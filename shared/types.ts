import { z } from 'zod';
import { CONFIG } from './config.ts';

// -------------------------------------------------------------
// App Errors & API Types
// -------------------------------------------------------------
export const ErrorCodeEnum = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'UNPROCESSABLE',
  'RATE_LIMITED',
  'INTERNAL',
  'UPSTREAM_ERROR',
  'AI_INVALID_OUTPUT',
  'AI_RATE_LIMITED',
  'AI_UNAVAILABLE',
  'JOB_TIMEOUT',
  'QUOTA_EXCEEDED',
  'CHANNEL_NOT_FOUND',
  'API_KEY_INVALID',
]);

export type ErrorCode = z.infer<typeof ErrorCodeEnum>;

export interface ApiErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown> | Array<{ field: string; message: string }>;
    retryable?: boolean;
    requestId?: string;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor?: string | null;
  total?: number;
}

// -------------------------------------------------------------
// User Profile
// -------------------------------------------------------------
export const UserSchema = z.object({
  uid: z.string(),
  email: z.string().email(),
  displayName: z.string().optional().nullable(),
  photoURL: z.string().url().optional().nullable(),
  createdAt: z.string(),
  lastLoginAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;

// -------------------------------------------------------------
// Campaign Status & Transitions
// -------------------------------------------------------------
export const CampaignStatusEnum = z.enum(['draft', 'active', 'completed', 'archived']);
export type CampaignStatus = z.infer<typeof CampaignStatusEnum>;

export const ALLOWED_STATUS_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ['active', 'archived'],
  active: ['completed', 'archived'],
  completed: ['archived'],
  archived: ['draft'],
};

// -------------------------------------------------------------
// Approved Lineup (Phase 4)
// -------------------------------------------------------------
export const ApprovedLineupSchema = z.object({
  creatorIds: z.array(z.string()),
  runId: z.string(),
  approvedAt: z.string(),
  approvedBy: z.string(),
});
export type ApprovedLineup = z.infer<typeof ApprovedLineupSchema>;

// -------------------------------------------------------------
// Campaign Model
// -------------------------------------------------------------
export const CampaignSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  ownerEmail: z.string().email(),
  memberEmails: z.array(z.string().email()).default([]),
  name: z.string().min(CONFIG.CAMPAIGN_NAME_MIN_LENGTH).max(CONFIG.CAMPAIGN_NAME_MAX_LENGTH),
  status: CampaignStatusEnum.default('draft'),
  brief: z.record(z.string(), z.unknown()).optional().default({}), // Phase 2
  settings: z.record(z.string(), z.unknown()).optional().default({}), // Phase 2
  approvedLineup: z.union([ApprovedLineupSchema, z.array(z.string())]).nullable().optional().default(null), // Phase 4
  deletedAt: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().nonnegative().default(1),
});
export type Campaign = z.infer<typeof CampaignSchema>;

// Input schemas for validation
export const CreateCampaignInputSchema = z.object({
  name: z.string()
    .trim()
    .min(CONFIG.CAMPAIGN_NAME_MIN_LENGTH, `Name must be at least ${CONFIG.CAMPAIGN_NAME_MIN_LENGTH} characters`)
    .max(CONFIG.CAMPAIGN_NAME_MAX_LENGTH, `Name cannot exceed ${CONFIG.CAMPAIGN_NAME_MAX_LENGTH} characters`),
});
export type CreateCampaignInput = z.infer<typeof CreateCampaignInputSchema>;

export const UpdateCampaignInputSchema = z.object({
  name: z.string()
    .trim()
    .min(CONFIG.CAMPAIGN_NAME_MIN_LENGTH)
    .max(CONFIG.CAMPAIGN_NAME_MAX_LENGTH)
    .optional(),
  status: CampaignStatusEnum.optional(),
  memberEmails: z.array(z.string().email()).optional(),
  brief: z.record(z.string(), z.unknown()).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  approvedLineup: z.union([ApprovedLineupSchema, z.array(z.string())]).nullable().optional(),
  version: z.number().int().nonnegative(),
});
export type UpdateCampaignInput = z.infer<typeof UpdateCampaignInputSchema>;

// -------------------------------------------------------------
// Phase 2: Campaign Brief (Stored on Campaign document as "brief")
// -------------------------------------------------------------
export const BRIEF_TONES = [
  'educational',
  'funny',
  'authentic',
  'premium',
  'energetic',
  'calm',
] as const;
export type BriefTone = (typeof BRIEF_TONES)[number];

export const BRIEF_GOALS = ['awareness', 'consideration', 'conversions'] as const;
export type BriefGoal = (typeof BRIEF_GOALS)[number];

