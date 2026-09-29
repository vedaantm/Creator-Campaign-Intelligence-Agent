import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  Play,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  TrendingDown,
  TrendingUp,
  DollarSign,
  Users,
  Eye,
  RefreshCw,
  Trash2,
  GitCompare,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Info,
  Sliders,
  Calendar,
  Layers,
  Flame,
  MessageSquare,
  Plus,
} from 'lucide-react';
import {
  Button,
  Card,
  Badge,
  Dialog,
} from '../common/UIComponents.tsx';
import { SEO } from '../common/SEO.tsx';
import { useCampaign, useCampaignBrief } from '../../hooks/useCampaigns.ts';
import { useCreators } from '../../hooks/useCreators.ts';
import {
  usePremortemRuns,
  usePremortemRun,
  useActivePremortemJob,
  usePremortemMutations,
} from '../../hooks/usePremortem.ts';
import {
  PremortemRun,
  PairwiseOverlapResult,
  PremortemRisk,
  PremortemSuggestion,
  HealthPenalty,
  WhatIfResponse,
  Creator,
} from '@/shared/types.ts';
import { formatNumber, formatCurrency, formatPercent } from '@/shared/format.ts';
import { CONFIG } from '@/shared/config.ts';

export function PremortemPage() {
  const { campaignId, runId } = useParams<{ campaignId: string; runId?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const compareParam = searchParams.get('compare');
  const compareRunIds = useMemo(
    () => (compareParam ? compareParam.split(',').filter(Boolean) : []),
    [compareParam]
  );

  const { data: campaign } = useCampaign(campaignId);
  const { data: briefData } = useCampaignBrief(campaignId);
  const { data: creators = [] } = useCreators(campaignId);
  const { data: runs = [], isLoading: isRunsLoading } = usePremortemRuns(campaignId);
  const { data: activeJob } = useActivePremortemJob(campaignId);

  // If viewing a specific run via deep-link
  const targetRunId = runId || (runs.length > 0 ? runs[0].id : undefined);
  const { data: currentRun, isLoading: isRunLoading } = usePremortemRun(campaignId, targetRunId);

  const queryClient = useQueryClient();
  const [wasRunning, setWasRunning] = useState(false);

  // Monitor activeJob state transitions to invalidate and refetch runs when completed
  useEffect(() => {
    if (activeJob) {
      setWasRunning(true);
    } else if (wasRunning && !activeJob) {
      setWasRunning(false);
      // Invalidate queries so that the newly created run appears instantly!
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId, 'premortem-runs'] });
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId, 'premortem-job'] });
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId, 'creators'] });
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
    }
  }, [activeJob, wasRunning, campaignId, queryClient]);

  const {
    startRunMutation,
    approveRunMutation,
    deleteRunMutation,
    whatIfMutation,
  } = usePremortemMutations(campaignId);

  // Modals & UI toggles
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [expandedRiskIdx, setExpandedRiskIdx] = useState<number | null>(null);
  const [selectedCellPair, setSelectedCellPair] = useState<PairwiseOverlapResult | null>(null);

  // What-If Simulator state
  const [whatIfCreatorIds, setWhatIfCreatorIds] = useState<string[]>([]);
  const [whatIfData, setWhatIfData] = useState<WhatIfResponse | null>(null);
  const [isWhatIfPanelOpen, setIsWhatIfPanelOpen] = useState(false);

  // Initialize what-if lineup from selected creators or current run
  useEffect(() => {
    if (currentRun) {
      setWhatIfCreatorIds(currentRun.lineupCreatorIds);
    } else {
      const selected = creators.filter((c) => c.selected).map((c) => c.id);
      if (selected.length > 0) {
        setWhatIfCreatorIds(selected);
      } else {
        setWhatIfCreatorIds(creators.slice(0, 4).map((c) => c.id));
      }
    }
  }, [currentRun?.id, creators.length]);

  // Run What-If calculation whenever whatIfCreatorIds changes
  useEffect(() => {
    if (whatIfCreatorIds.length >= 1 && campaignId) {
      whatIfMutation.mutate(whatIfCreatorIds, {
        onSuccess: (data) => setWhatIfData(data),
      });
    } else {
      setWhatIfData(null);
    }
  }, [whatIfCreatorIds.join(','), campaignId]);

  // Toggle creator in What-If lineup
  const toggleWhatIfCreator = (id: string) => {
    setWhatIfCreatorIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev; // At least 1 creator
        return prev.filter((item) => item !== id);
      } else {
        if (prev.length >= CONFIG.PREMORTEM_MAX_CREATORS) return prev;
        return [...prev, id];
      }
    });
  };

  // Apply a suggestion to What-If simulator
  const applySuggestion = (suggestion: PremortemSuggestion) => {
    setIsWhatIfPanelOpen(true);
    if (suggestion.action === 'remove' && suggestion.creatorId) {
      setWhatIfCreatorIds((prev) => prev.filter((id) => id !== suggestion.creatorId));
    } else if (suggestion.action === 'replace' && suggestion.creatorId && suggestion.replacementCreatorId) {
      setWhatIfCreatorIds((prev) =>
        prev.map((id) => (id === suggestion.creatorId ? suggestion.replacementCreatorId! : id))
      );
    } else if (suggestion.action === 'add' && suggestion.replacementCreatorId) {
      if (!whatIfCreatorIds.includes(suggestion.replacementCreatorId)) {
        setWhatIfCreatorIds((prev) => [...prev, suggestion.replacementCreatorId!]);
      }
    }
  };

  // Launch full simulation
  const handleLaunchSimulation = (creatorIdsToRun?: string[]) => {
    const ids = creatorIdsToRun || whatIfCreatorIds;
    if (ids.length < CONFIG.PREMORTEM_MIN_CREATORS) return;
    startRunMutation.mutate({ creatorIds: ids });
  };

  // Compare 2 runs side-by-side
  const run1 = runs.find((r) => r.id === compareRunIds[0]);
  const run2 = runs.find((r) => r.id === compareRunIds[1]);

  const setCompareRuns = (idA?: string, idB?: string) => {
    const next = new URLSearchParams(searchParams);
    if (idA && idB) {
      next.set('compare', `${idA},${idB}`);
    } else {
      next.delete('compare');
    }
    setSearchParams(next);
  };

  const analyzedCreators = useMemo(() => creators.filter((c) => c.status === 'analyzed'), [creators]);
  const isBriefValid = Boolean(briefData?.isComplete);
  const canRunSimulation = isBriefValid && analyzedCreators.length >= CONFIG.PREMORTEM_MIN_CREATORS && !activeJob;

  let startTooltip = '';
  if (!isBriefValid) startTooltip = 'Complete the Campaign Brief first';
  else if (analyzedCreators.length < CONFIG.PREMORTEM_MIN_CREATORS)
    startTooltip = `Analyze at least ${CONFIG.PREMORTEM_MIN_CREATORS} creators in Step 3`;
  else if (activeJob) startTooltip = 'Pre-Mortem job currently running';

  // Overlap matrix lookup
  const pairwiseLookup = useMemo(() => {
    const map = new Map<string, PairwiseOverlapResult>();
    if (!currentRun) return map;
    for (const pair of currentRun.pairwiseResults) {
      map.set(`${pair.creatorIdA}_${pair.creatorIdB}`, pair);
      map.set(`${pair.creatorIdB}_${pair.creatorIdA}`, pair);
    }
    return map;
  }, [currentRun]);

  const lineupCreatorObjects = useMemo(() => {
    if (!currentRun) return [];
    return currentRun.lineupCreatorIds
      .map((id) => creators.find((c) => c.id === id))
      .filter(Boolean) as Creator[];
  }, [currentRun, creators]);

  const isStepComplete = Boolean(
    campaign?.approvedLineup &&
      !Array.isArray(campaign.approvedLineup) &&
      campaign.approvedLineup.runId
  );

  if (isRunsLoading || (targetRunId && isRunLoading)) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto pb-28">
        <SEO
          title={campaign ? `${campaign.name} — Pre-Mortem (Step 4)` : 'Pre-Mortem Risk Simulator — Step 4'}
          description="Stress-test proposed creator lineups for audience cannibalization, sponsorship fatigue, and commercial risks."
        />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-950/60 text-indigo-400 border border-indigo-800/60">
                Phase 4 • Step 4
              </span>
            </div>
            <div className="flex items-baseline gap-3">
              <h1 className="text-2xl font-bold text-zinc-100">Pre-Mortem Campaign Simulator</h1>
            </div>
            <p className="text-sm text-zinc-400 mt-1">Loading simulation telemetry...</p>
          </div>
        </div>

        <Card className="p-12 text-center border-zinc-800 bg-zinc-900/20 flex flex-col items-center justify-center gap-4">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-zinc-400 font-medium">Loading historical audit data and Jaccard overlap matrices...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-28">
      <SEO
        title={campaign ? `${campaign.name} — Pre-Mortem (Step 4)` : 'Pre-Mortem Risk Simulator — Step 4'}
        description="Stress-test proposed creator lineups for audience cannibalization, sponsorship fatigue, and commercial risks."
      />
      {/* Header & Stepper Badge */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-950/60 text-indigo-400 border border-indigo-800/60">
              Phase 4 • Step 4
            </span>
            {isStepComplete ? (
              <Badge variant="active" className="text-xs">
                <CheckCircle2 className="w-3 h-3 text-emerald-400 inline mr-1" />
                Lineup Approved
              </Badge>
            ) : (
              <Badge variant="draft" className="text-xs">
                Pre-Mortem Simulator
              </Badge>
            )}
            {currentRun?.approved && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 flex items-center gap-1">
                <Check className="w-3 h-3" /> Approved Run
              </span>
            )}
          </div>

          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-bold text-zinc-100">Pre-Mortem Campaign Simulator</h1>
            <span className="text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">
              Engine 4
            </span>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Stress-test proposed creator lineups for audience cannibalization, sponsorship fatigue, and commercial risks before committing capital.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHowItWorks(true)}
            icon={Info}
            className="text-xs text-zinc-400 hover:text-zinc-200"
          >
            How We Estimate This
          </Button>

          {currentRun && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsWhatIfPanelOpen(!isWhatIfPanelOpen)}
              icon={Sliders}
              className="text-xs text-indigo-300 border-indigo-800/50 hover:bg-indigo-950/30"
            >
              What-If Sandbox
            </Button>
          )}

          {currentRun && !currentRun.approved && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowApproveConfirm(true)}
              icon={CheckCircle2}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              Approve Lineup
            </Button>
          )}

          <div title={startTooltip}>
            <Button
              variant={currentRun ? 'outline' : 'primary'}
              size="sm"
              disabled={!canRunSimulation}
              isLoading={startRunMutation.isPending || Boolean(activeJob)}
              onClick={() => handleLaunchSimulation()}
              icon={Play}
            >
              {currentRun ? 'Re-Run Simulation' : 'Run Pre-Mortem'}
            </Button>
          </div>
        </div>
      </div>

      {/* Simulation Running Progress Card */}
      {activeJob && (
        <Card className="p-4 border-indigo-500/50 bg-indigo-950/20 space-y-3 animate-pulse-subtle">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <div>
                <h4 className="text-sm font-semibold text-indigo-200">
                  Pre-Mortem Stress Simulation Running
                </h4>
                <p className="text-xs text-indigo-300/80">
                  {activeJob.progress?.message || 'Analyzing audience overlap matrices and commercial hazards...'}
                </p>
              </div>
            </div>
            <span className="text-xs font-mono text-indigo-300">
              {activeJob.progress?.done || 0}%
            </span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-indigo-500 h-1.5 transition-all duration-300"
              style={{ width: `${activeJob.progress?.done || 5}%` }}
            />
          </div>
        </Card>
      )}

      {/* EMPTY STATE: No runs yet */}
      {runs.length === 0 && !activeJob ? (
        <Card className="p-12 text-center border-dashed border-zinc-800 space-y-5 max-w-2xl mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-indigo-950/60 border border-indigo-800/60 flex items-center justify-center mx-auto text-indigo-400">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-zinc-100">No Pre-Mortem Simulations Run Yet</h3>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-lg mx-auto">
              Simulate your lineup to uncover audience cannibalization, sponsor fatigue, and commercial hazards.
              The simulator tests 8 risk dimensions using public comment patterns and video semantic embeddings.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-left text-xs space-y-2 max-w-md mx-auto">
            <div className="flex items-center justify-between text-zinc-300 font-semibold">
              <span>Proposed Initial Lineup:</span>
              <span className="text-indigo-400 font-mono">
                {whatIfCreatorIds.length} creators selected
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {whatIfCreatorIds.map((id) => {
                const c = creators.find((item) => item.id === id);
                return (
                  <span
                    key={id}
                    className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 text-[11px]"
                  >
                    {c?.channel?.title || c?.normalizedKey || id}
                  </span>
                );
              })}
            </div>
          </div>

          <Button
            variant="primary"
            size="md"
            disabled={!canRunSimulation}
            isLoading={startRunMutation.isPending}
            onClick={() => handleLaunchSimulation()}
            icon={Play}
          >
            Launch Pre-Mortem Simulator
          </Button>
        </Card>
      ) : null}

      {/* WHAT-IF SANDBOX PANEL (Collapsible or Open) */}
      {isWhatIfPanelOpen && (
        <Card className="p-5 border-indigo-900/50 bg-gradient-to-b from-zinc-900 via-indigo-950/10 to-zinc-900 space-y-5 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              <div>
                <h3 className="text-sm font-bold text-zinc-100">What-If Lineup Sandbox</h3>
                <p className="text-xs text-zinc-400">
                  Toggle creators in and out to instantly forecast score, reach, and budget changes before committing a full run.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {currentRun && whatIfData && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-xs">
                  <span className="text-zinc-500">Live Health:</span>
                  <span className="font-mono line-through text-zinc-400">{currentRun.healthScore}</span>
                  <ArrowRight className="w-3 h-3 text-zinc-500" />
                  <span
                    className={`font-bold font-mono text-sm ${
                      whatIfData.healthScore > currentRun.healthScore
                        ? 'text-emerald-400'
                        : whatIfData.healthScore < currentRun.healthScore
                        ? 'text-rose-400'
                        : 'text-zinc-200'
                    }`}
                  >
                    {whatIfData.healthScore}
                  </span>
                  <span className="text-[10px] text-zinc-400">({whatIfData.label})</span>
                </div>
              )}

              <Button
                variant="primary"
                size="sm"
                onClick={() => handleLaunchSimulation(whatIfCreatorIds)}
                isLoading={startRunMutation.isPending}
                className="text-xs gap-1.5"
              >
                <Play className="w-3.5 h-3.5" />
                Save As New Run
              </Button>

              <button
                onClick={() => setIsWhatIfPanelOpen(false)}
                className="text-zinc-500 hover:text-zinc-300 p-1"
                title="Close Sandbox"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Creator Selection Pills */}
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Select Creators to Include in Lineup ({whatIfCreatorIds.length}/{CONFIG.PREMORTEM_MAX_CREATORS}):
            </div>
            <div className="flex flex-wrap gap-2">
              {analyzedCreators.map((creator) => {
                const isIncluded = whatIfCreatorIds.includes(creator.id);
                return (
                  <button
                    key={creator.id}
                    onClick={() => toggleWhatIfCreator(creator.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isIncluded
                        ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400'
                        : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    <span className="truncate max-w-[150px]">
                      {creator.channel?.title || creator.normalizedKey}
                    </span>
                    <span className="text-[10px] opacity-80 font-mono">
                      fit: {creator.scores?.fitScore ?? '—'}
                    </span>
                    {isIncluded ? <Check className="w-3 h-3 shrink-0" /> : <Plus className="w-3 h-3 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* What-If Live Reach & Budget Summary */}
          {whatIfData && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-zinc-950/70 border border-zinc-800 text-xs">
              <div className="space-y-1">
                <div>
                  <span className="text-zinc-500 block font-medium">Deduplicated Reach:</span>
                  <span className="text-zinc-100 font-bold font-mono text-sm">
                    {whatIfData.lineupMetrics.overlapAdjustedReach.toLocaleString()} views
                  </span>
                  <span className="text-[10px] text-zinc-500 block">
                    ({whatIfData.lineupMetrics.reachDeduplicationRatio * 100}% deduped)
                  </span>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-1 overflow-hidden">
                  <div
                    className="bg-indigo-500 h-1 rounded-full transition-all duration-300"
                    style={{ width: `${Math.round((1 - whatIfData.lineupMetrics.reachDeduplicationRatio) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <div>
                  <span className="text-zinc-500 block font-medium">Estimated Midpoint Cost:</span>
                  <span
                    className={`font-bold font-mono text-sm ${
                      whatIfData.lineupMetrics.isOverBudget ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {formatCurrency(whatIfData.lineupMetrics.totalCostMidpoint)}
                  </span>
                  <span className="text-[10px] text-zinc-500 block">
                    Budget: {formatCurrency(whatIfData.lineupMetrics.budgetUsd)}
                  </span>
                </div>
                {whatIfData.lineupMetrics.budgetUsd > 0 && (
                  <div className="w-full bg-zinc-800 rounded-full h-1 overflow-hidden">
                    <div
                      className={`h-1 rounded-full transition-all duration-300 ${whatIfData.lineupMetrics.isOverBudget ? 'bg-rose-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(100, Math.round((whatIfData.lineupMetrics.totalCostMidpoint / whatIfData.lineupMetrics.budgetUsd) * 100))}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <div>
                  <span className="text-zinc-500 block font-medium">Active Penalties:</span>
                  <span className="text-zinc-100 font-bold font-mono text-sm">
                    {whatIfData.penalties.length} applied
                  </span>
                  <span className="text-[10px] text-zinc-500 block">
                    Confidence: {whatIfData.confidence}
                  </span>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-1 overflow-hidden">
                  <div
                    className={`h-1 rounded-full ${whatIfData.penalties.length > 2 ? 'bg-rose-500' : whatIfData.penalties.length > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.max(10, Math.min(100, (1 - whatIfData.penalties.length / 8) * 100))}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* LATEST RUN DETAILS */}
      {currentRun && (
        <div className="space-y-6">
          {/* Top Score & Executive Summary Hero */}
          <Card className="p-6 border-zinc-800 bg-zinc-900/60">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              {/* Left: Gauge & Score */}
              <div className="flex items-center gap-6">
                <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      className="text-zinc-800 stroke-current"
                      strokeWidth="8"
                      fill="transparent"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      className={`stroke-current transition-all duration-1000 ${
                        currentRun.healthScore >= 80
                          ? 'text-emerald-500'
                          : currentRun.healthScore >= 60
                          ? 'text-amber-500'
                          : 'text-rose-500'
                      }`}
                      strokeWidth="8"
                      strokeDasharray={251.2}
                      strokeDashoffset={251.2 - (251.2 * currentRun.healthScore) / 100}
                      strokeLinecap="round"
                      fill="transparent"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-3xl font-extrabold text-zinc-100 tabular-nums">
                      {currentRun.healthScore}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider text-zinc-400 font-medium">
                      Health
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                        currentRun.label === 'Ready to launch'
                          ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/60'
                          : currentRun.label === 'Launch with fixes'
                          ? 'text-amber-400 bg-amber-950/60 border border-amber-800/60'
                          : 'text-rose-400 bg-rose-950/60 border border-rose-800/60'
                      }`}
                    >
                      {currentRun.label}
                    </span>
                    <span className="text-xs text-zinc-400 font-mono">
                      Confidence: <strong>{currentRun.confidence}</strong>
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-zinc-100">
                    Lineup Health & Risk Synthesis
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Tested across {currentRun.lineupCreatorIds.length} creators with {currentRun.penalties.length} risk penalties applied.
                  </p>
                </div>
              </div>

              {/* Right: Quick Lineup Action */}
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="text-right hidden sm:block">
                  <div className="text-[11px] text-zinc-500">Run Timestamp</div>
                  <div className="text-xs font-mono text-zinc-300">
                    {new Date(currentRun.createdAt).toLocaleString()}
                  </div>
                </div>

                {currentRun.approved ? (
                  <div className="px-3.5 py-2 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Approved for Execution
                  </div>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setShowApproveConfirm(true)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    Approve Lineup
                  </Button>
                )}
              </div>
            </div>

            {/* Executive Summary Narrative */}
            {currentRun.executiveSummary && (
              <div className="mt-5 p-4 rounded-xl bg-zinc-950/70 border border-zinc-800 space-y-1">
                <div className="text-[11px] uppercase tracking-wider font-semibold text-indigo-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  CMO Executive Risk Synthesis
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed italic">
                  "{currentRun.executiveSummary}"
                </p>
              </div>
            )}
          </Card>

          {/* Key Metric Comparison Row: Reach & Budget */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Reach Card */}
            <Card className="p-5 border-zinc-800 bg-zinc-900/50 space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  <Eye className="w-4 h-4 text-indigo-400" />
                  Audience Reach Deduplication
                </div>
                <span className="text-[11px] text-zinc-500 font-mono">
                  -{Math.round(currentRun.lineupMetrics.reachDeduplicationRatio * 100)}% Overlap
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-zinc-500 block">Raw Views (Summed)</span>
                  <span className="text-lg font-bold font-mono text-zinc-400">
                    {formatNumber(currentRun.lineupMetrics.rawReach)}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Overlap-Adjusted Reach</span>
                  <span className="text-lg font-bold font-mono text-emerald-400">
                    {formatNumber(currentRun.lineupMetrics.overlapAdjustedReach)}
                  </span>
                </div>
              </div>
              
              {/* Audience Uniqueness Progress Bar */}
              <div className="space-y-1 pt-1.5 border-t border-zinc-850">
                <div className="flex justify-between text-[11px] text-zinc-500">
                  <span>Audience Uniqueness Rate</span>
                  <span className="font-mono text-indigo-400 font-semibold">
                    {Math.round((1 - currentRun.lineupMetrics.reachDeduplicationRatio) * 100)}% unique
                  </span>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${Math.round((1 - currentRun.lineupMetrics.reachDeduplicationRatio) * 100)}%` }}
                  />
                </div>
              </div>

              <p className="text-[11px] text-zinc-500 pt-1">
                Adjusted by pairwise cross-audience Jaccard similarity. Prevents paying twice for identical viewers.
              </p>
            </Card>

            {/* Budget Card */}
            <Card className="p-5 border-zinc-800 bg-zinc-900/50 space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  Commercial Budget Allocation
                </div>
                <span
                  className={`text-[11px] font-semibold ${
                    currentRun.lineupMetrics.isOverBudget ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {currentRun.lineupMetrics.isOverBudget ? 'Exceeds Budget' : 'Within Budget'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-zinc-500 block">Est. Total Lineup Cost</span>
                  <span className="text-lg font-bold font-mono text-zinc-200">
                    {formatCurrency(currentRun.lineupMetrics.totalCostMidpoint)}
                  </span>
                  <span className="text-[10px] text-zinc-500 block font-mono">
                    ({formatCurrency(currentRun.lineupMetrics.totalCostLow)} - {formatCurrency(currentRun.lineupMetrics.totalCostHigh)})
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Target Campaign Budget</span>
                  <span className="text-lg font-bold font-mono text-zinc-200">
                    {formatCurrency(currentRun.lineupMetrics.budgetUsd)}
                  </span>
                  <span className="text-[10px] text-zinc-500 block">
                    Top creator: {Math.round(currentRun.lineupMetrics.largestCreatorCostShare * 100)}% of total
                  </span>
                </div>
              </div>

              {/* Budget Consumed Progress Bar */}
              {currentRun.lineupMetrics.budgetUsd > 0 && (
                <div className="space-y-1 pt-1.5 border-t border-zinc-850">
                  <div className="flex justify-between text-[11px] text-zinc-500">
                    <span>Budget Consumed</span>
                    <span className={`font-mono font-semibold ${currentRun.lineupMetrics.isOverBudget ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {Math.round((currentRun.lineupMetrics.totalCostMidpoint / currentRun.lineupMetrics.budgetUsd) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-500 ${currentRun.lineupMetrics.isOverBudget ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(100, Math.round((currentRun.lineupMetrics.totalCostMidpoint / currentRun.lineupMetrics.budgetUsd) * 100))}%` }}
                    />
                  </div>
                </div>
              )}

              <p className="text-[11px] text-zinc-500 pt-1">
                Single creator concentration &gt; 50% incurs a portfolio volatility penalty.
              </p>
            </Card>
          </div>

          {/* Overlap Heatmap Matrix */}
          <Card className="p-5 border-zinc-800 bg-zinc-900/50 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
              <div>
                <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-400" />
                  Audience Overlap Heatmap Matrix
                </h3>
                <p className="text-xs text-zinc-400">
                  Estimated pairwise audience overlap between all creators in the lineup. Click any cell for raw telemetry.
                </p>
              </div>
              <div className="text-[11px] text-zinc-500 italic">
                *Estimated overlap based on public comment authors & semantic embeddings
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-center border-collapse">
                <thead>
                  <tr>
                    <th className="p-2 text-left text-zinc-400 font-semibold max-w-[120px] truncate">
                      Creator
                    </th>
                    {lineupCreatorObjects.map((c) => (
                      <th
                        key={c.id}
                        className="p-2 text-zinc-300 font-medium max-w-[100px] truncate"
                        title={c.channel?.title || c.normalizedKey}
                      >
                        {c.channel?.title || c.normalizedKey}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineupCreatorObjects.map((rowCreator) => (
                    <tr key={rowCreator.id} className="border-t border-zinc-800/50">
                      <td className="p-2 text-left font-semibold text-zinc-200 max-w-[120px] truncate">
                        {rowCreator.channel?.title || rowCreator.normalizedKey}
                      </td>
                      {lineupCreatorObjects.map((colCreator) => {
                        if (rowCreator.id === colCreator.id) {
                          return (
                            <td key={colCreator.id} className="p-2 bg-zinc-800/20 text-zinc-600 font-mono">
                              100%
                            </td>
                          );
                        }

                        const pair = pairwiseLookup.get(`${rowCreator.id}_${colCreator.id}`);
                        const overlap = pair ? pair.pairOverlap : 0;

                        // Color coding
                        let bgClass = 'bg-zinc-900/60 text-zinc-300';
                        if (overlap >= 60) bgClass = 'bg-rose-950/80 text-rose-300 font-bold border border-rose-800/60';
                        else if (overlap >= 40) bgClass = 'bg-amber-950/70 text-amber-300 font-bold border border-amber-800/60';
                        else if (overlap >= 20) bgClass = 'bg-indigo-950/50 text-indigo-300';

                        return (
                          <td key={colCreator.id} className="p-1">
                            <button
                              type="button"
                              onClick={() => pair && setSelectedCellPair(pair)}
                              className={`w-full py-1.5 px-2 rounded font-mono text-xs transition-transform hover:scale-105 ${bgClass}`}
                              title="Click to view signal breakdown"
                            >
                              {overlap}%
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Overlap Legend */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-[11px] text-zinc-400 border-t border-zinc-800/60">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-zinc-800 border border-zinc-700 inline-block" />
                  &lt; 20% (Low overlap)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-indigo-950 border border-indigo-800 inline-block" />
                  20-40% (Acceptable)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-amber-950 border border-amber-800 inline-block" />
                  40-60% (-8 pts penalty)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-rose-950 border border-rose-800 inline-block" />
                  &gt; 60% (-15 pts penalty)
                </span>
              </div>
              <span className="italic">Click any cell to inspect evidence</span>
            </div>
          </Card>

          {/* Itemized Risk Penalties List */}
          <Card className="p-5 border-zinc-800 bg-zinc-900/50 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
              <div>
                <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Itemized Health Score Penalties ({currentRun.penalties.length})
                </h3>
                <p className="text-xs text-zinc-400">
                  Deterministic audit penalties subtracted from base 100.
                </p>
              </div>
              <div className="text-xs font-mono text-zinc-400">
                Total Subtractions: -{100 - currentRun.healthScore} pts
              </div>
            </div>

            {currentRun.penalties.length === 0 ? (
              <div className="p-4 rounded-lg bg-emerald-950/20 border border-emerald-900/40 text-xs text-emerald-300 flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Zero penalties incurred. Lineup passed all commercial safety and overlap thresholds.</span>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/60">
                {currentRun.penalties.map((penalty, idx) => (
                  <div key={idx} className="py-2.5 flex items-start justify-between gap-4 text-xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
                          {penalty.category}
                        </span>
                        <span className="text-zinc-200 font-medium">{penalty.reason}</span>
                      </div>
                    </div>
                    <span className="text-rose-400 font-bold font-mono text-sm shrink-0">
                      -{penalty.penalty} pts
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* AI Identified Risks & Mitigation Suggestions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Risks List */}
            <Card className="p-5 border-zinc-800 bg-zinc-900/50 space-y-4">
              <div className="border-b border-zinc-800/80 pb-2">
                <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  Identified Campaign Vulnerabilities
                </h3>
                <p className="text-xs text-zinc-400">AI-audited failure modes grounded in verified data.</p>
              </div>

              <div className="space-y-3">
                {currentRun.risks.length === 0 ? (
                  <p className="text-xs text-zinc-500 italic">No significant vulnerabilities detected.</p>
                ) : (
                  currentRun.risks.map((risk, idx) => {
                    const isExpanded = expandedRiskIdx === idx;
                    return (
                      <div
                        key={idx}
                        className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800 space-y-2 text-xs"
                      >
                        <div
                          className="flex items-start justify-between gap-2 cursor-pointer"
                          onClick={() => setExpandedRiskIdx(isExpanded ? null : idx)}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                risk.severity === 'high'
                                  ? 'bg-rose-950 text-rose-400 border border-rose-800/60'
                                  : risk.severity === 'medium'
                                  ? 'bg-amber-950 text-amber-400 border border-amber-800/60'
                                  : 'bg-zinc-800 text-zinc-300'
                              }`}
                            >
                              {risk.severity}
                            </span>
                            <span className="font-semibold text-zinc-200 uppercase tracking-wide text-[11px]">
                              {risk.category}
                            </span>
                          </div>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                        </div>

                        <p className="text-zinc-300 leading-relaxed">{risk.explanation}</p>

                        {isExpanded && (
                          <div className="pt-2 border-t border-zinc-800/80 space-y-1 text-[11px]">
                            <div className="text-indigo-400 font-semibold">Recommended Mitigation:</div>
                            <p className="text-zinc-400">{risk.recommendation}</p>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </Card>

            {/* Lineup Suggestions with Apply Buttons */}
            <Card className="p-5 border-zinc-800 bg-zinc-900/50 space-y-4">
              <div className="border-b border-zinc-800/80 pb-2">
                <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  Recommended Lineup Actions
                </h3>
                <p className="text-xs text-zinc-400">One-click lineup optimizations to recover score.</p>
              </div>

              <div className="space-y-3">
                {currentRun.suggestions.length === 0 ? (
                  <p className="text-xs text-zinc-500 italic">No alternative suggestions needed for this lineup.</p>
                ) : (
                  currentRun.suggestions.map((sug, idx) => {
                    const targetCreator = creators.find((c) => c.id === sug.creatorId);
                    const repCreator = creators.find((c) => c.id === sug.replacementCreatorId);

                    return (
                      <div
                        key={idx}
                        className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-300 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/60">
                            {sug.action}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => applySuggestion(sug)}
                            className="text-[11px] h-6 px-2 text-indigo-400 border-indigo-800/60 hover:bg-indigo-950/40"
                          >
                            Apply in Sandbox
                          </Button>
                        </div>

                        <p className="text-zinc-300 leading-relaxed">{sug.rationale}</p>

                        {(targetCreator || repCreator) && (
                          <div className="text-[11px] text-zinc-500 pt-1 flex items-center gap-1.5">
                            {targetCreator && <span>Target: {targetCreator.channel?.title || targetCreator.normalizedKey}</span>}
                            {repCreator && <span>&rarr; Replacement: {repCreator.channel?.title || repCreator.normalizedKey}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </div>

          {/* Run History & Comparison Bar */}
          <Card className="p-5 border-zinc-800 bg-zinc-900/50 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
              <div>
                <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  Pre-Mortem Simulation Run History ({runs.length})
                </h3>
                <p className="text-xs text-zinc-400">
                  Select any historical run to inspect, or pick two runs to compare side-by-side.
                </p>
              </div>

              {compareRunIds.length === 2 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCompareRuns(undefined, undefined)}
                  className="text-xs text-zinc-400"
                >
                  Exit Compare Mode
                </Button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-zinc-950/70 text-zinc-400 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3 text-center">Health Score</th>
                    <th className="py-2.5 px-3 text-center">Lineup Size</th>
                    <th className="py-2.5 px-3 text-right">Adj. Reach</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {runs.map((r) => {
                    const isSelected = r.id === currentRun.id;
                    const isCompared = compareRunIds.includes(r.id);

                    return (
                      <tr
                        key={r.id}
                        className={`hover:bg-zinc-800/30 transition-colors ${
                          isSelected ? 'bg-indigo-950/20' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          {r.approved ? (
                            <span className="text-emerald-400 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                            </span>
                          ) : (
                            <span className="text-zinc-500">Historical</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-zinc-300 font-mono">
                          {new Date(r.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex flex-col items-center justify-center gap-1">
                            <span
                              className={`font-bold font-mono ${
                                r.healthScore >= 80
                                  ? 'text-emerald-400'
                                  : r.healthScore >= 60
                                  ? 'text-amber-400'
                                  : 'text-rose-400'
                              }`}
                            >
                              {r.healthScore}/100
                            </span>
                            <div className="w-16 bg-zinc-800 rounded-full h-1 overflow-hidden">
                              <div
                                className={`h-1 rounded-full ${
                                  r.healthScore >= 80
                                    ? 'bg-emerald-500'
                                    : r.healthScore >= 60
                                    ? 'bg-amber-500'
                                    : 'bg-rose-500'
                                }`}
                                style={{ width: `${r.healthScore}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center text-zinc-400">
                          {r.lineupCreatorIds.length} creators
                        </td>
                        <td className="py-2.5 px-3 text-right text-zinc-300 font-mono">
                          {formatNumber(r.lineupMetrics.overlapAdjustedReach)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              to={`/campaigns/${campaignId}/premortem/runs/${r.id}`}
                              className="text-xs text-indigo-400 hover:underline"
                            >
                              View Run
                            </Link>

                            <button
                              onClick={() => {
                                if (compareRunIds.includes(r.id)) {
                                  setCompareRuns(undefined, undefined);
                                } else if (compareRunIds.length === 1) {
                                  setCompareRuns(compareRunIds[0], r.id);
                                } else {
                                  setCompareRuns(currentRun.id, r.id);
                                }
                              }}
                              className={`text-xs px-2 py-0.5 rounded border ${
                                isCompared
                                  ? 'bg-indigo-600 text-white border-indigo-500'
                                  : 'text-zinc-400 border-zinc-800 hover:text-zinc-200'
                              }`}
                            >
                              Compare
                            </button>

                            {!r.approved && (
                              <button
                                onClick={() => deleteRunMutation.mutate(r.id)}
                                className="text-zinc-500 hover:text-rose-400 p-1"
                                title="Delete run"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* SIDE-BY-SIDE RUN COMPARISON MODAL */}
      {run1 && run2 && (
        <Dialog
          isOpen={Boolean(run1 && run2)}
          onClose={() => setCompareRuns(undefined, undefined)}
          title="Side-by-Side Pre-Mortem Comparison"
        >
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 text-xs">
              {/* Run 1 */}
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                <div className="border-b border-zinc-800/80 pb-2">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
                    Run A • {new Date(run1.createdAt).toLocaleDateString()}
                  </div>
                  <div className="text-2xl font-bold text-zinc-100">{run1.healthScore}/100</div>
                  <div className="text-xs text-zinc-400 font-semibold">{run1.label}</div>
                </div>
                <div>
                  <span className="text-zinc-500 block">Deduplicated Reach:</span>
                  <span className="font-mono font-bold text-zinc-200">
                    {formatNumber(run1.lineupMetrics.overlapAdjustedReach)} views
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Total Estimated Cost:</span>
                  <span className="font-mono font-bold text-zinc-200">
                    {formatCurrency(run1.lineupMetrics.totalCostMidpoint)}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Penalties Incurred:</span>
                  <span className="font-mono font-bold text-rose-400">
                    {run1.penalties.length} penalties (-{100 - run1.healthScore} pts)
                  </span>
                </div>
              </div>

              {/* Run 2 */}
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                <div className="border-b border-zinc-800/80 pb-2">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
                    Run B • {new Date(run2.createdAt).toLocaleDateString()}
                  </div>
                  <div className="text-2xl font-bold text-zinc-100">{run2.healthScore}/100</div>
                  <div className="text-xs text-zinc-400 font-semibold">{run2.label}</div>
                </div>
                <div>
                  <span className="text-zinc-500 block">Deduplicated Reach:</span>
                  <span className="font-mono font-bold text-zinc-200">
                    {formatNumber(run2.lineupMetrics.overlapAdjustedReach)} views
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Total Estimated Cost:</span>
                  <span className="font-mono font-bold text-zinc-200">
                    {formatCurrency(run2.lineupMetrics.totalCostMidpoint)}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Penalties Incurred:</span>
                  <span className="font-mono font-bold text-rose-400">
                    {run2.penalties.length} penalties (-{100 - run2.healthScore} pts)
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => setCompareRuns(undefined, undefined)}>
                Close Comparison
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Cell Overlap Telemetry Modal */}
      <Dialog
        isOpen={Boolean(selectedCellPair)}
        onClose={() => setSelectedCellPair(null)}
        title={`Audience Overlap: ${selectedCellPair?.creatorNameA} & ${selectedCellPair?.creatorNameB}`}
      >
        {selectedCellPair && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-lg bg-zinc-950/80 border border-zinc-800 flex items-center justify-between">
              <div>
                <div className="text-zinc-500 uppercase text-[10px] font-semibold">Estimated Overlap</div>
                <div className="text-2xl font-bold text-zinc-100 font-mono">
                  {selectedCellPair.pairOverlap}%
                </div>
              </div>
              <div className="text-right">
                <span className="text-zinc-500 block text-[10px]">Signals Used</span>
                <span className="font-mono text-indigo-400">{selectedCellPair.signalsUsed.join(' + ')}</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-zinc-400 font-semibold uppercase text-[10px]">Signal Contribution Breakdown</div>
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                  <span className="text-zinc-500 block text-[10px]">Commenter Jaccard</span>
                  <span className="font-mono text-zinc-200 font-bold">
                    {selectedCellPair.commenterOverlap !== null
                      ? `${selectedCellPair.commenterOverlap}%`
                      : 'Insufficient (< 30)'}
                  </span>
                </div>
                <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                  <span className="text-zinc-500 block text-[10px]">Content Cosine</span>
                  <span className="font-mono text-zinc-200 font-bold">
                    {selectedCellPair.contentSimilarity !== null
                      ? `${selectedCellPair.contentSimilarity}%`
                      : 'N/A'}
                  </span>
                </div>
                <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                  <span className="text-zinc-500 block text-[10px]">Tags / Topics</span>
                  <span className="font-mono text-zinc-200 font-bold">
                    {selectedCellPair.tagOverlap !== null ? `${selectedCellPair.tagOverlap}%` : '0%'}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3 rounded bg-zinc-950/70 border border-zinc-800/80 space-y-1 text-zinc-400">
              <span className="font-semibold text-zinc-300 block text-[11px]">Methodology & Honesty Disclosure</span>
              <p className="leading-relaxed">{selectedCellPair.methodExplanation}</p>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedCellPair(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* "How We Estimate This" Modal */}
      <Dialog
        isOpen={showHowItWorks}
        onClose={() => setShowHowItWorks(false)}
        title="Pre-Mortem Audience Overlap Methodology"
      >
        <div className="space-y-4 text-xs text-zinc-300 leading-relaxed">
          <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-800/50 text-amber-200 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="block mb-0.5">Honesty Rule</strong>
              YouTube does not reveal private audience demographics or exact viewer overlaps for channels we do not own. All overlap statistics are labeled as <em>Estimated Overlap</em>.
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-zinc-100 font-semibold text-sm">Three-Signal Weighted Triangulation:</h4>
            <ul className="list-disc pl-5 space-y-1.5 text-zinc-400">
              <li>
                <strong className="text-zinc-200">Commenter Overlap (50% weight):</strong> Computes Jaccard set similarity across unique top-level commenter IDs sampled across recent videos. If either creator has fewer than 30 unique commenters, this signal is marked insufficient and excluded.
              </li>
              <li>
                <strong className="text-zinc-200">Video Semantic Similarity (30% weight):</strong> Generates high-dimensional vector embeddings for recent video titles and descriptions, computing pairwise cosine similarity.
              </li>
              <li>
                <strong className="text-zinc-200">Tag & Topic Overlap (20% weight):</strong> Jaccard set similarity of channel tags and YouTube topic categories.
              </li>
            </ul>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-zinc-800">
            <h4 className="text-zinc-100 font-semibold text-sm">Adaptive Weight Re-Normalization:</h4>
            <p className="text-zinc-400">
              When a creator lacks comment data or disables comments, the weights automatically re-normalize across the remaining available signals (e.g., 60% content embeddings, 40% tags) rather than guessing or breaking.
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowHowItWorks(false)}>
              Got It
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Approve Lineup Confirmation Dialog */}
      <Dialog
        isOpen={showApproveConfirm}
        onClose={() => setShowApproveConfirm(false)}
        title="Approve Creator Lineup for Execution"
      >
        <div className="space-y-4 text-xs text-zinc-300">
          <p>
            Approving this lineup commits{' '}
            <strong className="text-zinc-100">{currentRun?.lineupCreatorIds.length} creators</strong> as the
            official campaign commercial lineup based on Pre-Mortem Run with Health Score{' '}
            <strong className="text-emerald-400">{currentRun?.healthScore}/100</strong>.
          </p>
          <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 space-y-1">
            <div className="text-zinc-400 font-medium">Approval Impact:</div>
            <ul className="list-disc pl-4 space-y-1 text-zinc-400">
              <li>Marks Step 4 complete in campaign stepper.</li>
              <li>Unlocks Step 5 (Creator Briefs & Deliverable contracts).</li>
              <li>If the lineup is modified in the future, a new Pre-Mortem run must be approved.</li>
            </ul>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowApproveConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={approveRunMutation.isPending}
              onClick={async () => {
                if (!currentRun) return;
                await approveRunMutation.mutateAsync(currentRun.id);
                setShowApproveConfirm(false);
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              Confirm & Approve Lineup
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
