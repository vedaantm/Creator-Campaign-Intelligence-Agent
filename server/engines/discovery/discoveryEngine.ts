import { z } from 'zod';
import { CONFIG } from '../../../shared/config.ts';
import {
  Creator,
  CampaignBrief,
  CampaignBriefSchema,
  CreatorScores,
  CreatorVideo,
} from '../../../shared/types.ts';
import { getRepositories } from '../../repositories/index.ts';
import { resolveChannel, getRecentVideos, YouTubeChannelResponse } from '../../services/youtube.ts';
import { computeMetrics, RawVideoItem } from './metrics.ts';
import {
  computeQuantitativeScores,
  computeCompositeFitScore,
  recomputeAllScores,
  verifyCitations,
  computeBudgetFitScore,
  computeRecencyScore,
  determineTier,
  ScoringWeights,
} from './scoring.ts';
import { generateStructured, wrapUntrustedData } from '../../services/gemini.ts';
import { AppError } from '../../errors/AppError.ts';

const StringOrArray = z.union([z.string(), z.array(z.string())]).transform((val) => (Array.isArray(val) ? val : val ? [val] : []));

const QualitativeSchema = z.object({
  nicheFit: z.coerce.number().min(0).max(100),
  audienceFit: z.coerce.number().min(0).max(100),
  toneFit: z.coerce.number().min(0).max(100),
  brandSafety: z.coerce.number().min(0).max(100),
  justifications: z
    .object({
      nicheFit: z.string().default(''),
      audienceFit: z.string().default(''),
      toneFit: z.string().default(''),
      brandSafety: z.string().default(''),
    })
    .default({ nicheFit: '', audienceFit: '', toneFit: '', brandSafety: '' }),
  citedTitles: z
    .object({
      nicheFit: StringOrArray.default([]),
      audienceFit: StringOrArray.default([]),
      toneFit: StringOrArray.default([]),
      brandSafety: StringOrArray.default([]),
    })
    .default({ nicheFit: [], audienceFit: [], toneFit: [], brandSafety: [] }),
  brandSafetyFlags: z
    .array(
      z.union([
        z.string().transform((str) => ({ concern: str, videoTitle: '' })),
        z.object({
          concern: z.string(),
          videoTitle: z.string().optional().default(''),
        }),
      ])
    )
    .default([]),
  summary: z.string().default(''),
});

type QualitativeOutput = z.infer<typeof QualitativeSchema>;

/**
 * Executes qualitative AI vetting for a creator against a campaign brief using Gemini.
 */