export const DisclosuresSchema = z.object({
  descriptionText: z.string().trim().default('#ad'),
  verbalText: z.string().trim().default('This video is sponsored by {brandName}.'),
});
export type Disclosures = z.infer<typeof DisclosuresSchema>;

export const CampaignBriefSchema = z.object({
  brandName: z.string().trim().min(1, 'Brand name is required (1–80 chars)').max(80, 'Max 80 characters'),
  productName: z.string().trim().min(1, 'Product name is required (1–80 chars)').max(80, 'Max 80 characters'),
  productCategory: z.string().trim().min(1, 'Product category is required'),
  landingPageUrl: z.string().trim().url('Must be a valid URL').refine((url) => url.startsWith('https://'), {
    message: 'Landing page URL must start with https://',
  }),
  approvedFacts: z.array(
    z.string().trim().min(5, 'Fact must be 5–300 chars').max(300, 'Fact must be 5–300 chars')
  ).min(1, 'At least 1 approved fact is required').max(20, 'Maximum 20 approved facts allowed'),
  competitors: z.array(z.string().trim().min(1).max(80)).max(20, 'Maximum 20 competitors allowed').default([]),
  bannedTerms: z.array(z.string().trim().min(1).max(100)).max(50, 'Maximum 50 banned terms allowed').default([]),
  nicheKeywords: z.array(z.string().trim().min(1).max(50)).min(1, 'At least 1 niche keyword required').max(10, 'Maximum 10 niche keywords allowed'),
  targetAudience: z.string().trim().min(20, 'Target audience must be 20–500 chars').max(500, 'Target audience must be 20–500 chars'),
  geography: z.string().trim().min(2, 'Country code required').max(10).default('US'),
  tones: z.array(z.string().trim().min(1)).min(1, 'Select at least one tone'),
  customTone: z.string().trim().max(80).optional().default(''),
  budgetUsd: z.coerce.number().positive('Budget must be greater than 0').max(10_000_000, 'Budget maximum is $10,000,000'),
  goal: z.enum(BRIEF_GOALS),
  launchDate: z.string().min(1, 'Launch date is required'),
  requiredDisclosures: DisclosuresSchema.default({
    descriptionText: '#ad',
    verbalText: 'This video is sponsored by {brandName}.',
  }),
});
export type CampaignBrief = z.infer<typeof CampaignBriefSchema>;

export const PutBriefInputSchema = CampaignBriefSchema.extend({
  version: z.number().int().nonnegative(),
});
export type PutBriefInput = z.infer<typeof PutBriefInputSchema>;

export const PatchBriefInputSchema = CampaignBriefSchema.partial().extend({
  version: z.number().int().nonnegative(),
});
export type PatchBriefInput = z.infer<typeof PatchBriefInputSchema>;

export const SAMPLE_BRIEF: CampaignBrief = {
  brandName: 'Wacaco',
  productName: 'Picopresso Portable Espresso Machine',
  productCategory: 'Home & Kitchen',
  landingPageUrl: 'https://wacaco.com/products/picopresso',
  approvedFacts: [
    'Produces authentic cafe-quality espresso with rich crema using 18 bars of manual pressure',
    'Ultra-compact design weighing only 350 grams (0.77 lbs) with 52mm commercial naked portafilter',
    'Requires zero electricity or battery, powered entirely by an ergonomic manual piston',
    'Crafted with premium anodized aluminum body and food-grade stainless steel parts',
    'Includes custom protective EVA hard-shell travel case and dosing funnel',
  ],
  competitors: ['Flair GO', 'Nanopresso', 'Bialetti Moka Express', 'Staresso'],
  bannedTerms: ['cheap plastic', 'instant coffee', 'Nespresso competitor', 'steamer pod'],
  nicheKeywords: ['espresso', 'coffee gear', 'camping coffee', 'edc travel', 'specialty coffee'],
  targetAudience: 'Specialty coffee enthusiasts, digital nomads, backpackers, and gear obsessives aged 24–45 looking for real espresso anywhere without electricity.',
  geography: 'US',
  tones: ['authentic', 'educational', 'premium'],
  customTone: '',
  budgetUsd: 25000,
  goal: 'consideration',
  launchDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
  requiredDisclosures: {
    descriptionText: '#ad',
    verbalText: 'This video is sponsored by {brandName}.',
  },
};

export function isBriefComplete(brief: unknown): boolean {
  if (!brief || typeof brief !== 'object') return false;
  const result = CampaignBriefSchema.safeParse(brief);
  return result.success;
}

export const CampaignQuerySchema = z.object({
  status: CampaignStatusEnum.optional(),
  search: z.string().optional(),
  sort: z.enum(['updatedAt', 'name', 'createdAt']).default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(CONFIG.MAX_PAGE_SIZE).default(CONFIG.DEFAULT_PAGE_SIZE),
});
export type CampaignQuery = z.infer<typeof CampaignQuerySchema>;

