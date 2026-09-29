import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApiApp } from '../apiPlugin.ts';
import { getRepositories, resetRepositoriesForTesting } from '../repositories/index.ts';
import {
  calculateExpectedViewsRatio,
  calculateExpectedViews,
  calculateEngagementRate,
} from '../engines/pulse/benchmarks.ts';
import {
  evaluateVideoAlerts,
  reconcileAlerts,
  checkDisclosurePresent,
} from '../engines/pulse/alerts.ts';
import { classifyComment, classifyCommentsList } from '../engines/pulse/sentiment.ts';
import { calculateSimulatedSearchMetrics } from '../engines/pulse/simulatedAds.ts';
import { TrackedVideo, Alert } from '../../shared/types.ts';
import { setQuotaUsageForTesting } from '../services/youtube.ts';

describe('Phase 8 — Pure Functions Unit Tests', () => {
  it('calculateExpectedViewsRatio interpolates correctly at key checkpoints', () => {
    expect(calculateExpectedViewsRatio(0)).toBe(0);
    expect(calculateExpectedViewsRatio(24)).toBe(0.40);
    expect(calculateExpectedViewsRatio(48)).toBeCloseTo(0.55, 2);
    expect(calculateExpectedViewsRatio(72)).toBe(0.70);
    expect(calculateExpectedViewsRatio(120)).toBeCloseTo(0.85, 2);
    expect(calculateExpectedViewsRatio(168)).toBe(1.00);
    expect(calculateExpectedViewsRatio(200)).toBe(1.00);
  });

  it('calculateExpectedViews computes views from creator median', () => {
    const publishedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24h ago
    const expected = calculateExpectedViews(100000, publishedAt);
    expect(expected).toBe(40000);
  });

  it('checkDisclosurePresent detects mandatory disclosures', () => {
    expect(checkDisclosurePresent('Reviewing new portable espresso #ad')).toBe(true);
    expect(checkDisclosurePresent('Sponsored by Wacaco Picopresso')).toBe(true);
    expect(checkDisclosurePresent('Just making morning coffee at home')).toBe(false);
  });

  it('evaluateVideoAlerts fires underperforming alert when views < 60% expected after 24h', () => {
    const publishedAt = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(); // 30h ago
    const video: TrackedVideo = {
      id: 'v1',
      campaignId: 'c1',
      creatorId: 'cr1',
      videoId: 'v1',
      url: 'https://youtube.com/watch?v=v1',
      title: 'Review #ad',
      publishedAt,
      isStandIn: false,
      active: true,
      latestStats: { views: 10000, likes: 500, comments: 100 }, // expected = 100,000 * 0.4375 = 43750, 60% = 26250
      commentsUnavailable: false,
      createdAt: publishedAt,
    };

    const alerts = evaluateVideoAlerts(video, 100000, 0.05, 'Description #ad');
    const underperforming = alerts.find((a) => a.type === 'underperforming');
    expect(underperforming).toBeDefined();
    expect(underperforming?.severity).toBe('warning');
  });

  it('evaluateVideoAlerts fires outperforming alert when views > 150% expected', () => {
    const publishedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24h ago (expected = 40,000)
    const video: TrackedVideo = {
      id: 'v2',
      campaignId: 'c1',
      creatorId: 'cr1',
      videoId: 'v2',
      url: 'https://youtube.com/watch?v=v2',
      title: 'Viral Review #ad',
      publishedAt,
      isStandIn: false,
      active: true,
      latestStats: { views: 70000, likes: 4000, comments: 500 }, // 70k > 150% of 40k
      commentsUnavailable: false,
      createdAt: publishedAt,
    };

    const alerts = evaluateVideoAlerts(video, 100000, 0.05, 'Description #ad');
    const outperforming = alerts.find((a) => a.type === 'outperforming');
    expect(outperforming).toBeDefined();
    expect(outperforming?.severity).toBe('info');
  });

  it('evaluateVideoAlerts fires sentiment_risk alert when negative share > 25% across >= 20 comments', () => {
    const publishedAt = new Date().toISOString();
    const video: TrackedVideo = {
      id: 'v3',
      campaignId: 'c1',
      creatorId: 'cr1',
      videoId: 'v3',
      url: 'https://youtube.com/watch?v=v3',
      title: 'Video Title #ad',
      publishedAt,
      isStandIn: false,
      active: true,
      latestStats: { views: 10000, likes: 200, comments: 50 },
      commentsUnavailable: false,
      sentiment: {
        positive: 5,
        negative: 15,
        neutral: 5,
        question: 5,
        examples: { positive: [], negative: [], neutral: [], question: [] },
      },
      createdAt: publishedAt,
    };

    const alerts = evaluateVideoAlerts(video, 10000, 0.03, 'Sponsored by Wacaco');
    const sentimentRisk = alerts.find((a) => a.type === 'sentiment_risk');
    expect(sentimentRisk).toBeDefined();
    expect(sentimentRisk?.severity).toBe('warning');
  });

  it('evaluateVideoAlerts fires disclosure_missing alert when no disclosure found', () => {
    const publishedAt = new Date().toISOString();
    const video: TrackedVideo = {
      id: 'v4',
      campaignId: 'c1',
      creatorId: 'cr1',
      videoId: 'v4',
      url: 'https://youtube.com/watch?v=v4',
      title: 'Coffee Machine Honest Thoughts',
      publishedAt,
      isStandIn: false,
      active: true,
      latestStats: { views: 5000, likes: 200, comments: 20 },
      commentsUnavailable: false,
      createdAt: publishedAt,
    };

    const alerts = evaluateVideoAlerts(video, 10000, 0.03, 'No disclosure keywords here.');
    const missingDisc = alerts.find((a) => a.type === 'disclosure_missing');
    expect(missingDisc).toBeDefined();
    expect(missingDisc?.severity).toBe('critical');
  });

  it('reconcileAlerts handles de-duplication and auto-resolution', () => {
    const nowISO = new Date().toISOString();
    const existingActiveAlert: Alert = {
      id: 'alert_underperforming_v1',
      campaignId: 'c1',
      type: 'underperforming',
      severity: 'warning',
      videoId: 'v1',
      creatorId: 'cr1',
      message: 'Old message',
      firstFiredAt: new Date(Date.now() - 3600000).toISOString(),
      lastSeenAt: new Date(Date.now() - 3600000).toISOString(),
      resolvedAt: null,
      acknowledged: false,
    };

    // Case 1: condition still firing -> update lastSeenAt
    const reconciledStillFiring = reconcileAlerts(
      'c1',
      [existingActiveAlert],
      [{
        type: 'underperforming',
        severity: 'warning',
        videoId: 'v1',
        creatorId: 'cr1',
        message: 'Updated message',
      }],
      nowISO
    );

    expect(reconciledStillFiring.length).toBe(1);
    expect(reconciledStillFiring[0].resolvedAt).toBeNull();
    expect(reconciledStillFiring[0].message).toBe('Updated message');
    expect(reconciledStillFiring[0].lastSeenAt).toBe(nowISO);

    // Case 2: condition cleared -> auto-resolve!
    const reconciledCleared = reconcileAlerts(
      'c1',
      [existingActiveAlert],
      [], // no firing conditions
      nowISO
    );

    expect(reconciledCleared.length).toBe(1);
    expect(reconciledCleared[0].resolvedAt).toBe(nowISO);
  });

  it('classifyCommentsList classifies and limits examples to 3 per category', () => {
    const comments = [
      'Love this machine so much! #ad',
      'This is terrible and overpriced',
      'How much does this cost?',
      'Just a neutral comment',
      'Amazing review, awesome!',
      'Great video, subbed!',
      'Super helpful, perfect!', // 4th positive
    ];

    const res = classifyCommentsList(comments);
    expect(res.positive).toBe(4);
    expect(res.negative).toBe(1);
    expect(res.question).toBe(1);
    expect(res.neutral).toBe(1);
    expect(res.examples.positive.length).toBe(3); // capped at 3 examples
  });

  it('calculateSimulatedSearchMetrics attaches SIMULATED label', () => {
    const video: TrackedVideo = {
      id: 'v1',
      campaignId: 'c1',
      creatorId: 'cr1',
      videoId: 'v1',
      url: 'https://youtube.com/watch?v=v1',
      title: 'Review #ad',
      publishedAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
      isStandIn: false,
      active: true,
      latestStats: { views: 50000, likes: 2000, comments: 300 },
      commentsUnavailable: false,
      createdAt: new Date().toISOString(),
    };

    const metrics = calculateSimulatedSearchMetrics([video]);
    expect(metrics.label).toBe('SIMULATED');
    expect(metrics.impressions).toBeGreaterThan(0);
    expect(metrics.clicks).toBeGreaterThan(0);
  });
});

