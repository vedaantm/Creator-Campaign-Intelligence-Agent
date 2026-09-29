/**
 * Shared Application Configuration
 * All tunable parameters, models, timeouts, rate limits, and page sizes.
 * NO MAGIC NUMBERS ANYWHERE IN CODE.
 */

export const CONFIG = {
  // Gemini AI Models
  GEMINI_MODEL: 'gemini-3.5-flash-lite',
  GEMINI_EMBEDDING_MODEL: 'gemini-embedding-2-preview',
  GEMINI_MAX_RETRIES: 3,
  GEMINI_CONCURRENCY_LIMIT: 2,
  GEMINI_BACKOFF_BASE_MS: 1000,

  // Pagination & Lists
  DEFAULT_PAGE_SIZE: 12,
  MAX_PAGE_SIZE: 50,

  // Campaign Rules
  CAMPAIGN_NAME_MIN_LENGTH: 3,
  CAMPAIGN_NAME_MAX_LENGTH: 80,
  MAX_CREATORS_PER_CAMPAIGN: 25,

  // Jobs
  JOB_TIMEOUT_MINUTES: 10,
  JOB_POLL_INTERVAL_MS: 2000,

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: 60 * 1000, // 1 minute
  RATE_LIMIT_MAX_REQUESTS: 300, // 300 requests per minute

  // Caching
  CACHE_DEFAULT_TTL_SECONDS: 3600, // 1 hour
  YOUTUBE_CACHE_TTL_SECONDS: 86400, // 24 hours

  // Quotas & Assumptions
  YOUTUBE_DAILY_QUOTA_UNITS: 10000,
  YOUTUBE_QUOTA_WARNING_RATIO: 0.9, // Refuse runs if >= 90%
  DEFAULT_CPM_ESTIMATE: 25.0,
  DEFAULT_CPM_LOW: 15.0,
  DEFAULT_CPM_HIGH: 35.0,

  // Engine 1: Discovery & Video Metrics
  SHORTS_MAX_SECONDS: 180,
  RECENT_VIDEOS_COUNT: 15,
  COMMENT_SAMPLE_MAX: 50,
  DISCOVERY_CONCURRENCY: 2,

  // Default Scoring Weights (Must sum to 100)
  DEFAULT_SCORING_WEIGHTS: {
    nicheFit: 25,
    audienceFit: 20,
    engagement: 15,
    toneFit: 10,
    brandSafety: 10,
    reach: 8,
    budgetFit: 6,
    consistency: 3,
    recency: 3,
  },

  // Absolute Scale Thresholds for Quantitative Sub-scores
  SCORING_THRESHOLDS: {
    engagement: { min: 0.01, target: 0.05 }, // 1% to 5%
    reach: { min: 2000, target: 100000 },    // 2k to 100k views
    consistency: { min: 0.25, target: 0.85 }, // 0.25 to 0.85
  },

  // Fit Score Tiers
  TIERS: {
    STRONG_FIT_MIN: 75,
    POSSIBLE_FIT_MIN: 55,
  },

  // Phase 4: Engine 4 Pre-Mortem Simulator
  PREMORTEM_MIN_CREATORS: 2,
  PREMORTEM_MAX_CREATORS: 10,
  PREMORTEM_MIN_UNIQUE_COMMENTERS: 30,
  PREMORTEM_WEIGHTS: {
    commenter: 0.5,
    content: 0.3,
    tags: 0.2,
  },
  PREMORTEM_PENALTIES: {
    PAIR_OVERLAP_MEDIUM: { threshold: 40, penalty: 8 },
    PAIR_OVERLAP_HIGH: { threshold: 60, penalty: 15 },
    NEGATIVE_SHARE_MEDIUM: { threshold: 0.20, penalty: 6 },
    NEGATIVE_SHARE_HIGH: { threshold: 0.35, penalty: 12 },
    SAME_CATEGORY_SPONSOR: { days: 60, penalty: 7 },
    COMPETITOR_SPONSOR: { penalty: 12 },
    AD_FATIGUE_SHARE: { threshold: 0.10, penalty: 4 },
    OVER_BUDGET: { penalty: 15 },
    COST_CONCENTRATION: { threshold: 0.50, penalty: 8 },
    BRAND_SAFETY_LOW: { threshold: 60, penalty: 10 },
  },
  PREMORTEM_HEALTH_LABELS: {
    READY_MIN: 80,
    FIXES_MIN: 60,
  },

  // Phase 5: Engine 2 Creator Briefs
  BRIEF_DRAFT_DUE_DAYS_BEFORE_LAUNCH: 14,
  BRIEF_FEEDBACK_WINDOW_DAYS: 3,
  BRIEF_FINAL_DUE_DAYS_BEFORE_LAUNCH: 3,
  BRIEF_VIEWS_BENCHMARK_RATIO: 0.90, // at least 90% of creator's median views
  DEFAULT_BRAND_GUIDELINES: [
    { code: 'G-1', rule: 'Must clearly disclose sponsorship in title or description and verbally within first 30 seconds (#ad / sponsored).', type: 'mandatory' },
    { code: 'G-2', rule: 'Do not make unverified medical, curing, guaranteed financial, or non-approved performance claims.', type: 'dont' },
    { code: 'G-3', rule: 'Demonstrate product in actual use with clear visual focus for at least 15 seconds.', type: 'do' },
    { code: 'G-4', rule: 'Do not compare the product directly to unapproved competitors.', type: 'dont' },
    { code: 'G-5', rule: 'Include designated tracking landing page link in top 3 lines of video description.', type: 'mandatory' },
  ],

  // Phase 8: Live Pulse Engine Configuration
  LIVE_POLL_MINUTES: 15,
  LIVE_POLL_MINIMUM_MINUTES: 5,
  LIVE_COMMENT_POLL_MINUTES: 60,
  LIVE_MAX_SNAPSHOTS_PER_VIDEO: 500,
  LIVE_SUMMARY_COOLDOWN_MINUTES: 30,
  EXPECTED_VIEWS_CURVE: [
    { hours: 0, ratio: 0.0 },
    { hours: 24, ratio: 0.40 },
    { hours: 72, ratio: 0.70 },
    { hours: 168, ratio: 1.00 },
  ],

  // Workflow Steps Definition
  WORKFLOW_STEPS: [
    { id: 'overview', title: 'Overview', stepNumber: 0, phase: 1, path: 'overview' },
    { id: 'brief', title: '1. Brief', stepNumber: 1, phase: 2, path: 'brief' },
    { id: 'guidelines', title: '2. Guidelines', stepNumber: 2, phase: 2, path: 'guidelines' },
    { id: 'creators', title: '3. Creators', stepNumber: 3, phase: 3, path: 'creators' },
    { id: 'premortem', title: '4. Pre-Mortem', stepNumber: 4, phase: 4, path: 'premortem' },
    { id: 'briefs', title: '5. Creator Briefs', stepNumber: 5, phase: 5, path: 'briefs' },
    { id: 'compliance', title: '6. Compliance', stepNumber: 6, phase: 6, path: 'compliance' },
    { id: 'search-capture', title: '7. Search Capture', stepNumber: 7, phase: 7, path: 'search-capture' },
    { id: 'live', title: '8. Live Pulse', stepNumber: 8, phase: 8, path: 'live' },
    { id: 'report', title: 'Report', stepNumber: 9, phase: 9, path: 'report' },
    { id: 'settings', title: 'Settings', stepNumber: 10, phase: 1, path: 'settings' },
  ],
} as const;

export type WorkflowStepId = (typeof CONFIG.WORKFLOW_STEPS)[number]['id'];