// -------------------------------------------------------------
// Campaign Activity Log
// -------------------------------------------------------------
export const ActivityEntrySchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  actorEmail: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  summary: z.string(),
  at: z.string(),
});
export type ActivityEntry = z.infer<typeof ActivityEntrySchema>;

// -------------------------------------------------------------
// Background Jobs
// -------------------------------------------------------------
export const JobStatusEnum = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']);
export type JobStatus = z.infer<typeof JobStatusEnum>;

export const JobProgressSchema = z.object({
  done: z.number().int(),
  total: z.number().int(),
  message: z.string(),
});
export type JobProgress = z.infer<typeof JobProgressSchema>;

export const JobErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});
export type JobError = z.infer<typeof JobErrorSchema>;

export const JobSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  ownerId: z.string(),
  type: z.string(),
  status: JobStatusEnum,
  progress: JobProgressSchema,
  result: z.unknown().optional().nullable(),
  error: JobErrorSchema.optional().nullable(),
  cancelRequested: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Job = z.infer<typeof JobSchema>;

// -------------------------------------------------------------
// Campaign Export / Import Schema
// -------------------------------------------------------------
export const CampaignExportSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  campaign: z.object({
    name: z.string().min(CONFIG.CAMPAIGN_NAME_MIN_LENGTH).max(CONFIG.CAMPAIGN_NAME_MAX_LENGTH),
    brief: z.record(z.string(), z.unknown()).optional().default({}),
    settings: z.record(z.string(), z.unknown()).optional().default({}),
    guidelines: z.array(z.record(z.string(), z.unknown())).optional().default([]),
    creators: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  }),
});
export type CampaignExport = z.infer<typeof CampaignExportSchema>;

// -------------------------------------------------------------
// Health Check Response
// -------------------------------------------------------------
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  database: 'ok' | 'error';
  secrets: {
    gemini: boolean;
    youtube: boolean;
    cloudNl: boolean;
  };
  youtubeQuotaUsedToday: number;
  appVersion: string;
}

// =============================================================
// Phase 3 — Engine 1: Discovery, Candidates & Scoring Schemas
// =============================================================
export const CreatorInputTypeEnum = z.enum(['channelId', 'handle', 'url']);
export type CreatorInputType = z.infer<typeof CreatorInputTypeEnum>;

export const CreatorStatusEnum = z.enum([
  'pending',
  'resolved',
  'unresolved',
  'analyzing',
  'analyzed',
  'error',
]);
export type CreatorStatus = z.infer<typeof CreatorStatusEnum>;

export const CreatorTierEnum = z.enum(['Strong fit', 'Possible fit', 'Weak fit']);
export type CreatorTier = z.infer<typeof CreatorTierEnum>;

export const CreatorChannelSchema = z.object({
  channelId: z.string(),
  title: z.string(),
  description: z.string(),
  customUrl: z.string().optional().nullable(),
  avatarUrl: z.string().optional().nullable(),
  subscriberCount: z.number().nullable(),
  hiddenSubscriberCount: z.boolean().default(false),
  videoCount: z.number(),
  viewCount: z.number(),
  country: z.string().optional().nullable(),
  publishedAt: z.string().optional().nullable(),
  channelAgeMonths: z.number().optional().nullable(),
  topicCategories: z.array(z.string()).optional().default([]),
});
export type CreatorChannel = z.infer<typeof CreatorChannelSchema>;

export const CreatorVideoSchema = z.object({
  videoId: z.string(),
  title: z.string(),
  description: z.string(),
  publishedAt: z.string(),
  durationSeconds: z.number(),
  isShort: z.boolean(),
  thumbnailUrl: z.string().optional().nullable(),
  viewCount: z.number(),
  likeCount: z.number().nullable(),
  commentCount: z.number(),
  engagementRate: z.number().nullable(),
  likesHidden: z.boolean().default(false),
  hasSponsorshipSignals: z.boolean().default(false),
  sponsorshipSignals: z.array(z.string()).default([]),
});
export type CreatorVideo = z.infer<typeof CreatorVideoSchema>;

