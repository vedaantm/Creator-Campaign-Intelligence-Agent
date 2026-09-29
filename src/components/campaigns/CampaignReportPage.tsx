import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.ts';
import {
  Campaign,
  Creator,
  PremortemRun,
  CreatorBrief,
  SearchPack,
  TrackedVideo,
  Alert as AlertType,
  SimulatedSearchMetrics,
} from '../../../shared/types.ts';
import { Button, Card, Badge } from '../common/UIComponents.tsx';
import { SEO } from '../common/SEO.tsx';
import {
  FileText,
  Printer,
  Download,
  Users,
  ShieldCheck,
  Search,
  Activity,
  CheckCircle,
  AlertTriangle,
  Award,
} from 'lucide-react';

export function CampaignReportPage() {
  const { campaignId } = useParams<{ campaignId: string }>();

  // Fetch campaign
  const { data: campaign, isLoading: campaignLoading } = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => api.get<Campaign>(`/campaigns/${campaignId}`),
    enabled: !!campaignId,
  });

  // Fetch creators
  const { data: creators = [] } = useQuery({
    queryKey: ['creators', campaignId],
    queryFn: () => api.get<Creator[]>(`/campaigns/${campaignId}/creators`),
    enabled: !!campaignId,
  });

  // Fetch pre-mortem runs
  const { data: premortemRuns = [] } = useQuery({
    queryKey: ['premortem', campaignId],
    queryFn: () => api.get<PremortemRun[]>(`/campaigns/${campaignId}/premortem/runs`),
    enabled: !!campaignId,
  });

  // Fetch briefs
  const { data: briefs = [] } = useQuery({
    queryKey: ['briefs', campaignId],
    queryFn: () => api.get<CreatorBrief[]>(`/campaigns/${campaignId}/briefs`),
    enabled: !!campaignId,
  });

  // Fetch search pack
  const { data: searchPack } = useQuery({
    queryKey: ['searchPack', campaignId],
    queryFn: () => api.get<SearchPack>(`/campaigns/${campaignId}/search-pack`).catch(() => null),
    enabled: !!campaignId,
  });

  // Fetch live tracked videos
  const { data: trackedVideos = [] } = useQuery({
    queryKey: ['trackedVideos', campaignId],
    queryFn: () => api.get<TrackedVideo[]>(`/campaigns/${campaignId}/live/videos`).catch(() => []),
    enabled: !!campaignId,
  });

  // Fetch simulated search metrics
  const { data: simulatedMetrics } = useQuery({
    queryKey: ['simulatedSearch', campaignId],
    queryFn: () => api.get<SimulatedSearchMetrics>(`/campaigns/${campaignId}/live/simulated-search`).catch(() => null),
    enabled: !!campaignId,
  });

  const approvedPremortem = premortemRuns.find((r) => r.approved) || premortemRuns[0];

  // Calculations
  const totalViews = trackedVideos.reduce((acc, v) => acc + (v.latestStats?.views || 0), 0);
  const totalLikes = trackedVideos.reduce((acc, v) => acc + (v.latestStats?.likes || 0), 0);
  const totalComments = trackedVideos.reduce((acc, v) => acc + (v.latestStats?.comments || 0), 0);
  const avgEngagementRate = totalViews > 0 ? ((totalLikes + totalComments) / totalViews) * 100 : 0;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadMarkdown = () => {
    if (!campaign) return;

    const brandName = (campaign.brief as any)?.brandName || 'Brand';
    const productName = (campaign.brief as any)?.productName || 'Product';

    const mdContent = `# Executive Campaign Report: ${campaign.name}
**Brand:** ${brandName} | **Product:** ${productName}
**Generated Date:** ${new Date().toLocaleDateString()}
**Status:** ${campaign.status.toUpperCase()}

---

## 1. Executive Brief & Campaign Objectives
- **Campaign Name:** ${campaign.name}
- **Owner Email:** ${campaign.ownerEmail}
- **Target Audience:** ${(campaign.brief as any)?.targetAudience || 'General Enthusiasts'}
- **Primary Message:** ${(campaign.brief as any)?.primaryMessage || 'Authentic creator review'}

---

## 2. Creator Lineup & Match Scores
Total Lineup Size: ${creators.length} creators

${creators
  .map(
    (c) => `- **${c.channel?.title || c.input}**: Score ${c.scores?.fitScore || 'N/A'}/100 (${c.scores?.tier || 'Candidate'}) | Subs: ${(c.channel?.subscriberCount || 0).toLocaleString()}`
  )
  .join('\n')}

---

## 3. Approved Pre-Mortem Assessment
${approvedPremortem ? `- **Health Score:** ${approvedPremortem.healthScore}/100 (${approvedPremortem.label})\n- **Executive Summary:** ${approvedPremortem.executiveSummary}` : 'No pre-mortem run executed.'}

---

## 4. Creator Briefs & Review Status
${briefs.length > 0 ? briefs.map((b) => `- **Creator ${b.creatorId}:** Status: ${b.status.toUpperCase()} (v${b.version})`).join('\n') : 'No briefs generated.'}

---

## 5. Google AI Max for Search Demand
${searchPack ? `- **High-Intent Queries:** ${searchPack.content.highIntentQueries.map((q) => q.query).join(', ')}\n- **Recommended Tags:** ${searchPack.content.recommendedTags.join(', ')}` : 'No search pack generated.'}

---

## 6. Live Pulse Performance
- **Total Tracked Views:** ${totalViews.toLocaleString()}
- **Total Likes:** ${totalLikes.toLocaleString()}
- **Total Comments:** ${totalComments.toLocaleString()}
- **Average Engagement Rate:** ${avgEngagementRate.toFixed(2)}%
- **Simulated Search Clicks:** ${simulatedMetrics?.clicks.toLocaleString() || 0} (${simulatedMetrics?.ctr || 0}% CTR)

---
*Generated by Creator Campaign Intelligence Agent (CCIA)*
`;

    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${campaign.name.toLowerCase().replace(/\s+/g, '_')}_report.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (campaignLoading) {
    return (
      <div className="py-24 text-center text-zinc-500">
        Generating Executive Campaign Report...
      </div>
    );
  }

  if (!campaign) {
    return <div className="py-12 text-center text-red-400">Campaign not found.</div>;
  }

  const briefData = (campaign.brief as any) || {};

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8 text-zinc-100 print:p-0 print:bg-white print:text-black">
      <SEO
        title={`${campaign.name} — Executive Report`}
        description={`Complete multi-engine campaign report for ${campaign.name} covering strategy, creator alignment, pre-mortem risk, search capture, and live pulse.`}
      />
      {/* Top Action Bar (Hidden in Print) */}
      <div className="flex items-center justify-between pb-6 border-b border-zinc-800 print:hidden">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Executive Campaign Report</h1>
            <Badge variant="active">Phase 9 Report</Badge>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Complete multi-engine synthesis covering strategy, creator alignment, pre-mortem risk, search capture, and live pulse performance.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" icon={Printer} onClick={handlePrint}>
            Print Report
          </Button>
          <Button size="sm" icon={Download} onClick={handleDownloadMarkdown}>
            Download Markdown
          </Button>
        </div>
      </div>

      {/* Report Container */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-8 space-y-8 print:border-none print:p-0 print:bg-transparent">
        {/* Section 1: Header & Brief Overview */}
        <div className="space-y-4 pb-6 border-b border-zinc-800">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                {briefData.brandName || 'Brand'} Campaign
              </span>
              <h2 className="text-3xl font-extrabold text-zinc-100 mt-1">{campaign.name}</h2>
              <p className="text-xs text-zinc-400 mt-1">
                Owner: {campaign.ownerEmail} · Product: {briefData.productName || 'N/A'} · Status:{' '}
                <span className="uppercase text-emerald-400 font-semibold">{campaign.status}</span>
              </p>
            </div>
            <div className="text-right text-xs text-zinc-400">
              <div>Date: {new Date().toLocaleDateString()}</div>
              <div>Report Version: 1.0</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 bg-zinc-950/60 p-4 rounded-xl border border-zinc-800/60">
            <div>
              <div className="text-[11px] font-semibold text-zinc-400">Target Audience</div>
              <div className="text-xs font-medium text-zinc-200 mt-0.5">{briefData.targetAudience || 'General Enthusiasts'}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-zinc-400">Primary Message</div>
              <div className="text-xs font-medium text-zinc-200 mt-0.5">{briefData.primaryMessage || 'Authentic review & demonstration'}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-zinc-400">Target Budget</div>
              <div className="text-xs font-medium text-zinc-200 mt-0.5">${(briefData.budget || 25000).toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* Section 2: Creator Lineup & Match Scores */}
        <div className="space-y-3">
          <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-400" /> 1. Creator Lineup & Match Alignment
          </h3>
          <div className="overflow-x-auto border border-zinc-800 rounded-xl">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-950 text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="p-3">Creator Channel</th>
                  <th className="p-3">Tier</th>
                  <th className="p-3 text-right">Subscribers</th>
                  <th className="p-3 text-right">Fit Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {creators.map((c) => (
                  <tr key={c.id}>
                    <td className="p-3 font-medium text-zinc-100">{c.channel?.title || c.input}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 capitalize">{c.scores?.tier || 'Candidate'}</span>
                    </td>
                    <td className="p-3 text-right font-mono text-zinc-400">{(c.channel?.subscriberCount || 0).toLocaleString()}</td>
                    <td className="p-3 text-right font-mono text-emerald-400 font-bold">{c.scores?.fitScore || 'N/A'}/100</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 3: Pre-Mortem Risk Simulation */}
        <div className="space-y-3">
          <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" /> 2. Pre-Mortem Risk Simulation
          </h3>
          {approvedPremortem ? (
            <div className="p-4 bg-zinc-950/60 border border-zinc-800 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-200">
                  Approved Assessment Health Score: {approvedPremortem.healthScore}/100
                </span>
                <span className="px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold uppercase">
                  {approvedPremortem.label}
                </span>
              </div>
              <p className="text-zinc-400">{approvedPremortem.executiveSummary}</p>
            </div>
          ) : (
            <div className="p-4 bg-zinc-950/40 border border-zinc-800 rounded-xl text-xs text-zinc-500">
              No approved Pre-Mortem simulation executed yet.
            </div>
          )}
        </div>

        {/* Section 4: Google AI Max for Search Demand */}
        <div className="space-y-3">
          <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <Search className="w-4 h-4 text-indigo-400" /> 3. Search Demand Capture Strategy
          </h3>
          {searchPack ? (
            <div className="p-4 bg-zinc-950/60 border border-zinc-800 rounded-xl space-y-3 text-xs">
              <div>
                <div className="font-semibold text-zinc-300 mb-1">High Intent Search Queries:</div>
                <div className="flex flex-wrap gap-2">
                  {searchPack.content.highIntentQueries.map((q) => (
                    <span key={q.id} className="bg-zinc-800 text-indigo-300 px-2.5 py-1 rounded border border-zinc-700">
                      "{q.query}"
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-zinc-950/40 border border-zinc-800 rounded-xl text-xs text-zinc-500">
              No search demand capture strategy configured.
            </div>
          )}
        </div>

        {/* Section 5: Live Pulse Results */}
        <div className="space-y-3">
          <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" /> 4. Live Pulse Performance Results
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-zinc-950/60 border border-zinc-800 rounded-xl text-xs">
            <div>
              <div className="text-zinc-400">Total Views</div>
              <div className="text-lg font-bold text-zinc-100 mt-0.5">{totalViews.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-zinc-400">Engagement Rate</div>
              <div className="text-lg font-bold text-emerald-400 mt-0.5">{avgEngagementRate.toFixed(2)}%</div>
            </div>
            <div>
              <div className="text-zinc-400">Simulated Search Clicks</div>
              <div className="text-lg font-bold text-indigo-300 mt-0.5">{simulatedMetrics?.clicks.toLocaleString() || 0}</div>
            </div>
            <div>
              <div className="text-zinc-400">Search CTR</div>
              <div className="text-lg font-bold text-zinc-100 mt-0.5">{simulatedMetrics?.ctr || 0}%</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
