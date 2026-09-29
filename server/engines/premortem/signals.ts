import { CONFIG } from '../../../shared/config.ts';
import {
  Creator,
  PairwiseOverlapResult,
  LineupMetrics,
  LineupCreatorMetrics,
} from '../../../shared/types.ts';

// -------------------------------------------------------------
// Pure Set and Vector Math Functions
// -------------------------------------------------------------

/**
 * Computes Jaccard similarity index between two sets or string arrays.
 * J(A, B) = |A ∩ B| / |A ∪ B|
 * Returns a number between 0 and 1. If both sets are empty, returns 0.
 */
export function computeJaccardSimilarity(
  setA: Set<string> | string[],
  setB: Set<string> | string[]
): number {
  const sA = setA instanceof Set ? setA : new Set(setA);
  const sB = setB instanceof Set ? setB : new Set(setB);

  if (sA.size === 0 && sB.size === 0) return 0;

  let intersectionSize = 0;
  for (const item of sA) {
    if (sB.has(item)) {
      intersectionSize++;
    }
  }

  const unionSize = sA.size + sB.size - intersectionSize;
  if (unionSize === 0) return 0;

  return intersectionSize / unionSize;
}

/**
 * Computes Cosine Similarity between two numerical vectors.
 * Cos(A, B) = (A · B) / (||A|| * ||B||)
 * Clamped between 0 and 1 for positive semantic embeddings.
 */
export function computeCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA <= 0 || normB <= 0) return 0;

  const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  return Math.max(0, Math.min(1, similarity));
}

/**
 * Average a collection of vector embeddings into a single centroid vector.
 */
export function averageEmbeddings(vectors: number[][]): number[] {
  if (!vectors || vectors.length === 0) return [];
  const dim = vectors[0].length;
  const result = new Array(dim).fill(0);

  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) {
      result[i] += vec[i];
    }
  }

  for (let i = 0; i < dim; i++) {
    result[i] /= vectors.length;
  }

  return result;
}

// -------------------------------------------------------------
// Pairwise Overlap with Re-Normalized Weights
// -------------------------------------------------------------

export interface RawPairSignals {
  commentersA: string[];
  commentersB: string[];
  embeddingA?: number[] | null;
  embeddingB?: number[] | null;
  tagsA: string[];
  tagsB: string[];
  videosCountA: number;
  videosCountB: number;
}

/**
 * Computes pairwise overlap (0-100) using available signals,
 * automatically re-normalizing weights if commenter data is insufficient.
 */
export function computePairOverlap(
  creatorA: { id: string; name: string },
  creatorB: { id: string; name: string },
  signals: RawPairSignals,
  baseWeights = CONFIG.PREMORTEM_WEIGHTS
): PairwiseOverlapResult {
  const minCommenters = CONFIG.PREMORTEM_MIN_UNIQUE_COMMENTERS;
  const setCommentersA = new Set(signals.commentersA.filter(Boolean));
  const setCommentersB = new Set(signals.commentersB.filter(Boolean));

  const hasCommenterSignal =
    setCommentersA.size >= minCommenters && setCommentersB.size >= minCommenters;

  let commenterJaccard: number | null = null;
  if (hasCommenterSignal) {
    commenterJaccard = computeJaccardSimilarity(setCommentersA, setCommentersB);
  }

  // Content similarity
  let contentCosine: number | null = null;
  if (
    signals.embeddingA &&
    signals.embeddingB &&
    signals.embeddingA.length > 0 &&
    signals.embeddingA.length === signals.embeddingB.length
  ) {
    contentCosine = computeCosineSimilarity(signals.embeddingA, signals.embeddingB);
  }

  // Tags & Topics overlap
  const tagJaccard = computeJaccardSimilarity(
    signals.tagsA.map((t) => t.toLowerCase().trim()),
    signals.tagsB.map((t) => t.toLowerCase().trim())
  );

  // Determine signals used and re-normalize weights
  const activeWeights: { key: string; weight: number; value: number }[] = [];

  if (commenterJaccard !== null) {
    activeWeights.push({
      key: 'commenter',
      weight: baseWeights.commenter,
      value: commenterJaccard,
    });
  }

  if (contentCosine !== null) {
    activeWeights.push({
      key: 'content',
      weight: baseWeights.content,
      value: contentCosine,
    });
  }

  // Tags always available (even if 0 tags, Jaccard is 0)
  activeWeights.push({
    key: 'tags',
    weight: baseWeights.tags,
    value: tagJaccard,
  });

  const totalActiveWeight = activeWeights.reduce((sum, item) => sum + item.weight, 0);

  let combinedSimilarity = 0;
  if (totalActiveWeight > 0) {
    for (const item of activeWeights) {
      const normalizedWeight = item.weight / totalActiveWeight;
      combinedSimilarity += normalizedWeight * item.value;
    }
  }

  const pairOverlap = Math.round(combinedSimilarity * 100 * 10) / 10; // 0-100 to 1 decimal place

  // Count shared commenters
  let sharedCommenters = 0;
  for (const c of setCommentersA) {
    if (setCommentersB.has(c)) sharedCommenters++;
  }

  return {
    creatorIdA: creatorA.id,
    creatorIdB: creatorB.id,
    creatorNameA: creatorA.name,
    creatorNameB: creatorB.name,
    pairOverlap,
    commenterOverlap: commenterJaccard !== null ? Math.round(commenterJaccard * 100 * 10) / 10 : null,
    contentSimilarity: contentCosine !== null ? Math.round(contentCosine * 100 * 10) / 10 : null,
    tagOverlap: Math.round(tagJaccard * 100 * 10) / 10,
    signalsUsed: activeWeights.map((w) => w.key),
    rawValues: {
      commenterJaccard,
      contentCosine,
      tagJaccard,
    },
    sampleSizes: {
      commentersA: setCommentersA.size,
      commentersB: setCommentersB.size,
      sharedCommenters,
      videosA: signals.videosCountA,
      videosB: signals.videosCountB,
    },
    methodExplanation:
      'Estimated overlap based on public comment authors, semantic video embeddings, and niche metadata. YouTube does not disclose true private audience overlaps.',
  };
}