export const CreatorMetricsSchema = z.object({
  subscribers: z.number().nullable(),
  videoCount: z.number(),
  channelAgeMonths: z.number(),
  country: z.string().nullable(),
  shorts: z.object({
    count: z.number(),
    medianViews: z.number(),
    medianEngagementRate: z.number(),
    likesHidden: z.boolean(),
  }),
  longForm: z.object({
    count: z.number(),
    medianViews: z.number(),
    medianEngagementRate: z.number(),
    likesHidden: z.boolean(),
  }),
  uploadsPerMonth: z.number(),
  daysSinceLastUpload: z.number(),
  consistency: z.number().nullable(),
  viewsToSubsRatio: z.number().nullable(),
  topVideos: z.array(
    z.object({
      videoId: z.string(),
      title: z.string(),
      views: z.number(),
      ratioToMedian: z.number(),
    })
  ),
  sponsorship: z.object({
    count: z.number(),
    sponsorshipRate: z.number(),
    sponsoredVideos: z.array(
      z.object({
        videoId: z.string(),
        title: z.string(),
        signals: z.array(z.string()),
      })
    ),
  }),
  estimatedCostPerVideoUsd: z.object({
    low: z.number(),
    high: z.number(),
  }),
  dataQuality: z.enum(['good', 'low']),
});
export type CreatorMetrics = z.infer<typeof CreatorMetricsSchema>;

export const BrandSafetyFlagSchema = z.object({
  concern: z.string(),
  videoTitle: z.string(),
});
export type BrandSafetyFlag = z.infer<typeof BrandSafetyFlagSchema>;

export const CreatorScoresSchema = z.object({
  // Quantitative sub-scores (0-100)
  engagementScore: z.number(),
  reachScore: z.number(),
  consistencyScore: z.number(),
  recencyScore: z.number(),
  budgetFitScore: z.number(),

  // Qualitative sub-scores (0-100)
  nicheFit: z.number(),
  audienceFit: z.number(),
  toneFit: z.number(),
  brandSafety: z.number(),

  // Explanations, citations and confidence
  justifications: z.object({
    nicheFit: z.string(),
    audienceFit: z.string(),
    toneFit: z.string(),
    brandSafety: z.string(),
  }),
  citations: z.object({
    nicheFit: z.array(z.string()),
    audienceFit: z.array(z.string()),
    toneFit: z.array(z.string()),
    brandSafety: z.array(z.string()),
  }),
  lowConfidence: z.object({
    nicheFit: z.boolean(),
    audienceFit: z.boolean(),
    toneFit: z.boolean(),
    brandSafety: z.boolean(),
  }),
  brandSafetyFlags: z.array(BrandSafetyFlagSchema),
  summary: z.string(),

  // Overall Composite
  fitScore: z.number(),
  tier: CreatorTierEnum,
  brandSafetyCapped: z.boolean().default(false),
  brandSafetyWarning: z.string().optional(),
});
export type CreatorScores = z.infer<typeof CreatorScoresSchema>;

export const CreatorSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  input: z.string(),
  inputType: CreatorInputTypeEnum,
  normalizedKey: z.string(),
  status: CreatorStatusEnum,
  channel: CreatorChannelSchema.optional().nullable(),
  recentVideos: z.array(CreatorVideoSchema).optional().default([]),
  metrics: CreatorMetricsSchema.optional().nullable(),
  scores: CreatorScoresSchema.optional().nullable(),
  selected: z.boolean().default(false),
  plannedPublishDate: z.string().optional().nullable(),
  notes: z.string().max(1000).default(''),
  tags: z.array(z.string()).max(10).default([]),
  error: z.string().optional().nullable(),
  analyzedAt: z.string().optional().nullable(),
  // Phase 4: Pre-Mortem Caches
  embeddingCache: z
    .object({
      hash: z.string(),
      vector: z.array(z.number()),
      updatedAt: z.string(),
    })
    .optional()
    .nullable(),
  commentSample: z
    .object({
      comments: z.array(z.string()),
      authorChannelIds: z.array(z.string()),
      fetchedAt: z.string(),
    })
    .optional()
    .nullable(),
  classifiedSponsors: z
    .array(
      z.object({
        videoId: z.string(),
        sponsorBrand: z.string(),
        sponsorCategory: z.string(),
        isCompetitor: z.boolean(),
        sameCategoryAsOurProduct: z.boolean(),
      })
    )
    .optional()
    .nullable(),
  sentimentStats: z
    .object({
      negativeShare: z.number(),
      adFatigueShare: z.number(),
      method: z.enum(['cloud_nl', 'gemini']),
      analyzedAt: z.string(),
    })
    .optional()
    .nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().nonnegative().default(1),
});
export type Creator = z.infer<typeof CreatorSchema>;

export const AddCreatorInputSchema = z.object({
  input: z.string().trim().min(1, 'Creator input is required'),
  notes: z.string().max(1000).optional().default(''),
  tags: z.array(z.string().trim()).max(10).optional().default([]),
});
export type AddCreatorInput = z.infer<typeof AddCreatorInputSchema>;

