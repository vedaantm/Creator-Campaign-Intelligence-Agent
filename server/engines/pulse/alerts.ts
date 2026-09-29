import {
  TrackedVideo,
  Alert,
  AlertType,
  AlertSeverity,
} from '../../../shared/types.ts';
import { calculateExpectedViews, calculateEngagementRate } from './benchmarks.ts';

export const DISCLOSURE_KEYWORDS = [
  '#ad',
  '#sponsored',
  'sponsored',
  '#paidpromotion',
  'paid partnership',
  'includes paid promotion',
  'sponsored by',
  'thanks to',
  'partnered with',
];

export function checkDisclosurePresent(titleAndDescription: string): boolean {
  const lower = titleAndDescription.toLowerCase();
  return DISCLOSURE_KEYWORDS.some((kw) => lower.includes(kw));
}

export interface FiringAlertCondition {
  type: AlertType;
  severity: AlertSeverity;
  videoId: string;
  creatorId: string;
  message: string;
}

/**
 * Pure function evaluating alert rules for a single tracked video.
 */
export function evaluateVideoAlerts(
  video: TrackedVideo,
  creatorMedianViews: number,
  creatorMedianEngagement: number,
  videoDescription: string = '',
  nowISO: string = new Date().toISOString()
): FiringAlertCondition[] {
  const firing: FiringAlertCondition[] = [];
  if (!video.active || !video.latestStats) return firing;

  const now = new Date(nowISO).getTime();
  const publishedAt = new Date(video.publishedAt).getTime();
  const hoursElapsed = Math.max(0, Math.floor((now - publishedAt) / (1000 * 60 * 60)));

  const views = video.latestStats.views;
  const likes = video.latestStats.likes;
  const comments = video.latestStats.comments;

  const expectedViews = calculateExpectedViews(creatorMedianViews, video.publishedAt, nowISO);
  const engagementRate = calculateEngagementRate(likes, comments, views);

  // Rule 1: Underperforming (views < 60% of expected after at least 24h)
  if (hoursElapsed >= 24 && expectedViews > 0 && views < 0.60 * expectedViews) {
    firing.push({
      type: 'underperforming',
      severity: 'warning',
      videoId: video.videoId,
      creatorId: video.creatorId,
      message: `Video views (${views.toLocaleString()}) are below 60% of expected benchmark (${expectedViews.toLocaleString()}) after ${hoursElapsed}h.`,
    });
  }

  // Rule 2: Outperforming (views > 150% of expected)
  if (expectedViews > 100 && views > 1.50 * expectedViews) {
    firing.push({
      type: 'outperforming',
      severity: 'info',
      videoId: video.videoId,
      creatorId: video.creatorId,
      message: `Video is outperforming expected views (${views.toLocaleString()} vs ${expectedViews.toLocaleString()} expected). Recommend boosting search capture budget.`,
    });
  }

  // Rule 3: Sentiment risk (negative share > 25% with at least 20 classified comments)
  if (video.sentiment) {
    const totalComments =
      video.sentiment.positive +
      video.sentiment.negative +
      video.sentiment.neutral +
      video.sentiment.question;

    if (totalComments >= 20) {
      const negShare = video.sentiment.negative / totalComments;
      if (negShare > 0.25) {
        firing.push({
          type: 'sentiment_risk',
          severity: 'warning',
          videoId: video.videoId,
          creatorId: video.creatorId,
          message: `High negative sentiment detected (${Math.round(negShare * 100)}% negative across ${totalComments} comments).`,
        });
      }
    }
  }

  // Rule 4: Low engagement (engagement rate < 50% of creator's median engagement after 24h)
  if (hoursElapsed >= 24 && creatorMedianEngagement > 0 && engagementRate < 0.50 * creatorMedianEngagement) {
    firing.push({
      type: 'low_engagement',
      severity: 'warning',
      videoId: video.videoId,
      creatorId: video.creatorId,
      message: `Engagement rate (${(engagementRate * 100).toFixed(2)}%) is below 50% of creator benchmark (${(creatorMedianEngagement * 100).toFixed(2)}%).`,
    });
  }

  // Rule 5: Disclosure missing (critical)
  const fullText = `${video.title} ${videoDescription}`;
  if (!checkDisclosurePresent(fullText)) {
    firing.push({
      type: 'disclosure_missing',
      severity: 'critical',
      videoId: video.videoId,
      creatorId: video.creatorId,
      message: 'Mandatory sponsorship disclosure missing from video title or description (#ad / sponsored).',
    });
  }

  return firing;
}

/**
 * Pure function to reconcile active alerts in the repository with current firing conditions.
 * Updates lastSeenAt on existing active alerts, creates new alerts, and auto-resolves cleared alerts.
 */
export function reconcileAlerts(
  campaignId: string,
  existingActiveAlerts: Alert[],
  allFiringConditions: FiringAlertCondition[],
  nowISO: string = new Date().toISOString()
): Alert[] {
  const result: Alert[] = [];
  const firingMap = new Map<string, FiringAlertCondition>();

  for (const cond of allFiringConditions) {
    firingMap.set(`${cond.type}:${cond.videoId}`, cond);
  }

  // Check existing active alerts
  for (const alert of existingActiveAlerts) {
    const key = `${alert.type}:${alert.videoId}`;
    const matchedFiring = firingMap.get(key);

    if (matchedFiring) {
      // Condition is STILL firing -> update lastSeenAt
      result.push({
        ...alert,
        lastSeenAt: nowISO,
        message: matchedFiring.message,
      });
      firingMap.delete(key); // Handled
    } else {
      // Condition NO LONGER firing -> auto-resolve!
      result.push({
        ...alert,
        resolvedAt: nowISO,
      });
    }
  }

  // Create brand new alerts for remaining firing conditions
  for (const [key, cond] of firingMap.entries()) {
    result.push({
      id: `alert_${cond.type}_${cond.videoId}_${Date.now()}`,
      campaignId,
      type: cond.type,
      severity: cond.severity,
      videoId: cond.videoId,
      creatorId: cond.creatorId,
      message: cond.message,
      firstFiredAt: nowISO,
      lastSeenAt: nowISO,
      resolvedAt: null,
      acknowledged: false,
    });
  }

  return result;
}
