import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApiApp } from '../apiPlugin.ts';
import { resetRepositoriesForTesting, getRepositories } from '../repositories/index.ts';
import { CONFIG } from '../../shared/config.ts';

vi.mock('../services/gemini.ts', () => ({
  embed: vi.fn().mockResolvedValue([[0.2, 0.4, 0.6, 0.8]]),
  generateStructured: vi.fn().mockImplementation(async ({ engine }) => {
    if (engine === 'Premortem:SponsorClassifier') {
      return { sponsors: [] };
    }
    if (engine === 'Premortem:Sentiment') {
      return {
        negativeCommentsCount: 1,
        adFatigueCommentsCount: 0,
        controversyDetected: false,
        notes: 'Positive sentiment',
      };
    }
    return {
      risks: [
        {
          category: 'budget',
          severity: 'medium',
          affectedCreatorIds: [],
          explanation: 'Budget allocation risk.',
          recommendation: 'Monitor cost.',
        },
      ],
      lineupSuggestions: [],
      executiveSummary: 'The lineup demonstrates solid health and consistent engagement. Overlap-adjusted reach delivers high efficiency within approved budget targets. Launch recommended with scheduled fatigue monitoring.',
    };
  }),
  wrapUntrustedData: (source: string, content: string) => `<untrusted_data source="${source}">\n${content}\n</untrusted_data>`,
  escapeUntrustedText: (text: string) => text,
}));
import {
  computeJaccardSimilarity,
  computeCosineSimilarity,
  averageEmbeddings,
  computePairOverlap,
  computeOverlapAdjustedReach,
  computeLineupBudgetMetrics,
} from '../engines/premortem/signals.ts';
import { calculateHealthScore } from '../engines/premortem/healthScore.ts';
import {
  Creator,
  PairwiseOverlapResult,
  LineupMetrics,
  CampaignBrief,
} from '../../shared/types.ts';

