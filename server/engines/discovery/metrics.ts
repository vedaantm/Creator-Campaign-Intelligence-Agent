import { CONFIG } from '../../../shared/config.ts';
import { CreatorMetrics, CreatorVideo } from '../../../shared/types.ts';

export interface RawVideoItem {
  videoId: string;
  title: string;
  description: string;
  publishedAt: string;
  duration: string; // ISO 8601 (e.g. PT15M33S)
  viewCount: number;
  likeCount: number | null; // null if hidden
  commentCount: number;
  channelId?: string;
  privacyStatus?: string;
}

export interface RawChannelItem {
  channelId: string;
  subscriberCount: number | null; // null if hidden
  hiddenSubscriberCount: boolean;
  videoCount: number;
  publishedAt?: string;
  country?: string | null;
}

/**
 * Parses ISO 8601 duration strings into total seconds.
 * Examples:
 *  PT1M30S -> 90
 *  PT1H2M3S -> 3723
 *  PT45S -> 45
 *  PT1H -> 3600
 *  P1DT2H -> 93600
 */
export function parseIsoDuration(durationStr: string): number {
  if (!durationStr || typeof durationStr !== 'string') return 0;

  const match = durationStr.match(/P(?:([0-9]+)D)?(?:T(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9]+(?:[.,][0-9]+)?)S)?)?/);
  if (!match) return 0;

  const days = parseInt(match[1] || '0', 10);
  const hours = parseInt(match[2] || '0', 10);
  const minutes = parseInt(match[3] || '0', 10);
  const seconds = parseFloat((match[4] || '0').replace(',', '.'));

  return Math.round(days * 86400 + hours * 3600 + minutes * 60 + seconds);
}

/**
 * Computes median of a numeric array.
 * Robust against empty arrays and handles even/odd lengths.
 */
