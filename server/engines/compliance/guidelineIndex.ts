import crypto from 'node:crypto';
import { embed } from '../../services/gemini.ts';
import { computeCosineSimilarity } from '../premortem/signals.ts';

export interface GuidelineRule {
  code: string;
  rule: string;
  type: 'do' | 'dont' | 'mandatory';
}

export interface IndexedGuidelineRule extends GuidelineRule {
  embedding: number[];
}

export interface GuidelineIndex {
  hash: string;
  items: IndexedGuidelineRule[];
  createdAt: string;
  isStale?: boolean;
}

// In-memory cache for guideline indices
let cachedGuidelineIndex: GuidelineIndex | null = null;

/**
  * Computes a deterministic hash of all active guideline rule texts.
  */
export function computeGuidelineHash(guidelines: GuidelineRule[]): string {
  if (!guidelines || guidelines.length === 0) return 'empty';
  const canonicalStr = guidelines
    .map((g) => `${g.code.toUpperCase()}:${g.type.toLowerCase()}:${g.rule.trim()}`)
    .sort()
    .join('|');

  return crypto.createHash('sha256').update(canonicalStr).digest('hex');
}

/**
  * Marks the guideline index cache as stale, forcing the next call to rebuild.
  */
export function markGuidelineIndexStale(): void {
  if (cachedGuidelineIndex) {
    cachedGuidelineIndex.isStale = true;
  }
}

/**
  * Builds or retrieves the cached guideline embedding index.
  * Rebuilds only when the hash changes or the index is marked stale.
  */
export async function getOrBuildGuidelineIndex(
  guidelines: GuidelineRule[],
  options?: { forceRebuild?: boolean }
): Promise<GuidelineIndex> {
  const currentHash = computeGuidelineHash(guidelines);

  if (
    !options?.forceRebuild &&
    cachedGuidelineIndex &&
    cachedGuidelineIndex.hash === currentHash &&
    !cachedGuidelineIndex.isStale
  ) {
    return cachedGuidelineIndex;
  }

  // If empty guidelines provided
  if (!guidelines || guidelines.length === 0) {
    const emptyIndex: GuidelineIndex = {
      hash: currentHash,
      items: [],
      createdAt: new Date().toISOString(),
      isStale: false,
    };
    cachedGuidelineIndex = emptyIndex;
    return emptyIndex;
  }

  // Generate embeddings for each guideline rule text
  const textsToEmbed = guidelines.map((g) => `[${g.code}] ${g.type.toUpperCase()}: ${g.rule}`);
  let embeddings: number[][] = [];

  try {
    embeddings = await embed(textsToEmbed);
  } catch (err) {
    console.warn('[GuidelineIndex] Failed to fetch embeddings from Gemini, building zero-vectors fallback:', (err as Error).message);
    embeddings = guidelines.map(() => new Array(768).fill(0));
  }

  const items: IndexedGuidelineRule[] = guidelines.map((g, idx) => ({
    ...g,
    embedding: embeddings[idx] || new Array(768).fill(0),
  }));

  const newIndex: GuidelineIndex = {
    hash: currentHash,
    items,
    createdAt: new Date().toISOString(),
    isStale: false,
  };

  cachedGuidelineIndex = newIndex;
  return newIndex;
}

/**
  * Finds the top K most similar guidelines for a given query embedding vector.
  */
export function findTopSimilarGuidelines(
  queryEmbedding: number[],
  index: GuidelineIndex,
  topK = 3
): Array<IndexedGuidelineRule & { similarityScore: number }> {
  if (!index || !index.items || index.items.length === 0 || !queryEmbedding || queryEmbedding.length === 0) {
    return [];
  }

  const scored = index.items.map((item) => {
    const similarityScore = computeCosineSimilarity(queryEmbedding, item.embedding);
    return {
      ...item,
      similarityScore,
    };
  });

  // Sort descending by similarity score
  scored.sort((a, b) => b.similarityScore - a.similarityScore);

  return scored.slice(0, topK);
}

/**
  * Resets the guideline index cache (useful for testing).
  */
export function resetGuidelineIndexCacheForTesting(): void {
  cachedGuidelineIndex = null;
}