// -------------------------------------------------------------
// Overlap-Adjusted Reach Calculation
// -------------------------------------------------------------

/**
 * Calculates raw reach and overlap-adjusted reach across a cohort of creators.
 * Formula:
 * rawReach = sum of each creator's medianViews.
 * overlapAdjustedReach = rawReach - sum over all pairs (pairOverlap% * min(viewsA, viewsB)).
 * Hard lower bound: overlapAdjustedReach >= max(individual creator medianViews).
 */
export function computeOverlapAdjustedReach(
  creatorMedians: Array<{ id: string; medianViews: number }>,
  pairwiseOverlaps: PairwiseOverlapResult[]
): { rawReach: number; overlapAdjustedReach: number; reachDeduplicationRatio: number } {
  if (creatorMedians.length === 0) {
    return { rawReach: 0, overlapAdjustedReach: 0, reachDeduplicationRatio: 0 };
  }

  const rawReach = creatorMedians.reduce((sum, c) => sum + Math.max(0, c.medianViews), 0);
  const maxSingleReach = Math.max(...creatorMedians.map((c) => Math.max(0, c.medianViews)));

  if (creatorMedians.length === 1) {
    return { rawReach, overlapAdjustedReach: rawReach, reachDeduplicationRatio: 0 };
  }

  const viewsMap = new Map(creatorMedians.map((c) => [c.id, Math.max(0, c.medianViews)]));

  let totalOverlapDeduction = 0;
  for (const pair of pairwiseOverlaps) {
    const viewsA = viewsMap.get(pair.creatorIdA) || 0;
    const viewsB = viewsMap.get(pair.creatorIdB) || 0;
    const smallerViews = Math.min(viewsA, viewsB);

    const deduction = (pair.pairOverlap / 100) * smallerViews;
    totalOverlapDeduction += deduction;
  }

  let adjusted = rawReach - totalOverlapDeduction;
  // Never lower than the largest single creator's median views
  if (adjusted < maxSingleReach) {
    adjusted = maxSingleReach;
  }

  adjusted = Math.round(adjusted);
  const deduplicationRatio = rawReach > 0 ? (rawReach - adjusted) / rawReach : 0;

  return {
    rawReach,
    overlapAdjustedReach: adjusted,
    reachDeduplicationRatio: Math.round(deduplicationRatio * 1000) / 1000,
  };
}

// -------------------------------------------------------------
// Lineup Budget & Commercial Concentration Metrics
// -------------------------------------------------------------

export function computeLineupBudgetMetrics(
  creators: Array<{ id: string; metrics: Creator['metrics'] }>,
  budgetUsd: number
): {
  totalCostLow: number;
  totalCostHigh: number;
  totalCostMidpoint: number;
  isOverBudget: boolean;
  largestCreatorCostShare: number;
  largestCreatorId: string;
} {
  let totalCostLow = 0;
  let totalCostHigh = 0;
  let totalCostMidpoint = 0;

  const costByCreator: Array<{ id: string; midpoint: number }> = [];

  for (const c of creators) {
    const low = c.metrics?.estimatedCostPerVideoUsd?.low || 0;
    const high = c.metrics?.estimatedCostPerVideoUsd?.high || 0;
    const midpoint = (low + high) / 2;

    totalCostLow += low;
    totalCostHigh += high;
    totalCostMidpoint += midpoint;

    costByCreator.push({ id: c.id, midpoint });
  }

  let largestCreatorCostShare = 0;
  let largestCreatorId = '';

  if (totalCostMidpoint > 0) {
    costByCreator.sort((a, b) => b.midpoint - a.midpoint);
    const top = costByCreator[0];
    largestCreatorCostShare = Math.round((top.midpoint / totalCostMidpoint) * 1000) / 1000;
    largestCreatorId = top.id;
  }

  return {
    totalCostLow: Math.round(totalCostLow),
    totalCostHigh: Math.round(totalCostHigh),
    totalCostMidpoint: Math.round(totalCostMidpoint),
    isOverBudget: totalCostMidpoint > budgetUsd,
    largestCreatorCostShare,
    largestCreatorId,
  };
}
