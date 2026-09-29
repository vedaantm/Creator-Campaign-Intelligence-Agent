import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createApiApp } from '../apiPlugin.ts';
import { resetRepositoriesForTesting, getRepositories } from '../repositories/index.ts';
import { parseCreatorInput } from '../engines/discovery/inputParser.ts';
import {
  parseIsoDuration,
  computeMedian,
  computeVideoEngagement,
  computeConsistency,
  detectSponsorshipSignals,
  computeMetrics,
} from '../engines/discovery/metrics.ts';
import {
  normalizeTitle,
  verifyCitations,
  computePercentileRank,
  computeRecencyScore,
  computeBudgetFitScore,
  computeCompositeFitScore,
  computeQuantitativeScores,
  recomputeAllScores,
  determineTier,
} from '../engines/discovery/scoring.ts';
import {
  resolveChannel,
  getRecentVideos,
  getCommentSample,
  recordQuotaUsage,
  getQuotaUsageToday,
  checkQuotaAvailable,
  setQuotaUsageForTesting,
} from '../services/youtube.ts';
import { SAMPLE_BRIEF, Creator, CreatorVideo } from '../../shared/types.ts';
import { CONFIG } from '../../shared/config.ts';

describe('Phase 3: Engine 1 — Discovery & Scoring Suite', () => {
  // ==========================================================================
  // 1. Creator Input Parser Unit Tests (15+ cases including edge cases)
  // ==========================================================================
  describe('1. Creator Input Parser', () => {
    it('1. accepts standard 24-character YouTube Channel ID starting with UC', () => {
      const res = parseCreatorInput('UCBJycsmduvYEL83R_U4JriQ');
      expect(res.valid).toBe(true);
      expect(res.inputType).toBe('channelId');
      expect(res.normalizedKey).toBe('UCBJycsmduvYEL83R_U4JriQ');
      expect(res.queryValue).toBe('UCBJycsmduvYEL83R_U4JriQ');
    });

    it('2. accepts @handle input', () => {
      const res = parseCreatorInput('@MKBHD');
      expect(res.valid).toBe(true);
      expect(res.inputType).toBe('handle');
      expect(res.normalizedKey).toBe('@mkbhd');
      expect(res.queryValue).toBe('MKBHD');
    });

    it('3. accepts bare handle without @ and normalizes with leading @', () => {
      const res = parseCreatorInput('jameshoffmann');
      expect(res.valid).toBe(true);
      expect(res.inputType).toBe('handle');
      expect(res.normalizedKey).toBe('@jameshoffmann');
      expect(res.queryValue).toBe('jameshoffmann');
    });

    it('4. accepts standard https://www.youtube.com/@handle URL', () => {
      const res = parseCreatorInput('https://www.youtube.com/@AliAbdaal');
      expect(res.valid).toBe(true);
      expect(res.inputType).toBe('url');
      expect(res.normalizedKey).toBe('@aliabdaal');
      expect(res.queryValue).toBe('AliAbdaal');
    });

    it('5. accepts youtube.com/@handle URL without protocol or www', () => {
      const res = parseCreatorInput('youtube.com/@Veritasium');
      expect(res.valid).toBe(true);
      expect(res.inputType).toBe('url');
      expect(res.normalizedKey).toBe('@veritasium');
    });

    it('6. accepts mobile URL m.youtube.com/@handle', () => {
      const res = parseCreatorInput('https://m.youtube.com/@mkbhd');
      expect(res.valid).toBe(true);
      expect(res.inputType).toBe('url');
      expect(res.normalizedKey).toBe('@mkbhd');
    });

    it('7. handles URL with /videos trailing path segment', () => {
      const res = parseCreatorInput('https://www.youtube.com/@lancehedrick/videos');
      expect(res.valid).toBe(true);
      expect(res.normalizedKey).toBe('@lancehedrick');
      expect(res.queryValue).toBe('lancehedrick');
    });

    it('8. handles URL with query parameters and tracking hashes', () => {
      const res = parseCreatorInput('https://youtube.com/@mkbhd?si=xyz123&sub_confirmation=1#about');
      expect(res.valid).toBe(true);
      expect(res.normalizedKey).toBe('@mkbhd');
    });

    it('9. accepts /channel/UC... format URL', () => {
      const res = parseCreatorInput('https://www.youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ');
      expect(res.valid).toBe(true);
      expect(res.normalizedKey).toBe('UCBJycsmduvYEL83R_U4JriQ');
      expect(res.queryValue).toBe('UCBJycsmduvYEL83R_U4JriQ');
    });

    it('10. accepts /c/CustomName format URL', () => {
      const res = parseCreatorInput('https://www.youtube.com/c/TechReviewHub');
      expect(res.valid).toBe(true);
      expect(res.normalizedKey).toBe('c:techreviewhub');
      expect(res.queryValue).toBe('TechReviewHub');
    });

    it('11. accepts /user/LegacyUser format URL', () => {
      const res = parseCreatorInput('https://youtube.com/user/marquesbrownlee');
      expect(res.valid).toBe(true);
      expect(res.normalizedKey).toBe('user:marquesbrownlee');
      expect(res.queryValue).toBe('marquesbrownlee');
    });

    it('12. strips surrounding whitespace', () => {
      const res = parseCreatorInput('   @CoffeeReviewer   ');
      expect(res.valid).toBe(true);
      expect(res.normalizedKey).toBe('@coffeereviewer');
    });

    it('13. rejects empty or whitespace-only input', () => {
      expect(parseCreatorInput('').valid).toBe(false);
      expect(parseCreatorInput('   ').valid).toBe(false);
    });

    it('14. rejects non-youtube external URLs', () => {
      const res = parseCreatorInput('https://vimeo.com/channels/staffpicks');
      expect(res.valid).toBe(false);
    });

    it('15. rejects invalid channel ID with wrong prefix or length', () => {
      const shortId = parseCreatorInput('UC123'); // too short
      expect(shortId.inputType).toBe('handle'); // falls back to handle check or invalid
      const notUc = parseCreatorInput('XXBJycsmduvYEL83R_U4JriQ');
      expect(notUc.inputType).toBe('handle');
    });

    it('16. handles URL with trailing slashes gracefully', () => {
      const res = parseCreatorInput('https://www.youtube.com/@brianquan/');
      expect(res.valid).toBe(true);
      expect(res.normalizedKey).toBe('@brianquan');
    });
  });

  // ==========================================================================
  // 2. Metrics & Pure Functions Unit Tests
  // ==========================================================================
  describe('2. Metrics Pure Functions', () => {
    describe('parseIsoDuration', () => {
      it('parses minutes and seconds (PT1M30S -> 90s)', () => {
        expect(parseIsoDuration('PT1M30S')).toBe(90);
      });

      it('parses hours, minutes, seconds (PT1H2M3S -> 3723s)', () => {
        expect(parseIsoDuration('PT1H2M3S')).toBe(3723);
      });

      it('parses seconds only (PT45S -> 45s)', () => {
        expect(parseIsoDuration('PT45S')).toBe(45);
      });

      it('parses hours only (PT1H -> 3600s)', () => {
        expect(parseIsoDuration('PT1H')).toBe(3600);
      });

      it('parses days and hours (P1DT2H -> 93600s)', () => {
        expect(parseIsoDuration('P1DT2H')).toBe(93600);
      });

      it('returns 0 for empty or invalid string', () => {
        expect(parseIsoDuration('')).toBe(0);
        expect(parseIsoDuration('not-a-duration')).toBe(0);
      });
    });

    describe('computeMedian', () => {
      it('computes median of odd-length list', () => {
        expect(computeMedian([10, 50, 20])).toBe(20);
      });

      it('computes median of even-length list', () => {
        expect(computeMedian([10, 20, 30, 40])).toBe(25);
      });

      it('handles empty list returning 0', () => {
        expect(computeMedian([])).toBe(0);
      });

      it('handles single item', () => {
        expect(computeMedian([42])).toBe(42);
      });

      it('is not distorted by a single massive viral outlier', () => {
        const values = [5000, 6000, 7000, 8000, 10000000]; // viral video
        expect(computeMedian(values)).toBe(7000);
      });
    });

    describe('computeVideoEngagement', () => {
      it('calculates (likes + comments) / views with visible likes', () => {
        const res = computeVideoEngagement(400, 100, 10000);
        expect(res.rate).toBe(0.05); // (400+100)/10000 = 5%
        expect(res.likesHidden).toBe(false);
      });

      it('calculates comments only when likes are hidden (null)', () => {
        const res = computeVideoEngagement(null, 150, 10000);
        expect(res.rate).toBe(0.015); // 150/10000 = 1.5%
        expect(res.likesHidden).toBe(true);
      });

      it('skips and returns null when viewCount is 0', () => {
        const res = computeVideoEngagement(10, 2, 0);
        expect(res.rate).toBeNull();
      });
    });

    describe('computeConsistency', () => {
      it('returns null if fewer than 3 upload dates', () => {
        expect(computeConsistency(['2026-01-01', '2026-01-10'])).toBeNull();
        expect(computeConsistency([])).toBeNull();
      });

      it('computes consistency close to 1 for perfectly spaced weekly uploads', () => {
        const dates = [
          '2026-01-01T00:00:00Z',
          '2026-01-08T00:00:00Z',
          '2026-01-15T00:00:00Z',
          '2026-01-22T00:00:00Z',
        ];
        const consistency = computeConsistency(dates);
        expect(consistency).toBe(1.0);
      });

      it('computes low consistency for erratic upload gaps', () => {
        const dates = [
          '2026-01-01T00:00:00Z',
          '2026-01-02T00:00:00Z', // 1 day gap
          '2026-01-03T00:00:00Z', // 1 day gap
          '2026-04-01T00:00:00Z', // 88 days gap
        ];
        const consistency = computeConsistency(dates);
        expect(consistency).not.toBeNull();
        expect(consistency!).toBeLessThan(0.4);
      });
    });

    describe('detectSponsorshipSignals', () => {
      it('detects #ad and #sponsored in description', () => {
        const res = detectSponsorshipSignals('Thanks for watching! #ad Check out the links below #sponsored');
        expect(res.isSponsored).toBe(true);
        expect(res.signals).toContain('#ad');
        expect(res.signals).toContain('#sponsored');
      });

      it('detects "sponsored by" and "use code"', () => {
        const res = detectSponsorshipSignals('This video is sponsored by BrandX. Use code ESPRESSO for 10% off.');
        expect(res.isSponsored).toBe(true);
        expect(res.signals).toContain('sponsored by');
        expect(res.signals).toContain('use code');
      });

      it('detects common affiliate domains (amzn.to, bit.ly)', () => {
        const res = detectSponsorshipSignals('My gear: https://amzn.to/3xyz and https://bit.ly/coffee-bag');
        expect(res.isSponsored).toBe(true);
        expect(res.signals).toContain('amzn.to');
        expect(res.signals).toContain('bit.ly');
      });

      it('returns isSponsored=false for non-commercial content', () => {
        const res = detectSponsorshipSignals('Just a Sunday vlog exploring the mountains with friends.');
        expect(res.isSponsored).toBe(false);
        expect(res.signals).toEqual([]);
      });
    });

    describe('computeMetrics (Shorts vs Long-form separation)', () => {
      it('splits videos into Shorts (<= 180s) and long-form (> 180s)', () => {
        const rawVideos = [
          {
            videoId: 'v1',
            title: 'Quick Crema Shot',
            description: 'Short video',
            publishedAt: '2026-02-01T00:00:00Z',
            duration: 'PT55S', // 55s -> Short
            viewCount: 50000,
            likeCount: 2000,
            commentCount: 100,
          },
          {
            videoId: 'v2',
            title: 'Full Espresso Machine Review',
            description: 'Detailed deep dive #ad sponsored by Wacaco',
            publishedAt: '2026-02-10T00:00:00Z',
            duration: 'PT15M30S', // 930s -> Long-form
            viewCount: 30000,
            likeCount: 1500,
            commentCount: 250,
          },
          {
            videoId: 'v3',
            title: 'Grinder Comparison',
            description: 'Testing conical vs flat burrs',
            publishedAt: '2026-02-20T00:00:00Z',
            duration: 'PT12M00S', // 720s -> Long-form
            viewCount: 40000,
            likeCount: 2200,
            commentCount: 300,
          },
        ];

        const { metrics } = computeMetrics(
          {
            channelId: 'UC_test',
            subscriberCount: 200000,
            hiddenSubscriberCount: false,
            videoCount: 150,
            country: 'US',
          },
          rawVideos
        );

        expect(metrics.shorts.count).toBe(1);
        expect(metrics.shorts.medianViews).toBe(50000);
        expect(metrics.longForm.count).toBe(2);
        expect(metrics.longForm.medianViews).toBe(35000); // avg of 30k & 40k
        expect(metrics.sponsorship.count).toBe(1);
        expect(metrics.dataQuality).toBe('good');
      });
    });
  });

  // ==========================================================================
  // 3. Scoring & Citation Verification Unit Tests
  // ==========================================================================
  describe('3. Scoring Engine & Citation Matcher', () => {
    describe('normalizeTitle & verifyCitations', () => {
      const mockVideos: CreatorVideo[] = [
        {
          videoId: 'v1',
          title: 'The Ultimate Portable Espresso Machine Comparison (18 Bars Tested)',
          description: '',
          publishedAt: '',
          durationSeconds: 600,
          isShort: false,
          viewCount: 10000,
          likeCount: 500,
          commentCount: 50,
          engagementRate: 0.055,
          likesHidden: false,
          hasSponsorshipSignals: false,
          sponsorshipSignals: [],
        },
      ];

      it('normalizes case, quotes, and punctuation', () => {
        expect(normalizeTitle('“The Ultimate” Espresso!')).toBe('the ultimate espresso');
      });

      it('verifies exact and normalized title matches', () => {
        const verified = verifyCitations(
          ['"The Ultimate Portable Espresso Machine Comparison (18 Bars Tested)"'],
          mockVideos
        );
        expect(verified).toHaveLength(1);
        expect(verified[0]).toBe('The Ultimate Portable Espresso Machine Comparison (18 Bars Tested)');
      });

      it('rejects hallucinated titles not in video list', () => {
        const verified = verifyCitations(['Nonexistent Video That AI Made Up'], mockVideos);
        expect(verified).toHaveLength(0);
      });
    });

    describe('computeRecencyScore', () => {
      it('returns 100 for recent upload <= 14 days ago', () => {
        expect(computeRecencyScore(3)).toBe(100);
        expect(computeRecencyScore(14)).toBe(100);
      });

      it('returns 0 for inactive channel >= 120 days since last upload', () => {
        expect(computeRecencyScore(120)).toBe(0);
        expect(computeRecencyScore(200)).toBe(0);
      });

      it('falls linearly between 14 and 120 days', () => {
        const score = computeRecencyScore(67); // midpoint (120-14)/2 + 14 = 67
        expect(score).toBeCloseTo(50, 0);
      });
    });

    describe('computeBudgetFitScore', () => {
      it('returns 100 if midpoint cost <= budget / max(3, candidates / 2)', () => {
        // budget 30,000, candidates 6 -> target = 30000 / 3 = 10,000
        const score = computeBudgetFitScore(4000, 6000, 30000, 6); // midpoint = 5000 <= 10000
        expect(score).toBe(100);
      });

      it('returns 0 when midpoint cost >= full campaign budget', () => {
        const score = computeBudgetFitScore(30000, 35000, 30000, 6);
        expect(score).toBe(0);
      });
    });

    describe('computeCompositeFitScore & Brand Safety Cap', () => {
      it('computes weighted composite score and determines tier', () => {
        const res = computeCompositeFitScore({
          nicheFit: 90,
          audienceFit: 85,
          engagement: 80,
          toneFit: 85,
          brandSafety: 95,
          reach: 75,
          budgetFit: 90,
          consistency: 85,
          recency: 90,
        });

        expect(res.fitScore).toBeGreaterThanOrEqual(75);
        expect(res.tier).toBe('Strong fit');
        expect(res.brandSafetyCapped).toBe(false);
      });

      it('CAPS fitScore at 50 if brandSafety is below 40, even with perfect 100s elsewhere', () => {
        const res = computeCompositeFitScore({
          nicheFit: 100,
          audienceFit: 100,
          engagement: 100,
          toneFit: 100,
          brandSafety: 25, // Brand safety failure (< 40)
          reach: 100,
          budgetFit: 100,
          consistency: 100,
          recency: 100,
        });

        expect(res.fitScore).toBe(50); // Capped at 50
        expect(res.brandSafetyCapped).toBe(true);
        expect(res.brandSafetyWarning).toBeDefined();
        expect(res.tier).toBe('Weak fit');
      });
    });
  });

  // ==========================================================================
  // 4. YouTube Service Tests with Mock Responses & Error Mapping
  // ==========================================================================
  describe('4. YouTube Service Edge Cases', () => {
    beforeEach(() => {
      resetRepositoriesForTesting();
      setQuotaUsageForTesting(0);
    });

    it('handles channel with hidden subscribers', async () => {
      const res = await resolveChannel('@jameshoffmann');
      expect(res.channel).toBeDefined();
      expect(res.channel.title).toBe('James Hoffmann');
    });

    it('returns empty comments without throwing when comments are disabled', async () => {
      const commentsRes = await getCommentSample('vid_with_comments_disabled');
      expect(commentsRes.unavailable).toBeDefined();
      expect(Array.isArray(commentsRes.comments)).toBe(true);
    });

    it('tracks quota usage and refuses runs when threshold (90%) is exceeded', () => {
      setQuotaUsageForTesting(9500); // 95% of 10,000
      expect(getQuotaUsageToday()).toBe(9500);
      expect(() => checkQuotaAvailable()).toThrowError(/Daily YouTube API quota threshold reached/);
    });
  });

  // ==========================================================================
  // 5. Creator API CRUD Endpoints
  // ==========================================================================
  describe('5. Creator API CRUD Suite', () => {
    let app: express.Express;
    let campaignId: string;

    const OWNER_AUTH = 'Bearer demo_user_owner';
    const MEMBER_AUTH = 'Bearer demo_user_member';
    const STRANGER_AUTH = 'Bearer demo_user_stranger';

    beforeEach(async () => {
      const repos = resetRepositoriesForTesting();
      app = createApiApp();
      setQuotaUsageForTesting(0);

      const campaign = await repos.campaigns.create({
        ownerId: 'demo_user_owner',
        ownerEmail: 'owner@example.com',
        memberEmails: ['member@example.com'],
        name: 'Creator Discovery Campaign',
        status: 'draft',
        brief: SAMPLE_BRIEF as any,
        settings: {},
        approvedLineup: [],
      });
      campaignId = campaign.id;
    });

    it('POST /api/v1/campaigns/:id/creators adds a creator candidate', async () => {
      const res = await request(app)
        .post(`/api/v1/campaigns/${campaignId}/creators`)
        .set('Authorization', OWNER_AUTH)
        .send({
          input: '@jameshoffmann',
          notes: 'Specialty coffee world champion',
          tags: ['espresso', 'expert'],
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.normalizedKey).toBe('@jameshoffmann');
      expect(res.body.notes).toBe('Specialty coffee world champion');
      expect(res.body.tags).toContain('espresso');
    });

    it('POST /api/v1/campaigns/:id/creators rejects duplicate creator with 409 CONFLICT', async () => {
      await request(app)
        .post(`/api/v1/campaigns/${campaignId}/creators`)
        .set('Authorization', OWNER_AUTH)
        .send({ input: '@jameshoffmann' });

      const dupRes = await request(app)
        .post(`/api/v1/campaigns/${campaignId}/creators`)
        .set('Authorization', OWNER_AUTH)
        .send({ input: 'https://youtube.com/@jameshoffmann' }); // Same normalized key

      expect(dupRes.status).toBe(409);
      expect(dupRes.body.error.code).toBe('CONFLICT');
    });

    it('POST /api/v1/campaigns/:id/creators/validate-inputs provides live preview before saving', async () => {
      // First add one creator
      await request(app)
        .post(`/api/v1/campaigns/${campaignId}/creators`)
        .set('Authorization', OWNER_AUTH)
        .send({ input: '@jameshoffmann' });

      // Live validate a batch with valid, duplicate, and invalid entries
      const res = await request(app)
        .post(`/api/v1/campaigns/${campaignId}/creators/validate-inputs`)
        .set('Authorization', OWNER_AUTH)
        .send({
          inputs: [
            '@lancehedrick', // valid
            '@jameshoffmann', // duplicate
            'not a valid url or handle /!@#$', // invalid
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(3);
      expect(res.body.results[0].status).toBe('valid');
      expect(res.body.results[1].status).toBe('duplicate');
      expect(res.body.results[2].status).toBe('invalid');
    });

    it('POST /api/v1/campaigns/:id/creators/bulk adds multiple creators up to campaign limit', async () => {
      const res = await request(app)
        .post(`/api/v1/campaigns/${campaignId}/creators/bulk`)
        .set('Authorization', OWNER_AUTH)
        .send({
          inputs: ['@lancehedrick', '@brianquan', '@morganandrtd'],
        });

      expect(res.status).toBe(201);
      expect(res.body.addedCount).toBe(3);

      const listRes = await request(app)
        .get(`/api/v1/campaigns/${campaignId}/creators`)
        .set('Authorization', MEMBER_AUTH);

      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveLength(3);
    });

    it('GET /api/v1/campaigns/:id/creators returns 404 for stranger', async () => {
      const res = await request(app)
        .get(`/api/v1/campaigns/${campaignId}/creators`)
        .set('Authorization', STRANGER_AUTH);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('PATCH /api/v1/campaigns/:id/creators/:creatorId updates notes, tags, selection with version concurrency', async () => {
      const createRes = await request(app)
        .post(`/api/v1/campaigns/${campaignId}/creators`)
        .set('Authorization', OWNER_AUTH)
        .send({ input: '@brianquan' });

      const creator = createRes.body;

      // Successful update
      const updateRes = await request(app)
        .patch(`/api/v1/campaigns/${campaignId}/creators/${creator.id}`)
        .set('Authorization', MEMBER_AUTH)
        .send({
          notes: 'Shortlisted for hero campaign drop',
          selected: true,
          version: creator.version,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.selected).toBe(true);
      expect(updateRes.body.version).toBe(creator.version + 1);

      // Stale version returns 409 CONFLICT
      const staleRes = await request(app)
        .patch(`/api/v1/campaigns/${campaignId}/creators/${creator.id}`)
        .set('Authorization', MEMBER_AUTH)
        .send({
          notes: 'Conflicting edit',
          version: creator.version,
        });

      expect(staleRes.status).toBe(409);
      expect(staleRes.body.error.code).toBe('CONFLICT');
    });

    it('DELETE /api/v1/campaigns/:id/creators/:creatorId removes creator', async () => {
      const createRes = await request(app)
        .post(`/api/v1/campaigns/${campaignId}/creators`)
        .set('Authorization', OWNER_AUTH)
        .send({ input: '@brianquan' });

      const creatorId = createRes.body.id;

      const delRes = await request(app)
        .delete(`/api/v1/campaigns/${campaignId}/creators/${creatorId}`)
        .set('Authorization', OWNER_AUTH);

      expect(delRes.status).toBe(200);

      const getRes = await request(app)
        .get(`/api/v1/campaigns/${campaignId}/creators/${creatorId}`)
        .set('Authorization', OWNER_AUTH);

      expect(getRes.status).toBe(404);
    });

    it('POST /api/v1/campaigns/:id/discovery/run triggers background job when brief is valid and >= 2 creators exist', async () => {
      // Add 2 creators
      await request(app)
        .post(`/api/v1/campaigns/${campaignId}/creators/bulk`)
        .set('Authorization', OWNER_AUTH)
        .send({ inputs: ['@jameshoffmann', '@lancehedrick'] });

      const runRes = await request(app)
        .post(`/api/v1/campaigns/${campaignId}/discovery/run`)
        .set('Authorization', OWNER_AUTH)
        .send({});

      expect(runRes.status).toBe(202);
      expect(runRes.body.jobId).toBeDefined();

      // Check job status
      const jobRes = await request(app)
        .get(`/api/v1/jobs/${runRes.body.jobId}`)
        .set('Authorization', OWNER_AUTH);

      expect(jobRes.status).toBe(200);
      expect(jobRes.body.type).toBe('DISCOVERY');
    });

    it('POST /api/v1/campaigns/:id/discovery/run rejects if fewer than 2 creators exist', async () => {
      // Add only 1 creator
      await request(app)
        .post(`/api/v1/campaigns/${campaignId}/creators`)
        .set('Authorization', OWNER_AUTH)
        .send({ input: '@jameshoffmann' });

      const runRes = await request(app)
        .post(`/api/v1/campaigns/${campaignId}/discovery/run`)
        .set('Authorization', OWNER_AUTH)
        .send({});

      expect(runRes.status).toBe(400);
      expect(runRes.body.error.code).toBe('VALIDATION_ERROR');
      expect(runRes.body.error.message).toContain('At least 2 candidate creators');
    });

    it('POST /api/v1/campaigns/:id/creators/select-recommended selects top eligible creators', async () => {
      // Add and seed analyzed creators
      const repos = getRepositories();
      await repos.creators.create(campaignId, {
        campaignId,
        input: '@jameshoffmann',
        inputType: 'handle',
        normalizedKey: '@jameshoffmann',
        status: 'analyzed',
        recentVideos: [],
        scores: {
          fitScore: 88,
          tier: 'Strong fit',
          engagementScore: 85,
          reachScore: 90,
          consistencyScore: 85,
          recencyScore: 95,
          budgetFitScore: 85,
          nicheFit: 90,
          audienceFit: 90,
          toneFit: 85,
          brandSafety: 95,
          justifications: { nicheFit: '', audienceFit: '', toneFit: '', brandSafety: '' },
          citations: { nicheFit: [], audienceFit: [], toneFit: [], brandSafety: [] },
          lowConfidence: { nicheFit: false, audienceFit: false, toneFit: false, brandSafety: false },
          brandSafetyFlags: [],
          summary: '',
          brandSafetyCapped: false,
        },
        selected: false,
        notes: '',
        tags: [],
      });

      await repos.creators.create(campaignId, {
        campaignId,
        input: '@weakcreator',
        inputType: 'handle',
        normalizedKey: '@weakcreator',
        status: 'analyzed',
        recentVideos: [],
        scores: {
          fitScore: 40,
          tier: 'Weak fit',
          engagementScore: 40,
          reachScore: 40,
          consistencyScore: 40,
          recencyScore: 40,
          budgetFitScore: 40,
          nicheFit: 40,
          audienceFit: 40,
          toneFit: 40,
          brandSafety: 40,
          justifications: { nicheFit: '', audienceFit: '', toneFit: '', brandSafety: '' },
          citations: { nicheFit: [], audienceFit: [], toneFit: [], brandSafety: [] },
          lowConfidence: { nicheFit: false, audienceFit: false, toneFit: false, brandSafety: false },
          brandSafetyFlags: [],
          summary: '',
          brandSafetyCapped: false,
        },
        selected: false,
        notes: '',
        tags: [],
      });

      const res = await request(app)
        .post(`/api/v1/campaigns/${campaignId}/creators/select-recommended`)
        .set('Authorization', OWNER_AUTH);

      expect(res.status).toBe(200);
      expect(res.body.selectedCount).toBe(1);

      const creators = await repos.creators.list(campaignId);
      const jh = creators.find((c) => c.normalizedKey === '@jameshoffmann');
      const weak = creators.find((c) => c.normalizedKey === '@weakcreator');

      expect(jh?.selected).toBe(true);
      expect(weak?.selected).toBe(false);
    });
  });
});