async function performQualitativeAiVetting(
  channel: YouTubeChannelResponse,
  videos: CreatorVideo[],
  brief: CampaignBrief
): Promise<QualitativeOutput> {
  const videoSnippets = videos
    .slice(0, 15)
    .map(
      (v, idx) =>
        `${idx + 1}. Title: "${v.title}"\nDescription snippet: ${v.description.slice(0, 300).replace(/\n+/g, ' ')}`
    )
    .join('\n\n');

  const untrustedChannelContent = `Channel Title: ${channel.title}
Custom URL / Handle: ${channel.customUrl || 'N/A'}
Topic Categories: ${(channel.topicCategories || []).join(', ') || 'N/A'}
Channel Description: ${channel.description}

Recent Uploaded Videos:
${videoSnippets}`;

  const wrappedUntrusted = wrapUntrustedData('youtube_channel_metadata', untrustedChannelContent);

  const prompt = `Evaluate the candidate YouTube creator for this brand campaign:

CAMPAIGN BRIEF:
- Brand Name: ${brief.brandName}
- Product Name: ${brief.productName}
- Category: ${brief.productCategory}
- Target Audience: ${brief.targetAudience}
- Desired Tones: ${brief.tones.join(', ')} ${brief.customTone ? `(${brief.customTone})` : ''}
- Niche Keywords: ${brief.nicheKeywords.join(', ')}
- Competitors: ${(brief.competitors || []).join(', ') || 'None'}
- Approved Product Claims: ${brief.approvedFacts.join('; ')}

CANDIDATE CREATOR DATA:
${wrappedUntrusted}

Assess the creator on 4 qualitative dimensions (0–100):
1. nicheFit: Relevance to ${brief.productCategory} and keywords (${brief.nicheKeywords.join(', ')}).
2. audienceFit: Resonance with target audience (${brief.targetAudience}).
3. toneFit: Alignment with desired tones (${brief.tones.join(', ')}).
4. brandSafety: Freedom from controversies, disparagement, explicit content, or risk flags.

For EACH score, provide a concise 1-sentence justification and cite at least one exact video title from recent uploads. Also extract any brandSafetyFlags and provide a 2-sentence plain-English summary.

Return strict JSON in this format:
{
  "nicheFit": 0-100,
  "audienceFit": 0-100,
  "toneFit": 0-100,
  "brandSafety": 0-100,
  "justifications": {
    "nicheFit": "1-sentence justification citing specific evidence",
    "audienceFit": "1-sentence justification citing specific evidence",
    "toneFit": "1-sentence justification citing specific evidence",
    "brandSafety": "1-sentence justification citing specific evidence"
  },
  "citedTitles": {
    "nicheFit": ["exact video title from recent uploads"],
    "audienceFit": ["exact video title from recent uploads"],
    "toneFit": ["exact video title from recent uploads"],
    "brandSafety": ["exact video title from recent uploads"]
  },
  "brandSafetyFlags": [],
  "summary": "2-sentence plain-English summary of creator fit"
}`;

  const systemInstruction = `You are an expert creator sponsorship vetting engine.
Evaluate creator fit and brand safety based strictly on evidence provided in the untrusted_data block.

Scoring rubric:
90–100: clear, repeated evidence
70–89: good fit with minor gaps
40–69: partial fit
below 40: poor fit or insufficient evidence
Score conservatively when evidence is thin. Never invent video titles.`;

  try {
    const result = await generateStructured<QualitativeOutput>({
      engine: 'discovery_qualitative',
      systemInstruction,
      prompt,
      zodSchema: QualitativeSchema,
      temperature: 0.2,
    });
    return result;
  } catch (err: unknown) {
    console.warn('[DiscoveryEngine] Gemini call failed or unavailable, using deterministic heuristic fallback:', (err as Error).message);
    return getFallbackQualitativeAnalysis(channel, videos, brief);
  }
}

/**
 * Deterministic fallback analysis if AI is offline, missing key, or rate-limited.
 */
function getFallbackQualitativeAnalysis(
  channel: YouTubeChannelResponse,
  videos: CreatorVideo[],
  brief: CampaignBrief
): QualitativeOutput {
  const allText = `${channel.title} ${channel.description} ${videos.map((v) => v.title).join(' ')}`.toLowerCase();
  const matchedKeywords = brief.nicheKeywords.filter((kw) => allText.includes(kw.toLowerCase()));

  const nicheRatio = brief.nicheKeywords.length > 0 ? matchedKeywords.length / brief.nicheKeywords.length : 0;
  const nicheFit = Math.min(85, Math.max(20, Math.round(30 + nicheRatio * 55)));
  const audienceFit = Math.min(85, Math.max(25, Math.round(35 + nicheRatio * 45)));
  const toneFit = 60;
  const brandSafety = 80;

  return {
    nicheFit,
    audienceFit,
    toneFit,
    brandSafety,
    justifications: {
      nicheFit: `[Unvetted Fallback] Matched ${matchedKeywords.length}/${brief.nicheKeywords.length} campaign niche keywords across recent content metadata.`,
      audienceFit: `[Unvetted Fallback] Audience resonance estimated from keyword overlap with ${brief.productCategory}.`,
      toneFit: `[Unvetted Fallback] Tone alignment defaulted to neutral baseline; manual review recommended.`,
      brandSafety: `[Unvetted Fallback] Basic brand safety baseline applied; automated transcript vetting was unavailable.`,
    },
    citedTitles: {
      nicheFit: [],
      audienceFit: [],
      toneFit: [],
      brandSafety: [],
    },
    brandSafetyFlags: [
      {
        concern: 'AI qualitative vetting was unavailable for this creator; low-confidence baseline applied.',
        videoTitle: '',
      },
    ],
    summary: `⚠️ AI Qualitative Vetting Unavailable: Qualitative evaluation could not be processed by Gemini for ${channel.title}. Scores reflect a baseline keyword match heuristic.`,
  };
}

