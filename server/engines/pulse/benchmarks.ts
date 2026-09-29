import { CONFIG } from '../../../shared/config.ts';

/**
 * Calculates the expected views curve ratio based on elapsed hours since publication.
 * Benchmarks:
 * - 0 hours: 0%
 * - 24 hours: 40% of 7-day median views
 * - 72 hours: 70% of 7-day median views
 * - 168 hours (7 days): 100% of 7-day median views
 * Linear interpolation applied between key checkpoints.
 */
export function calculateExpectedViewsRatio(hoursElapsed: number): number {
  if (hoursElapsed <= 0) return 0;
  if (hoursElapsed >= 168) return 1.0;

  if (hoursElapsed <= 24) {
    return (hoursElapsed / 24) * 0.40;
  } else if (hoursElapsed <= 72) {
    return 0.40 + ((hoursElapsed - 24) / 48) * 0.30;
  } else {
    return 0.70 + ((hoursElapsed - 72) / 96) * 0.30;
  }
}

/**
 * Calculates expected views for a video given creator's median views and publication timestamp.
 */
export function calculateExpectedViews(
  creatorMedianViews: number,
  publishedAtISO: string,
  nowISO: string = new Date().toISOString()
): number {
  const publishedAt = new Date(publishedAtISO).getTime();
  const now = new Date(nowISO).getTime();
  const hoursElapsed = Math.max(0, (now - publishedAt) / (1000 * 60 * 60));

  const ratio = calculateExpectedViewsRatio(hoursElapsed);
  return Math.round(creatorMedianViews * ratio);
}

/**
 * Calculates current engagement rate for a video: (likes + comments) / views.
 */
export function calculateEngagementRate(likes: number, comments: number, views: number): number {
  if (!views || views <= 0) return 0;
  return (likes + comments) / views;
}
