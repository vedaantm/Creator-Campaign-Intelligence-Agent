import { CONFIG } from '../../../shared/config.ts';
import {
  Creator,
  HealthPenalty,
  PairwiseOverlapResult,
  LineupMetrics,
  PremortemConfidence,
  PremortemHealthLabel,
} from '../../../shared/types.ts';

export interface HealthScoreInput {
  creators: Creator[];
  pairwiseResults: PairwiseOverlapResult[];
  lineupMetrics: LineupMetrics;
  budgetUsd: number;
}

export interface HealthScoreResult {
  healthScore: number;
  label: PremortemHealthLabel;
  confidence: PremortemConfidence;
  penalties: HealthPenalty[];
}

/**
 * Pure function to compute the Pre-Mortem Lineup Health Score (0-100),
 * applying itemized deterministic penalties from CONFIG.
 */
export function calculateHealthScore(input: HealthScoreInput): HealthScoreResult {
  const { creators, pairwiseResults, lineupMetrics, budgetUsd } = input;
  const penalties: HealthPenalty[] = [];
  let score = 100;

  // 1. Pairwise Overlap Penalties
  // "each pair with pairOverlap above 40: -8 (above 60: -15)"
  for (const pair of pairwiseResults) {
    if (pair.pairOverlap > CONFIG.PREMORTEM_PENALTIES.PAIR_OVERLAP_HIGH.threshold) {
      const p = CONFIG.PREMORTEM_PENALTIES.PAIR_OVERLAP_HIGH.penalty;
      score -= p;
      penalties.push({
        id: `overlap_${pair.creatorIdA}_${pair.creatorIdB}`,
        category: 'overlap',
        penalty: p,
        reason: `High audience overlap (${pair.pairOverlap}%) between ${pair.creatorNameA} and ${pair.creatorNameB}`,
        details: { pairOverlap: pair.pairOverlap, creatorIdA: pair.creatorIdA, creatorIdB: pair.creatorIdB },
      });
    } else if (pair.pairOverlap > CONFIG.PREMORTEM_PENALTIES.PAIR_OVERLAP_MEDIUM.threshold) {
      const p = CONFIG.PREMORTEM_PENALTIES.PAIR_OVERLAP_MEDIUM.penalty;
      score -= p;
      penalties.push({
        id: `overlap_${pair.creatorIdA}_${pair.creatorIdB}`,
        category: 'overlap',
        penalty: p,
        reason: `Moderate audience overlap (${pair.pairOverlap}%) between ${pair.creatorNameA} and ${pair.creatorNameB}`,
        details: { pairOverlap: pair.pairOverlap, creatorIdA: pair.creatorIdA, creatorIdB: pair.creatorIdB },
      });
    }
  }

  // 2. Creator Sentiment & Negative Share Penalties
  // "each creator with negativeShare above 20%: -6 (above 35%: -12)"
  for (const c of creators) {
    const creatorMetric = lineupMetrics.creatorMetrics[c.id];
    const negativeShare = creatorMetric?.negativeShare ?? 0;
    const name = c.channel?.title || c.normalizedKey;

    if (negativeShare > CONFIG.PREMORTEM_PENALTIES.NEGATIVE_SHARE_HIGH.threshold) {
      const p = CONFIG.PREMORTEM_PENALTIES.NEGATIVE_SHARE_HIGH.penalty;
      score -= p;
      penalties.push({
        id: `sentiment_high_${c.id}`,
        category: 'sentiment',
        penalty: p,
        reason: `High comment negativity (${Math.round(negativeShare * 100)}%) on ${name}'s recent content`,
        details: { creatorId: c.id, negativeShare },
      });
    } else if (negativeShare > CONFIG.PREMORTEM_PENALTIES.NEGATIVE_SHARE_MEDIUM.threshold) {
      const p = CONFIG.PREMORTEM_PENALTIES.NEGATIVE_SHARE_MEDIUM.penalty;
      score -= p;
      penalties.push({
        id: `sentiment_med_${c.id}`,
        category: 'sentiment',
        penalty: p,
        reason: `Elevated comment negativity (${Math.round(negativeShare * 100)}%) on ${name}'s recent content`,
        details: { creatorId: c.id, negativeShare },
      });
    }

    // 3. Ad Fatigue Penalty
    // "adFatigueShare above 10%: -4"
    const adFatigueShare = creatorMetric?.adFatigueShare ?? 0;
    if (adFatigueShare > CONFIG.PREMORTEM_PENALTIES.AD_FATIGUE_SHARE.threshold) {
      const p = CONFIG.PREMORTEM_PENALTIES.AD_FATIGUE_SHARE.penalty;
      score -= p;
      penalties.push({
        id: `fatigue_${c.id}`,
        category: 'fatigue',
        penalty: p,
        reason: `Viewer sponsorship fatigue detected (${Math.round(adFatigueShare * 100)}% complaints) on ${name}`,
        details: { creatorId: c.id, adFatigueShare },
      });
    }

    // 4. Same-Category Sponsor in last 60 days: -7
    const categorySponsors = creatorMetric?.recentCategorySponsoredCount ?? 0;
    if (categorySponsors > 0) {
      const p = CONFIG.PREMORTEM_PENALTIES.SAME_CATEGORY_SPONSOR.penalty;
      score -= p;
      penalties.push({
        id: `same_cat_${c.id}`,
        category: 'fatigue',
        penalty: p,
        reason: `${name} published a sponsored video in the same product category within the last 60 days`,
        details: { creatorId: c.id, categorySponsors },
      });
    }

    // 5. Competitor Sponsor: -12
    const competitorSponsors = creatorMetric?.recentCompetitorSponsoredCount ?? 0;
    if (competitorSponsors > 0) {
      const p = CONFIG.PREMORTEM_PENALTIES.COMPETITOR_SPONSOR.penalty;
      score -= p;
      penalties.push({
        id: `competitor_${c.id}`,
        category: 'competitor',
        penalty: p,
        reason: `${name} has sponsored an active named competitor in recent content`,
        details: { creatorId: c.id, competitorSponsors },
      });
    }

    // 6. Engine 1 Brand Safety below 60: -10
    const brandSafetyScore = c.scores?.brandSafety ?? 100;
    if (brandSafetyScore < CONFIG.PREMORTEM_PENALTIES.BRAND_SAFETY_LOW.threshold) {
      const p = CONFIG.PREMORTEM_PENALTIES.BRAND_SAFETY_LOW.penalty;
      score -= p;
      penalties.push({
        id: `safety_${c.id}`,
        category: 'brandSafety',
        penalty: p,
        reason: `${name} has low brand safety score (${brandSafetyScore}/100) from Discovery Engine audit`,
        details: { creatorId: c.id, brandSafetyScore },
      });
    }
  }

  // 7. Budget Penalties
  // "total cost over budget: -15"
  if (lineupMetrics.isOverBudget) {
    const p = CONFIG.PREMORTEM_PENALTIES.OVER_BUDGET.penalty;
    score -= p;
    penalties.push({
      id: 'budget_over',
      category: 'budget',
      penalty: p,
      reason: `Lineup estimated cost ($${lineupMetrics.totalCostMidpoint.toLocaleString()}) exceeds campaign budget ($${budgetUsd.toLocaleString()})`,
      details: { totalCost: lineupMetrics.totalCostMidpoint, budgetUsd },
    });
  }

  // 8. Cost Concentration Penalty
  // "one creator above 50% of total cost: -8"
  if (lineupMetrics.largestCreatorCostShare > CONFIG.PREMORTEM_PENALTIES.COST_CONCENTRATION.threshold) {
    const p = CONFIG.PREMORTEM_PENALTIES.COST_CONCENTRATION.penalty;
    score -= p;
    const largestCreator = creators.find((c) => c.id === lineupMetrics.largestCreatorId);
    const largestName = largestCreator?.channel?.title || largestCreator?.normalizedKey || 'Single creator';
    penalties.push({
      id: 'budget_concentration',
      category: 'concentration',
      penalty: p,
      reason: `${largestName} consumes ${Math.round(lineupMetrics.largestCreatorCostShare * 100)}% of total lineup budget (> 50% concentration risk)`,
      details: { share: lineupMetrics.largestCreatorCostShare, creatorId: lineupMetrics.largestCreatorId },
    });
  }

  // Clamp healthScore to 0-100
  const healthScore = Math.max(0, Math.min(100, Math.round(score)));

  // Determine Health Label
  let label: PremortemHealthLabel = 'High risk — revise lineup';
  if (healthScore >= CONFIG.PREMORTEM_HEALTH_LABELS.READY_MIN) {
    label = 'Ready to launch';
  } else if (healthScore >= CONFIG.PREMORTEM_HEALTH_LABELS.FIXES_MIN) {
    label = 'Launch with fixes';
  }

  // Determine Confidence (high | medium | low) based on share of signals with sufficient data
  let totalDataPoints = 0;
  let validDataPoints = 0;

  // Pairwise commenter data points
  for (const pair of pairwiseResults) {
    totalDataPoints += 2; // Commenter + Content
    if (pair.commenterOverlap !== null) validDataPoints++;
    if (pair.contentSimilarity !== null) validDataPoints++;
  }

  // Creator comment telemetry data points
  for (const c of creators) {
    totalDataPoints += 2; // Comments present + Videos present
    if (c.recentVideos && c.recentVideos.length > 0) validDataPoints++;
    const cm = lineupMetrics.creatorMetrics[c.id];
    if (cm?.hasSufficientCommentData) validDataPoints++;
  }

  const confidenceRatio = totalDataPoints > 0 ? validDataPoints / totalDataPoints : 0;
  let confidence: PremortemConfidence = 'low';
  if (confidenceRatio >= 0.75) {
    confidence = 'high';
  } else if (confidenceRatio >= 0.45) {
    confidence = 'medium';
  }

  return {
    healthScore,
    label,
    confidence,
    penalties,
  };
}
