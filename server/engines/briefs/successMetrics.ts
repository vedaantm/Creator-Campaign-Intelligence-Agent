import { CONFIG } from '../../../shared/config.ts';
import { Creator, BriefSuccessMetrics } from '../../../shared/types.ts';

/**
 * Computes contractual and performance success metrics based on creator benchmark history.
 * Target views: at least 90% of creator's median views.
 * Target engagement: at least creator's median engagement rate.
 */
export function calculateSuccessMetrics(creator: Creator): BriefSuccessMetrics {
  const m = creator.metrics;
  const medianViews = m?.longForm?.medianViews || m?.shorts?.medianViews || 1000;
  const medianEngagement = m?.longForm?.medianEngagementRate || m?.shorts?.medianEngagementRate || 0.03;

  const targetViews = Math.round(medianViews * CONFIG.BRIEF_VIEWS_BENCHMARK_RATIO);
  const targetEngagementRate = Math.round(medianEngagement * 10000) / 10000;

  return {
    targetViews,
    targetEngagementRate,
    medianViewsBenchmark: medianViews,
    medianEngagementBenchmark: medianEngagement,
  };
}
