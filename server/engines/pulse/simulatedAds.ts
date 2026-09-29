import { TrackedVideo, SimulatedSearchMetrics } from '../../../shared/types.ts';

/**
 * Generates simulated search metrics based on active tracked videos and time elapsed since publish.
 * Metrics rise progressively over time to simulate search ad campaign performance.
 * Always labeled 'SIMULATED'.
 */
export function calculateSimulatedSearchMetrics(
  trackedVideos: TrackedVideo[],
  nowISO: string = new Date().toISOString()
): SimulatedSearchMetrics {
  const now = new Date(nowISO).getTime();
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalConversions = 0;

  for (const video of trackedVideos) {
    if (!video.active) continue;

    const publishedAt = new Date(video.publishedAt).getTime();
    const hoursElapsed = Math.max(0, (now - publishedAt) / (1000 * 60 * 60));

    if (hoursElapsed > 0) {
      // Base impressions scale with views and time elapsed
      const views = video.latestStats?.views || 1000;
      const hoursFactor = Math.min(hoursElapsed / 24, 14); // Scale over 14 days max

      const videoImpressions = Math.round(views * 0.8 * (1 + hoursFactor * 0.15));
      const videoClicks = Math.round(videoImpressions * 0.038); // ~3.8% CTR
      const videoConversions = Math.round(videoClicks * 0.024); // ~2.4% Conv Rate

      totalImpressions += videoImpressions;
      totalClicks += videoClicks;
      totalConversions += videoConversions;
    }
  }

  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

  return {
    impressions: totalImpressions,
    clicks: totalClicks,
    ctr: Number(ctr.toFixed(2)),
    conversions: totalConversions,
    label: 'SIMULATED',
  };
}