export const BulkAddCreatorsInputSchema = z.object({
  inputs: z.array(z.string().trim().min(1)).min(1, 'Provide at least one input'),
});
export type BulkAddCreatorsInput = z.infer<typeof BulkAddCreatorsInputSchema>;

export const UpdateCreatorInputSchema = z.object({
  notes: z.string().max(1000).optional(),
  tags: z.array(z.string().trim()).max(10).optional(),
  selected: z.boolean().optional(),
  plannedPublishDate: z.string().nullable().optional(),
  version: z.number().int().nonnegative(),
});
export type UpdateCreatorInput = z.infer<typeof UpdateCreatorInputSchema>;

export const CreatorQuerySchema = z.object({
  status: CreatorStatusEnum.optional(),
  selected: z.enum(['true', 'false']).optional(),
  tier: z.enum(['Strong fit', 'Possible fit', 'Weak fit', 'all']).optional(),
  sort: z.enum(['fitScore', 'subscribers', 'medianViews', 'engagementRate', 'name', 'createdAt']).default('fitScore'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type CreatorQuery = z.infer<typeof CreatorQuerySchema>;

// Bulk Add Result Line
export interface CreatorValidationResult {
  raw: string;
  normalizedKey?: string;
  inputType?: CreatorInputType;
  status: 'valid' | 'duplicate' | 'invalid';
  reason?: string;
}

// -------------------------------------------------------------
// Phase 4: Engine 4 Pre-Mortem Simulator
// -------------------------------------------------------------
export const PairwiseOverlapResultSchema = z.object({
  creatorIdA: z.string(),
  creatorIdB: z.string(),
  creatorNameA: z.string(),
  creatorNameB: z.string(),
  pairOverlap: z.number().min(0).max(100), // 0-100%
  commenterOverlap: z.number().nullable(), // null if insufficient unique commenters (< 30)
  contentSimilarity: z.number().nullable(),
  tagOverlap: z.number().nullable(),
  signalsUsed: z.array(z.string()),
  rawValues: z.object({
    commenterJaccard: z.number().optional().nullable(),
    contentCosine: z.number().optional().nullable(),
    tagJaccard: z.number().optional().nullable(),
  }),
  sampleSizes: z.object({
    commentersA: z.number(),
    commentersB: z.number(),
    sharedCommenters: z.number(),
    videosA: z.number(),
    videosB: z.number(),
  }),
  methodExplanation: z.string(),
});
export type PairwiseOverlapResult = z.infer<typeof PairwiseOverlapResultSchema>;

export const LineupCreatorMetricsSchema = z.object({
  creatorId: z.string(),
  channelTitle: z.string(),
  sponsoredVideosCount: z.number(),
  recentCategorySponsoredCount: z.number(),
  recentCompetitorSponsoredCount: z.number(),
  recentCategoryShare: z.number(),
  negativeShare: z.number(),
  adFatigueShare: z.number(),
  sentimentMethod: z.enum(['cloud_nl', 'gemini']),
  medianViews: z.number(),
  estimatedCostMidpoint: z.number(),
  costShare: z.number(),
  hasSufficientCommentData: z.boolean(),
});
export type LineupCreatorMetrics = z.infer<typeof LineupCreatorMetricsSchema>;

export const LineupMetricsSchema = z.object({
  rawReach: z.number(),
  overlapAdjustedReach: z.number(),
  reachDeduplicationRatio: z.number(), // (raw - adjusted) / raw
  totalCostLow: z.number(),
  totalCostHigh: z.number(),
  totalCostMidpoint: z.number(),
  budgetUsd: z.number(),
  isOverBudget: z.boolean(),
  largestCreatorCostShare: z.number(),
  largestCreatorId: z.string(),
  creatorMetrics: z.record(z.string(), LineupCreatorMetricsSchema),
});
export type LineupMetrics = z.infer<typeof LineupMetricsSchema>;

export const HealthPenaltySchema = z.object({
  id: z.string(),
  category: z.enum([
    'overlap',
    'sentiment',
    'fatigue',
    'competitor',
    'budget',
    'concentration',
    'brandSafety',
  ]),
  penalty: z.number(),
  reason: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type HealthPenalty = z.infer<typeof HealthPenaltySchema>;

export const PremortemRiskSchema = z.object({
  category: z.enum([
    'overlap',
    'fatigue',
    'sentiment',
    'budget',
    'concentration',
    'brandSafety',
    'competitor',
  ]),
  severity: z.enum(['low', 'medium', 'high']),
  affectedCreatorIds: z.array(z.string()),
  explanation: z.string().max(300),
  recommendation: z.string(),
});
export type PremortemRisk = z.infer<typeof PremortemRiskSchema>;

export const PremortemSuggestionSchema = z.object({
  action: z.enum(['remove', 'replace', 'add', 'rebalanceBudget']),
  creatorId: z.string().optional(),
  replacementCreatorId: z.string().optional(),
  rationale: z.string(),
});
export type PremortemSuggestion = z.infer<typeof PremortemSuggestionSchema>;

export const PremortemConfidenceEnum = z.enum(['high', 'medium', 'low']);
export type PremortemConfidence = z.infer<typeof PremortemConfidenceEnum>;

export const PremortemHealthLabelEnum = z.enum([
  'Ready to launch',
  'Launch with fixes',
  'High risk — revise lineup',
]);
export type PremortemHealthLabel = z.infer<typeof PremortemHealthLabelEnum>;

export const PremortemRunSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  lineupCreatorIds: z.array(z.string()),
  pairwiseResults: z.array(PairwiseOverlapResultSchema),
  lineupMetrics: LineupMetricsSchema,
  penalties: z.array(HealthPenaltySchema),
  healthScore: z.number().min(0).max(100),
  label: PremortemHealthLabelEnum,
  confidence: PremortemConfidenceEnum,
  risks: z.array(PremortemRiskSchema),
  suggestions: z.array(PremortemSuggestionSchema),
  executiveSummary: z.string(),
  status: z.enum(['running', 'complete', 'failed']),
  approved: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string(),
  version: z.number().int().nonnegative().default(1),
});
export type PremortemRun = z.infer<typeof PremortemRunSchema>;

export const CreatePremortemRunInputSchema = z.object({
  creatorIds: z
    .array(z.string())
    .min(CONFIG.PREMORTEM_MIN_CREATORS, `Select at least ${CONFIG.PREMORTEM_MIN_CREATORS} creators`)
    .max(CONFIG.PREMORTEM_MAX_CREATORS, `Maximum ${CONFIG.PREMORTEM_MAX_CREATORS} creators allowed`),
});
export type CreatePremortemRunInput = z.infer<typeof CreatePremortemRunInputSchema>;

export const WhatIfInputSchema = z.object({
  creatorIds: z.array(z.string()).min(1).max(CONFIG.PREMORTEM_MAX_CREATORS),
});
export type WhatIfInput = z.infer<typeof WhatIfInputSchema>;

export const WhatIfResponseSchema = z.object({
  lineupCreatorIds: z.array(z.string()),
  healthScore: z.number(),
  label: PremortemHealthLabelEnum,
  confidence: PremortemConfidenceEnum,
  penalties: z.array(HealthPenaltySchema),
  lineupMetrics: LineupMetricsSchema,
  pairwiseResults: z.array(PairwiseOverlapResultSchema),
  creatorsNeedingData: z.array(z.string()),
});
export type WhatIfResponse = z.infer<typeof WhatIfResponseSchema>;

// =============================================================
// Phase 5 — Engine 2: Creator Briefs Schemas
// =============================================================

export const CreatorBriefStatusEnum = z.enum(['draft', 'needsReview', 'final']);
export type CreatorBriefStatus = z.infer<typeof CreatorBriefStatusEnum>;

export const RecommendedFormatTypeEnum = z.enum(['dedicated video', 'integrated segment', 'Short']);
export type RecommendedFormatType = z.infer<typeof RecommendedFormatTypeEnum>;

export const RecommendedFormatSchema = z.object({
  type: RecommendedFormatTypeEnum,
  targetLength: z.string(),
  placement: z.string(),
  rationale: z.string(),
});
export type RecommendedFormat = z.infer<typeof RecommendedFormatSchema>;

export const ContentAngleSchema = z.object({
  title: z.string(),
  hook: z.string(),
  outline: z.array(z.string()).min(2).max(8),
  whyItFitsThisCreator: z.string(),
});
export type ContentAngle = z.infer<typeof ContentAngleSchema>;

export const GuidelineRuleItemSchema = z.object({
  ruleCode: z.string(),
  instruction: z.string(),
});
export type GuidelineRuleItem = z.infer<typeof GuidelineRuleItemSchema>;

export const DeliverablesTimelineSchema = z.object({
  draftDue: z.string(),
  feedbackWithinDays: z.number().int().positive(),
  finalDue: z.string(),
  publishDate: z.string(),
});
export type DeliverablesTimeline = z.infer<typeof DeliverablesTimelineSchema>;

export const BriefSuccessMetricsSchema = z.object({
  targetViews: z.number().int().nonnegative(),
  targetEngagementRate: z.number().nonnegative(),
  medianViewsBenchmark: z.number().int().nonnegative(),
  medianEngagementBenchmark: z.number().nonnegative(),
});
export type BriefSuccessMetrics = z.infer<typeof BriefSuccessMetricsSchema>;

export const ClaimWarningSchema = z.object({
  messageIndex: z.number().int().nonnegative(),
  claim: z.string(),
  reason: z.string(),
});
export type ClaimWarning = z.infer<typeof ClaimWarningSchema>;

export const CitationWarningSchema = z.object({
  field: z.string(),
  citedTitle: z.string(),
  reason: z.string(),
});
export type CitationWarning = z.infer<typeof CitationWarningSchema>;

export const CreatorBriefContentSchema = z.object({
  creatorSnapshot: z.string(),
  campaignObjective: z.string(),
  recommendedFormat: RecommendedFormatSchema,
  contentAngles: z.array(ContentAngleSchema).length(3),
  keyMessages: z.array(z.string()).min(3).max(6),
  dos: z.array(GuidelineRuleItemSchema),
  donts: z.array(GuidelineRuleItemSchema),
  mandatoryDisclosures: DisclosuresSchema,
  callToAction: z.string(),
  deliverablesAndTimeline: DeliverablesTimelineSchema,
  successMetrics: BriefSuccessMetricsSchema,
  claimWarnings: z.array(ClaimWarningSchema).default([]),
  citationWarnings: z.array(CitationWarningSchema).default([]),
});
export type CreatorBriefContent = z.infer<typeof CreatorBriefContentSchema>;

export const CreatorBriefSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  creatorId: z.string(),
  status: CreatorBriefStatusEnum.default('draft'),
  content: CreatorBriefContentSchema,
  editedFields: z.array(z.string()).default([]),
  currentVersion: z.number().int().positive().default(1),
  generatedAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().nonnegative().default(1),
});
export type CreatorBrief = z.infer<typeof CreatorBriefSchema>;

export const CreatorBriefVersionSchema = z.object({
  id: z.string(),
  versionNumber: z.number().int().positive(),
  briefId: z.string(),
  creatorId: z.string(),
  content: CreatorBriefContentSchema,
  status: CreatorBriefStatusEnum,
  editedFields: z.array(z.string()).default([]),
  savedBy: z.string(),
  savedAt: z.string(),
  changeNote: z.string().optional().default(''),
});
export type CreatorBriefVersion = z.infer<typeof CreatorBriefVersionSchema>;

// Route Input Schemas
export const GenerateBriefsInputSchema = z.object({
  creatorIds: z.array(z.string()).optional(),
  instruction: z.string().trim().max(500).optional(),
  force: z.boolean().optional().default(false),
});
export type GenerateBriefsInput = z.infer<typeof GenerateBriefsInputSchema>;

export const RegenerateBriefInputSchema = z.object({
  instruction: z.string().trim().max(500).optional(),
  preserveEdits: z.boolean().optional().default(true),
});
export type RegenerateBriefInput = z.infer<typeof RegenerateBriefInputSchema>;

export const PatchBriefContentInputSchema = z.object({
  content: CreatorBriefContentSchema,
  version: z.number().int().nonnegative(),
  changeNote: z.string().optional(),
});
export type PatchBriefContentInput = z.infer<typeof PatchBriefContentInputSchema>;

export const PatchBriefStatusInputSchema = z.object({
  status: CreatorBriefStatusEnum,
  version: z.number().int().nonnegative(),
});
export type PatchBriefStatusInput = z.infer<typeof PatchBriefStatusInputSchema>;

// =============================================================
// Phase 7 — Engine 5: Search & Capture (Search Pack) Schemas
// =============================================================

export const SearchIntentEnum = z.enum([
  'problem_seeking',
  'product_comparison',
  'how_to',
  'brand_direct',
  'review_recommendation',
]);
export type SearchIntent = z.infer<typeof SearchIntentEnum>;

export const SearchPriorityEnum = z.enum(['high', 'medium', 'low']);
export type SearchPriority = z.infer<typeof SearchPriorityEnum>;

export const SearchQuerySchema = z.object({
  id: z.string(),
  query: z.string().trim().min(1).max(100),
  intent: SearchIntentEnum,
  priority: SearchPriorityEnum,
  rationale: z.string(),
  targetCreatorIds: z.array(z.string()).default([]),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const SearchTitleFormulaSchema = z.object({
  formula: z.string(),
  exampleTitle: z.string(),
  searchIntent: z.string(),
});
export type SearchTitleFormula = z.infer<typeof SearchTitleFormulaSchema>;

export const SearchPackContentSchema = z.object({
  highIntentQueries: z.array(SearchQuerySchema),
  titleFormulas: z.array(SearchTitleFormulaSchema),
  thumbnailHooks: z.array(z.string()),
  searchDescriptionTemplate: z.string(),
  recommendedTags: z.array(z.string()),
  creatorGuidelines: z.string(),
});
export type SearchPackContent = z.infer<typeof SearchPackContentSchema>;

export const SearchPackStatusEnum = z.enum(['draft', 'final']);
export type SearchPackStatus = z.infer<typeof SearchPackStatusEnum>;

export const SearchPackSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  status: SearchPackStatusEnum.default('draft'),
  content: SearchPackContentSchema,
  generatedAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().nonnegative().default(1),
});
export type SearchPack = z.infer<typeof SearchPackSchema>;

export const GenerateSearchPackInputSchema = z.object({
  force: z.boolean().optional().default(false),
  instruction: z.string().trim().max(500).optional(),
});
export type GenerateSearchPackInput = z.infer<typeof GenerateSearchPackInputSchema>;

export const PatchSearchPackInputSchema = z.object({
  content: SearchPackContentSchema,
  status: SearchPackStatusEnum.optional(),
  version: z.number().int().nonnegative(),
});
export type PatchSearchPackInput = z.infer<typeof PatchSearchPackInputSchema>;

// =============================================================
// Phase 8 — Live Pulse Dashboard & Report Schemas
// =============================================================

export const VideoSnapshotSchema = z.object({
  id: z.string().optional(),
  at: z.string(),
  views: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative(),
  comments: z.number().int().nonnegative(),
});
export type VideoSnapshot = z.infer<typeof VideoSnapshotSchema>;

export const SentimentSummarySchema = z.object({
  positive: z.number().int().nonnegative().default(0),
  negative: z.number().int().nonnegative().default(0),
  neutral: z.number().int().nonnegative().default(0),
  question: z.number().int().nonnegative().default(0),
  examples: z.object({
    positive: z.array(z.string()).default([]),
    negative: z.array(z.string()).default([]),
    neutral: z.array(z.string()).default([]),
    question: z.array(z.string()).default([]),
  }).default({ positive: [], negative: [], neutral: [], question: [] }),
});
export type SentimentSummary = z.infer<typeof SentimentSummarySchema>;

export const TrackedVideoStatsSchema = z.object({
  views: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative(),
  comments: z.number().int().nonnegative(),
});
export type TrackedVideoStats = z.infer<typeof TrackedVideoStatsSchema>;

export const TrackedVideoSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  creatorId: z.string(),
  videoId: z.string(),
  url: z.string(),
  title: z.string(),
  publishedAt: z.string(),
  isStandIn: z.boolean().default(false),
  active: z.boolean().default(true),
  lastPolledAt: z.string().nullable().optional(),
  lastCommentPollAt: z.string().nullable().optional(),
  latestStats: TrackedVideoStatsSchema.nullable().optional(),
  sentiment: SentimentSummarySchema.optional(),
  commentsUnavailable: z.boolean().default(false),
  createdAt: z.string(),
});
export type TrackedVideo = z.infer<typeof TrackedVideoSchema>;

