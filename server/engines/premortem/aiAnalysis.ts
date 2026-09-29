import { z } from 'zod';
import { CONFIG } from '../../../shared/config.ts';
import {
  CampaignBrief,
  Creator,
  PremortemRisk,
  PremortemSuggestion,
  HealthPenalty,
  LineupMetrics,
  PairwiseOverlapResult,
} from '../../../shared/types.ts';
import {
  generateStructured,
  wrapUntrustedData,
} from '../../services/gemini.ts';
import { analyzeSentimentWithCloudNl } from '../../services/cloudNl.ts';

// -------------------------------------------------------------
// 1. Sponsor Classification Schema & Function
// -------------------------------------------------------------

export interface ClassifiedSponsor {
  videoId: string;
  sponsorBrand: string;
  sponsorCategory: string;
  isCompetitor: boolean;
  sameCategoryAsOurProduct: boolean;
}

const SponsorClassificationItemSchema = z.object({
  videoId: z.string(),
  sponsorBrand: z.string(),
  sponsorCategory: z.string(),
  isCompetitor: z.boolean(),
  sameCategoryAsOurProduct: z.boolean(),
});

const SponsorClassificationResponseSchema = z.object({
  sponsors: z.array(SponsorClassificationItemSchema),
});

export async function classifyCreatorSponsors(
  creator: Creator,
  brief: CampaignBrief
): Promise<ClassifiedSponsor[]> {
  // If already cached on creator document, return cached
  if (creator.classifiedSponsors && creator.classifiedSponsors.length > 0) {
    return creator.classifiedSponsors;
  }

  const sponsoredVideos = (creator.recentVideos || []).filter((v) => v.hasSponsorshipSignals);
  if (sponsoredVideos.length === 0) {
    return [];
  }

  const videoSnippets = sponsoredVideos.map((v) => {
    return `Video ID: ${v.videoId}\nTitle: ${v.title}\nDescription Snippet: ${v.description.slice(0, 300)}`;
  });

  const prompt = `You are a sponsorship intelligence classifier.
Our Brand: "${brief.brandName}"
Our Product: "${brief.productName}"
Our Product Category: "${brief.productCategory}"
Our Named Competitors: ${brief.competitors.length > 0 ? brief.competitors.join(', ') : 'None listed'}

Analyze these sponsored video snippets from creator "${creator.channel?.title || creator.normalizedKey}".
For each video ID, determine:
1. sponsorBrand: Name of the sponsoring company/product
2. sponsorCategory: Primary category of the sponsor
3. isCompetitor: true if the sponsor is one of our named competitors or direct equivalent
4. sameCategoryAsOurProduct: true if the sponsor sells products in our category "${brief.productCategory}"

${wrapUntrustedData('sponsored_videos', videoSnippets.join('\n---\n'))}

Return strictly a JSON object with array "sponsors".`;

  try {
    const res = await generateStructured({
      engine: 'Premortem:SponsorClassifier',
      systemInstruction: 'Classify sponsored video disclosures accurately without speculation.',
      prompt,
      zodSchema: SponsorClassificationResponseSchema,
      temperature: 0.1,
    });
    return res.sponsors;
  } catch (err) {
    console.warn(`[Premortem:SponsorClassifier] Failed to classify sponsors for ${creator.id}:`, (err as Error).message);
    // Fallback: rule-based check
    return sponsoredVideos.map((v) => {
      const lower = (v.title + ' ' + v.description).toLowerCase();
      const hasCompetitor = brief.competitors.some((comp) => lower.includes(comp.toLowerCase()));
      const sameCategory = lower.includes(brief.productCategory.toLowerCase());
      return {
        videoId: v.videoId,
        sponsorBrand: 'Detected Sponsor',
        sponsorCategory: sameCategory ? brief.productCategory : 'Other',
        isCompetitor: hasCompetitor,
        sameCategoryAsOurProduct: sameCategory,
      };
    });
  }
}

