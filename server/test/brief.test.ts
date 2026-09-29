import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApiApp } from '../apiPlugin.ts';
import { resetRepositoriesForTesting, getRepositories } from '../repositories/index.ts';
import { CONFIG } from '../../shared/config.ts';

vi.mock('../services/gemini.ts', () => ({
  embed: vi.fn().mockResolvedValue([[0.2, 0.4, 0.6, 0.8]]),
  generateStructured: vi.fn().mockImplementation(async ({ engine }) => {
    return {
      creatorSnapshot: 'Coffee Expert delivers rigorous analysis, as seen in "Picopresso Deep Dive". Her community trusts her reviews.',
      campaignObjective: 'Introduce the Picopresso to drive authentic consideration and engagement.',
      recommendedFormat: {
        type: 'integrated segment',
        targetLength: '60–90 seconds',
        placement: 'Mid-roll at natural transition',
        rationale: 'Audience engages strongly with demonstrative integrated reviews.',
      },
      contentAngles: [
        {
          title: 'Field-Testing the Picopresso',
          hook: 'Can a portable brewer make authentic cafe espresso?',
          outline: ['Unboxing', 'Grind and puck prep', 'Piston extraction', 'Taste verdict'],
          whyItFitsThisCreator: 'Directly follows up on "Picopresso Deep Dive".',
        },
        {
          title: 'Ultimate Travel Espresso Setup',
          hook: 'Here is how I pack high-end coffee for travel.',
          outline: ['Gear essentials', 'Picopresso demonstration', 'Cleanup tips'],
          whyItFitsThisCreator: 'Matches travel guide style from "Travel Espresso Setup".',
        },
        {
          title: '5 Mistakes with Manual Espresso',
          hook: 'Why most people fail at manual extraction.',
          outline: ['Grind size', 'Pre-heating', 'Pumping speed', 'Channeling fixes'],
          whyItFitsThisCreator: 'Tutorial style favored by their community.',
        },
      ],
      keyMessages: [
        'Produces authentic espresso with 18 bars of pressure',
        'Compact form factor weighing only 350 grams',
        'Features a commercial-grade 52mm stainless steel basket',
      ],
      dos: [
        { ruleCode: 'G-1', instruction: 'Disclose brand partnership verbally in the first 30 seconds.' },
        { ruleCode: 'G-3', instruction: 'Show hands-on brewing process with clear camera focus.' },
      ],
      donts: [
        { ruleCode: 'G-2', instruction: 'Do not make unverified health or medical guarantees.' },
      ],
    };
  }),
  wrapUntrustedData: (source: string, content: string) => `<untrusted_data source="${source}">\n${content}\n</untrusted_data>`,
  escapeUntrustedText: (text: string) => text,
}));

import { slugify, buildCreatorCtaUrl } from '../engines/briefs/utmBuilder.ts';
import { calculateTimeline } from '../engines/briefs/timelineCalculator.ts';
import { calculateSuccessMetrics } from '../engines/briefs/successMetrics.ts';
import { detectUnapprovedClaims } from '../engines/briefs/claimDetector.ts';
import { verifyBriefCitations } from '../engines/briefs/titleCitationVerifier.ts';
import {
  getNestedProperty,
  setNestedProperty,
  mergePreservingEdits,
  detectChangedFieldPaths,
} from '../engines/briefs/preserveEditsMerge.ts';
import { briefToMarkdown, createBriefsZipArchive } from '../engines/briefs/markdownExporter.ts';
import {
  Creator,
  CampaignBrief,
  CreatorBrief,
  CreatorBriefContent,
  CreatorBriefVersion,
} from '../../shared/types.ts';