describe('Phase 4: Engine 4 — Pre-Mortem Simulator Suite', () => {
  let app: ReturnType<typeof createApiApp>;

  beforeEach(() => {
    resetRepositoriesForTesting();
    app = createApiApp();
  });

  // -------------------------------------------------------------
  // 1. Pure Math & Vector Signal Functions
  // -------------------------------------------------------------
  describe('1. Pure Mathematical Signals', () => {
    describe('computeJaccardSimilarity', () => {
      it('returns 1.0 for identical sets', () => {
        const setA = ['user_1', 'user_2', 'user_3'];
        const setB = ['user_3', 'user_1', 'user_2'];
        expect(computeJaccardSimilarity(setA, setB)).toBe(1.0);
      });

      it('returns 0.0 for disjoint sets', () => {
        const setA = ['user_1', 'user_2'];
        const setB = ['user_3', 'user_4'];
        expect(computeJaccardSimilarity(setA, setB)).toBe(0.0);
      });

      it('returns 0.0 for empty sets', () => {
        expect(computeJaccardSimilarity([], [])).toBe(0.0);
      });

      it('calculates exact intersection over union', () => {
        // A = {1, 2, 3, 4}, B = {3, 4, 5, 6}
        // Intersection = {3, 4} (size 2), Union = {1, 2, 3, 4, 5, 6} (size 6)
        // J = 2 / 6 = 1/3 ~ 0.3333
        const setA = ['1', '2', '3', '4'];
        const setB = ['3', '4', '5', '6'];
        expect(computeJaccardSimilarity(setA, setB)).toBeCloseTo(0.3333, 3);
      });
    });

    describe('computeCosineSimilarity', () => {
      it('returns 1.0 for identical non-zero vectors', () => {
        const vecA = [0.2, 0.4, 0.6, 0.8];
        const vecB = [0.2, 0.4, 0.6, 0.8];
        expect(computeCosineSimilarity(vecA, vecB)).toBeCloseTo(1.0, 5);
      });

      it('returns 0.0 for orthogonal vectors', () => {
        const vecA = [1, 0, 0];
        const vecB = [0, 1, 0];
        expect(computeCosineSimilarity(vecA, vecB)).toBe(0.0);
      });

      it('returns 0.0 for empty or zero vectors', () => {
        expect(computeCosineSimilarity([], [])).toBe(0.0);
        expect(computeCosineSimilarity([0, 0], [0, 0])).toBe(0.0);
      });

      it('returns 0.0 for dimension mismatch', () => {
        expect(computeCosineSimilarity([1, 2], [1, 2, 3])).toBe(0.0);
      });

      it('correctly calculates known cosine similarity', () => {
        // A = [3, 4], B = [4, 3]
        // Dot = 12 + 12 = 24. NormA = 5, NormB = 5. Cos = 24/25 = 0.96
        expect(computeCosineSimilarity([3, 4], [4, 3])).toBeCloseTo(0.96, 4);
      });
    });

    describe('averageEmbeddings', () => {
      it('computes centroid of multiple vectors', () => {
        const v1 = [1, 2, 3];
        const v2 = [3, 4, 5];
        expect(averageEmbeddings([v1, v2])).toEqual([2, 3, 4]);
      });
    });
  });

  // -------------------------------------------------------------
  // 2. Pairwise Overlap & Weight Re-Normalization
  // -------------------------------------------------------------
  describe('2. Pairwise Overlap & Adaptive Weight Re-Normalization', () => {
    it('uses all 3 signals when commenter data is sufficient (>= 30 commenters)', () => {
      // 30 unique commenters for each
      const commentersA = Array.from({ length: 40 }, (_, i) => `user_${i}`);
      const commentersB = Array.from({ length: 40 }, (_, i) => `user_${i + 20}`); // 20 shared
      const embeddingA = [0.5, 0.5];
      const embeddingB = [0.5, 0.5]; // 1.0 similarity
      const tagsA = ['coffee', 'espresso'];
      const tagsB = ['espresso', 'beans']; // 1/3 ~ 0.333 similarity

      const pair = computePairOverlap(
        { id: 'c1', name: 'Creator 1' },
        { id: 'c2', name: 'Creator 2' },
        {
          commentersA,
          commentersB,
          embeddingA,
          embeddingB,
          tagsA,
          tagsB,
          videosCountA: 10,
          videosCountB: 10,
        }
      );

      expect(pair.signalsUsed).toContain('commenter');
      expect(pair.signalsUsed).toContain('content');
      expect(pair.signalsUsed).toContain('tags');
      expect(pair.commenterOverlap).not.toBeNull();
      expect(pair.contentSimilarity).toBeCloseTo(100, 0);
      expect(pair.pairOverlap).toBeGreaterThan(0);
    });

    it('re-normalizes weights across content and tags when commenter data is insufficient (< 30)', () => {
      // Only 10 commenters (below 30 threshold)
      const commentersA = Array.from({ length: 10 }, (_, i) => `user_${i}`);
      const commentersB = Array.from({ length: 10 }, (_, i) => `user_${i}`);
      const embeddingA = [1, 0];
      const embeddingB = [1, 0]; // 1.0 similarity -> 100%
      const tagsA = ['tech'];
      const tagsB = ['tech']; // 1.0 similarity -> 100%

      const pair = computePairOverlap(
        { id: 'c1', name: 'Creator 1' },
        { id: 'c2', name: 'Creator 2' },
        {
          commentersA,
          commentersB,
          embeddingA,
          embeddingB,
          tagsA,
          tagsB,
          videosCountA: 5,
          videosCountB: 5,
        }
      );

      // Commenter signal must be excluded
      expect(pair.signalsUsed).not.toContain('commenter');
      expect(pair.signalsUsed).toContain('content');
      expect(pair.signalsUsed).toContain('tags');
      expect(pair.commenterOverlap).toBeNull();
      // Since content and tags are both 1.0, re-normalized combination must equal 100%
      expect(pair.pairOverlap).toBe(100);
    });
  });

  // -------------------------------------------------------------
  // 3. Overlap-Adjusted Reach & Budget
  // -------------------------------------------------------------
  describe('3. Overlap-Adjusted Reach Calculation', () => {
    it('deduplicates reach subtracting pairOverlap% * min(viewsA, viewsB)', () => {
      const creatorMedians = [
        { id: 'c1', medianViews: 100000 },
        { id: 'c2', medianViews: 50000 },
      ];

      // Pair overlap of 40%
      const pairs: PairwiseOverlapResult[] = [
        {
          creatorIdA: 'c1',
          creatorIdB: 'c2',
          creatorNameA: 'C1',
          creatorNameB: 'C2',
          pairOverlap: 40,
          commenterOverlap: 40,
          contentSimilarity: 40,
          tagOverlap: 40,
          signalsUsed: ['commenter'],
          rawValues: {},
          sampleSizes: { commentersA: 50, commentersB: 50, sharedCommenters: 20, videosA: 5, videosB: 5 },
          methodExplanation: '',
        },
      ];

      // Raw reach = 100k + 50k = 150k
      // Deduction = 40% * min(100k, 50k) = 40% * 50k = 20k
      // Adjusted reach = 150k - 20k = 130k
      const result = computeOverlapAdjustedReach(creatorMedians, pairs);
      expect(result.rawReach).toBe(150000);
      expect(result.overlapAdjustedReach).toBe(130000);
      expect(result.reachDeduplicationRatio).toBeCloseTo(20000 / 150000, 3);
    });

    it('enforces hard lower bound: overlapAdjustedReach never lower than the largest single creator', () => {
      const creatorMedians = [
        { id: 'c1', medianViews: 100000 },
        { id: 'c2', medianViews: 10000 },
        { id: 'c3', medianViews: 10000 },
      ];

      // Simulated extreme 100% overlap
      const pairs: PairwiseOverlapResult[] = [
        {
          creatorIdA: 'c1',
          creatorIdB: 'c2',
          creatorNameA: 'C1',
          creatorNameB: 'C2',
          pairOverlap: 100,
          commenterOverlap: 100,
          contentSimilarity: 100,
          tagOverlap: 100,
          signalsUsed: ['tags'],
          rawValues: {},
          sampleSizes: { commentersA: 0, commentersB: 0, sharedCommenters: 0, videosA: 5, videosB: 5 },
          methodExplanation: '',
        },
        {
          creatorIdA: 'c1',
          creatorIdB: 'c3',
          creatorNameA: 'C1',
          creatorNameB: 'C3',
          pairOverlap: 100,
          commenterOverlap: 100,
          contentSimilarity: 100,
          tagOverlap: 100,
          signalsUsed: ['tags'],
          rawValues: {},
          sampleSizes: { commentersA: 0, commentersB: 0, sharedCommenters: 0, videosA: 5, videosB: 5 },
          methodExplanation: '',
        },
        {
          creatorIdA: 'c2',
          creatorIdB: 'c3',
          creatorNameA: 'C2',
          creatorNameB: 'C3',
          pairOverlap: 100,
          commenterOverlap: 100,
          contentSimilarity: 100,
          tagOverlap: 100,
          signalsUsed: ['tags'],
          rawValues: {},
          sampleSizes: { commentersA: 0, commentersB: 0, sharedCommenters: 0, videosA: 5, videosB: 5 },
          methodExplanation: '',
        },
      ];

      const result = computeOverlapAdjustedReach(creatorMedians, pairs);
      expect(result.overlapAdjustedReach).toBeGreaterThanOrEqual(100000);
      expect(result.overlapAdjustedReach).toBe(100000);
    });
  });

  // -------------------------------------------------------------
  // 4. Health Score & Every Penalty Verification
  // -------------------------------------------------------------
  describe('4. Health Score Deterministic Penalties Suite', () => {
    const mockCreator = (id: string, brandSafety = 85): Creator => ({
      id,
      campaignId: 'cmp_1',
      input: `@${id}`,
      inputType: 'handle',
      normalizedKey: `@${id}`,
      status: 'analyzed',
      scores: {
        fitScore: 80,
        tier: 'Strong fit',
        engagementScore: 80,
        reachScore: 80,
        consistencyScore: 80,
        recencyScore: 80,
        budgetFitScore: 80,
        nicheFit: 80,
        audienceFit: 80,
        toneFit: 80,
        brandSafety,
        justifications: { nicheFit: '', audienceFit: '', toneFit: '', brandSafety: '' },
        citations: { nicheFit: [], audienceFit: [], toneFit: [], brandSafety: [] },
        lowConfidence: { nicheFit: false, audienceFit: false, toneFit: false, brandSafety: false },
        brandSafetyFlags: [],
        summary: '',
        brandSafetyCapped: false,
      },
      selected: true,
      notes: '',
      tags: [],
      recentVideos: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    });

    const baseLineupMetrics = (creators: Creator[], isOverBudget = false, largestShare = 0.3): LineupMetrics => ({
      rawReach: 200000,
      overlapAdjustedReach: 180000,
      reachDeduplicationRatio: 0.1,
      totalCostLow: 8000,
      totalCostHigh: 12000,
      totalCostMidpoint: 10000,
      budgetUsd: isOverBudget ? 8000 : 20000,
      isOverBudget,
      largestCreatorCostShare: largestShare,
      largestCreatorId: creators[0]?.id || '',
      creatorMetrics: Object.fromEntries(
        creators.map((c) => [
          c.id,
          {
            creatorId: c.id,
            channelTitle: c.normalizedKey,
            sponsoredVideosCount: 2,
            recentCategorySponsoredCount: 0,
            recentCompetitorSponsoredCount: 0,
            recentCategoryShare: 0,
            negativeShare: 0.05,
            adFatigueShare: 0.02,
            sentimentMethod: 'gemini',
            medianViews: 50000,
            estimatedCostMidpoint: 2500,
            costShare: 0.25,
            hasSufficientCommentData: true,
          },
        ])
      ),
    });

    it('starts at 100 for clean lineup with no penalties', () => {
      const c1 = mockCreator('c1');
      const c2 = mockCreator('c2');
      const metrics = baseLineupMetrics([c1, c2]);

      const res = calculateHealthScore({
        creators: [c1, c2],
        pairwiseResults: [],
        lineupMetrics: metrics,
        budgetUsd: 20000,
      });

      expect(res.healthScore).toBe(100);
      expect(res.label).toBe('Ready to launch');
      expect(res.penalties).toHaveLength(0);
    });

    it('applies -8 penalty for pair overlap > 40%, and -15 for > 60%', () => {
      const c1 = mockCreator('c1');
      const c2 = mockCreator('c2');
      const metrics = baseLineupMetrics([c1, c2]);

      // Medium overlap: 45% -> -8
      const pairMedium: PairwiseOverlapResult = {
        creatorIdA: 'c1',
        creatorIdB: 'c2',
        creatorNameA: 'C1',
        creatorNameB: 'C2',
        pairOverlap: 45,
        commenterOverlap: 45,
        contentSimilarity: 45,
        tagOverlap: 45,
        signalsUsed: ['commenter'],
        rawValues: {},
        sampleSizes: { commentersA: 50, commentersB: 50, sharedCommenters: 20, videosA: 5, videosB: 5 },
        methodExplanation: '',
      };

      const resMed = calculateHealthScore({
        creators: [c1, c2],
        pairwiseResults: [pairMedium],
        lineupMetrics: metrics,
        budgetUsd: 20000,
      });
      expect(resMed.healthScore).toBe(92); // 100 - 8

      // High overlap: 65% -> -15
      const pairHigh = { ...pairMedium, pairOverlap: 65 };
      const resHigh = calculateHealthScore({
        creators: [c1, c2],
        pairwiseResults: [pairHigh],
        lineupMetrics: metrics,
        budgetUsd: 20000,
      });
      expect(resHigh.healthScore).toBe(85); // 100 - 15
    });

    it('applies -6 penalty for negativeShare > 20%, and -12 for > 35%', () => {
      const c1 = mockCreator('c1');
      const c2 = mockCreator('c2');
      const metrics = baseLineupMetrics([c1, c2]);

      // 25% negativity -> -6
      metrics.creatorMetrics['c1'].negativeShare = 0.25;
      const resMed = calculateHealthScore({
        creators: [c1, c2],
        pairwiseResults: [],
        lineupMetrics: metrics,
        budgetUsd: 20000,
      });
      expect(resMed.healthScore).toBe(94); // 100 - 6

      // 40% negativity -> -12
      metrics.creatorMetrics['c1'].negativeShare = 0.40;
      const resHigh = calculateHealthScore({
        creators: [c1, c2],
        pairwiseResults: [],
        lineupMetrics: metrics,
        budgetUsd: 20000,
      });
      expect(resHigh.healthScore).toBe(88); // 100 - 12
    });

    it('applies -7 penalty for same-category sponsor in last 60 days', () => {
      const c1 = mockCreator('c1');
      const metrics = baseLineupMetrics([c1]);
      metrics.creatorMetrics['c1'].recentCategorySponsoredCount = 1;

      const res = calculateHealthScore({
        creators: [c1],
        pairwiseResults: [],
        lineupMetrics: metrics,
        budgetUsd: 20000,
      });
      expect(res.healthScore).toBe(93); // 100 - 7
    });

    it('applies -12 penalty for competitor sponsor', () => {
      const c1 = mockCreator('c1');
      const metrics = baseLineupMetrics([c1]);
      metrics.creatorMetrics['c1'].recentCompetitorSponsoredCount = 1;

      const res = calculateHealthScore({
        creators: [c1],
        pairwiseResults: [],
        lineupMetrics: metrics,
        budgetUsd: 20000,
      });
      expect(res.healthScore).toBe(88); // 100 - 12
    });

    it('applies -4 penalty for adFatigueShare > 10%', () => {
      const c1 = mockCreator('c1');
      const metrics = baseLineupMetrics([c1]);
      metrics.creatorMetrics['c1'].adFatigueShare = 0.15;

      const res = calculateHealthScore({
        creators: [c1],
        pairwiseResults: [],
        lineupMetrics: metrics,
        budgetUsd: 20000,
      });
      expect(res.healthScore).toBe(96); // 100 - 4
    });

    it('applies -15 penalty for total cost over budget', () => {
      const c1 = mockCreator('c1');
      const metrics = baseLineupMetrics([c1], true); // isOverBudget = true

      const res = calculateHealthScore({
        creators: [c1],
        pairwiseResults: [],
        lineupMetrics: metrics,
        budgetUsd: 5000,
      });
      expect(res.healthScore).toBe(85); // 100 - 15
    });

    it('applies -8 penalty for one creator consuming > 50% of total cost', () => {
      const c1 = mockCreator('c1');
      const metrics = baseLineupMetrics([c1], false, 0.65); // 65% cost share

      const res = calculateHealthScore({
        creators: [c1],
        pairwiseResults: [],
        lineupMetrics: metrics,
        budgetUsd: 20000,
      });
      expect(res.healthScore).toBe(92); // 100 - 8
    });

    it('applies -10 penalty for creator with brandSafety below 60', () => {
      const c1 = mockCreator('c1', 45); // Brand safety = 45 (< 60)
      const metrics = baseLineupMetrics([c1]);

      const res = calculateHealthScore({
        creators: [c1],
        pairwiseResults: [],
        lineupMetrics: metrics,
        budgetUsd: 20000,
      });
      expect(res.healthScore).toBe(90); // 100 - 10
    });

    it('clamps health score to minimum 0 and assigns "High risk — revise lineup"', () => {
      const c1 = mockCreator('c1', 30);
      const metrics = baseLineupMetrics([c1], true, 0.8);
      metrics.creatorMetrics['c1'].negativeShare = 0.50; // -12
      metrics.creatorMetrics['c1'].recentCompetitorSponsoredCount = 2; // -12
      metrics.creatorMetrics['c1'].recentCategorySponsoredCount = 1; // -7
      metrics.creatorMetrics['c1'].adFatigueShare = 0.25; // -4

      // 100 - 15 (budget) - 8 (concentration) - 10 (safety) - 12 - 12 - 7 - 4 = 32
      const res = calculateHealthScore({
        creators: [c1],
        pairwiseResults: [],
        lineupMetrics: metrics,
        budgetUsd: 2000,
      });
      expect(res.healthScore).toBe(32);
      expect(res.label).toBe('High risk — revise lineup');
    });
  });

  // -------------------------------------------------------------
  // 5. Scenario Tests & Full End-to-End API Routes
  // -------------------------------------------------------------
  describe('5. Scenario & Integration Endpoints', () => {
    let campaignId: string;
    let creator1Id: string;
    let creator2Id: string;
    const OWNER_AUTH = 'Bearer demo_user_owner';

    beforeEach(async () => {
      const repos = getRepositories();
      const campaign = await repos.campaigns.create({
        ownerId: 'demo_user_owner',
        ownerEmail: 'owner@example.com',
        memberEmails: [],
        name: 'Pre-Mortem Testing Campaign',
        status: 'draft',
        brief: {
          brandName: 'Wacaco',
          productName: 'Picopresso',
          productCategory: 'Coffee Equipment',
          landingPageUrl: 'https://wacaco.com/picopresso',
          approvedFacts: ['Manual hand-pump espresso machine capable of 18 bars of pressure.'],
          competitors: ['Flair Espresso', 'Aeropress'],
          bannedTerms: ['cheap plastic'],
          nicheKeywords: ['espresso', 'coffee'],
          targetAudience: 'Home baristas and travel enthusiasts seeking manual espresso extraction.',
          geography: 'US',
          tones: ['educational', 'authentic'],
          budgetUsd: 25000,
          goal: 'consideration',
          launchDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
          requiredDisclosures: { descriptionText: '#ad', verbalText: 'Sponsored by Wacaco' },
        },
        settings: {},
        approvedLineup: null,
      });
      campaignId = campaign.id;

      // Seed 2 analyzed creators
      const c1 = await repos.creators.create(campaignId, {
        campaignId,
        input: '@jameshoffmann',
        inputType: 'handle',
        normalizedKey: '@jameshoffmann',
        status: 'analyzed',
        channel: {
          channelId: 'UCjames',
          title: 'James Hoffmann',
          description: 'Specialty coffee roaster and author.',
          subscriberCount: 1500000,
          hiddenSubscriberCount: false,
          videoCount: 300,
          viewCount: 150000000,
          topicCategories: ['coffee', 'espresso'],
        },
        metrics: {
          subscribers: 1500000,
          videoCount: 300,
          channelAgeMonths: 60,
          country: 'GB',
          shorts: { count: 5, medianViews: 25000, medianEngagementRate: 0.05, likesHidden: false },
          longForm: { count: 10, medianViews: 120000, medianEngagementRate: 0.06, likesHidden: false },
          uploadsPerMonth: 4,
          daysSinceLastUpload: 5,
          consistency: 0.9,
          viewsToSubsRatio: 0.08,
          topVideos: [],
          sponsorship: { count: 2, sponsorshipRate: 0.13, sponsoredVideos: [] },
          estimatedCostPerVideoUsd: { low: 2000, high: 4000 },
          dataQuality: 'good',
        },
        scores: {
          fitScore: 92,
          tier: 'Strong fit',
          engagementScore: 85,
          reachScore: 95,
          consistencyScore: 90,
          recencyScore: 95,
          budgetFitScore: 90,
          nicheFit: 95,
          audienceFit: 95,
          toneFit: 90,
          brandSafety: 95,
          justifications: { nicheFit: '', audienceFit: '', toneFit: '', brandSafety: '' },
          citations: { nicheFit: [], audienceFit: [], toneFit: [], brandSafety: [] },
          lowConfidence: { nicheFit: false, audienceFit: false, toneFit: false, brandSafety: false },
          brandSafetyFlags: [],
          summary: '',
          brandSafetyCapped: false,
        },
        selected: true,
        notes: '',
        tags: ['espresso', 'coffee equipment'],
        recentVideos: [
          {
            videoId: 'vid_coffee_1',
            title: 'How to dial in espresso',
            description: 'A deep dive into extraction.',
            publishedAt: new Date().toISOString(),
            durationSeconds: 900,
            isShort: false,
            viewCount: 150000,
            likeCount: 12000,
            commentCount: 800,
            engagementRate: 0.08,
            likesHidden: false,
            hasSponsorshipSignals: false,
            sponsorshipSignals: [],
          },
        ],
      });
      creator1Id = c1.id;

      const c2 = await repos.creators.create(campaignId, {
        campaignId,
        input: '@lancehedrick',
        inputType: 'handle',
        normalizedKey: '@lancehedrick',
        status: 'analyzed',
        channel: {
          channelId: 'UClance',
          title: 'Lance Hedrick',
          description: 'Latte art champion and coffee geek.',
          subscriberCount: 450000,
          hiddenSubscriberCount: false,
          videoCount: 200,
          viewCount: 45000000,
          topicCategories: ['coffee', 'latte art'],
        },
        metrics: {
          subscribers: 450000,
          videoCount: 200,
          channelAgeMonths: 40,
          country: 'US',
          shorts: { count: 3, medianViews: 15000, medianEngagementRate: 0.04, likesHidden: false },
          longForm: { count: 12, medianViews: 65000, medianEngagementRate: 0.055, likesHidden: false },
          uploadsPerMonth: 5,
          daysSinceLastUpload: 8,
          consistency: 0.85,
          viewsToSubsRatio: 0.14,
          topVideos: [],
          sponsorship: { count: 3, sponsorshipRate: 0.2, sponsoredVideos: [] },
          estimatedCostPerVideoUsd: { low: 1000, high: 2500 },
          dataQuality: 'good',
        },
        scores: {
          fitScore: 88,
          tier: 'Strong fit',
          engagementScore: 88,
          reachScore: 80,
          consistencyScore: 85,
          recencyScore: 90,
          budgetFitScore: 90,
          nicheFit: 92,
          audienceFit: 90,
          toneFit: 85,
          brandSafety: 90,
          justifications: { nicheFit: '', audienceFit: '', toneFit: '', brandSafety: '' },
          citations: { nicheFit: [], audienceFit: [], toneFit: [], brandSafety: [] },
          lowConfidence: { nicheFit: false, audienceFit: false, toneFit: false, brandSafety: false },
          brandSafetyFlags: [],
          summary: '',
          brandSafetyCapped: false,
        },
        selected: true,
        notes: '',
        tags: ['espresso', 'coffee equipment'],
        recentVideos: [
          {
            videoId: 'vid_coffee_2',
            title: 'Testing portable coffee gear',
            description: 'Hands on review of portable espresso gadgets.',
            publishedAt: new Date().toISOString(),
            durationSeconds: 1200,
            isShort: false,
            viewCount: 80000,
            likeCount: 5000,
            commentCount: 450,
            engagementRate: 0.068,
            likesHidden: false,
            hasSponsorshipSignals: true,
            sponsorshipSignals: ['#ad', 'sponsored by'],
          },
        ],
      });
      creator2Id = c2.id;
    });

    it('POST /what-if synchronous recomputation returns health score and flags creators needing comment data', async () => {
      const res = await request(app)
        .post(`/api/v1/campaigns/${campaignId}/premortem/what-if`)
        .set('Authorization', OWNER_AUTH)
        .send({ creatorIds: [creator1Id, creator2Id] });

      expect(res.status).toBe(200);
      expect(res.body.healthScore).toBeGreaterThanOrEqual(0);
      expect(res.body.healthScore).toBeLessThanOrEqual(100);
      expect(res.body.label).toBeDefined();
      expect(res.body.lineupMetrics.rawReach).toBe(185000); // 120k + 65k
      expect(res.body.lineupMetrics.overlapAdjustedReach).toBeLessThanOrEqual(185000);
      expect(res.body.creatorsNeedingData).toContain(creator1Id);
      expect(res.body.creatorsNeedingData).toContain(creator2Id);
    });

    it('POST /runs launches background job and GET /runs lists the created run', async () => {
      const runLaunchRes = await request(app)
        .post(`/api/v1/campaigns/${campaignId}/premortem/runs`)
        .set('Authorization', OWNER_AUTH)
        .send({ creatorIds: [creator1Id, creator2Id] });

      expect(runLaunchRes.status).toBe(202);
      expect(runLaunchRes.body.jobId).toBeDefined();
      expect(runLaunchRes.body.status).toBe('running');

      // Wait a short tick for job completion in memory
      for (let i = 0; i < 20; i++) {
        const jRes = await request(app)
          .get(`/api/v1/jobs/${runLaunchRes.body.jobId}`)
          .set('Authorization', OWNER_AUTH);
        const j = jRes.body;
        if (j.status === 'succeeded' || j.status === 'failed' || j.status === 'cancelled') {
          console.log('[Test] Job finished with status:', j.status, 'error:', j.error);
          break;
        }
        await new Promise((r) => setTimeout(r, 50));
      }

      const listRes = await request(app)
        .get(`/api/v1/campaigns/${campaignId}/premortem/runs`)
        .set('Authorization', OWNER_AUTH);

      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body)).toBe(true);
      expect(listRes.body.length).toBeGreaterThanOrEqual(1);

      const run = listRes.body[0];
      expect(run.healthScore).toBeDefined();
      expect(run.lineupCreatorIds).toEqual([creator1Id, creator2Id]);
      expect(run.executiveSummary).toBeDefined();
    });

    it('POST /runs/:runId/approve sets campaign.approvedLineup and prevents run deletion', async () => {
      // Create a direct run in repository
      const repos = getRepositories();
      const run = await repos.premortem.create(campaignId, {
        campaignId,
        lineupCreatorIds: [creator1Id, creator2Id],
        pairwiseResults: [],
        lineupMetrics: {
          rawReach: 185000,
          overlapAdjustedReach: 170000,
          reachDeduplicationRatio: 0.08,
          totalCostLow: 3000,
          totalCostHigh: 6500,
          totalCostMidpoint: 4750,
          budgetUsd: 25000,
          isOverBudget: false,
          largestCreatorCostShare: 0.63,
          largestCreatorId: creator1Id,
          creatorMetrics: {},
        },
        penalties: [],
        healthScore: 92,
        label: 'Ready to launch',
        confidence: 'high',
        risks: [],
        suggestions: [],
        executiveSummary: 'Approved lineup is well balanced.',
        status: 'complete',
        approved: false,
        createdBy: 'owner@example.com',
      });

      // Approve run
      const approveRes = await request(app)
        .post(`/api/v1/campaigns/${campaignId}/premortem/runs/${run.id}/approve`)
        .set('Authorization', OWNER_AUTH);

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.success).toBe(true);

      // Verify campaign approvedLineup is set
      const campaignRes = await request(app)
        .get(`/api/v1/campaigns/${campaignId}`)
        .set('Authorization', OWNER_AUTH);

      expect(campaignRes.body.approvedLineup.runId).toBe(run.id);
      expect(campaignRes.body.approvedLineup.creatorIds).toEqual([creator1Id, creator2Id]);

      // Attempting to delete the approved run must be rejected with 400
      const deleteRes = await request(app)
        .delete(`/api/v1/campaigns/${campaignId}/premortem/runs/${run.id}`)
        .set('Authorization', OWNER_AUTH);

      expect(deleteRes.status).toBe(400);
      expect(deleteRes.body.error.message).toContain('Cannot delete an approved Pre-Mortem run');
    });
  });
});