/**
 * Analyzes one creator end-to-end:
 * 1. Resolve channel (if needed)
 * 2. Fetch recent videos
 * 3. Compute metrics
 * 4. Qualitative AI scoring via Gemini
 * 5. Citation verification
 * 6. Composite scoring
 */
export async function analyzeCreator(
  campaignId: string,
  creator: Creator,
  brief: CampaignBrief,
  campaignBudget: number,
  allCandidates: Creator[],
  cpmBounds = { low: CONFIG.DEFAULT_CPM_LOW, high: CONFIG.DEFAULT_CPM_HIGH },
  scoringWeights: ScoringWeights = CONFIG.DEFAULT_SCORING_WEIGHTS
): Promise<Creator> {
  const repos = getRepositories();

  // 1. Resolve channel if not resolved
  let channelData = creator.channel;
  let rawVideos: RawVideoItem[] = [];

  if (!channelData || !channelData.channelId) {
    const existingChannelIds = allCandidates
      .filter((c) => c.id !== creator.id && c.channel?.channelId)
      .map((c) => c.channel!.channelId);

    const resolveRes = await resolveChannel(creator.input, existingChannelIds);
    if (resolveRes.isDuplicate) {
      const updated = await repos.creators.update(campaignId, creator.id, creator.version, {
        status: 'error',
        error: `Channel ${resolveRes.channel.title} (${resolveRes.channel.channelId}) is already added in this campaign.`,
      });
      return updated;
    }

    channelData = {
      channelId: resolveRes.channel.channelId,
      title: resolveRes.channel.title,
      description: resolveRes.channel.description,
      customUrl: resolveRes.channel.customUrl,
      avatarUrl: resolveRes.channel.avatarUrl,
      subscriberCount: resolveRes.channel.subscriberCount,
      hiddenSubscriberCount: resolveRes.channel.hiddenSubscriberCount,
      videoCount: resolveRes.channel.videoCount,
      viewCount: resolveRes.channel.viewCount,
      country: resolveRes.channel.country,
      publishedAt: resolveRes.channel.publishedAt,
      channelAgeMonths: resolveRes.channel.publishedAt ? Math.floor((Date.now() - new Date(resolveRes.channel.publishedAt).getTime()) / (1000 * 86400 * 30)) : 0,
      topicCategories: resolveRes.channel.topicCategories || [],
    };
  }

  if (!channelData) {
    throw AppError.channelNotFound(`Channel data not found for creator ${creator.id}`);
  }

  // 2. Fetch recent videos
  rawVideos = await getRecentVideos(channelData.channelId);

  // 3. Compute metrics & process videos
  const { metrics, processedVideos } = computeMetrics(
    {
      channelId: channelData.channelId,
      subscriberCount: channelData.subscriberCount,
      hiddenSubscriberCount: channelData.hiddenSubscriberCount,
      videoCount: channelData.videoCount,
      publishedAt: channelData.publishedAt || undefined,
      country: channelData.country,
    },
    rawVideos,
    cpmBounds
  );

  // 4. Qualitative AI scoring via Gemini
  const channelForAi: YouTubeChannelResponse = {
    channelId: channelData.channelId,
    title: channelData.title,
    description: channelData.description,
    customUrl: channelData.customUrl || undefined,
    avatarUrl: channelData.avatarUrl || undefined,
    subscriberCount: channelData.subscriberCount,
    hiddenSubscriberCount: channelData.hiddenSubscriberCount,
    videoCount: channelData.videoCount,
    viewCount: channelData.viewCount,
    publishedAt: channelData.publishedAt || undefined,
    country: channelData.country,
  };

  const qualitative = await performQualitativeAiVetting(channelForAi, processedVideos, brief);

  // 5. Citation verification
  const verifiedNiche = verifyCitations(qualitative.citedTitles.nicheFit, processedVideos);
  const verifiedAudience = verifyCitations(qualitative.citedTitles.audienceFit, processedVideos);
  const verifiedTone = verifyCitations(qualitative.citedTitles.toneFit, processedVideos);
  const verifiedSafety = verifyCitations(qualitative.citedTitles.brandSafety, processedVideos);

  const lowConfidence = {
    nicheFit: verifiedNiche.length === 0,
    audienceFit: verifiedAudience.length === 0,
    toneFit: verifiedTone.length === 0,
    brandSafety: verifiedSafety.length === 0,
  };

  // 6. Quantitative scoring (guarantee exactly 1 metrics object per candidate)
  const otherMetrics = allCandidates
    .filter((c) => c.id !== creator.id && c.metrics)
    .map((c) => c.metrics!);
  const allMetrics = [...otherMetrics, metrics];

  const quant = computeQuantitativeScores(
    metrics,
    campaignBudget,
    Math.max(1, allCandidates.length),
    allMetrics
  );

  // 7. Composite fit score
  const composite = computeCompositeFitScore(
    {
      nicheFit: qualitative.nicheFit,
      audienceFit: qualitative.audienceFit,
      engagement: quant.engagementScore,
      toneFit: qualitative.toneFit,
      brandSafety: qualitative.brandSafety,
      reach: quant.reachScore,
      budgetFit: quant.budgetFitScore,
      consistency: quant.consistencyScore,
      recency: quant.recencyScore,
    },
    scoringWeights
  );

  const scores: CreatorScores = {
    engagementScore: quant.engagementScore,
    reachScore: quant.reachScore,
    consistencyScore: quant.consistencyScore,
    recencyScore: quant.recencyScore,
    budgetFitScore: quant.budgetFitScore,
    nicheFit: qualitative.nicheFit,
    audienceFit: qualitative.audienceFit,
    toneFit: qualitative.toneFit,
    brandSafety: qualitative.brandSafety,
    justifications: qualitative.justifications,
    citations: {
      nicheFit: verifiedNiche,
      audienceFit: verifiedAudience,
      toneFit: verifiedTone,
      brandSafety: verifiedSafety,
    },
    lowConfidence,
    brandSafetyFlags: qualitative.brandSafetyFlags,
    summary: qualitative.summary,
    fitScore: composite.fitScore,
    tier: composite.tier,
    brandSafetyCapped: composite.brandSafetyCapped,
    brandSafetyWarning: composite.brandSafetyWarning,
  };

  // 8. Update creator document
  const updated = await repos.creators.update(campaignId, creator.id, creator.version, {
    channel: channelData,
    recentVideos: processedVideos,
    metrics,
    scores,
    status: 'analyzed',
    error: null,
    analyzedAt: new Date().toISOString(),
  });

  return updated;
}