describe('Phase 5: Engine 2 — Creator Brief Generation Suite', () => {
  let app: ReturnType<typeof createApiApp>;

  beforeEach(() => {
    resetRepositoriesForTesting();
    app = createApiApp();
  });

  const OWNER_AUTH = 'Bearer demo_user_alpha';
  const OTHER_AUTH = 'Bearer demo_user_beta';

  const sampleBrief: CampaignBrief = {
    brandName: 'Wacaco',
    productName: 'Picopresso',
    productCategory: 'Coffee Equipment',
    landingPageUrl: 'https://wacaco.com/products/picopresso',
    goal: 'consideration',
    targetAudience: 'Specialty coffee enthusiasts, travelers, outdoor campers',
    competitors: [],
    bannedTerms: [],
    nicheKeywords: ['espresso', 'coffee gear'],
    geography: 'US',
    tones: ['Technical / Educational', 'Authentic / Creator-Led'],
    customTone: '',
    approvedFacts: [
      'Produces authentic espresso with 18 bars of pressure',
      'Compact handheld design weighing only 350 grams',
      'Features a naked 52mm stainless steel portafilter basket',
      'Retail price is $129 USD',
    ],
    requiredDisclosures: {
      verbalText: 'This segment is proudly sponsored by {brandName}.',
      descriptionText: '#ad Sponsored by {brandName}',
    },
    launchDate: '2026-10-30T00:00:00.000Z',
    budgetUsd: 25000,
  };

  const sampleCreator: Creator = {
    id: 'creator_coffee_jane',
    campaignId: 'cmp_brief_test',
    input: '@coffeewithjane',
    inputType: 'handle',
    normalizedKey: 'uc_coffee_jane_123',
    status: 'analyzed',
    channel: {
      channelId: 'UC_COFFEE_JANE_123',
      title: 'Coffee With Jane',
      customUrl: 'youtube.com/@coffeewithjane',
      description: 'In-depth espresso and gear reviews.',
      subscriberCount: 250000,
      hiddenSubscriberCount: false,
      videoCount: 180,
      viewCount: 15000000,
      avatarUrl: 'https://example.com/avatar.jpg',
      country: 'US',
      publishedAt: '2020-01-15T00:00:00Z',
      channelAgeMonths: 68,
      topicCategories: ['Coffee', 'Technology'],
    },
    metrics: {
      subscribers: 250000,
      videoCount: 180,
      channelAgeMonths: 68,
      country: 'US',
      uploadsPerMonth: 4,
      daysSinceLastUpload: 5,
      consistency: 0.9,
      viewsToSubsRatio: 0.2,
      topVideos: [],
      sponsorship: { count: 2, sponsorshipRate: 0.1, sponsoredVideos: [] },
      estimatedCostPerVideoUsd: { low: 1000, high: 2000 },
      dataQuality: 'good',
      longForm: {
        medianViews: 50000,
        medianEngagementRate: 0.045,
        count: 30,
        likesHidden: false,
      },
      shorts: {
        medianViews: 20000,
        medianEngagementRate: 0.03,
        count: 10,
        likesHidden: false,
      },
    },
    recentVideos: [
      {
        videoId: 'vid_1',
        title: 'Picopresso Deep Dive: Is Portable Espresso Real?',
        description: 'Testing the Picopresso with calibrated grind and extraction monitoring.',
        publishedAt: '2026-08-01T12:00:00Z',
        durationSeconds: 780,
        viewCount: 95000,
        likeCount: 4200,
        commentCount: 650,
        engagementRate: 0.05,
        likesHidden: false,
        hasSponsorshipSignals: false,
        sponsorshipSignals: [],
        isShort: false,
      },
      {
        videoId: 'vid_2',
        title: 'Ultimate Travel Espresso Setup for 2026',
        description: 'Complete breakdown of packing portable grinders and manual brewers.',
        publishedAt: '2026-07-15T12:00:00Z',
        durationSeconds: 620,
        viewCount: 60000,
        likeCount: 3100,
        commentCount: 410,
        engagementRate: 0.058,
        likesHidden: false,
        hasSponsorshipSignals: false,
        sponsorshipSignals: [],
        isShort: false,
      },
      {
        videoId: 'vid_3',
        title: 'Budget Grinder Shootout',
        description: 'Comparing manual hand grinders under $100.',
        publishedAt: '2026-06-20T12:00:00Z',
        durationSeconds: 900,
        viewCount: 45000,
        likeCount: 2200,
        commentCount: 300,
        engagementRate: 0.055,
        likesHidden: false,
        hasSponsorshipSignals: false,
        sponsorshipSignals: [],
        isShort: false,
      },
    ],
    scores: {
      fitScore: 88,
      tier: 'Strong fit',
      engagementScore: 85,
      reachScore: 90,
      consistencyScore: 90,
      recencyScore: 90,
      budgetFitScore: 85,
      nicheFit: 90,
      audienceFit: 88,
      toneFit: 85,
      brandSafety: 95,
      justifications: { nicheFit: '', audienceFit: '', toneFit: '', brandSafety: '' },
      citations: { nicheFit: [], audienceFit: [], toneFit: [], brandSafety: [] },
      lowConfidence: { nicheFit: false, audienceFit: false, toneFit: false, brandSafety: false },
      brandSafetyFlags: [],
      summary: 'Strong fit for coffee gear reviews',
      brandSafetyCapped: false,
    },
    selected: true,
    plannedPublishDate: '2026-10-28',
    tags: ['espresso', 'gear'],
    notes: 'Top candidate for manual gear reviews.',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    version: 1,
  };

  // -------------------------------------------------------------
  // 1. UTM Builder Pure Unit Tests
  // -------------------------------------------------------------
  describe('1. UTM Builder Engine', () => {
    it('slugify converts titles and handles into clean URL slugs', () => {
      expect(slugify('Summer Espresso Campaign 2026!')).toBe('summer-espresso-campaign-2026');
      expect(slugify('@CoffeeWithJane')).toBe('coffeewithjane');
      expect(slugify('   Product Launch — Part 1   ')).toBe('product-launch-part-1');
      expect(slugify('')).toBe('campaign');
      expect(slugify('###')).toBe('unnamed');
    });

    it('buildCreatorCtaUrl sets correct UTM parameters and encoding', () => {
      const url = buildCreatorCtaUrl({
        landingPageUrl: 'https://wacaco.com/products/picopresso',
        campaignName: 'Picopresso Global Launch',
        creatorHandleOrName: '@CoffeeWithJane',
      });

      const parsed = new URL(url);
      expect(parsed.origin).toBe('https://wacaco.com');
      expect(parsed.pathname).toBe('/products/picopresso');
      expect(parsed.searchParams.get('utm_source')).toBe('youtube');
      expect(parsed.searchParams.get('utm_medium')).toBe('creator');
      expect(parsed.searchParams.get('utm_campaign')).toBe('picopresso-global-launch');
      expect(parsed.searchParams.get('utm_content')).toBe('coffeewithjane');
    });

    it('buildCreatorCtaUrl preserves existing query parameters on landing page', () => {
      const url = buildCreatorCtaUrl({
        landingPageUrl: 'https://wacaco.com/store?category=espresso&promo=earlybird',
        campaignName: 'Launch 2026',
        creatorHandleOrName: 'Jane Doe',
      });

      const parsed = new URL(url);
      expect(parsed.searchParams.get('category')).toBe('espresso');
      expect(parsed.searchParams.get('promo')).toBe('earlybird');
      expect(parsed.searchParams.get('utm_source')).toBe('youtube');
      expect(parsed.searchParams.get('utm_content')).toBe('jane-doe');
    });

    it('handles relative or unparseable URLs gracefully', () => {
      const url = buildCreatorCtaUrl({
        landingPageUrl: '/shop/deal',
        campaignName: 'Black Friday',
        creatorHandleOrName: 'TechGuy',
      });
      expect(url).toContain('/shop/deal?');
      expect(url).toContain('utm_source=youtube');
      expect(url).toContain('utm_content=techguy');
    });
  });

  // -------------------------------------------------------------
  // 2. Timeline Calculator Pure Unit Tests
  // -------------------------------------------------------------
  describe('2. Timeline Calculator Engine', () => {
    it('calculates milestones using config offsets relative to launch date', () => {
      const launch = '2026-10-30T00:00:00.000Z';
      const timeline = calculateTimeline(launch, null);

      expect(timeline.feedbackWithinDays).toBe(CONFIG.BRIEF_FEEDBACK_WINDOW_DAYS);
      expect(timeline.publishDate).toBe('2026-10-30');

      // Draft due = launch - 14 days
      const expectedDraft = new Date(new Date(launch).getTime() - 14 * 86400000).toISOString().split('T')[0];
      expect(timeline.draftDue).toBe(expectedDraft);

      // Final due = launch - 3 days
      const expectedFinal = new Date(new Date(launch).getTime() - 3 * 86400000).toISOString().split('T')[0];
      expect(timeline.finalDue).toBe(expectedFinal);
    });

    it('prioritizes creator plannedPublishDate when specified', () => {
      const launch = '2026-10-30T00:00:00.000Z';
      const planned = '2026-11-05';
      const timeline = calculateTimeline(launch, planned);

      expect(timeline.publishDate).toBe('2026-11-05');
    });

    it('handles invalid launch date without crashing', () => {
      const timeline = calculateTimeline('not-a-date', null);
      expect(timeline.draftDue).toBeDefined();
      expect(timeline.finalDue).toBeDefined();
      expect(timeline.publishDate).toBeDefined();
    });
  });

  // -------------------------------------------------------------
  // 3. Success Metrics Pure Unit Tests
  // -------------------------------------------------------------
  describe('3. Success Metrics Engine', () => {
    it('computes target views at 90% of median views and preserves median engagement rate', () => {
      const metrics = calculateSuccessMetrics(sampleCreator);

      expect(metrics.medianViewsBenchmark).toBe(50000);
      expect(metrics.targetViews).toBe(45000); // 50000 * 0.90
      expect(metrics.medianEngagementBenchmark).toBe(0.045);
      expect(metrics.targetEngagementRate).toBe(0.045);
    });

    it('falls back to shorts metrics when long-form metrics are missing', () => {
      const shortsCreator: Creator = {
        ...sampleCreator,
        metrics: {
          ...sampleCreator.metrics!,
          subscribers: 100000,
          longForm: undefined as any,
          shorts: {
            medianViews: 80000,
            medianEngagementRate: 0.06,
            count: 20,
            likesHidden: false,
          },
        },
      };

      const metrics = calculateSuccessMetrics(shortsCreator);
      expect(metrics.medianViewsBenchmark).toBe(80000);
      expect(metrics.targetViews).toBe(72000); // 80000 * 0.9
      expect(metrics.targetEngagementRate).toBe(0.06);
    });
  });

  // -------------------------------------------------------------
  // 4. Claim Detector Pure Unit Tests
  // -------------------------------------------------------------
  describe('4. Claim Detector Engine', () => {
    const approved = [
      'Produces authentic espresso with 18 bars of pressure',
      'Compact handheld design weighing only 350 grams',
      'Retail price is $129 USD',
    ];

    it('allows claims that match approved facts', () => {
      const messages = [
        'Built with an 18 bars manual piston for true espresso extraction.',
        'Extremely portable at just 350 grams in your backpack.',
        'Available now for $129 USD.',
      ];
      const warnings = detectUnapprovedClaims(messages, approved);
      expect(warnings.length).toBe(0);
    });

    it('flags unapproved pricing claims', () => {
      const messages = [
        'Grab yours today for only $49!',
        'A steal at 99 dollars.',
      ];
      const warnings = detectUnapprovedClaims(messages, approved);
      expect(warnings.length).toBeGreaterThanOrEqual(2);
      expect(warnings.some((w) => w.claim.includes('$49'))).toBe(true);
      expect(warnings.some((w) => w.claim.toLowerCase().includes('99 dollars'))).toBe(true);
    });

    it('flags unapproved numerical specifications', () => {
      const messages = [
        'Extracts with massive 25 bars of pressure!',
        'Guarantees 100% crema retention.',
      ];
      const warnings = detectUnapprovedClaims(messages, approved);
      expect(warnings.some((w) => w.claim.includes('25'))).toBe(true);
      expect(warnings.some((w) => w.claim.includes('100%'))).toBe(true);
    });

    it('flags unapproved medical and miracle health terms', () => {
      const messages = [
        'Drinking this coffee will cure morning fatigue and heal inflammation.',
        'A clinically proven miracle brewer.',
      ];
      const warnings = detectUnapprovedClaims(messages, approved);
      expect(warnings.some((w) => w.claim === 'cure')).toBe(true);
      expect(warnings.some((w) => w.claim === 'heal')).toBe(true);
      expect(warnings.some((w) => w.claim === 'miracle')).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 5. Title Citation Verifier Pure Unit Tests
  // -------------------------------------------------------------
  describe('5. Title Citation Verifier Engine', () => {
    const realVideos = sampleCreator.recentVideos!;

    it('verifies valid citations matching creator real video titles', () => {
      const snapshot = 'Known for thorough reviews like "Picopresso Deep Dive: Is Portable Espresso Real?", Jane has an engaged following.';
      const angles = [
        {
          title: 'Field Test',
          hook: 'Let us brew outside.',
          outline: ['Beat 1', 'Beat 2'],
          whyItFitsThisCreator: 'Matches their work on "Ultimate Travel Espresso Setup for 2026".',
        },
      ];

      const warnings = verifyBriefCitations(snapshot, angles, realVideos);
      expect(warnings.length).toBe(0);
    });

    it('flags fabricated video citations that do not exist on the channel', () => {
      const snapshot = 'Known for reviews like "Secret Espresso Hacks That Baristas Hate".';
      const angles = [
        {
          title: 'Field Test',
          hook: 'Let us brew outside.',
          outline: ['Beat 1', 'Beat 2'],
          whyItFitsThisCreator: 'Builds upon "The Worst Espresso Machine Ever Made".',
        },
      ];

      const warnings = verifyBriefCitations(snapshot, angles, realVideos);
      expect(warnings.length).toBe(2);
      expect(warnings[0].field).toBe('creatorSnapshot');
      expect(warnings[1].field).toBe('contentAngles.0.whyItFitsThisCreator');
    });
  });

  // -------------------------------------------------------------
  // 6. Preserve-Edits Merge & Changed Paths Pure Unit Tests
  // -------------------------------------------------------------
  describe('6. Preserve-Edits Merge & Change Detection', () => {
    const baseContent: CreatorBriefContent = {
      creatorSnapshot: 'Initial snapshot text.',
      campaignObjective: 'Initial objective.',
      recommendedFormat: {
        type: 'integrated segment',
        targetLength: '60s',
        placement: 'Mid-roll',
        rationale: 'Good fit.',
      },
      contentAngles: [
        {
          title: 'Angle 1',
          hook: 'Original Hook',
          outline: ['Beat 1', 'Beat 2'],
          whyItFitsThisCreator: 'Reason 1',
        },
        {
          title: 'Angle 2',
          hook: 'Hook 2',
          outline: ['Beat A', 'Beat B'],
          whyItFitsThisCreator: 'Reason 2',
        },
        {
          title: 'Angle 3',
          hook: 'Hook 3',
          outline: ['Beat X', 'Beat Y'],
          whyItFitsThisCreator: 'Reason 3',
        },
      ],
      keyMessages: ['Msg 1', 'Msg 2', 'Msg 3'],
      dos: [{ ruleCode: 'G-1', instruction: 'Do this' }],
      donts: [{ ruleCode: 'G-2', instruction: 'Do not do that' }],
      mandatoryDisclosures: {
        verbalText: 'Sponsored by Wacaco',
        descriptionText: '#ad',
      },
      callToAction: 'https://wacaco.com?utm_source=youtube',
      deliverablesAndTimeline: {
        draftDue: '2026-10-16',
        feedbackWithinDays: 3,
        finalDue: '2026-10-27',
        publishDate: '2026-10-30',
      },
      successMetrics: {
        targetViews: 45000,
        targetEngagementRate: 0.045,
        medianViewsBenchmark: 50000,
        medianEngagementBenchmark: 0.045,
      },
      claimWarnings: [],
      citationWarnings: [],
    };

    it('detectChangedFieldPaths identifies exact modified paths', () => {
      const updated = JSON.parse(JSON.stringify(baseContent));
      updated.creatorSnapshot = 'Custom user-edited snapshot!';
      updated.contentAngles[0].hook = 'High-octane custom hook!';

      const changes = detectChangedFieldPaths(baseContent, updated);
      expect(changes).toContain('creatorSnapshot');
      expect(changes).toContain('contentAngles.0.hook');
      expect(changes).not.toContain('campaignObjective');
    });

    it('getNestedProperty and setNestedProperty read and write deep paths', () => {
      const obj = { user: { profile: { title: 'Engineer' } } };
      expect(getNestedProperty(obj, 'user.profile.title')).toBe('Engineer');

      setNestedProperty(obj, 'user.profile.title', 'Strategist');
      expect(getNestedProperty(obj, 'user.profile.title')).toBe('Strategist');
    });

    it('mergePreservingEdits keeps user-edited fields and adopts new generated fields', () => {
      const previous = JSON.parse(JSON.stringify(baseContent));
      previous.contentAngles[0].hook = 'USER_CUSTOM_HOOK';
      previous.recommendedFormat.targetLength = '90–120s';

      const newlyGenerated = JSON.parse(JSON.stringify(baseContent));
      newlyGenerated.creatorSnapshot = 'FRESH_AI_SNAPSHOT';
      newlyGenerated.contentAngles[0].hook = 'AI_OVERWRITTEN_HOOK';
      newlyGenerated.recommendedFormat.targetLength = '30s';
      newlyGenerated.campaignObjective = 'FRESH_AI_OBJECTIVE';

      const editedFields = ['contentAngles.0.hook', 'recommendedFormat.targetLength'];

      const merged = mergePreservingEdits(newlyGenerated, previous, editedFields);

      // Preserved fields
      expect(merged.contentAngles[0].hook).toBe('USER_CUSTOM_HOOK');
      expect(merged.recommendedFormat.targetLength).toBe('90–120s');

      // Refreshed AI fields
      expect(merged.creatorSnapshot).toBe('FRESH_AI_SNAPSHOT');
      expect(merged.campaignObjective).toBe('FRESH_AI_OBJECTIVE');
    });
  });

  // -------------------------------------------------------------
  // 7. Markdown & Zip Exporter Pure Unit Tests
  // -------------------------------------------------------------
  describe('7. Markdown & Zip Exporter', () => {
    const briefDoc: CreatorBrief = {
      id: sampleCreator.id,
      campaignId: 'cmp_export_test',
      creatorId: sampleCreator.id,
      status: 'final',
      content: {
        creatorSnapshot: 'Jane is an elite coffee creator.',
        campaignObjective: 'Drive consideration for Picopresso.',
        recommendedFormat: {
          type: 'integrated segment',
          targetLength: '60–90 seconds',
          placement: 'Mid-roll',
          rationale: 'High retention.',
        },
        contentAngles: [
          {
            title: 'Field Test',
            hook: 'Testing on a mountain.',
            outline: ['Start', 'Extract', 'Taste'],
            whyItFitsThisCreator: 'Channel fit.',
          },
          {
            title: 'Angle 2',
            hook: 'Hook 2',
            outline: ['A', 'B'],
            whyItFitsThisCreator: 'Fit 2',
          },
          {
            title: 'Angle 3',
            hook: 'Hook 3',
            outline: ['X', 'Y'],
            whyItFitsThisCreator: 'Fit 3',
          },
        ],
        keyMessages: ['18 bars pressure', 'Compact 350g'],
        dos: [{ ruleCode: 'G-1', instruction: 'Disclose sponsor' }],
        donts: [{ ruleCode: 'G-2', instruction: 'No medical claims' }],
        mandatoryDisclosures: {
          verbalText: 'Sponsored by Wacaco.',
          descriptionText: '#ad',
        },
        callToAction: 'https://wacaco.com?utm_source=youtube',
        deliverablesAndTimeline: {
          draftDue: '2026-10-16',
          feedbackWithinDays: 3,
          finalDue: '2026-10-27',
          publishDate: '2026-10-30',
        },
        successMetrics: {
          targetViews: 45000,
          targetEngagementRate: 0.045,
          medianViewsBenchmark: 50000,
          medianEngagementBenchmark: 0.045,
        },
        claimWarnings: [],
        citationWarnings: [],
      },
      editedFields: [],
      currentVersion: 1,
      generatedAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
      version: 1,
    };

    it('briefToMarkdown produces formatted document with required sections', () => {
      const md = briefToMarkdown(briefDoc, sampleCreator, 'Picopresso Launch');
      expect(md).toContain('# Creator Collaboration Brief: Coffee With Jane');
      expect(md).toContain('## 1. Creator Context & Fit');
      expect(md).toContain('## 2. Campaign Objective');
      expect(md).toContain('## 3. Recommended Deliverable Format');
      expect(md).toContain('## 4. Proposed Creative Angles');
      expect(md).toContain('## 7. Mandatory FTC & Platform Disclosures');
      expect(md).toContain('## 8. Call to Action & Tracked Link');
      expect(md).toContain('## 9. Production Timeline & Milestones');
    });

    it('createBriefsZipArchive packages briefs into a readable zip buffer with README', async () => {
      const zipBuffer = await createBriefsZipArchive(
        [{ brief: briefDoc, creator: sampleCreator }],
        'Picopresso Launch'
      );
      expect(Buffer.isBuffer(zipBuffer)).toBe(true);
      expect(zipBuffer.length).toBeGreaterThan(100);
    });
  });

  // -------------------------------------------------------------
  // 8. API Integration Endpoints Suite (/api/v1/campaigns/:id/briefs)
  // -------------------------------------------------------------
  describe('8. API Endpoints & Version History Integration', () => {
    let campaignId: string;

    beforeEach(async () => {
      const repos = getRepositories();
      // Create campaign with approvedLineup
      const camp = await repos.campaigns.create({
        ownerId: 'demo_user_alpha',
        ownerEmail: 'demo_user_alpha@example.com',
        memberEmails: [],
        name: 'Wacaco Global Briefing',
        status: 'draft',
        brief: sampleBrief,
        settings: {},
        approvedLineup: {
          creatorIds: ['creator_coffee_jane', 'creator_coffee_bob'],
          runId: 'run_premortem_1',
          approvedAt: '2026-09-01T00:00:00Z',
          approvedBy: 'demo_user_alpha@example.com',
        },
      });
      campaignId = camp.id;

      // Add creators
      await repos.creators.bulkUpsert(campaignId, [
        sampleCreator,
        {
          ...sampleCreator,
          id: 'creator_coffee_bob',
          normalizedKey: 'uc_coffee_bob_456',
          channel: {
            ...sampleCreator.channel!,
            title: 'Bob Coffee Tech',
            customUrl: 'youtube.com/@bobcoffeetech',
          },
        },
      ]);
    });

    it('POST /generate creates briefs for approved lineup and returns jobId', async () => {
      const res = await request(app)
        .post(`/api/v1/campaigns/${campaignId}/briefs/generate`)
        .set('Authorization', OWNER_AUTH)
        .send({
          instruction: 'Focus on outdoor travel gear',
        });

      expect(res.status).toBe(202);
      expect(res.body.jobId).toBeDefined();

      // Poll job until complete
      for (let i = 0; i < 20; i++) {
        const jRes = await request(app)
          .get(`/api/v1/jobs/${res.body.jobId}`)
          .set('Authorization', OWNER_AUTH);
        if (jRes.body.status === 'succeeded' || jRes.body.status === 'failed') break;
        await new Promise((r) => setTimeout(r, 50));
      }

      // Verify briefs were created in repository
      const listRes = await request(app)
        .get(`/api/v1/campaigns/${campaignId}/briefs`)
        .set('Authorization', OWNER_AUTH);

      expect(listRes.status).toBe(200);
      expect(listRes.body.length).toBe(2);
      expect(listRes.body[0].creatorId).toBeDefined();
      expect(listRes.body[0].currentVersion).toBe(1);
    });

    it('POST /generate rejects creators not in approved lineup', async () => {
      const res = await request(app)
        .post(`/api/v1/campaigns/${campaignId}/briefs/generate`)
        .set('Authorization', OWNER_AUTH)
        .send({
          creatorIds: ['unapproved_creator_xyz'],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('not in the approved lineup');
    });

    it('POST /generate skips creators whose brief is final unless force = true', async () => {
      const repos = getRepositories();
      // Generate one brief and mark it final
      const briefDoc: CreatorBrief = {
        id: 'creator_coffee_jane',
        campaignId,
        creatorId: 'creator_coffee_jane',
        status: 'final',
        content: {
          creatorSnapshot: 'Finalized snapshot',
          campaignObjective: 'Goal',
          recommendedFormat: {
            type: 'Short',
            targetLength: '45s',
            placement: 'Feed',
            rationale: 'Quick virality',
          },
          contentAngles: [
            { title: 'T1', hook: 'H1', outline: ['A', 'B'], whyItFitsThisCreator: 'F1' },
            { title: 'T2', hook: 'H2', outline: ['A', 'B'], whyItFitsThisCreator: 'F2' },
            { title: 'T3', hook: 'H3', outline: ['A', 'B'], whyItFitsThisCreator: 'F3' },
          ],
          keyMessages: ['K1', 'K2', 'K3'],
          dos: [{ ruleCode: 'G-1', instruction: 'Do' }],
          donts: [{ ruleCode: 'G-2', instruction: 'Dont' }],
          mandatoryDisclosures: { verbalText: 'Ad', descriptionText: '#ad' },
          callToAction: 'https://wacaco.com',
          deliverablesAndTimeline: {
            draftDue: '2026-10-16',
            feedbackWithinDays: 3,
            finalDue: '2026-10-27',
            publishDate: '2026-10-30',
          },
          successMetrics: {
            targetViews: 45000,
            targetEngagementRate: 0.045,
            medianViewsBenchmark: 50000,
            medianEngagementBenchmark: 0.045,
          },
          claimWarnings: [],
          citationWarnings: [],
        },
        editedFields: [],
        currentVersion: 1,
        generatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };
      await repos.briefs.upsert(campaignId, briefDoc);

      // Call generate without force for Jane
      const skipRes = await request(app)
        .post(`/api/v1/campaigns/${campaignId}/briefs/generate`)
        .set('Authorization', OWNER_AUTH)
        .send({
          creatorIds: ['creator_coffee_jane'],
          force: false,
        });

      expect(skipRes.status).toBe(200);
      expect(skipRes.body.jobId).toBeNull();
      expect(skipRes.body.message).toContain('already marked as Final');

      // Call generate WITH force
      const forceRes = await request(app)
        .post(`/api/v1/campaigns/${campaignId}/briefs/generate`)
        .set('Authorization', OWNER_AUTH)
        .send({
          creatorIds: ['creator_coffee_jane'],
          force: true,
        });

      expect(forceRes.status).toBe(202);
      expect(forceRes.body.jobId).toBeDefined();
    });

    it('PATCH /:creatorId updates content, records editedFields, and creates version snapshot', async () => {
      // First generate brief
      const repos = getRepositories();
      const initialBrief: CreatorBrief = {
        id: 'creator_coffee_jane',
        campaignId,
        creatorId: 'creator_coffee_jane',
        status: 'draft',
        content: {
          creatorSnapshot: 'Original snapshot',
          campaignObjective: 'Goal',
          recommendedFormat: {
            type: 'integrated segment',
            targetLength: '60s',
            placement: 'Mid-roll',
            rationale: 'Fit',
          },
          contentAngles: [
            { title: 'T1', hook: 'Original Hook', outline: ['A', 'B'], whyItFitsThisCreator: 'F1' },
            { title: 'T2', hook: 'H2', outline: ['A', 'B'], whyItFitsThisCreator: 'F2' },
            { title: 'T3', hook: 'H3', outline: ['A', 'B'], whyItFitsThisCreator: 'F3' },
          ],
          keyMessages: ['K1', 'K2', 'K3'],
          dos: [{ ruleCode: 'G-1', instruction: 'Do' }],
          donts: [{ ruleCode: 'G-2', instruction: 'Dont' }],
          mandatoryDisclosures: { verbalText: 'Ad', descriptionText: '#ad' },
          callToAction: 'https://wacaco.com',
          deliverablesAndTimeline: {
            draftDue: '2026-10-16',
            feedbackWithinDays: 3,
            finalDue: '2026-10-27',
            publishDate: '2026-10-30',
          },
          successMetrics: {
            targetViews: 45000,
            targetEngagementRate: 0.045,
            medianViewsBenchmark: 50000,
            medianEngagementBenchmark: 0.045,
          },
          claimWarnings: [],
          citationWarnings: [],
        },
        editedFields: [],
        currentVersion: 1,
        generatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };
      await repos.briefs.upsert(campaignId, initialBrief);

      // Create v1 version snapshot
      const v1Snapshot: CreatorBriefVersion = {
        id: 'v_creator_coffee_jane_1',
        versionNumber: 1,
        briefId: 'creator_coffee_jane',
        creatorId: 'creator_coffee_jane',
        content: initialBrief.content,
        status: 'draft',
        editedFields: [],
        savedBy: 'demo_user_alpha@example.com',
        savedAt: new Date().toISOString(),
        changeNote: 'Initial generation',
      };
      await repos.briefs.createVersion(campaignId, 'creator_coffee_jane', v1Snapshot);

      // Edit field
      const updatedContent = JSON.parse(JSON.stringify(initialBrief.content));
      updatedContent.contentAngles[0].hook = 'Brand New Custom Hook!';

      const patchRes = await request(app)
        .patch(`/api/v1/campaigns/${campaignId}/briefs/creator_coffee_jane`)
        .set('Authorization', OWNER_AUTH)
        .send({
          content: updatedContent,
          version: 1,
          changeNote: 'Refined first hook',
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.currentVersion).toBe(2);
      expect(patchRes.body.editedFields).toContain('contentAngles.0.hook');

      // Verify version snapshot v2 was created
      const versionsRes = await request(app)
        .get(`/api/v1/campaigns/${campaignId}/briefs/creator_coffee_jane/versions`)
        .set('Authorization', OWNER_AUTH);

      expect(versionsRes.status).toBe(200);
      expect(versionsRes.body.length).toBe(2);
      expect(versionsRes.body[0].versionNumber).toBe(2);
      expect(versionsRes.body[1].versionNumber).toBe(1);
    });

    it('POST /versions/:n/restore restores previous snapshot as a brand new version', async () => {
      const repos = getRepositories();

      const v1Content = {
        creatorSnapshot: 'V1 Historic Snapshot',
        campaignObjective: 'Goal',
        recommendedFormat: {
          type: 'Short' as const,
          targetLength: '30s',
          placement: 'Feed',
          rationale: 'Fit',
        },
        contentAngles: [
          { title: 'T1', hook: 'H1', outline: ['A', 'B'], whyItFitsThisCreator: 'F1' },
          { title: 'T2', hook: 'H2', outline: ['A', 'B'], whyItFitsThisCreator: 'F2' },
          { title: 'T3', hook: 'H3', outline: ['A', 'B'], whyItFitsThisCreator: 'F3' },
        ],
        keyMessages: ['K1', 'K2', 'K3'],
        dos: [{ ruleCode: 'G-1', instruction: 'Do' }],
        donts: [{ ruleCode: 'G-2', instruction: 'Dont' }],
        mandatoryDisclosures: { verbalText: 'Ad', descriptionText: '#ad' },
        callToAction: 'https://wacaco.com',
        deliverablesAndTimeline: {
          draftDue: '2026-10-16',
          feedbackWithinDays: 3,
          finalDue: '2026-10-27',
          publishDate: '2026-10-30',
        },
        successMetrics: {
          targetViews: 45000,
          targetEngagementRate: 0.045,
          medianViewsBenchmark: 50000,
          medianEngagementBenchmark: 0.045,
        },
        claimWarnings: [],
        citationWarnings: [],
      };

      const v2Content = JSON.parse(JSON.stringify(v1Content));
      v2Content.creatorSnapshot = 'V2 Modified Snapshot';

      // Current brief is at v2
      await repos.briefs.upsert(campaignId, {
        id: 'creator_coffee_jane',
        campaignId,
        creatorId: 'creator_coffee_jane',
        status: 'draft',
        content: v2Content,
        editedFields: ['creatorSnapshot'],
        currentVersion: 2,
        generatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 2,
      });

      // Save v1 and v2 version snapshots
      await repos.briefs.createVersion(campaignId, 'creator_coffee_jane', {
        id: 'v_creator_coffee_jane_1',
        versionNumber: 1,
        briefId: 'creator_coffee_jane',
        creatorId: 'creator_coffee_jane',
        content: v1Content,
        status: 'draft',
        editedFields: [],
        savedBy: 'demo_user_alpha@example.com',
        savedAt: new Date().toISOString(),
        changeNote: 'Initial',
      });

      await repos.briefs.createVersion(campaignId, 'creator_coffee_jane', {
        id: 'v_creator_coffee_jane_2',
        versionNumber: 2,
        briefId: 'creator_coffee_jane',
        creatorId: 'creator_coffee_jane',
        content: v2Content,
        status: 'draft',
        editedFields: ['creatorSnapshot'],
        savedBy: 'demo_user_alpha@example.com',
        savedAt: new Date().toISOString(),
        changeNote: 'V2 edit',
      });

      // Restore v1
      const restoreRes = await request(app)
        .post(`/api/v1/campaigns/${campaignId}/briefs/creator_coffee_jane/versions/1/restore`)
        .set('Authorization', OWNER_AUTH);

      expect(restoreRes.status).toBe(200);
      expect(restoreRes.body.currentVersion).toBe(3);
      expect(restoreRes.body.content.creatorSnapshot).toBe('V1 Historic Snapshot');

      // Verify history contains all 3 versions (never overwritten)
      const allVersions = await repos.briefs.listVersions(campaignId, 'creator_coffee_jane');
      expect(allVersions.length).toBe(3);
      expect(allVersions[0].versionNumber).toBe(3);
      expect(allVersions[0].changeNote).toContain('Restored from version 1');
      expect(allVersions[1].versionNumber).toBe(2);
      expect(allVersions[2].versionNumber).toBe(1);
    });

    it('PATCH /:creatorId/status updates review state to final', async () => {
      const repos = getRepositories();
      await repos.briefs.upsert(campaignId, {
        id: 'creator_coffee_jane',
        campaignId,
        creatorId: 'creator_coffee_jane',
        status: 'draft',
        content: {
          creatorSnapshot: 'Snapshot',
          campaignObjective: 'Goal',
          recommendedFormat: {
            type: 'Short',
            targetLength: '30s',
            placement: 'Feed',
            rationale: 'Fit',
          },
          contentAngles: [
            { title: 'T1', hook: 'H1', outline: ['A', 'B'], whyItFitsThisCreator: 'F1' },
            { title: 'T2', hook: 'H2', outline: ['A', 'B'], whyItFitsThisCreator: 'F2' },
            { title: 'T3', hook: 'H3', outline: ['A', 'B'], whyItFitsThisCreator: 'F3' },
          ],
          keyMessages: ['K1', 'K2', 'K3'],
          dos: [{ ruleCode: 'G-1', instruction: 'Do' }],
          donts: [{ ruleCode: 'G-2', instruction: 'Dont' }],
          mandatoryDisclosures: { verbalText: 'Ad', descriptionText: '#ad' },
          callToAction: 'https://wacaco.com',
          deliverablesAndTimeline: {
            draftDue: '2026-10-16',
            feedbackWithinDays: 3,
            finalDue: '2026-10-27',
            publishDate: '2026-10-30',
          },
          successMetrics: {
            targetViews: 45000,
            targetEngagementRate: 0.045,
            medianViewsBenchmark: 50000,
            medianEngagementBenchmark: 0.045,
          },
          claimWarnings: [],
          citationWarnings: [],
        },
        editedFields: [],
        currentVersion: 1,
        generatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      });

      const res = await request(app)
        .patch(`/api/v1/campaigns/${campaignId}/briefs/creator_coffee_jane/status`)
        .set('Authorization', OWNER_AUTH)
        .send({
          status: 'final',
          version: 1,
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('final');
    });

    it('GET /:creatorId/export?format=md downloads single brief as Markdown', async () => {
      const repos = getRepositories();
      await repos.briefs.upsert(campaignId, {
        id: 'creator_coffee_jane',
        campaignId,
        creatorId: 'creator_coffee_jane',
        status: 'final',
        content: {
          creatorSnapshot: 'Expert coffee host.',
          campaignObjective: 'Goal',
          recommendedFormat: {
            type: 'integrated segment',
            targetLength: '60s',
            placement: 'Mid-roll',
            rationale: 'Fit',
          },
          contentAngles: [
            { title: 'T1', hook: 'H1', outline: ['A', 'B'], whyItFitsThisCreator: 'F1' },
            { title: 'T2', hook: 'H2', outline: ['A', 'B'], whyItFitsThisCreator: 'F2' },
            { title: 'T3', hook: 'H3', outline: ['A', 'B'], whyItFitsThisCreator: 'F3' },
          ],
          keyMessages: ['K1', 'K2', 'K3'],
          dos: [{ ruleCode: 'G-1', instruction: 'Do' }],
          donts: [{ ruleCode: 'G-2', instruction: 'Dont' }],
          mandatoryDisclosures: { verbalText: 'Ad', descriptionText: '#ad' },
          callToAction: 'https://wacaco.com?utm_source=youtube',
          deliverablesAndTimeline: {
            draftDue: '2026-10-16',
            feedbackWithinDays: 3,
            finalDue: '2026-10-27',
            publishDate: '2026-10-30',
          },
          successMetrics: {
            targetViews: 45000,
            targetEngagementRate: 0.045,
            medianViewsBenchmark: 50000,
            medianEngagementBenchmark: 0.045,
          },
          claimWarnings: [],
          citationWarnings: [],
        },
        editedFields: [],
        currentVersion: 1,
        generatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      });

      const res = await request(app)
        .get(`/api/v1/campaigns/${campaignId}/briefs/creator_coffee_jane/export?format=md`)
        .set('Authorization', OWNER_AUTH);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/markdown');
      expect(res.text).toContain('# Creator Collaboration Brief');
    });

    it('GET /export.zip downloads all briefs as a zip archive', async () => {
      const repos = getRepositories();
      await repos.briefs.upsert(campaignId, {
        id: 'creator_coffee_jane',
        campaignId,
        creatorId: 'creator_coffee_jane',
        status: 'final',
        content: {
          creatorSnapshot: 'Expert coffee host.',
          campaignObjective: 'Goal',
          recommendedFormat: {
            type: 'integrated segment',
            targetLength: '60s',
            placement: 'Mid-roll',
            rationale: 'Fit',
          },
          contentAngles: [
            { title: 'T1', hook: 'H1', outline: ['A', 'B'], whyItFitsThisCreator: 'F1' },
            { title: 'T2', hook: 'H2', outline: ['A', 'B'], whyItFitsThisCreator: 'F2' },
            { title: 'T3', hook: 'H3', outline: ['A', 'B'], whyItFitsThisCreator: 'F3' },
          ],
          keyMessages: ['K1', 'K2', 'K3'],
          dos: [{ ruleCode: 'G-1', instruction: 'Do' }],
          donts: [{ ruleCode: 'G-2', instruction: 'Dont' }],
          mandatoryDisclosures: { verbalText: 'Ad', descriptionText: '#ad' },
          callToAction: 'https://wacaco.com?utm_source=youtube',
          deliverablesAndTimeline: {
            draftDue: '2026-10-16',
            feedbackWithinDays: 3,
            finalDue: '2026-10-27',
            publishDate: '2026-10-30',
          },
          successMetrics: {
            targetViews: 45000,
            targetEngagementRate: 0.045,
            medianViewsBenchmark: 50000,
            medianEngagementBenchmark: 0.045,
          },
          claimWarnings: [],
          citationWarnings: [],
        },
        editedFields: [],
        currentVersion: 1,
        generatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      });

      const res = await request(app)
        .get(`/api/v1/campaigns/${campaignId}/briefs/export.zip`)
        .set('Authorization', OWNER_AUTH);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/zip');
      expect(res.headers['content-disposition']).toContain('.zip');
      expect(res.body).toBeDefined();
    });

    it('DELETE /:creatorId removes brief document', async () => {
      const repos = getRepositories();
      await repos.briefs.upsert(campaignId, {
        id: 'creator_coffee_jane',
        campaignId,
        creatorId: 'creator_coffee_jane',
        status: 'draft',
        content: {
          creatorSnapshot: 'To be deleted',
          campaignObjective: 'Goal',
          recommendedFormat: {
            type: 'Short',
            targetLength: '30s',
            placement: 'Feed',
            rationale: 'Fit',
          },
          contentAngles: [
            { title: 'T1', hook: 'H1', outline: ['A', 'B'], whyItFitsThisCreator: 'F1' },
            { title: 'T2', hook: 'H2', outline: ['A', 'B'], whyItFitsThisCreator: 'F2' },
            { title: 'T3', hook: 'H3', outline: ['A', 'B'], whyItFitsThisCreator: 'F3' },
          ],
          keyMessages: ['K1', 'K2', 'K3'],
          dos: [],
          donts: [],
          mandatoryDisclosures: { verbalText: 'Ad', descriptionText: '#ad' },
          callToAction: 'https://wacaco.com',
          deliverablesAndTimeline: {
            draftDue: '2026-10-16',
            feedbackWithinDays: 3,
            finalDue: '2026-10-27',
            publishDate: '2026-10-30',
          },
          successMetrics: {
            targetViews: 45000,
            targetEngagementRate: 0.045,
            medianViewsBenchmark: 50000,
            medianEngagementBenchmark: 0.045,
          },
          claimWarnings: [],
          citationWarnings: [],
        },
        editedFields: [],
        currentVersion: 1,
        generatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      });

      const deleteRes = await request(app)
        .delete(`/api/v1/campaigns/${campaignId}/briefs/creator_coffee_jane`)
        .set('Authorization', OWNER_AUTH);

      expect(deleteRes.status).toBe(200);

      const checkRes = await request(app)
        .get(`/api/v1/campaigns/${campaignId}/briefs/creator_coffee_jane`)
        .set('Authorization', OWNER_AUTH);

      expect(checkRes.status).toBe(404);
    });
  });
});