export const AddTrackedVideoInputSchema = z.object({
  urlOrId: z.string().trim().min(1),
  creatorId: z.string().trim().min(1),
  isStandIn: z.boolean().optional().default(false),
  allowSecond: z.boolean().optional().default(false),
});
export type AddTrackedVideoInput = z.infer<typeof AddTrackedVideoInputSchema>;

export const AlertTypeEnum = z.enum([
  'underperforming',
  'outperforming',
  'sentiment_risk',
  'low_engagement',
  'disclosure_missing',
]);
export type AlertType = z.infer<typeof AlertTypeEnum>;

export const AlertSeverityEnum = z.enum(['critical', 'warning', 'info']);
export type AlertSeverity = z.infer<typeof AlertSeverityEnum>;

export const AlertSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  type: AlertTypeEnum,
  severity: AlertSeverityEnum,
  videoId: z.string(),
  creatorId: z.string(),
  message: z.string(),
  firstFiredAt: z.string(),
  lastSeenAt: z.string(),
  resolvedAt: z.string().nullable(),
  acknowledged: z.boolean().default(false),
  acknowledgedBy: z.string().nullable().optional(),
});
export type Alert = z.infer<typeof AlertSchema>;

export const PulseSummarySchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  text: z.string(),
  actions: z.array(z.string()),
  basedOnSnapshotAt: z.string(),
  createdAt: z.string(),
});
export type PulseSummary = z.infer<typeof PulseSummarySchema>;

export const SimulatedSearchMetricsSchema = z.object({
  impressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  ctr: z.number().nonnegative(),
  conversions: z.number().int().nonnegative(),
  label: z.literal('SIMULATED').default('SIMULATED'),
});
export type SimulatedSearchMetrics = z.infer<typeof SimulatedSearchMetricsSchema>;


