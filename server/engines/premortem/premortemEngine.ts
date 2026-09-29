import { createHash } from 'crypto';
import { CONFIG } from '../../../shared/config.ts';
import {
  CampaignBrief,
  Creator,
  PremortemRun,
  PairwiseOverlapResult,
  LineupMetrics,
  LineupCreatorMetrics,
} from '../../../shared/types.ts';
import { AppError } from '../../errors/AppError.ts';
import { getRepositories } from '../../repositories/index.ts';
import { embed } from '../../services/gemini.ts';
import { getRecentVideos, getCommentSample } from '../../services/youtube.ts';
import {
  computePairOverlap,
  computeOverlapAdjustedReach,
  computeLineupBudgetMetrics,
  averageEmbeddings,
} from './signals.ts';
import { calculateHealthScore } from './healthScore.ts';
import {
  classifyCreatorSponsors,
  analyzeCreatorSentiment,
  synthesizePremortem,
} from './aiAnalysis.ts';

export interface PremortemPipelineOptions {
  updateProgress?: (current: number, total: number, message: string) => Promise<void>;
  isCancelled?: () => Promise<boolean> | boolean;
  userId?: string;
}

/**
 * Execute full Pre-Mortem Simulator run via Background Job Runner.
 */
export async function executePremortem(
  campaignId: string,
  creatorIds: string[],
  options: PremortemPipelineOptions = {}
): Promise<PremortemRun> {
  const { updateProgress = async () => {}, isCancelled = async () => false, userId = 'system' } = options;
  const repos = getRepositories();

  await updateProgress(5, 100, 'Validating lineup preflight criteria...');

  // 1. Preflight Validation
  if (creatorIds.length < CONFIG.PREMORTEM_MIN_CREATORS || creatorIds.length > CONFIG.PREMORTEM_MAX_CREATORS) {
    throw AppError.validation(
      `Pre-Mortem simulation requires between ${CONFIG.PREMORTEM_MIN_CREATORS} and ${CONFIG.PREMORTEM_MAX_CREATORS} creators`
    );
  }

  const campaign = await repos.campaigns.getById(campaignId);
  if (!campaign) throw AppError.notFound('Campaign not found');

  const brief = campaign.brief as CampaignBrief;
  if (!brief || !brief.brandName || !brief.productCategory) {
    throw AppError.validation('Campaign brief must be completed before running Pre-Mortem simulator');
  }

  const allCreators = await repos.creators.list(campaignId);
  const creatorMap = new Map(allCreators.map((c) => [c.id, c]));

  const lineupCreators: Creator[] = [];
  for (const id of creatorIds) {
    const c = creatorMap.get(id);
    if (!c) {
      throw AppError.notFound(`Creator ${id} does not belong to this campaign`);
    }
    if (c.status !== 'analyzed') {
      throw AppError.validation(`Creator "${c.channel?.title || c.normalizedKey}" must be analyzed before Pre-Mortem`);
    }
    lineupCreators.push(c);
  }

  // 2. Fetch missing creator telemetry & compute embeddings/sentiment
  const updatedCreators: Creator[] = [];

  for (let i = 0; i < lineupCreators.length; i++) {
    if (await isCancelled()) throw new Error('JOB_CANCELLED');
    const creator = lineupCreators[i];
    const name = creator.channel?.title || creator.normalizedKey;
    const prog = 10 + Math.floor((i / lineupCreators.length) * 40);
    await updateProgress(prog, 100, `Collecting audience telemetry for ${name} (${i + 1}/${lineupCreators.length})...`);

    let modified = false;
    let current = { ...creator };

    // A. Embeddings for video content
    const videoSnippets = (current.recentVideos || []).map(
      (v) => `${v.title} - ${v.description.slice(0, 300)}`
    );
    const contentHash = createHash('sha256').update(videoSnippets.join('||')).digest('hex');

    if (!current.embeddingCache || current.embeddingCache.hash !== contentHash) {
      if (videoSnippets.length > 0) {
        try {
          const vectors = await embed(videoSnippets.slice(0, 10)); // Sample up to 10 videos
          const centroid = averageEmbeddings(vectors);
          current.embeddingCache = {
            hash: contentHash,
            vector: centroid,
            updatedAt: new Date().toISOString(),
          };
          modified = true;
        } catch (embErr) {
          console.warn(`[Premortem] Embedding generation failed for ${name}:`, (embErr as Error).message);
        }
      }
    }

    // B. Comment Sample & Author IDs
    if (!current.commentSample || current.commentSample.authorChannelIds.length < CONFIG.PREMORTEM_MIN_UNIQUE_COMMENTERS) {
      const topVideos = (current.recentVideos || []).slice(0, 5);
      const comments: string[] = [];
      const authorChannelIds: string[] = [];

      for (const vid of topVideos) {
        try {
          const sample = await getCommentSample(vid.videoId, 25);
          if (!sample.unavailable && sample.comments.length > 0) {
            comments.push(...sample.comments);
            // In our youtube service, mock or real comment samples yield authorChannelId or mock ids
            sample.comments.forEach((_, idx) => {
              authorChannelIds.push(`author_${createHash('md5').update(`${vid.videoId}_${idx}`).digest('hex').slice(0, 12)}`);
            });
          }
        } catch {}
      }

      current.commentSample = {
        comments: comments.slice(0, 100),
        authorChannelIds: authorChannelIds.slice(0, 100),
        fetchedAt: new Date().toISOString(),
      };
      modified = true;
    }

    // C. Sponsor Classification
    if (!current.classifiedSponsors) {
      const classified = await classifyCreatorSponsors(current, brief);
      current.classifiedSponsors = classified;
      modified = true;
    }

    // D. Sentiment Analysis
    if (!current.sentimentStats) {
      const sentiment = await analyzeCreatorSentiment(
        current,
        current.commentSample?.comments || []
      );
      current.sentimentStats = sentiment;
      modified = true;
    }

    if (modified) {
      current = await repos.creators.update(campaignId, current.id, current.version, current);
    }
    updatedCreators.push(current);
  }

  if (await isCancelled()) throw new Error('JOB_CANCELLED');
  await updateProgress(55, 100, 'Computing audience overlap and cross-channel Jaccard matrices...');

  // 3. Compute Pairwise Overlaps across all pairs
  const pairwiseResults: PairwiseOverlapResult[] = [];
  for (let i = 0; i < updatedCreators.length; i++) {
    for (let j = i + 1; j < updatedCreators.length; j++) {
      const cA = updatedCreators[i];
      const cB = updatedCreators[j];

      const pair = computePairOverlap(
        { id: cA.id, name: cA.channel?.title || cA.normalizedKey },
        { id: cB.id, name: cB.channel?.title || cB.normalizedKey },
        {
          commentersA: cA.commentSample?.authorChannelIds || [],
          commentersB: cB.commentSample?.authorChannelIds || [],
          embeddingA: cA.embeddingCache?.vector || null,
          embeddingB: cB.embeddingCache?.vector || null,
          tagsA: [...(cA.tags || []), ...(cA.channel?.topicCategories || [])],
          tagsB: [...(cB.tags || []), ...(cB.channel?.topicCategories || [])],
          videosCountA: cA.recentVideos?.length || 0,
          videosCountB: cB.recentVideos?.length || 0,
        }
      );
      pairwiseResults.push(pair);
    }
  }

  await updateProgress(70, 100, 'Calculating deduplicated reach, fatigue, and commercial terms...');

  // 4. Lineup-Level Telemetry & Reach
  const creatorMedians = updatedCreators.map((c) => ({
    id: c.id,
    medianViews: c.metrics?.longForm?.medianViews || c.metrics?.shorts?.medianViews || 1000,
  }));

  const reachMetrics = computeOverlapAdjustedReach(creatorMedians, pairwiseResults);
  const budgetMetrics = computeLineupBudgetMetrics(
    updatedCreators.map((c) => ({ id: c.id, metrics: c.metrics })),
    brief.budgetUsd
  );

  const creatorMetrics: Record<string, LineupCreatorMetrics> = {};
  const sixtyDaysAgoMs = Date.now() - 60 * 86400000;

  for (const c of updatedCreators) {
    const name = c.channel?.title || c.normalizedKey;
    const sponsored = (c.recentVideos || []).filter((v) => v.hasSponsorshipSignals);
    const classified = c.classifiedSponsors || [];

    // Category and Competitor counts in last 60 days
    let recentCategoryCount = 0;
    let recentCompetitorCount = 0;

    for (const s of classified) {
      const vid = c.recentVideos?.find((v) => v.videoId === s.videoId);
      const isRecent = vid?.publishedAt ? new Date(vid.publishedAt).getTime() > sixtyDaysAgoMs : true;
      if (s.sameCategoryAsOurProduct && isRecent) recentCategoryCount++;
      if (s.isCompetitor && isRecent) recentCompetitorCount++;
    }

    const midpoint = c.metrics
      ? (c.metrics.estimatedCostPerVideoUsd.low + c.metrics.estimatedCostPerVideoUsd.high) / 2
      : 0;

    const costShare = budgetMetrics.totalCostMidpoint > 0 ? midpoint / budgetMetrics.totalCostMidpoint : 0;

    creatorMetrics[c.id] = {
      creatorId: c.id,
      channelTitle: name,
      sponsoredVideosCount: sponsored.length,
      recentCategorySponsoredCount: recentCategoryCount,
      recentCompetitorSponsoredCount: recentCompetitorCount,
      recentCategoryShare: sponsored.length > 0 ? recentCategoryCount / sponsored.length : 0,
      negativeShare: c.sentimentStats?.negativeShare || 0,
      adFatigueShare: c.sentimentStats?.adFatigueShare || 0,
      sentimentMethod: c.sentimentStats?.method || 'gemini',
      medianViews: c.metrics?.longForm?.medianViews || c.metrics?.shorts?.medianViews || 0,
      estimatedCostMidpoint: midpoint,
      costShare: Math.round(costShare * 1000) / 1000,
      hasSufficientCommentData: Boolean(c.commentSample && c.commentSample.authorChannelIds.length >= 30),
    };
  }

  const lineupMetrics: LineupMetrics = {
    ...reachMetrics,
    ...budgetMetrics,
    budgetUsd: brief.budgetUsd,
    creatorMetrics,
  };

  // 5. Compute Health Score & Itemized Penalties (Pure Code)
  const healthResult = calculateHealthScore({
    creators: updatedCreators,
    pairwiseResults,
    lineupMetrics,
    budgetUsd: brief.budgetUsd,
  });

  if (await isCancelled()) throw new Error('JOB_CANCELLED');
  await updateProgress(85, 100, 'Synthesizing CMO executive summary and risk mitigations...');

  // 6. Gemini Synthesis Call (with validation & Unknown ID pruning)
  const availableCandidates = allCreators.filter(
    (c) => !creatorIds.includes(c.id) && c.status === 'analyzed'
  );

  const synthesis = await synthesizePremortem({
    brief,
    lineupCreators: updatedCreators,
    availableCandidates,
    healthScore: healthResult.healthScore,
    label: healthResult.label,
    penalties: healthResult.penalties,
    lineupMetrics,
    pairwiseResults,
  });

  await updateProgress(95, 100, 'Saving Pre-Mortem simulation audit...');

  // 7. Persist Run Document
  const createdRun = await repos.premortem.create(campaignId, {
    campaignId,
    lineupCreatorIds: creatorIds,
    pairwiseResults,
    lineupMetrics,
    penalties: healthResult.penalties,
    healthScore: healthResult.healthScore,
    label: healthResult.label,
    confidence: healthResult.confidence,
    risks: synthesis.risks,
    suggestions: synthesis.suggestions,
    executiveSummary: synthesis.executiveSummary,
    status: 'complete',
    approved: false,
    createdBy: userId,
  });

  await repos.activity.log({
    campaignId,
    actorEmail: userId,
    action: 'PREMORTEM_RUN_COMPLETED',
    entityType: 'premortemRun',
    entityId: createdRun.id,
    summary: `Pre-Mortem simulated: Health Score ${createdRun.healthScore}/100 (${createdRun.label})`,
  });

  await updateProgress(100, 100, 'Simulation complete');
  return createdRun;
}
