import JSZip from 'jszip';
import { CreatorBrief, Creator } from '../../../shared/types.ts';
import { formatCurrency, formatNumber, formatPercent } from '../../../shared/format.ts';

/**
 * Converts a CreatorBrief and creator metadata into a polished, professional Markdown deliverable.
 */
export function briefToMarkdown(
  brief: CreatorBrief,
  creator?: Creator | null,
  campaignName = 'Influencer Campaign'
): string {
  const c = brief.content;
  const name = creator?.channel?.title || creator?.normalizedKey || brief.creatorId;

  const lines: string[] = [];

  lines.push(`# Creator Collaboration Brief: ${name}`);
  lines.push(`**Campaign**: ${campaignName}`);
  lines.push(`**Status**: ${brief.status.toUpperCase()} (v${brief.currentVersion})`);
  lines.push(`**Generated**: ${new Date(brief.generatedAt).toLocaleDateString()} | **Last Updated**: ${new Date(brief.updatedAt).toLocaleDateString()}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // 1. Creator Snapshot
  lines.push('## 1. Creator Context & Fit');
  lines.push(c.creatorSnapshot);
  lines.push('');

  // 2. Campaign Objective
  lines.push('## 2. Campaign Objective');
  lines.push(c.campaignObjective);
  lines.push('');

  // 3. Recommended Format
  lines.push('## 3. Recommended Deliverable Format');
  lines.push(`- **Format Type**: ${c.recommendedFormat.type}`);
  lines.push(`- **Target Length**: ${c.recommendedFormat.targetLength}`);
  lines.push(`- **Placement**: ${c.recommendedFormat.placement}`);
  lines.push(`- **Format Rationale**: ${c.recommendedFormat.rationale}`);
  lines.push('');

  // 4. Proposed Content Angles
  lines.push('## 4. Proposed Creative Angles');
  c.contentAngles.forEach((angle, idx) => {
    lines.push(`### Option ${idx + 1}: ${angle.title}`);
    lines.push(`- **First 10-Second Hook**: "${angle.hook}"`);
    lines.push('- **Story Outline**:');
    angle.outline.forEach((beat, bIdx) => {
      lines.push(`  ${bIdx + 1}. ${beat}`);
    });
    lines.push(`- **Why This Fits Your Style**: ${angle.whyItFitsThisCreator}`);
    lines.push('');
  });

  // 5. Key Talking Points
  lines.push('## 5. Mandatory Key Messages');
  c.keyMessages.forEach((msg) => {
    lines.push(`- ${msg}`);
  });
  lines.push('');

  // 6. Brand Guidelines: Dos and Don'ts
  lines.push('## 6. Brand Guidelines & Safety Guardrails');
  lines.push('### Do:');
  c.dos.forEach((d) => {
    lines.push(`- **[${d.ruleCode}]**: ${d.instruction}`);
  });
  lines.push('');
  lines.push('### Do NOT:');
  c.donts.forEach((d) => {
    lines.push(`- **[${d.ruleCode}]**: ${d.instruction}`);
  });
  lines.push('');

  // 7. Mandatory Disclosures
  lines.push('## 7. Mandatory FTC & Platform Disclosures');
  lines.push(`- **Description Text**: \`${c.mandatoryDisclosures.descriptionText}\``);
  lines.push(`- **Verbal Disclosure**: "${c.mandatoryDisclosures.verbalText}" (Deliver clearly within the first 30 seconds of content).`);
  lines.push('');

  // 8. Call to Action & Tracking Link
  lines.push('## 8. Call to Action & Tracked Link');
  lines.push(`Please include this trackable URL in the first 3 lines of your video description and pinned comment:`);
  lines.push(`\`${c.callToAction}\``);
  lines.push('');

  // 9. Deliverables Schedule
  lines.push('## 9. Production Timeline & Milestones');
  lines.push(`| Milestone | Date / Window |`);
  lines.push(`|---|---|`);
  lines.push(`| **First Cut / Video Draft Due** | ${c.deliverablesAndTimeline.draftDue} |`);
  lines.push(`| **Brand Feedback Window** | Within ${c.deliverablesAndTimeline.feedbackWithinDays} business days |`);
  lines.push(`| **Final Approved Cut Due** | ${c.deliverablesAndTimeline.finalDue} |`);
  lines.push(`| **Target Publish Date** | ${c.deliverablesAndTimeline.publishDate} |`);
  lines.push('');

  // 10. Performance Benchmarks
  lines.push('## 10. Performance Expectations');
  lines.push(`- **Target Views**: ${formatNumber(c.successMetrics.targetViews)} views (Benchmark median: ${formatNumber(c.successMetrics.medianViewsBenchmark)})`);
  lines.push(`- **Target Engagement Rate**: ${formatPercent(c.successMetrics.targetEngagementRate)} (Benchmark median: ${formatPercent(c.successMetrics.medianEngagementBenchmark)})`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Packs multiple creator briefs into a .zip archive as individual Markdown files.
 */
export async function createBriefsZipArchive(
  briefsWithCreators: Array<{ brief: CreatorBrief; creator?: Creator | null }>,
  campaignName: string
): Promise<Buffer> {
  const zip = new JSZip();

  for (const { brief, creator } of briefsWithCreators) {
    const rawName = creator?.channel?.title || creator?.normalizedKey || brief.creatorId;
    const safeFilename = rawName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const md = briefToMarkdown(brief, creator, campaignName);
    zip.file(`${safeFilename}_brief_v${brief.currentVersion}.md`, md);
  }

  // Also include a summary README.md
  const readmeLines = [
    `# Campaign Creator Briefs: ${campaignName}`,
    `Exported ${briefsWithCreators.length} briefs on ${new Date().toISOString()}`,
    '',
    `## Lineup Status:`,
    ...briefsWithCreators.map(({ brief, creator }) => {
      const name = creator?.channel?.title || creator?.normalizedKey || brief.creatorId;
      return `- **${name}**: ${brief.status.toUpperCase()} (v${brief.currentVersion})`;
    }),
  ];
  zip.file('README.md', readmeLines.join('\n'));

  const arrayBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  return arrayBuffer;
}