/**
 * Worker pool helper for concurrency control.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Master Discovery Job execution for a campaign.
 */
export async function executeCampaignDiscovery(
  campaignId: string,
  options: {
    force?: boolean;
    updateProgress: (done: number, total: number, message: string) => Promise<void>;
    isCancelled: () => Promise<boolean>;
  }
): Promise<{ succeeded: string[]; failed: string[] }> {
  const repos = getRepositories();
  const campaign = await repos.campaigns.getById(campaignId);
  if (!campaign) {
    throw AppError.notFound(`Campaign ${campaignId} not found`);
  }

  // Brief validation
  const briefParse = CampaignBriefSchema.safeParse(campaign.brief);
  if (!briefParse.success) {
    throw AppError.validation('Campaign brief must be completed before running discovery');
  }
  const brief = briefParse.data;

  const creators = await repos.creators.list(campaignId);
  if (creators.length === 0) {
    throw AppError.validation('At least 1 candidate creator is required to run discovery');
  }

  const toAnalyze = options.force
    ? creators
    : creators.filter((c) => c.status === 'pending' || c.status === 'resolved' || c.status === 'error');

  if (toAnalyze.length === 0) {
    await options.updateProgress(100, 100, 'All creators already analyzed');
    return { succeeded: creators.map((c) => c.id), failed: [] };
  }

  const total = toAnalyze.length;
  let completedCount = 0;
  const succeeded: string[] = [];
  const failed: string[] = [];

  const campaignBudget = brief.budgetUsd || 10000;

  await options.updateProgress(0, total, `Starting discovery for ${total} creators...`);

  await runWithConcurrency(toAnalyze, CONFIG.DISCOVERY_CONCURRENCY, async (creator, idx) => {
    if (await options.isCancelled()) return;

    const label = creator.channel?.customUrl || creator.channel?.title || creator.input;
    await options.updateProgress(
      completedCount,
      total,
      `Analyzing ${completedCount + 1} of ${total}: ${label}`
    );

    try {
      // Mark analyzing
      const activeCreator = await repos.creators.getById(campaignId, creator.id);
      if (!activeCreator) return;

      const analyzingDoc = await repos.creators.update(campaignId, creator.id, activeCreator.version, {
        status: 'analyzing',
      });

      const analyzed = await analyzeCreator(
        campaignId,
        analyzingDoc,
        brief,
        campaignBudget,
        creators
      );

      if (analyzed.status === 'analyzed') {
        succeeded.push(creator.id);
      } else {
        failed.push(creator.id);
      }
    } catch (err: unknown) {
      console.error(`[DiscoveryEngine] Error analyzing creator ${creator.id}:`, err);
      const errMsg = (err as Error).message || 'Failed to analyze creator';
      try {
        const cur = await repos.creators.getById(campaignId, creator.id);
        if (cur) {
          await repos.creators.update(campaignId, creator.id, cur.version, {
            status: 'error',
            error: errMsg,
          });
        }
      } catch {}
      failed.push(creator.id);
    } finally {
      completedCount++;
      await options.updateProgress(
        completedCount,
        total,
        `Processed ${completedCount} of ${total} creators`
      );
    }
  });

  // Recompute quantitative scores and composite fitScore across ALL analyzed creators
  const refreshedCreators = await repos.creators.list(campaignId);
  const alignedCreators = recomputeAllScores(refreshedCreators, campaignBudget);
  await repos.creators.bulkUpsert(campaignId, alignedCreators);

  await repos.activity.log({
    campaignId,
    actorEmail: campaign.ownerEmail,
    action: 'DISCOVERY_COMPLETED',
    entityType: 'discovery',
    entityId: campaignId,
    summary: `Discovery completed for ${succeeded.length} creators (${failed.length} failed)`,
  });

  await options.updateProgress(100, 100, `Discovery completed (${succeeded.length} analyzed)`);
  return { succeeded, failed };
}

