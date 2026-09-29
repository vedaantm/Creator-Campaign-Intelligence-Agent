import { CONFIG } from '../../../shared/config.ts';
import {
  Creator,
  CreatorMetrics,
  CreatorScores,
  CreatorTier,
  CreatorVideo,
} from '../../../shared/types.ts';

export interface ScoringWeights {
  nicheFit: number;
  audienceFit: number;
  engagement: number;
  toneFit: number;
  brandSafety: number;
  reach: number;
  budgetFit: number;
  consistency: number;
  recency: number;
}

/**
 * Normalizes title for citation matching:
 * lowercase, removes quotes/punctuation, collapses whitespace.
 */
export function normalizeTitle(title: string): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/["'“”‘’`]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Verifies citations against a real list of video titles.
 * Returns valid matching video titles.
 */
export function verifyCitations(citedTitles: string[], validVideos: CreatorVideo[]): string[] {
  if (!citedTitles || citedTitles.length === 0 || !validVideos || validVideos.length === 0) {
    return [];
  }

  const validNormalized = validVideos.map((v) => ({
    original: v.title,
    norm: normalizeTitle(v.title),
  }));

  const verified: string[] = [];

  for (const rawCitation of citedTitles) {
    const normCitation = normalizeTitle(rawCitation);
    if (!normCitation) continue;

    // Check exact match or normalized match, or substring match if citation is substantial (>= 10 chars)
    const found = validNormalized.find(
      (v) =>
        v.norm === normCitation ||
        (normCitation.length >= 10 && (v.norm.includes(normCitation) || normCitation.includes(v.norm)))
    );

    if (found && !verified.includes(found.original)) {
      verified.push(found.original);
    }
  }

  return verified;
}

/**
 * Computes absolute score from min and target thresholds.
 */
function computeAbsoluteScore(value: number, min: number, target: number): number {
  if (value <= min) return 0;
  if (value >= target) return 100;
  return Math.round(((value - min) / (target - min)) * 100);
}

/**
 * Computes percentile rank (0 to 100) of a value within an array of values.
 * Returns 50 if only 1 item or all items are equal.
 */
export function computePercentileRank(value: number, allValues: number[]): number {
  if (allValues.length <= 1) return 50;

  const countStrictlyBelow = allValues.filter((v) => v < value).length;
  const countEqual = allValues.filter((v) => v === value).length;

  // Mid-rank percentile: (below + 0.5 * equal) / total * 100
  const rank = ((countStrictlyBelow + 0.5 * countEqual) / allValues.length) * 100;
  return Math.round(rank);
}

/**
 * Recency Score: 100 if last upload <= 14 days ago, falling linearly to 0 at 120 days.
 */
export function computeRecencyScore(daysSinceLastUpload: number): number {
  if (daysSinceLastUpload <= 14) return 100;
  if (daysSinceLastUpload >= 120) return 0;
  const score = 100 - ((daysSinceLastUpload - 14) / (120 - 14)) * 100;
  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * Budget Fit Score:
 * For multiple creators: 100 if midpoint cost <= budget / max(3, candidates / 2),
 * falling linearly to 0 when one video would cost the whole budget.
 * For a single creator: compares cost against budget (100 if <= 25% of campaign budget,
 * falling linearly to 0 at 100% of budget).
 */
export function computeBudgetFitScore(
  costLow: number,
  costHigh: number,
  campaignBudget: number,
  candidatesCount: number
): number {
  if (campaignBudget <= 0) return 50;

  const midpoint = (costLow + costHigh) / 2;

  if (candidatesCount <= 1) {
    // Single creator allocation target: 25% of campaign budget
    const target = campaignBudget * 0.25;
    if (midpoint <= target) return 100;
    if (midpoint >= campaignBudget) return 0;
    const score = 100 * (1 - (midpoint - target) / (campaignBudget - target));
    return Math.round(Math.max(0, Math.min(100, score)));
  }

  const divisor = Math.max(3, candidatesCount / 2);
  const targetPerCreator = campaignBudget / divisor;

  if (midpoint <= targetPerCreator) return 100;
  if (midpoint >= campaignBudget) return 0;

  const score = 100 * (1 - (midpoint - targetPerCreator) / (campaignBudget - targetPerCreator));
  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * Determines fit tier: Strong fit (75+), Possible fit (55-74), Weak fit (<55).
 */
export function determineTier(fitScore: number): CreatorTier {
  if (fitScore >= CONFIG.TIERS.STRONG_FIT_MIN) return 'Strong fit';
  if (fitScore >= CONFIG.TIERS.POSSIBLE_FIT_MIN) return 'Possible fit';
  return 'Weak fit';
}

/**
 * Computes composite fitScore (0-100) using weighted sum.
 * Applies brandSafety cap if brandSafety < 40.
 */
export function computeCompositeFitScore(
  scores: {
    nicheFit: number;
    audienceFit: number;
    engagement: number;
    toneFit: number;
    brandSafety: number;
    reach: number;
    budgetFit: number;
    consistency: number;
    recency: number;
  },
  weights: ScoringWeights = CONFIG.DEFAULT_SCORING_WEIGHTS
): { fitScore: number; tier: CreatorTier; brandSafetyCapped: boolean; brandSafetyWarning?: string } {
  const totalWeight =
    weights.nicheFit +
    weights.audienceFit +
    weights.engagement +
    weights.toneFit +
    weights.brandSafety +
    weights.reach +
    weights.budgetFit +
    weights.consistency +
    weights.recency;

  const normalizedTotalWeight = totalWeight > 0 ? totalWeight : 100;

  const weightedSum =
    scores.nicheFit * weights.nicheFit +
    scores.audienceFit * weights.audienceFit +
    scores.engagement * weights.engagement +
    scores.toneFit * weights.toneFit +
    scores.brandSafety * weights.brandSafety +
    scores.reach * weights.reach +
    scores.budgetFit * weights.budgetFit +
    scores.consistency * weights.consistency +
    scores.recency * weights.recency;

  let rawFitScore = Math.round(weightedSum / normalizedTotalWeight);
  rawFitScore = Math.max(0, Math.min(100, rawFitScore));

  let brandSafetyCapped = false;
  let brandSafetyWarning: string | undefined;

  if (scores.brandSafety < 40) {
    if (rawFitScore > 50) {
      rawFitScore = 50;
      brandSafetyCapped = true;
      brandSafetyWarning = 'Brand safety score is below 40. Fit Score has been capped at 50.';
    }
  }

  const tier = determineTier(rawFitScore);
  return { fitScore: rawFitScore, tier, brandSafetyCapped, brandSafetyWarning };
}

/**
 * Computes quantitative sub-scores for a creator given population values:
 * engagementScore, reachScore, consistencyScore, recencyScore, budgetFitScore.
 * If population has only 1 creator, uses absolute scale alone.
 * Otherwise 50% percentile + 50% absolute scale.
 */
export function computeQuantitativeScores(
  metrics: CreatorMetrics,
  campaignBudget: number,
  candidatesCount: number,
  allMetrics: CreatorMetrics[]
): {
  engagementScore: number;
  reachScore: number;
  consistencyScore: number;
  recencyScore: number;
  budgetFitScore: number;
} {
  // Engagement: use long-form or shorts median engagement
  const rawEngagement =
    metrics.longForm.medianEngagementRate || metrics.shorts.medianEngagementRate || 0;
  const absEngagement = computeAbsoluteScore(
    rawEngagement,
    CONFIG.SCORING_THRESHOLDS.engagement.min,
    CONFIG.SCORING_THRESHOLDS.engagement.target
  );

  // Reach: use long-form or shorts median views
  const rawReach = metrics.longForm.medianViews || metrics.shorts.medianViews || 0;
  const absReach = computeAbsoluteScore(
    rawReach,
    CONFIG.SCORING_THRESHOLDS.reach.min,
    CONFIG.SCORING_THRESHOLDS.reach.target
  );

  // Consistency: 0 to 1
  const rawConsistency = metrics.consistency ?? 0.5;
  const absConsistency = computeAbsoluteScore(
    rawConsistency,
    CONFIG.SCORING_THRESHOLDS.consistency.min,
    CONFIG.SCORING_THRESHOLDS.consistency.target
  );

  const isSolo = allMetrics.length <= 1 || candidatesCount <= 1;

  let engagementScore = absEngagement;
  let reachScore = absReach;
  let consistencyScore = absConsistency;

  if (!isSolo) {
    const allEngagements = allMetrics.map(
      (m) => m.longForm.medianEngagementRate || m.shorts.medianEngagementRate || 0
    );
    const allReaches = allMetrics.map((m) => m.longForm.medianViews || m.shorts.medianViews || 0);
    const allConsistencies = allMetrics.map((m) => m.consistency ?? 0.5);

    const pEngagement = computePercentileRank(rawEngagement, allEngagements);
    const pReach = computePercentileRank(rawReach, allReaches);
    const pConsistency = computePercentileRank(rawConsistency, allConsistencies);

    engagementScore = Math.round(0.5 * pEngagement + 0.5 * absEngagement);
    reachScore = Math.round(0.5 * pReach + 0.5 * absReach);
    consistencyScore = Math.round(0.5 * pConsistency + 0.5 * absConsistency);
  }

  const recencyScore = computeRecencyScore(metrics.daysSinceLastUpload);
  const budgetFitScore = computeBudgetFitScore(
    metrics.estimatedCostPerVideoUsd.low,
    metrics.estimatedCostPerVideoUsd.high,
    campaignBudget,
    candidatesCount
  );

  return {
    engagementScore,
    reachScore,
    consistencyScore,
    recencyScore,
    budgetFitScore,
  };
}

/**
 * Recomputes quantitative sub-scores, percentiles, and composite fit scores
 * for all analyzed creators in a campaign.
 * Called whenever a creator is added, removed, or re-analyzed (pure code, NO AI calls).
 */
export function recomputeAllScores(
  creators: Creator[],
  campaignBudget: number,
  weights: ScoringWeights = CONFIG.DEFAULT_SCORING_WEIGHTS
): Creator[] {
  const analyzedCreators = creators.filter(
    (c) => c.status === 'analyzed' && c.metrics && c.scores
  );

  if (analyzedCreators.length === 0) {
    return creators;
  }

  const allMetrics = analyzedCreators.map((c) => c.metrics!);
  const candidatesCount = creators.length;

  return creators.map((creator) => {
    if (creator.status !== 'analyzed' || !creator.metrics || !creator.scores) {
      return creator;
    }

    const quant = computeQuantitativeScores(
      creator.metrics,
      campaignBudget,
      candidatesCount,
      allMetrics
    );

    const composite = computeCompositeFitScore(
      {
        nicheFit: creator.scores.nicheFit,
        audienceFit: creator.scores.audienceFit,
        engagement: quant.engagementScore,
        toneFit: creator.scores.toneFit,
        brandSafety: creator.scores.brandSafety,
        reach: quant.reachScore,
        budgetFit: quant.budgetFitScore,
        consistency: quant.consistencyScore,
        recency: quant.recencyScore,
      },
      weights
    );

    const updatedScores: CreatorScores = {
      ...creator.scores,
      engagementScore: quant.engagementScore,
      reachScore: quant.reachScore,
      consistencyScore: quant.consistencyScore,
      recencyScore: quant.recencyScore,
      budgetFitScore: quant.budgetFitScore,
      fitScore: composite.fitScore,
      tier: composite.tier,
      brandSafetyCapped: composite.brandSafetyCapped,
      brandSafetyWarning: composite.brandSafetyWarning,
    };

    return {
      ...creator,
      scores: updatedScores,
    };
  });
}