// -------------------------------------------------------------
// 2. Comment Sentiment & Ad Fatigue Analysis
// -------------------------------------------------------------

const CommentAnalysisBatchSchema = z.object({
  negativeCommentsCount: z.number().int().nonnegative(),
  adFatigueCommentsCount: z.number().int().nonnegative(),
  controversyDetected: z.boolean(),
  notes: z.string(),
});

export interface SentimentAnalysisResult {
  negativeShare: number;
  adFatigueShare: number;
  method: 'cloud_nl' | 'gemini';
  analyzedAt: string;
}

export async function analyzeCreatorSentiment(
  creator: Creator,
  comments: string[]
): Promise<SentimentAnalysisResult> {
  // If already cached on creator doc, return cached
  if (creator.sentimentStats) {
    return creator.sentimentStats;
  }

  if (comments.length === 0) {
    return {
      negativeShare: 0,
      adFatigueShare: 0,
      method: 'gemini',
      analyzedAt: new Date().toISOString(),
    };
  }

  const sample = comments.slice(0, 50); // Up to 50 comments per batch
  const cloudNlKey = process.env.CLOUD_NL_API_KEY;

  if (cloudNlKey) {
    // Run Cloud Natural Language API for sentiment
    let negativeCount = 0;
    for (const comment of sample.slice(0, 20)) {
      const res = await analyzeSentimentWithCloudNl(comment);
      if (res?.isNegative) negativeCount++;
    }
    const negativeShare = sample.length > 0 ? negativeCount / Math.min(20, sample.length) : 0;

    // Run Gemini for ad fatigue & hostility toward sponsors
    const fatiguePrompt = `Analyze these ${sample.length} comments from YouTube videos.
Count how many comments express complaints about sponsorships, too many ads, selling out, or hostility toward sponsors.

${wrapUntrustedData('comments', sample.join('\n'))}

Return strictly JSON with negativeCommentsCount: 0, adFatigueCommentsCount, controversyDetected, notes.`;

    try {
      const res = await generateStructured({
        engine: 'Premortem:AdFatigue',
        prompt: fatiguePrompt,
        zodSchema: CommentAnalysisBatchSchema,
        temperature: 0.1,
      });

      return {
        negativeShare: Math.round(negativeShare * 1000) / 1000,
        adFatigueShare: Math.round((res.adFatigueCommentsCount / sample.length) * 1000) / 1000,
        method: 'cloud_nl',
        analyzedAt: new Date().toISOString(),
      };
    } catch {
      return {
        negativeShare: Math.round(negativeShare * 1000) / 1000,
        adFatigueShare: 0,
        method: 'cloud_nl',
        analyzedAt: new Date().toISOString(),
      };
    }
  }

  // Pure Gemini Path
  const prompt = `Analyze these ${sample.length} comments from creator "${creator.channel?.title || creator.normalizedKey}".
Count:
1. negativeCommentsCount: Comments expressing dissatisfaction, criticism, or negative sentiment.
2. adFatigueCommentsCount: Comments complaining about sponsorships, too many ads, promotional content, or hostility toward sponsors.
3. controversyDetected: true if comments mention active creator controversy, cancellations, or scams.

${wrapUntrustedData('comments', sample.join('\n'))}

Return strictly JSON matching the schema.`;

  try {
    const res = await generateStructured({
      engine: 'Premortem:CommentSentiment',
      systemInstruction: 'Analyze audience sentiment objectively based solely on provided comments.',
      prompt,
      zodSchema: CommentAnalysisBatchSchema,
      temperature: 0.1,
    });

    const negativeShare = Math.min(1, Math.round((res.negativeCommentsCount / sample.length) * 1000) / 1000);
    const adFatigueShare = Math.min(1, Math.round((res.adFatigueCommentsCount / sample.length) * 1000) / 1000);

    return {
      negativeShare,
      adFatigueShare,
      method: 'gemini',
      analyzedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn(`[Premortem:Sentiment] Fallback for ${creator.id}:`, (err as Error).message);
    return {
      negativeShare: 0.05,
      adFatigueShare: 0.02,
      method: 'gemini',
      analyzedAt: new Date().toISOString(),
    };
  }
}

// -------------------------------------------------------------
// 3. Synthesis Call (Risks, Lineup Suggestions, Executive Summary)
// -------------------------------------------------------------

const SynthesisResponseSchema = z.object({
  risks: z.array(
    z.object({
      category: z.enum([
        'overlap',
        'fatigue',
        'sentiment',
        'budget',
        'concentration',
        'brandSafety',
      ]),
      severity: z.enum(['low', 'medium', 'high']),
      affectedCreatorIds: z.array(z.string()),
      explanation: z.string().max(300),
      recommendation: z.string(),
    })
  ),
  lineupSuggestions: z.array(
    z.object({
      action: z.enum(['remove', 'replace', 'add', 'rebalanceBudget']),
      creatorId: z.string().optional(),
      replacementCreatorId: z.string().optional(),
      rationale: z.string(),
    })
  ),
  executiveSummary: z.string(),
});

export interface SynthesisInput {
  brief: CampaignBrief;
  lineupCreators: Creator[];
  availableCandidates: Creator[]; // Unselected analyzed creators that can serve as replacements
  healthScore: number;
  label: string;
  penalties: HealthPenalty[];
  lineupMetrics: LineupMetrics;
  pairwiseResults: PairwiseOverlapResult[];
}

export async function synthesizePremortem(
  input: SynthesisInput
): Promise<{
  risks: PremortemRisk[];
  suggestions: PremortemSuggestion[];
  executiveSummary: string;
}> {
  const {
    brief,
    lineupCreators,
    availableCandidates,
    healthScore,
    label,
    penalties,
    lineupMetrics,
    pairwiseResults,
  } = input;

  const creatorLookup = new Map(lineupCreators.map((c) => [c.id, c.channel?.title || c.normalizedKey]));
  const candidateLookup = new Map(availableCandidates.map((c) => [c.id, c.channel?.title || c.normalizedKey]));

  const highOverlaps = pairwiseResults
    .filter((p) => p.pairOverlap > 40)
    .map((p) => `${p.creatorNameA} (ID: ${p.creatorIdA}) & ${p.creatorNameB} (ID: ${p.creatorIdB}): ${p.pairOverlap}% overlap`);

  const penaltyList = penalties.map((p) => `• [${p.category.toUpperCase()}] (-${p.penalty} pts) ${p.reason}`);

  const creatorSummaries = lineupCreators.map((c) => {
    const cm = lineupMetrics.creatorMetrics[c.id];
    return `Creator: ${c.channel?.title || c.normalizedKey} (ID: ${c.id})
- Median Views: ${cm?.medianViews || 0}
- Est. Cost Share: ${Math.round((cm?.costShare || 0) * 100)}%
- Negativity: ${Math.round((cm?.negativeShare || 0) * 100)}% | Ad Fatigue: ${Math.round((cm?.adFatigueShare || 0) * 100)}%
- Category Sponsors (last 60d): ${cm?.recentCategorySponsoredCount || 0}
- Competitor Sponsors: ${cm?.recentCompetitorSponsoredCount || 0}
- Brand Safety: ${c.scores?.brandSafety || 100}/100`;
  });

  const alternativeCandidatesList = availableCandidates.map((c) => {
    return `Candidate ID: ${c.id} | Name: "${c.channel?.title || c.normalizedKey}" | Fit Score: ${c.scores?.fitScore || 0} | Tier: ${c.scores?.tier || 'N/A'}`;
  });

  const prompt = `You are the Chief Marketing Risk Officer for an influencer campaign.
Brand: "${brief.brandName}" | Product: "${brief.productName}" (${brief.productCategory})
Target Budget: $${brief.budgetUsd.toLocaleString()}
Lineup Health Score: ${healthScore}/100 ("${label}")
Raw Reach: ${lineupMetrics.rawReach.toLocaleString()} views | Overlap-Adjusted Reach: ${lineupMetrics.overlapAdjustedReach.toLocaleString()} views
Total Lineup Cost: $${lineupMetrics.totalCostMidpoint.toLocaleString()} (${lineupMetrics.isOverBudget ? 'OVER BUDGET' : 'Within Budget'})

CRITICAL EVIDENCE & PENALTIES:
${penaltyList.length > 0 ? penaltyList.join('\n') : 'No penalties incurred.'}

HIGH AUDIENCE OVERLAPS (>40%):
${highOverlaps.length > 0 ? highOverlaps.join('\n') : 'None'}

LINEUP CREATOR TELEMETRY:
${creatorSummaries.join('\n\n')}

AVAILABLE UNSELECTED CANDIDATES FOR REPLACEMENT (if any need replacing):
${alternativeCandidatesList.length > 0 ? alternativeCandidatesList.join('\n') : 'No alternative candidates in campaign.'}

RULES:
1. risks: Return identified vulnerabilities. For each risk, specify category (overlap | fatigue | sentiment | budget | concentration | brandSafety), severity (low | medium | high), affectedCreatorIds (must ONLY contain exact creator IDs from above), explanation (at most 2 plain-English sentences), and recommendation.
2. lineupSuggestions: Practical lineup actions (remove, replace, add, rebalanceBudget). If action is "replace", replacementCreatorId MUST be one of the Available Unselected Candidate IDs above.
3. executiveSummary: Exactly 3 sentences for a CMO summarizing launch readiness, primary hazard, and recommended corrective action.
4. Validation: DO NOT invent creator IDs or fake video titles.`;

  try {
    const res = await generateStructured({
      engine: 'Premortem:Synthesis',
      systemInstruction: 'Provide honest, objective, data-grounded CMO risk synthesis.',
      prompt,
      zodSchema: SynthesisResponseSchema,
      temperature: 0.2,
    });

    // Enforce validation in code: drop risks or suggestions referencing unknown creator IDs
    const validCreatorIds = new Set(lineupCreators.map((c) => c.id));
    const validCandidateIds = new Set(availableCandidates.map((c) => c.id));

    const validatedRisks = res.risks.map((r) => ({
      ...r,
      affectedCreatorIds: r.affectedCreatorIds.filter((id) => validCreatorIds.has(id)),
    }));

    const validatedSuggestions = res.lineupSuggestions.filter((s) => {
      if (s.creatorId && !validCreatorIds.has(s.creatorId)) return false;
      if (s.action === 'replace' && (!s.replacementCreatorId || !validCandidateIds.has(s.replacementCreatorId))) {
        return false;
      }
      return true;
    });

    return {
      risks: validatedRisks,
      suggestions: validatedSuggestions,
      executiveSummary: res.executiveSummary,
    };
  } catch (err) {
    console.warn('[Premortem:Synthesis] Fallback generated due to error:', (err as Error).message);
    // Deterministic rule-based fallback
    const fallbackRisks: PremortemRisk[] = [];
    if (lineupMetrics.isOverBudget) {
      fallbackRisks.push({
        category: 'budget',
        severity: 'high',
        affectedCreatorIds: [lineupMetrics.largestCreatorId],
        explanation: `Lineup estimated cost exceeds the campaign budget of $${brief.budgetUsd.toLocaleString()}.`,
        recommendation: 'Rebalance creator fee allocations or swap top tier creator for mid-tier alternative.',
      });
    }

    const fallbackSummary = `The proposed creator lineup achieves an overall Health Score of ${healthScore}/100 (${label}). Estimated deduplicated audience reach is ${lineupMetrics.overlapAdjustedReach.toLocaleString()} views against a midpoint budget commitment of $${lineupMetrics.totalCostMidpoint.toLocaleString()}. Review the itemized risk penalties and consider recommended lineup adjustments prior to approving commercial deliverables.`;

    return {
      risks: fallbackRisks,
      suggestions: [],
      executiveSummary: fallbackSummary,
    };
  }
}
