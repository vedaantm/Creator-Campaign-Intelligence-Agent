import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  computeGuidelineHash,
  getOrBuildGuidelineIndex,
  findTopSimilarGuidelines,
  markGuidelineIndexStale,
  resetGuidelineIndexCacheForTesting,
  GuidelineRule,
} from '../engines/compliance/guidelineIndex.ts';

vi.mock('../services/gemini.ts', () => ({
  embed: vi.fn().mockImplementation(async (texts: string[]) => {
    return texts.map((t, idx) => {
      // Mock simple orthogonal/predictable vectors
      const vec = new Array(4).fill(0);
      vec[idx % 4] = 1.0;
      return vec;
    });
  }),
}));

describe('Phase 6 — Section A: Guideline Embedding Index Engine', () => {
  beforeEach(() => {
    resetGuidelineIndexCacheForTesting();
  });

  const sampleGuidelines: GuidelineRule[] = [
    { code: 'G-1', rule: 'Must clearly disclose sponsorship in title or description and verbally within first 30 seconds (#ad / sponsored).', type: 'mandatory' },
    { code: 'G-2', rule: 'Do not make unverified medical, curing, guaranteed financial, or non-approved performance claims.', type: 'dont' },
    { code: 'G-3', rule: 'Demonstrate product in actual use with clear visual focus for at least 15 seconds.', type: 'do' },
  ];

  it('computeGuidelineHash produces consistent SHA-256 hash regardless of input order', () => {
    const hash1 = computeGuidelineHash(sampleGuidelines);
    const hash2 = computeGuidelineHash([...sampleGuidelines].reverse());
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA-256 hex string length
  });

  it('getOrBuildGuidelineIndex builds index and caches results', async () => {
    const index1 = await getOrBuildGuidelineIndex(sampleGuidelines);
    expect(index1.items.length).toBe(3);
    expect(index1.items[0].code).toBe('G-1');
    expect(index1.items[0].embedding.length).toBe(4);

    // Second call should return cached instance without rebuilding
    const index2 = await getOrBuildGuidelineIndex(sampleGuidelines);
    expect(index2.createdAt).toBe(index1.createdAt);
  });

  it('rebuilds index when guideline content or rules change', async () => {
    const index1 = await getOrBuildGuidelineIndex(sampleGuidelines);

    const modifiedGuidelines: GuidelineRule[] = [
      ...sampleGuidelines,
      { code: 'G-4', rule: 'Do not compare product directly to unapproved competitors.', type: 'dont' },
    ];

    const index2 = await getOrBuildGuidelineIndex(modifiedGuidelines);
    expect(index2.hash).not.toBe(index1.hash);
    expect(index2.items.length).toBe(4);
  });

  it('rebuilds index when marked stale', async () => {
    const index1 = await getOrBuildGuidelineIndex(sampleGuidelines);
    markGuidelineIndexStale();

    const index2 = await getOrBuildGuidelineIndex(sampleGuidelines);
    expect(index2.items.length).toBe(3);
  });

  it('findTopSimilarGuidelines ranks guidelines by cosine similarity', async () => {
    const index = await getOrBuildGuidelineIndex(sampleGuidelines);
    const queryVector = [1.0, 0.0, 0.0, 0.0];

    const topMatches = findTopSimilarGuidelines(queryVector, index, 2);
    expect(topMatches.length).toBe(2);
    expect(topMatches[0].code).toBe('G-1'); // Matched vector [1.0, 0.0, 0.0, 0.0]
    expect(topMatches[0].similarityScore).toBeCloseTo(1.0, 3);
  });
});