export function computeMedian(numbers: number[]): number {
  if (!numbers || numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
}

/**
 * Computes per-video engagement rate:
 * (likes + comments) / views.
 * If likes are hidden, uses comments only and flags likesHidden = true.
 * Returns null if views <= 0.
 */
export function computeVideoEngagement(
  likeCount: number | null,
  commentCount: number,
  viewCount: number
): { rate: number | null; likesHidden: boolean } {
  if (viewCount <= 0) {
    return { rate: null, likesHidden: likeCount === null };
  }

  if (likeCount === null) {
    return {
      rate: Math.round((commentCount / viewCount) * 10000) / 10000,
      likesHidden: true,
    };
  }

  return {
    rate: Math.round(((likeCount + commentCount) / viewCount) * 10000) / 10000,
    likesHidden: false,
  };
}

/**
 * Computes consistency score = 1 - (stdDev / mean) of upload gaps in days.
 * Clamped between 0 and 1.
 * Returns null if fewer than 3 uploads are provided.
 */
export function computeConsistency(publishedDates: string[]): number | null {
  if (!publishedDates || publishedDates.length < 3) return null;

  // Convert to timestamps and sort chronologically ascending
  const timestamps = publishedDates
    .map((d) => new Date(d).getTime())
    .filter((t) => !isNaN(t))
    .sort((a, b) => a - b);

  if (timestamps.length < 3) return null;

  const gapsInDays: number[] = [];
  for (let i = 0; i < timestamps.length - 1; i++) {
    const diffDays = (timestamps[i + 1] - timestamps[i]) / (1000 * 86400);
    gapsInDays.push(Math.max(0, diffDays));
  }

  const mean = gapsInDays.reduce((acc, v) => acc + v, 0) / gapsInDays.length;
  if (mean === 0) return 1.0; // All uploaded simultaneously

  const variance =
    gapsInDays.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (gapsInDays.length - 1);
  const stdDev = Math.sqrt(variance);

  const rawConsistency = 1.0 - stdDev / mean;
  return Math.round(Math.max(0, Math.min(1.0, rawConsistency)) * 100) / 100;
}

const SPONSORSHIP_PATTERNS = [
  /#ad\b/i,
  /#sponsored\b/i,
  /sponsored by\b/i,
  /paid partnership\b/i,
  /use code\b/i,
  /discount code\b/i,
  /promo code\b/i,
  /affiliate\b/i,
  /amzn\.to/i,
  /bit\.ly/i,
  /magiclinks/i,
  /shopliketoknow/i,
  /rstyle\.me/i,
  /mavely\.app/i,
  /geni\.us/i,
  /go\.magik\.ly/i,
  /linktr\.ee/i,
];

/**
 * Detects disclosure signals and affiliate links in video description/title.
 */
export function detectSponsorshipSignals(text: string): { isSponsored: boolean; signals: string[] } {
  if (!text) return { isSponsored: false, signals: [] };

  const detected: string[] = [];
  for (const regex of SPONSORSHIP_PATTERNS) {
    const match = text.match(regex);
    if (match) {
      detected.push(match[0].toLowerCase());
    }
  }

  return {
    isSponsored: detected.length > 0,
    signals: Array.from(new Set(detected)),
  };
}

/**
 * Computes channel age in months from publishedAt ISO string.
 */
export function computeChannelAgeMonths(publishedAt?: string): number {
  if (!publishedAt) return 0;
  const created = new Date(publishedAt);
  if (isNaN(created.getTime())) return 0;

  const now = new Date();
  const months = (now.getFullYear() - created.getFullYear()) * 12 + (now.getMonth() - created.getMonth());
  return Math.max(0, months);
}

/**
 * Master pure function to transform raw YouTube video and channel data into CreatorMetrics.
 */
export function computeMetrics(
  channel: RawChannelItem,
  rawVideos: RawVideoItem[],
  cpmBounds: { low: number; high: number } = { low: CONFIG.DEFAULT_CPM_LOW, high: CONFIG.DEFAULT_CPM_HIGH },
  shortsMaxSeconds: number = CONFIG.SHORTS_MAX_SECONDS
): { metrics: CreatorMetrics; processedVideos: CreatorVideo[] } {
  const processedVideos: CreatorVideo[] = rawVideos.map((v) => {
    const durationSeconds = parseIsoDuration(v.duration);
    const isShort = durationSeconds <= shortsMaxSeconds;
    const engagement = computeVideoEngagement(v.likeCount, v.commentCount, v.viewCount);
    const textToCheck = `${v.title}\n${v.description}`;
    const sponsorship = detectSponsorshipSignals(textToCheck);

    return {
      videoId: v.videoId,
      title: v.title,
      description: v.description,
      publishedAt: v.publishedAt,
      durationSeconds,
      isShort,
      viewCount: v.viewCount,
      likeCount: v.likeCount,
      commentCount: v.commentCount,
      engagementRate: engagement.rate,
      likesHidden: engagement.likesHidden,
      hasSponsorshipSignals: sponsorship.isSponsored,
      sponsorshipSignals: sponsorship.signals,
    };
  });

  const shorts = processedVideos.filter((v) => v.isShort);
  const longForm = processedVideos.filter((v) => !v.isShort);

  // Median Views
  const shortsViews = shorts.map((v) => v.viewCount);
  const longFormViews = longForm.map((v) => v.viewCount);
  const allViews = processedVideos.map((v) => v.viewCount);

  const shortsMedianViews = computeMedian(shortsViews);
  const longFormMedianViews = computeMedian(longFormViews);
  const overallMedianViews = longForm.length > 0 ? longFormMedianViews : shortsMedianViews || computeMedian(allViews);

  // Engagement Rates
  const shortsRates = shorts.map((v) => v.engagementRate).filter((r): r is number => r !== null);
  const longFormRates = longForm.map((v) => v.engagementRate).filter((r): r is number => r !== null);

  const shortsMedianEngagement = computeMedian(shortsRates);
  const longFormMedianEngagement = computeMedian(longFormRates);

  // Upload frequency over last 90 days
  const nowMs = Date.now();
  const ninetyDaysAgoMs = nowMs - 90 * 86400 * 1000;
  const recentIn90Days = processedVideos.filter((v) => {
    const t = new Date(v.publishedAt).getTime();
    return !isNaN(t) && t >= ninetyDaysAgoMs;
  });
  const uploadsPerMonth = Math.round((recentIn90Days.length / 3) * 10) / 10;

  // Days since last upload
  let daysSinceLastUpload = 999;
  if (processedVideos.length > 0) {
    const sortedDates = processedVideos
      .map((v) => new Date(v.publishedAt).getTime())
      .filter((t) => !isNaN(t))
      .sort((a, b) => b - a);

    if (sortedDates.length > 0) {
      daysSinceLastUpload = Math.max(0, Math.floor((nowMs - sortedDates[0]) / (1000 * 86400)));
    }
  }

  // Consistency across all recent uploads
  const allDates = processedVideos.map((v) => v.publishedAt);
  const consistency = computeConsistency(allDates);

  // Views to Subs Ratio (null if subscribers hidden)
  let viewsToSubsRatio: number | null = null;
  if (channel.subscriberCount && channel.subscriberCount > 0 && !channel.hiddenSubscriberCount) {
    viewsToSubsRatio = Math.round((overallMedianViews / channel.subscriberCount) * 1000) / 1000;
  }

  // Top 3 videos with highest views / channel median
  const baselineMedian = overallMedianViews > 0 ? overallMedianViews : 1;
  const topVideos = [...processedVideos]
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 3)
    .map((v) => ({
      videoId: v.videoId,
      title: v.title,
      views: v.viewCount,
      ratioToMedian: Math.round((v.viewCount / baselineMedian) * 10) / 10,
    }));

  // Sponsorship analysis
  const sponsoredList = processedVideos.filter((v) => v.hasSponsorshipSignals);
  const sponsorshipCount = sponsoredList.length;
  const sponsorshipRate =
    processedVideos.length > 0 ? Math.round((sponsorshipCount / processedVideos.length) * 100) / 100 : 0;

  // Estimated Cost Per Video USD = medianViews / 1000 * CPM low/high
  const estimatedCostPerVideoUsd = {
    low: Math.round((overallMedianViews / 1000) * cpmBounds.low),
    high: Math.round((overallMedianViews / 1000) * cpmBounds.high),
  };

  const dataQuality: 'good' | 'low' = processedVideos.length >= 3 ? 'good' : 'low';
  const channelAgeMonths = computeChannelAgeMonths(channel.publishedAt);

  const metrics: CreatorMetrics = {
    subscribers: channel.hiddenSubscriberCount ? null : channel.subscriberCount,
    videoCount: channel.videoCount,
    channelAgeMonths,
    country: channel.country || null,
    shorts: {
      count: shorts.length,
      medianViews: shortsMedianViews,
      medianEngagementRate: shortsMedianEngagement,
      likesHidden: shorts.some((v) => v.likesHidden),
    },
    longForm: {
      count: longForm.length,
      medianViews: longFormMedianViews,
      medianEngagementRate: longFormMedianEngagement,
      likesHidden: longForm.some((v) => v.likesHidden),
    },
    uploadsPerMonth,
    daysSinceLastUpload,
    consistency,
    viewsToSubsRatio,
    topVideos,
    sponsorship: {
      count: sponsorshipCount,
      sponsorshipRate,
      sponsoredVideos: sponsoredList.map((v) => ({
        videoId: v.videoId,
        title: v.title,
        signals: v.sponsorshipSignals,
      })),
    },
    estimatedCostPerVideoUsd,
    dataQuality,
  };

  return { metrics, processedVideos };
}
