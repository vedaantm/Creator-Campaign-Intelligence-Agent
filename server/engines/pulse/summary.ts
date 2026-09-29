import { generateStructured } from '../../services/gemini.ts';
import { z } from 'zod';
import { PulseSummary, Alert, TrackedVideo, SimulatedSearchMetrics } from '../../../shared/types.ts';

const PulseSummaryAiOutputSchema = z.object({
  text: z.string().min(50).max(1000),
  actions: z.array(z.string().min(5).max(300)).min(1).max(3),
});

export async function generatePulseAiSummary(
  campaignId: string,
  campaignName: string,
  trackedVideos: TrackedVideo[],
  activeAlerts: Alert[],
  simulatedMetrics: SimulatedSearchMetrics,
  nowISO: string = new Date().toISOString()
): Promise<PulseSummary> {
  const totalViews = trackedVideos.reduce((acc, v) => acc + (v.latestStats?.views || 0), 0);
  const totalLikes = trackedVideos.reduce((acc, v) => acc + (v.latestStats?.likes || 0), 0);
  const totalComments = trackedVideos.reduce((acc, v) => acc + (v.latestStats?.comments || 0), 0);
  const avgEngagement = totalViews > 0 ? ((totalLikes + totalComments) / totalViews) * 100 : 0;

  const alertSummaries = activeAlerts.map((a) => `[${a.severity.toUpperCase()}] ${a.type}: ${a.message}`);

  const systemInstruction = `You are an expert marketing intelligence assistant summarizing campaign performance.
Provide a clear, executive-level 4-6 sentence plain-English summary and 1-3 actionable next steps.
Rely strictly on the provided computed numbers and active alert summary. Never fabricate data.`;

  const prompt = `
<untrusted_data source="campaign_metrics">
Campaign: ${campaignName}
Active Tracked Videos: ${trackedVideos.length}
Total Views: ${totalViews.toLocaleString()}
Total Likes: ${totalLikes.toLocaleString()}
Total Comments: ${totalComments.toLocaleString()}
Average Engagement Rate: ${avgEngagement.toFixed(2)}%

Simulated Search Performance:
- Impressions: ${simulatedMetrics.impressions.toLocaleString()}
- Clicks: ${simulatedMetrics.clicks.toLocaleString()}
- CTR: ${simulatedMetrics.ctr}%
- Conversions: ${simulatedMetrics.conversions.toLocaleString()}

Active Alerts (${activeAlerts.length}):
${alertSummaries.length > 0 ? alertSummaries.join('\n') : 'No active alerts. Performance within expected parameters.'}
</untrusted_data>

Generate a structured JSON response matching the required schema with text (4-6 sentences) and actions (1-3 items).
`;

  let text = '';
  let actions: string[] = [];

  try {
    const aiResult = await generateStructured({
      engine: 'PULSE_SUMMARY',
      systemInstruction,
      prompt,
      zodSchema: PulseSummaryAiOutputSchema,
    });
    text = aiResult.text;
    actions = aiResult.actions;
  } catch (err) {
    // Fallback deterministic summary generation when Gemini API is unavailable or unconfigured
    const alertCountStr = activeAlerts.length > 0
      ? `${activeAlerts.length} active alert(s) requiring attention.`
      : 'no critical performance alerts detected.';

    text = `Campaign ${campaignName} is currently tracking ${trackedVideos.length} published video(s) with a total of ${totalViews.toLocaleString()} views and ${totalComments.toLocaleString()} comments. Overall engagement rate stands at ${avgEngagement.toFixed(2)}%, while simulated search campaign metrics reflect ${simulatedMetrics.clicks.toLocaleString()} clicks from ${simulatedMetrics.impressions.toLocaleString()} impressions (${simulatedMetrics.ctr}% CTR). Monitoring systems report ${alertCountStr} Continued tracking is recommended as audience reach scales across all active creator channels.`;

    actions = activeAlerts.length > 0
      ? activeAlerts.slice(0, 3).map((a) => `[${a.type.toUpperCase()}] Review video ${a.videoId}: ${a.message}`)
      : ['Maintain active polling and monitor search capture campaign performance.', 'Review high-performing creators for potential budget expansion.'];
  }

  return {
    id: `ps_${Date.now()}`,
    campaignId,
    text,
    actions,
    basedOnSnapshotAt: nowISO,
    createdAt: nowISO,
  };
}
