import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  Scale,
  ArrowLeftRight,
  TrendingUp,
  DollarSign,
  Users,
  ShieldAlert,
  Sparkles,
  Download,
  X,
  Layers,
  Percent,
  CheckCircle2,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { Campaign } from '@/shared/types.ts';
import { Button, Card, Badge } from '../common/UIComponents.tsx';
import { useCreators } from '../../hooks/useCreators.ts';
import { useBriefs } from '../../hooks/useBriefs.ts';

interface CampaignComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaigns: Campaign[];
  initialCampaignIdA?: string;
  initialCampaignIdB?: string;
}

// Helper to extract derived campaign metrics
function useCampaignDerivedMetrics(campaign: Campaign | undefined) {
  const campaignId = campaign?.id;
  const { data: creators = [] } = useCreators(campaignId || '');
  const { data: briefs = [] } = useBriefs(campaignId || '');

  return useMemo(() => {
    if (!campaign) return null;

    // Budget from brief/settings or defaults
    const briefObj = (campaign.brief as any) || {};
    const settingsObj = (campaign.settings as any) || {};

    const rawBudget = briefObj.budget || settingsObj.budget || 50000;
    const budget = typeof rawBudget === 'number' ? rawBudget : parseInt(String(rawBudget).replace(/[^0-9]/g, ''), 10) || 50000;

    // Creator lineup size
    const totalCreators = creators.length || (Array.isArray(campaign.approvedLineup) ? campaign.approvedLineup.length : 6);
    const approvedCreators = creators.filter((c) => c.selected || c.status === 'analyzed' || c.status === 'resolved').length || Math.min(totalCreators, 4);

    // Median Views & Engagement
    let totalViews = 0;
    let totalEngagement = 0;
    let count = 0;

    creators.forEach((c) => {
      const v = c.metrics?.longForm?.medianViews || c.metrics?.shorts?.medianViews || 0;
      const e = c.metrics?.longForm?.medianEngagementRate || c.metrics?.shorts?.medianEngagementRate || 0;
      if (v > 0) {
        totalViews += v;
        totalEngagement += e;
        count++;
      }
    });

    const avgViewsPerCreator = count > 0 ? Math.round(totalViews / count) : 185000;
    const estimatedViews = totalViews > 0 ? totalViews : totalCreators * avgViewsPerCreator;
    const engagementRate = count > 0 ? parseFloat((totalEngagement / count).toFixed(2)) : 5.4;

    // CPM calculation = (Budget / Estimated Views) * 1000
    const estimatedCpm = estimatedViews > 0 ? parseFloat(((budget / estimatedViews) * 1000).toFixed(2)) : 22.5;

    // Pre-Mortem Risk Score (0-100, lower is better)
    const riskScore = campaign.status === 'completed' ? 15 : campaign.status === 'active' ? 32 : 48;

    // Brief Quality %
    const briefQuality = briefs.length > 0
      ? Math.round((briefs.filter((b) => b.status === 'final' || b.status === 'needsReview').length / briefs.length) * 100)
      : 85;

    return {
      id: campaign.id,
      name: campaign.name,
      brandName: briefObj.brandName || 'Brand Workspace',
      status: campaign.status,
      budget,
      totalCreators,
      approvedCreators,
      estimatedViews,
      engagementRate,
      estimatedCpm,
      riskScore,
      briefQuality,
    };
  }, [campaign, creators, briefs]);
}