describe('Phase 8 — API & Repositories Endpoints Suite', () => {
  let app: any;
  let campaignId: string;
  let creatorId: string;

  const AUTH_HEADER = 'Bearer demo_user_alpha';

  beforeEach(async () => {
    resetRepositoriesForTesting();
    setQuotaUsageForTesting(0);
    app = createApiApp();
    const repos = getRepositories();

    const campaign = await repos.campaigns.create({
      ownerId: 'demo_user_alpha',
      ownerEmail: 'demo_user_alpha@example.com',
      memberEmails: [],
      name: 'Live Pulse Campaign',
      status: 'active',
      brief: { brandName: 'Wacaco', productName: 'Picopresso' },
      settings: {},
      approvedLineup: null,
    });
    campaignId = campaign.id;

    const creator = await repos.creators.create(campaignId, {
      campaignId,
      input: '@jameshoffmann',
      normalizedKey: '@jameshoffmann',
      channel: {
        channelId: 'UCMb0O2CdPBNi-QqPk5T3gsQ',
        title: 'James Hoffmann',
        description: 'Coffee channel',
        customUrl: '@jameshoffmann',
        avatarUrl: 'https://example.com/avatar.jpg',
        subscriberCount: 1950000,
        hiddenSubscriberCount: false,
        videoCount: 400,
        viewCount: 180000000,
        topicCategories: [],
      },
      status: 'resolved',
      selected: true,
      inputType: 'handle',
      recentVideos: [],
      notes: '',
      tags: [],
      metrics: {
        subscribers: 1950000,
        videoCount: 400,
        channelAgeMonths: 36,
        country: 'US',
        longForm: { count: 10, medianViews: 100000, medianEngagementRate: 0.05, likesHidden: false },
        shorts: { count: 0, medianViews: 0, medianEngagementRate: 0, likesHidden: false },
        uploadsPerMonth: 4,
        daysSinceLastUpload: 5,
        consistency: 0.9,
        viewsToSubsRatio: 0.05,
        topVideos: [],
        sponsorship: { count: 1, sponsorshipRate: 0.1, sponsoredVideos: [] },
        estimatedCostPerVideoUsd: { low: 2000, high: 3000 },
        dataQuality: 'good',
      },
    });
    creatorId = creator.id;
  });

  it('POST /api/v1/campaigns/:id/live/videos validates channel mismatch unless isStandIn = true', async () => {
    // vid_mock_1 has channelId 'UC_jameshoffmann' or similar mock channel
    const resMismatch = await request(app)
      .post(`/api/v1/campaigns/${campaignId}/live/videos`)
      .set('Authorization', AUTH_HEADER)
      .send({
        urlOrId: 'vid_mock_1',
        creatorId,
        isStandIn: false,
      });

    // Unless channel ID matches, rejects mismatch
    expect([400, 422]).toContain(resMismatch.status);

    // With isStandIn = true, succeeds as stand-in video
    const resStandIn = await request(app)
      .post(`/api/v1/campaigns/${campaignId}/live/videos`)
      .set('Authorization', AUTH_HEADER)
      .send({
        urlOrId: 'vid_mock_1',
        creatorId,
        isStandIn: true,
      });

    expect(resStandIn.status).toBe(201);
    expect(resStandIn.body.isStandIn).toBe(true);
    expect(resStandIn.body.videoId).toBe('vid_mock_1');
  });

  it('POST /api/v1/campaigns/:id/live/videos enforces 1 video per creator unless allowSecond = true', async () => {
    const repos = getRepositories();
    await repos.trackedVideos.create(campaignId, {
      id: 'existing_vid',
      campaignId,
      creatorId,
      videoId: 'existing_vid',
      url: 'https://youtube.com/watch?v=existing_vid',
      title: 'Existing #ad',
      publishedAt: new Date().toISOString(),
      isStandIn: true,
      active: true,
      latestStats: { views: 1000, likes: 50, comments: 10 },
      commentsUnavailable: false,
      createdAt: new Date().toISOString(),
    });

    const resBlocked = await request(app)
      .post(`/api/v1/campaigns/${campaignId}/live/videos`)
      .set('Authorization', AUTH_HEADER)
      .send({
        urlOrId: 'vid_mock_2',
        creatorId,
        isStandIn: true,
        allowSecond: false,
      });

    expect([400, 422]).toContain(resBlocked.status);
    expect(resBlocked.body.error.message).toContain('already has a tracked video');

    const resAllowed = await request(app)
      .post(`/api/v1/campaigns/${campaignId}/live/videos`)
      .set('Authorization', AUTH_HEADER)
      .send({
        urlOrId: 'vid_mock_3',
        creatorId,
        isStandIn: true,
        allowSecond: true,
      });

    expect(resAllowed.status).toBe(201);
  });

  it('POST /api/v1/campaigns/:id/live/poll enforces minimum 5-minute polling interval', async () => {
    const repos = getRepositories();
    await repos.trackedVideos.create(campaignId, {
      id: 'v_poll_1',
      campaignId,
      creatorId,
      videoId: 'v_poll_1',
      url: 'https://youtube.com/watch?v=v_poll_1',
      title: 'Test #ad',
      publishedAt: new Date().toISOString(),
      isStandIn: true,
      active: true,
      lastPolledAt: new Date().toISOString(), // polled just now!
      latestStats: { views: 5000, likes: 200, comments: 20 },
      commentsUnavailable: false,
      createdAt: new Date().toISOString(),
    });

    const res = await request(app)
      .post(`/api/v1/campaigns/${campaignId}/live/poll`)
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe(true);
    expect(res.body.reason).toContain('Poll interval active');
  });

  it('PATCH /api/v1/campaigns/:id/live/alerts/:alertId updates acknowledgment', async () => {
    const repos = getRepositories();
    const alert = await repos.alerts.upsert(campaignId, {
      id: 'alert_test_1',
      campaignId,
      type: 'underperforming',
      severity: 'warning',
      videoId: 'v1',
      creatorId,
      message: 'Views low',
      firstFiredAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      resolvedAt: null,
      acknowledged: false,
    });

    const res = await request(app)
      .patch(`/api/v1/campaigns/${campaignId}/live/alerts/${alert.id}`)
      .set('Authorization', AUTH_HEADER)
      .send({ acknowledged: true });

    expect(res.status).toBe(200);
    expect(res.body.acknowledged).toBe(true);
    expect(res.body.acknowledgedBy).toBeDefined();
  });

  it('POST /api/v1/campaigns/:id/live/summary generates AI summary and respects cooldown', async () => {
    const res1 = await request(app)
      .post(`/api/v1/campaigns/${campaignId}/live/summary`)
      .set('Authorization', AUTH_HEADER)
      .send({ force: true });

    expect(res1.status).toBe(201);
    expect(res1.body.text).toBeDefined();
    expect(res1.body.actions.length).toBeGreaterThanOrEqual(1);

    // Call again immediately without force -> returns cached summary
    const res2 = await request(app)
      .post(`/api/v1/campaigns/${campaignId}/live/summary`)
      .set('Authorization', AUTH_HEADER)
      .send({ force: false });

    expect(res2.status).toBe(200);
    expect(res2.body.id).toBe(res1.body.id);
  }, 20000);

  it('Downsamples snapshots in TrackedVideo repository when count > 500', async () => {
    const repos = getRepositories();
    const videoId = 'v_downsample';

    await repos.trackedVideos.create(campaignId, {
      id: videoId,
      campaignId,
      creatorId,
      videoId,
      url: `https://youtube.com/watch?v=${videoId}`,
      title: 'Downsample Test #ad',
      publishedAt: new Date().toISOString(),
      isStandIn: true,
      active: true,
      latestStats: { views: 100, likes: 5, comments: 1 },
      commentsUnavailable: false,
      createdAt: new Date().toISOString(),
    });

    for (let i = 0; i < 505; i++) {
      await repos.trackedVideos.addSnapshot(campaignId, videoId, {
        at: new Date(Date.now() + i * 1000).toISOString(),
        views: 100 + i,
        likes: 5,
        comments: 1,
      });
    }

    const snaps = await repos.trackedVideos.getSnapshots(campaignId, videoId);
    expect(snaps.length).toBeLessThanOrEqual(500);
  });
});