/**
 * Lightweight Budget Fit check for a single creator candidate.
 * Skips Gemini qualitative scoring & pairwise comparison.
 * Computes YouTube telemetry, recent videos, and estimated cost vs campaign budget.
 */
export async function checkSingleCreatorBudgetFit(
  campaignId: string,
  creator: Creator,
  campaignBudget: number
): Promise<{
  creator: Creator;
  isWithinBudget: boolean;
  estimatedCostUsd: { low: number; high: number; midpoint: number };
  percentageOfBudget: number;
  budgetFitScore: number;
}> {
  const repos = getRepositories();

  // Mark analyzing state first
  let currentCreator = creator;
  try {
    const freshCreator = await repos.creators.update(campaignId, creator.id, creator.version, {
      status: 'analyzing',
    });
    currentCreator = freshCreator;
  } catch (err) {
    console.warn('[checkSingleCreatorBudgetFit] Failed to set analyzing status:', err);
    const refetched = await repos.creators.getById(campaignId, creator.id);
    if (refetched) {
      currentCreator = refetched;
    }
  }

  // 1. Resolve channel if not already resolved
  let channelData = currentCreator.channel;
  if (!channelData || !channelData.channelId) {
    const resolveRes = await resolveChannel(currentCreator.input, []);
    channelData = {
      channelId: resolveRes.channel.channelId,
      title: resolveRes.channel.title,
      description: resolveRes.channel.description,
      customUrl: resolveRes.channel.customUrl,
      avatarUrl: resolveRes.channel.avatarUrl,
      subscriberCount: resolveRes.channel.subscriberCount,
      hiddenSubscriberCount: resolveRes.channel.hiddenSubscriberCount,
      videoCount: resolveRes.channel.videoCount,
      viewCount: resolveRes.channel.viewCount,
      country: resolveRes.channel.country,
      publishedAt: resolveRes.channel.publishedAt,
      channelAgeMonths: resolveRes.channel.publishedAt
        ? Math.floor((Date.now() - new Date(resolveRes.channel.publishedAt).getTime()) / (1000 * 86400 * 30))
        : 0,
      topicCategories: resolveRes.channel.topicCategories || [],
    };
  }

  // 2. Fetch recent videos & compute metrics
  const rawVideos = await getRecentVideos(channelData.channelId);
  const { metrics, processedVideos } = computeMetrics(
    {
      channelId: channelData.channelId,
      subscriberCount: channelData.subscriberCount,
      hiddenSubscriberCount: channelData.hiddenSubscriberCount,
      videoCount: channelData.videoCount,
      publishedAt: channelData.publishedAt || undefined,
      country: channelData.country,
    },
    rawVideos,
    { low: CONFIG.DEFAULT_CPM_LOW, high: CONFIG.DEFAULT_CPM_HIGH }
  );

  const costLow = metrics.estimatedCostPerVideoUsd.low;
  const costHigh = metrics.estimatedCostPerVideoUsd.high;
  const midpoint = Math.round((costLow + costHigh) / 2);
  const isWithinBudget = midpoint <= campaignBudget;
  const percentageOfBudget = campaignBudget > 0 ? Math.round((midpoint / campaignBudget) * 100) : 100;

  // 3. Compute real quantitative scores on absolute scale alone
  const quant = computeQuantitativeScores(metrics, campaignBudget, 1, [metrics]);

  // Baseline qualitative scores for unvetted check
  const unvettedQualitative = {
    nicheFit: 50,
    audienceFit: 50,
    toneFit: 50,
    brandSafety: 85,
  };

  const composite = computeCompositeFitScore({
    ...unvettedQualitative,
    engagement: quant.engagementScore,
    reach: quant.reachScore,
    budgetFit: quant.budgetFitScore,
    consistency: quant.consistencyScore,
    recency: quant.recencyScore,
  });

  // Set lightweight scores
  const scores: CreatorScores = {
    reachScore: quant.reachScore,
    engagementScore: quant.engagementScore,
    consistencyScore: quant.consistencyScore,
    recencyScore: quant.recencyScore,
    budgetFitScore: quant.budgetFitScore,
    nicheFit: unvettedQualitative.nicheFit,
    audienceFit: unvettedQualitative.audienceFit,
    toneFit: unvettedQualitative.toneFit,
    brandSafety: unvettedQualitative.brandSafety,
    justifications: {
      nicheFit: 'Niche fit not evaluated in lightweight budget check (skipped to save AI quota).',
      audienceFit: 'Audience resonance not evaluated in lightweight budget check.',
      toneFit: 'Tone analysis not evaluated in lightweight budget check.',
      brandSafety: 'Standard brand safety baseline applied.',
    },
    citations: {
      nicheFit: [],
      audienceFit: [],
      toneFit: [],
      brandSafety: [],
    },
    lowConfidence: {
      nicheFit: true,
      audienceFit: true,
      toneFit: true,
      brandSafety: false,
    },
    brandSafetyFlags: [],
    summary: `Quick Budget Check: Estimated video cost is $${midpoint.toLocaleString()} (${percentageOfBudget}% of $${campaignBudget.toLocaleString()} campaign budget). Qualitative AI scoring skipped.`,
    fitScore: composite.fitScore,
    tier: composite.tier,
    brandSafetyCapped: false,
  };

  const updated = await repos.creators.update(campaignId, currentCreator.id, currentCreator.version, {
    channel: channelData,
    recentVideos: processedVideos,
    metrics,
    scores,
    status: 'analyzed',
    error: null,
    analyzedAt: new Date().toISOString(),
  });

  return {
    creator: updated,
    isWithinBudget,
    estimatedCostUsd: { low: costLow, high: costHigh, midpoint },
    percentageOfBudget,
    budgetFitScore: quant.budgetFitScore,
  };
}