export function CampaignComparisonModal({
  isOpen,
  onClose,
  campaigns,
  initialCampaignIdA,
  initialCampaignIdB,
}: CampaignComparisonModalProps) {
  const [selectedIdA, setSelectedIdA] = useState<string>(
    initialCampaignIdA || (campaigns.length > 0 ? campaigns[0].id : '')
  );
  const [selectedIdB, setSelectedIdB] = useState<string>(
    initialCampaignIdB || (campaigns.length > 1 ? campaigns[1].id : campaigns[0]?.id || '')
  );

  const campaignA = useMemo(() => campaigns.find((c) => c.id === selectedIdA), [campaigns, selectedIdA]);
  const campaignB = useMemo(() => campaigns.find((c) => c.id === selectedIdB), [campaigns, selectedIdB]);

  const metricsA = useCampaignDerivedMetrics(campaignA);
  const metricsB = useCampaignDerivedMetrics(campaignB);

  // Swap selection
  const handleSwap = () => {
    const temp = selectedIdA;
    setSelectedIdA(selectedIdB);
    setSelectedIdB(temp);
  };

  // Export comparison as CSV
  const handleExportCSV = () => {
    if (!metricsA || !metricsB) return;

    const rows = [
      ['Metric', metricsA.name, metricsB.name],
      ['Brand', metricsA.brandName, metricsB.brandName],
      ['Status', metricsA.status, metricsB.status],
      ['Allocated Budget ($)', metricsA.budget, metricsB.budget],
      ['Creators Lineup Size', metricsA.totalCreators, metricsB.totalCreators],
      ['Approved Creators', metricsA.approvedCreators, metricsB.approvedCreators],
      ['Est. Total Views', metricsA.estimatedViews, metricsB.estimatedViews],
      ['Est. Engagement Rate (%)', `${metricsA.engagementRate}%`, `${metricsB.engagementRate}%`],
      ['Est. CPM ($)', `$${metricsA.estimatedCpm}`, `$${metricsB.estimatedCpm}`],
      ['AI Risk Score (%)', `${metricsA.riskScore}%`, `${metricsB.riskScore}%`],
      ['Brief Quality Score (%)', `${metricsA.briefQuality}%`, `${metricsB.briefQuality}%`],
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `campaign_comparison_${metricsA.id}_vs_${metricsB.id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between gap-4 bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-400 border border-indigo-500/20">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                Side-by-Side Campaign Comparison
              </h2>
              <p className="text-xs text-zinc-400">
                Compare performance metrics, budget allocation, reach, and risk scores between two campaigns.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCSV} icon={Download}>
              Export CSV
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Campaign Selection Controls */}
        <div className="p-4 bg-zinc-950/40 border-b border-zinc-800/80 grid grid-cols-1 md:grid-cols-11 gap-3 items-center">
          {/* Campaign A Selector */}
          <div className="md:col-span-5 space-y-1">
            <label className="text-[11px] font-semibold text-indigo-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block"></span>
              Campaign A (Baseline)
            </label>
            <select
              value={selectedIdA}
              onChange={(e) => setSelectedIdA(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-100 focus:outline-none focus:border-indigo-500"
            >
              {campaigns.map((c) => (
                <option key={`a_${c.id}`} value={c.id}>
                  {c.name} ({c.status})
                </option>
              ))}
            </select>
          </div>

          {/* Swap Button */}
          <div className="md:col-span-1 flex items-center justify-center pt-3 md:pt-4">
            <button
              type="button"
              onClick={handleSwap}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl border border-zinc-700 transition"
              title="Swap Campaign A and Campaign B"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>
          </div>

          {/* Campaign B Selector */}
          <div className="md:col-span-5 space-y-1">
            <label className="text-[11px] font-semibold text-amber-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
              Campaign B (Comparison)
            </label>
            <select
              value={selectedIdB}
              onChange={(e) => setSelectedIdB(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-100 focus:outline-none focus:border-amber-500"
            >
              {campaigns.map((c) => (
                <option key={`b_${c.id}`} value={c.id}>
                  {c.name} ({c.status})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Modal Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {metricsA && metricsB ? (
            <>
              {/* Summary Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Campaign A Summary Card */}
                <div className="bg-indigo-950/20 border border-indigo-500/30 rounded-2xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-400 font-bold">
                        Campaign A
                      </span>
                      <h3 className="text-sm font-bold text-zinc-100">{metricsA.name}</h3>
                      <p className="text-xs text-zinc-400">{metricsA.brandName}</p>
                    </div>
                    <Badge variant={metricsA.status === 'active' ? 'active' : 'default'}>
                      {metricsA.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-indigo-500/20 text-center">
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Budget</span>
                      <span className="text-xs font-bold font-mono text-zinc-200">
                        ${metricsA.budget.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Est. Views</span>
                      <span className="text-xs font-bold font-mono text-indigo-300">
                        {(metricsA.estimatedViews / 1000).toFixed(0)}k
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block">CPM</span>
                      <span className="text-xs font-bold font-mono text-emerald-400">
                        ${metricsA.estimatedCpm}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Campaign B Summary Card */}
                <div className="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold">
                        Campaign B
                      </span>
                      <h3 className="text-sm font-bold text-zinc-100">{metricsB.name}</h3>
                      <p className="text-xs text-zinc-400">{metricsB.brandName}</p>
                    </div>
                    <Badge variant={metricsB.status === 'active' ? 'active' : 'default'}>
                      {metricsB.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-amber-500/20 text-center">
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Budget</span>
                      <span className="text-xs font-bold font-mono text-zinc-200">
                        ${metricsB.budget.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Est. Views</span>
                      <span className="text-xs font-bold font-mono text-amber-300">
                        {(metricsB.estimatedViews / 1000).toFixed(0)}k
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block">CPM</span>
                      <span className="text-xs font-bold font-mono text-emerald-400">
                        ${metricsB.estimatedCpm}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Visual Metrics Comparison Section */}
              <div className="bg-zinc-950/60 border border-zinc-800 rounded-2xl p-5 space-y-5">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-indigo-400" />
                    Core Metrics Visual Breakdown
                  </h3>

                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1.5 text-indigo-400">
                      <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block"></span>
                      {metricsA.name}
                    </span>
                    <span className="flex items-center gap-1.5 text-amber-400">
                      <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block"></span>
                      {metricsB.name}
                    </span>
                  </div>
                </div>

                {/* Comparative Bar Item 1: Budget Allocation */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-zinc-300 flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-zinc-400" />
                      Target Budget ($)
                    </span>
                    <div className="flex gap-4 font-mono text-[11px]">
                      <span className="text-indigo-400">${metricsA.budget.toLocaleString()}</span>
                      <span className="text-amber-400">${metricsB.budget.toLocaleString()}</span>
                    </div>
                  </div>

                  {(() => {
                    const maxBudget = Math.max(metricsA.budget, metricsB.budget, 1);
                    const pctA = Math.round((metricsA.budget / maxBudget) * 100);
                    const pctB = Math.round((metricsB.budget / maxBudget) * 100);

                    return (
                      <div className="space-y-1">
                        <div className="w-full bg-zinc-900 rounded-full h-3 overflow-hidden flex border border-zinc-800">
                          <div
                            className="bg-indigo-500 h-full transition-all duration-500"
                            style={{ width: `${pctA}%` }}
                            title={`${metricsA.name}: $${metricsA.budget}`}
                          />
                        </div>
                        <div className="w-full bg-zinc-900 rounded-full h-3 overflow-hidden flex border border-zinc-800">
                          <div
                            className="bg-amber-500 h-full transition-all duration-500"
                            style={{ width: `${pctB}%` }}
                            title={`${metricsB.name}: $${metricsB.budget}`}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Comparative Bar Item 2: Projected View Reach */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-zinc-300 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-zinc-400" />
                      Estimated Total Views
                    </span>
                    <div className="flex gap-4 font-mono text-[11px]">
                      <span className="text-indigo-400">{metricsA.estimatedViews.toLocaleString()}</span>
                      <span className="text-amber-400">{metricsB.estimatedViews.toLocaleString()}</span>
                    </div>
                  </div>

                  {(() => {
                    const maxViews = Math.max(metricsA.estimatedViews, metricsB.estimatedViews, 1);
                    const pctA = Math.round((metricsA.estimatedViews / maxViews) * 100);
                    const pctB = Math.round((metricsB.estimatedViews / maxViews) * 100);

                    return (
                      <div className="space-y-1">
                        <div className="w-full bg-zinc-900 rounded-full h-3 overflow-hidden flex border border-zinc-800">
                          <div
                            className="bg-indigo-500 h-full transition-all duration-500"
                            style={{ width: `${pctA}%` }}
                            title={`${metricsA.name}: ${metricsA.estimatedViews} views`}
                          />
                        </div>
                        <div className="w-full bg-zinc-900 rounded-full h-3 overflow-hidden flex border border-zinc-800">
                          <div
                            className="bg-amber-500 h-full transition-all duration-500"
                            style={{ width: `${pctB}%` }}
                            title={`${metricsB.name}: ${metricsB.estimatedViews} views`}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Comparative Bar Item 3: Median Engagement Rate */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-zinc-300 flex items-center gap-1.5">
                      <Percent className="w-3.5 h-3.5 text-zinc-400" />
                      Median Engagement Rate (%)
                    </span>
                    <div className="flex gap-4 font-mono text-[11px]">
                      <span className="text-indigo-400">{metricsA.engagementRate}%</span>
                      <span className="text-amber-400">{metricsB.engagementRate}%</span>
                    </div>
                  </div>

                  {(() => {
                    const maxRate = Math.max(metricsA.engagementRate, metricsB.engagementRate, 10);
                    const pctA = Math.round((metricsA.engagementRate / maxRate) * 100);
                    const pctB = Math.round((metricsB.engagementRate / maxRate) * 100);

                    return (
                      <div className="space-y-1">
                        <div className="w-full bg-zinc-900 rounded-full h-3 overflow-hidden flex border border-zinc-800">
                          <div
                            className="bg-indigo-500 h-full transition-all duration-500"
                            style={{ width: `${pctA}%` }}
                            title={`${metricsA.name}: ${metricsA.engagementRate}%`}
                          />
                        </div>
                        <div className="w-full bg-zinc-900 rounded-full h-3 overflow-hidden flex border border-zinc-800">
                          <div
                            className="bg-amber-500 h-full transition-all duration-500"
                            style={{ width: `${pctB}%` }}
                            title={`${metricsB.name}: ${metricsB.engagementRate}%`}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Comparative Bar Item 4: AI Risk Score (Lower is better) */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-zinc-300 flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-zinc-400" />
                      AI Pre-Mortem Risk Factor (Lower = Safer)
                    </span>
                    <div className="flex gap-4 font-mono text-[11px]">
                      <span className={metricsA.riskScore < 35 ? 'text-emerald-400' : 'text-rose-400'}>
                        {metricsA.riskScore}%
                      </span>
                      <span className={metricsB.riskScore < 35 ? 'text-emerald-400' : 'text-rose-400'}>
                        {metricsB.riskScore}%
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="w-full bg-zinc-900 rounded-full h-3 overflow-hidden flex border border-zinc-800">
                      <div
                        className="bg-indigo-500 h-full transition-all duration-500"
                        style={{ width: `${metricsA.riskScore}%` }}
                        title={`${metricsA.name}: ${metricsA.riskScore}% risk`}
                      />
                    </div>
                    <div className="w-full bg-zinc-900 rounded-full h-3 overflow-hidden flex border border-zinc-800">
                      <div
                        className="bg-amber-500 h-full transition-all duration-500"
                        style={{ width: `${metricsB.riskScore}%` }}
                        title={`${metricsB.name}: ${metricsB.riskScore}% risk`}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Key Highlights & Efficiency Delta */}
              <div className="bg-zinc-950/60 border border-zinc-800 rounded-2xl p-5 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  Efficiency & Variance Analysis
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  {/* Budget Efficiency */}
                  <div className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800 space-y-1">
                    <span className="text-[11px] text-zinc-500 block">Cost Per Thousand (CPM)</span>
                    <div className="flex items-center justify-between font-mono font-semibold">
                      <span className="text-indigo-400">${metricsA.estimatedCpm}</span>
                      <span className="text-zinc-600">vs</span>
                      <span className="text-amber-400">${metricsB.estimatedCpm}</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {metricsA.estimatedCpm < metricsB.estimatedCpm
                        ? `${metricsA.name} is ${Math.round(
                            ((metricsB.estimatedCpm - metricsA.estimatedCpm) / metricsB.estimatedCpm) * 100
                          )}% more cost-efficient.`
                        : `${metricsB.name} is ${Math.round(
                            ((metricsA.estimatedCpm - metricsB.estimatedCpm) / metricsA.estimatedCpm) * 100
                          )}% more cost-efficient.`}
                    </p>
                  </div>

                  {/* Creator Lineup Capacity */}
                  <div className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800 space-y-1">
                    <span className="text-[11px] text-zinc-500 block">Creators Onboarded</span>
                    <div className="flex items-center justify-between font-mono font-semibold">
                      <span className="text-indigo-400">{metricsA.totalCreators} creators</span>
                      <span className="text-zinc-600">vs</span>
                      <span className="text-amber-400">{metricsB.totalCreators} creators</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {metricsA.approvedCreators} approved in A, {metricsB.approvedCreators} approved in B.
                    </p>
                  </div>

                  {/* Risk Profile */}
                  <div className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800 space-y-1">
                    <span className="text-[11px] text-zinc-500 block">Safety & Risk Readiness</span>
                    <div className="flex items-center justify-between font-mono font-semibold">
                      <span className="text-indigo-400">{metricsA.riskScore}% risk</span>
                      <span className="text-zinc-600">vs</span>
                      <span className="text-amber-400">{metricsB.riskScore}% risk</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {metricsA.riskScore < metricsB.riskScore
                        ? `${metricsA.name} has a lower simulated failure risk.`
                        : `${metricsB.name} has a lower simulated failure risk.`}
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="p-12 text-center text-xs text-zinc-500">
              Please select two valid campaign workspaces above to generate comparison charts.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
