import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Search,
  Sparkles,
  Plus,
  Play,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  DollarSign,
  Filter,
  ArrowUpDown,
  MoreVertical,
  Trash2,
  RefreshCw,
  FileEdit,
  X,
  Sliders,
  Check,
  LayoutGrid,
  List,
  Activity,
  AlertTriangle,
  Info,
} from 'lucide-react';
import {
  Button,
  Card,
  Input,
  Badge,
  Dialog,
} from '../common/UIComponents.tsx';
import {
  useCampaign,
  useCampaignBrief,
} from '../../hooks/useCampaigns.ts';
import {
  useCreators,
  useCreatorMutations,
  useActiveDiscoveryJob,
  useQuotaStatus,
} from '../../hooks/useCreators.ts';
import { apiClient } from '../../lib/api.ts';
import {
  Creator,
  CreatorQuery,
  CreatorTier,
  CreatorValidationResult,
  Job,
} from '@/shared/types.ts';
import { formatNumber, formatCurrency, formatPercent } from '@/shared/format.ts';
import { CONFIG } from '@/shared/config.ts';
import { SEO } from '../common/SEO.tsx';

const SAMPLE_CREATOR_INPUTS = `@jameshoffmann
@lancehedrick
@brianquan
@morganandrtd`;

interface SinglePreviewData {
  valid: boolean;
  inputType?: string;
  normalizedKey?: string;
  isDuplicate?: boolean;
  channel?: {
    channelId: string;
    title: string;
    description: string;
    customUrl?: string;
    avatarUrl?: string;
    subscriberCount: number | null;
    hiddenSubscriberCount: boolean;
    videoCount: number;
    viewCount: number;
  };
}

export function CreatorsPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read sort & tier filter from URL query params
  const tierFilter = (searchParams.get('tier') as string) || 'all';
  const sortField = (searchParams.get('sort') as CreatorQuery['sort']) || 'fitScore';
  const sortOrder = (searchParams.get('order') as CreatorQuery['order']) || 'desc';
  const selectedOnly = searchParams.get('selectedOnly') === 'true';
  const searchQuery = searchParams.get('q') || '';
  const viewMode = (searchParams.get('view') as 'table' | 'cards') || 'table';

  const updateParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, val]) => {
      if (val === null || val === '') next.delete(key);
      else next.set(key, val);
    });
    setSearchParams(next);
  };

  const { data: campaign } = useCampaign(campaignId);
  const { data: briefData } = useCampaignBrief(campaignId);
  const { data: quota } = useQuotaStatus(campaignId);

  const { data: activeJob } = useActiveDiscoveryJob(campaignId);

  // Invalidate creators list when background job finishes
  const prevJobRef = useRef<boolean>(false);
  useEffect(() => {
    const hadJob = prevJobRef.current;
    const hasJob = Boolean(activeJob);
    if (hadJob && !hasJob && campaignId) {
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId, 'creators'] });
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
    }
    prevJobRef.current = hasJob;
  }, [activeJob, campaignId, queryClient]);

  // Unfiltered creators list for total candidate count and single-creator detection
  const { data: allCampaignCreators = [] } = useCreators(campaignId);

  const { data: rawCreators = [], isLoading: isCreatorsLoading } = useCreators(
    campaignId,
    {
      tier: tierFilter !== 'unanalyzed' ? (tierFilter as CreatorTier) : undefined,
      sort: sortField,
      order: sortOrder,
    }
  );

  const {
    addCreatorMutation,
    bulkAddMutation,
    updateCreatorMutation,
    deleteCreatorMutation,
    runDiscoveryMutation,
    analyzeSingleMutation,
    selectRecommendedMutation,
    batchActionMutation,
    checkBudgetFitMutation,
  } = useCreatorMutations(campaignId);

  // Dialog states
  const [showAddModal, setShowAddModal] = useState(false);
  const [addTab, setAddTab] = useState<'single' | 'bulk'>('single');

  // Single creator state
  const [singleInput, setSingleInput] = useState('');
  const [singlePreview, setSinglePreview] = useState<SinglePreviewData | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Bulk creator state
  const [bulkInputText, setBulkInputText] = useState('');
  const [liveValidation, setLiveValidation] = useState<CreatorValidationResult[]>([]);
  const [isValidating, setIsValidating] = useState(false);

  // Multi-select for batch actions
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  // Edit notes/tags modal
  const [editingCreator, setEditingCreator] = useState<Creator | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Creator | null>(null);

  // Debounced live single preview
  useEffect(() => {
    if (!showAddModal || addTab !== 'single' || !singleInput.trim()) {
      setSinglePreview(null);
      setPreviewError(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsPreviewLoading(true);
      setPreviewError(null);
      try {
        const res = await apiClient<SinglePreviewData>(
          `/api/v1/campaigns/${campaignId}/creators/preview`,
          {
            method: 'POST',
            body: JSON.stringify({ input: singleInput.trim() }),
          }
        );
        setSinglePreview(res);
      } catch (err: any) {
        setPreviewError(err.message || 'Could not resolve channel');
        setSinglePreview(null);
      } finally {
        setIsPreviewLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [singleInput, showAddModal, addTab, campaignId]);

  // Live input validation in Bulk Add modal (debounced)
  useEffect(() => {
    if (!showAddModal || addTab !== 'bulk' || !bulkInputText.trim()) {
      setLiveValidation([]);
      return;
    }

    const timer = setTimeout(async () => {
      const lines = bulkInputText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      if (lines.length === 0) {
        setLiveValidation([]);
        return;
      }

      setIsValidating(true);
      try {
        const res = await apiClient<{ results: CreatorValidationResult[] }>(
          `/api/v1/campaigns/${campaignId}/creators/validate-inputs`,
          {
            method: 'POST',
            body: JSON.stringify({ inputs: lines }),
          }
        );
        setLiveValidation(res.results);
      } catch {
        // Fallback
      } finally {
        setIsValidating(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [bulkInputText, showAddModal, addTab, campaignId]);

  // Handle Single Add
  const handleSingleAdd = async () => {
    if (!singleInput.trim()) return;
    await addCreatorMutation.mutateAsync({ input: singleInput.trim() });
    setShowAddModal(false);
    setSingleInput('');
    setSinglePreview(null);
  };

  // Handle Bulk Add submit
  const handleBulkAdd = async () => {
    const validLines = liveValidation.filter((r) => r.status === 'valid').map((r) => r.raw);
    if (validLines.length === 0) return;

    await bulkAddMutation.mutateAsync({ inputs: validLines });
    setShowAddModal(false);
    setBulkInputText('');
    setLiveValidation([]);
  };

  // Client-side filtering for search query, selectedOnly, and 'unanalyzed'
  const filteredCreators = useMemo(() => {
    return rawCreators.filter((c) => {
      if (selectedOnly && !c.selected) return false;
      if (tierFilter === 'unanalyzed' && c.status === 'analyzed') return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const title = c.channel?.title?.toLowerCase() || '';
        const handle = c.channel?.customUrl?.toLowerCase() || c.normalizedKey.toLowerCase();
        const notes = c.notes?.toLowerCase() || '';
        if (!title.includes(q) && !handle.includes(q) && !notes.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [rawCreators, selectedOnly, tierFilter, searchQuery]);

  // Multi-select management
  const allFilteredSelected =
    filteredCreators.length > 0 && filteredCreators.every((c) => checkedIds.has(c.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(filteredCreators.map((c) => c.id)));
    }
  };

  const toggleCheckOne = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Batch actions
  const handleBatchAction = async (action: 'select' | 'deselect' | 'remove' | 'reanalyze') => {
    const ids = Array.from(checkedIds);
    if (ids.length === 0) return;
    await batchActionMutation.mutateAsync({ action, creatorIds: ids });
    setCheckedIds(new Set());
  };

  // Smart Action: 1 creator (Check Budget Fit) vs 2+ creators (Run Discovery)
  const effectiveCandidateList = allCampaignCreators.length > 0 ? allCampaignCreators : rawCreators;
  const totalCandidateCount = effectiveCandidateList.length;
  const isSingleCreator = totalCandidateCount === 1;
  const singleCreator = isSingleCreator ? effectiveCandidateList[0] : null;
  const isBriefValid = Boolean(briefData?.isComplete);
  const isJobRunning = Boolean(activeJob);

  const canRunAction = isBriefValid && totalCandidateCount > 0 && !isJobRunning;

  let actionTooltip = '';
  if (!isBriefValid) actionTooltip = 'Complete the Campaign Brief first';
  else if (totalCandidateCount === 0) actionTooltip = 'Add candidate creators first';
  else if (isJobRunning) actionTooltip = 'Discovery job currently running';
  else if (isSingleCreator) actionTooltip = 'Check budget fit: Quick estimate of video cost vs campaign budget without pairwise ranking';
  else actionTooltip = 'Run full multi-factor scoring, Gemini AI vetting, and pairwise ranking across all candidates';

  const handlePrimaryAction = () => {
    if (isSingleCreator && singleCreator) {
      checkBudgetFitMutation.mutate(singleCreator.id);
    } else {
      runDiscoveryMutation.mutate({ force: false });
    }
  };

  // Discovery summary calculations
  const analyzedCreators = useMemo(
    () => rawCreators.filter((c) => c.status === 'analyzed'),
    [rawCreators]
  );
  const strongCount = analyzedCreators.filter((c) => c.scores?.tier === 'Strong fit').length;
  const possibleCount = analyzedCreators.filter((c) => c.scores?.tier === 'Possible fit').length;
  const weakCount = analyzedCreators.filter((c) => c.scores?.tier === 'Weak fit').length;

  const topCreator = useMemo(() => {
    if (analyzedCreators.length === 0) return null;
    return [...analyzedCreators].sort((a, b) => (b.scores?.fitScore || 0) - (a.scores?.fitScore || 0))[0];
  }, [analyzedCreators]);

  // Budget calculations for selected creators
  const campaignBudget = (campaign?.brief as any)?.budgetUsd || 10000;
  const selectedCreators = useMemo(() => rawCreators.filter((c) => c.selected), [rawCreators]);
  const totalEstimatedCost = useMemo(() => {
    return selectedCreators.reduce((acc, c) => {
      const midpoint = c.metrics
        ? (c.metrics.estimatedCostPerVideoUsd.low + c.metrics.estimatedCostPerVideoUsd.high) / 2
        : 0;
      return acc + midpoint;
    }, 0);
  }, [selectedCreators]);

  const isOverBudget = totalEstimatedCost > campaignBudget;

  // Toggle selection for lineup
  const handleToggleSelect = (creator: Creator) => {
    updateCreatorMutation.mutate({
      creatorId: creator.id,
      version: creator.version,
      updates: { selected: !creator.selected },
    });
  };

  // Cancel running job
  const handleCancelJob = async () => {
    if (!activeJob) return;
    try {
      await apiClient(`/api/v1/jobs/${activeJob.id}/cancel`, { method: 'POST' });
    } catch {}
  };

  // Open Edit Modal
  const openEditModal = (c: Creator) => {
    setEditingCreator(c);
    setEditNotes(c.notes || '');
    setEditTags(c.tags || []);
  };

  const handleSaveEdit = async () => {
    if (!editingCreator) return;
    await updateCreatorMutation.mutateAsync({
      creatorId: editingCreator.id,
      version: editingCreator.version,
      updates: { notes: editNotes, tags: editTags },
    });
    setEditingCreator(null);
  };

  const isStepComplete = analyzedCreators.length >= 2 && selectedCreators.length >= 2;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-24">
      <SEO
        title={campaign ? `${campaign.name} — Creators (Step 3)` : 'Creator Discovery & Fit Scoring — Step 3'}
        description="Discover, score, and shortlist YouTube creators using multi-factor AI analysis and channel telemetry."
      />
      {/* Top Header & Action Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-950/60 text-indigo-400 border border-indigo-800/60">
              Phase 3 • Step 3
            </span>
            {isStepComplete ? (
              <Badge variant="active" className="text-xs">
                <CheckCircle2 className="w-3 h-3 text-emerald-400 inline mr-1" />
                Lineup Vetted ({selectedCreators.length} Selected)
              </Badge>
            ) : (
              <Badge variant="draft" className="text-xs">
                Discovery & Scoring
              </Badge>
            )}

            {/* Quota Indicator */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono bg-zinc-900 border border-zinc-800 text-zinc-400">
              <Activity className="w-3 h-3 text-indigo-400" />
              <span>YouTube API units used today: {quota?.used ?? 0} / {quota?.limit ?? 10000}</span>
            </div>
          </div>

          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-bold text-zinc-100">Candidate Creators</h1>
            <span className="text-sm text-zinc-400">({rawCreators.length} total)</span>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Vet, score, and select creator partners using YouTube channel telemetry and AI risk simulation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddModal(true)}
            icon={Plus}
          >
            Add Creators
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => selectRecommendedMutation.mutate()}
            isLoading={selectRecommendedMutation.isPending}
            icon={Sparkles}
            className="text-amber-300 border-amber-800/50 hover:bg-amber-950/30"
          >
            Select Recommended
          </Button>

          <div title={actionTooltip}>
            <Button
              variant="primary"
              size="sm"
              disabled={!canRunAction}
              isLoading={
                isSingleCreator
                  ? checkBudgetFitMutation.isPending
                  : runDiscoveryMutation.isPending || isJobRunning
              }
              onClick={handlePrimaryAction}
              icon={isSingleCreator ? DollarSign : Play}
              className="gap-2 shadow-lg shadow-indigo-600/20"
            >
              {isSingleCreator
                ? checkBudgetFitMutation.isPending
                  ? 'Checking Budget...'
                  : 'Check Budget Fit'
                : isJobRunning || runDiscoveryMutation.isPending
                ? 'Running Discovery...'
                : 'Run Discovery'}
            </Button>
          </div>
        </div>
      </div>

      {/* Single Creator Quick-Fit Tip */}
      {isSingleCreator && !activeJob && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-indigo-950/30 border border-indigo-800/40 text-xs text-indigo-300">
          <Info className="w-4 h-4 shrink-0 text-indigo-400" />
          <span>
            Single creator mode active: Click <strong>"Check Budget Fit"</strong> for a fast telemetry and budget evaluation. Add 2 or more creators to enable multi-factor comparative AI ranking.
          </span>
        </div>
      )}

      {/* Discovery Summary Banner (if discovery has run) */}
      {analyzedCreators.length > 0 && (
        <Card className="p-4 bg-gradient-to-r from-zinc-900 via-indigo-950/20 to-zinc-900 border border-indigo-900/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start md:items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-zinc-100">
                {analyzedCreators.length} analyzed: {strongCount} Strong Fit, {possibleCount} Possible, {weakCount} Weak.
                {topCreator && (
                  <span className="ml-1 text-zinc-300">
                    Top recommendation: <strong className="text-emerald-400">{topCreator.channel?.title || topCreator.normalizedKey}</strong> ({topCreator.scores?.fitScore ?? 0})
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Vetted across 8 quantitative and qualitative dimensions with verified video citations.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => selectRecommendedMutation.mutate()}
            isLoading={selectRecommendedMutation.isPending}
            className="text-xs text-amber-300 border-amber-800/50 hover:bg-amber-950/40 shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1" />
            Select Recommended (Top 5)
          </Button>
        </Card>
      )}

      {/* Discovery Running Progress Banner */}
      {activeJob && (
        <Card className="p-4 border-indigo-500/60 bg-gradient-to-r from-indigo-950/40 via-zinc-900 to-indigo-950/40 space-y-3 shadow-lg shadow-indigo-950/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center shrink-0">
                <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin" />
                <Sparkles className="w-3.5 h-3.5 text-indigo-400 absolute" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-semibold text-zinc-100">
                    Discovery & Fit Scoring in Progress
                  </h4>
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-mono font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Live Engine
                  </span>
                </div>
                <p className="text-xs text-indigo-200/80 mt-0.5 font-mono">
                  {activeJob.progress?.message || 'Analyzing candidate creators against campaign brief...'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 self-end sm:self-auto">
              <span className="text-xs font-mono font-semibold text-indigo-300 bg-indigo-950/80 px-2.5 py-1 rounded border border-indigo-800/60">
                {activeJob.progress?.done ?? 0}%
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelJob}
                className="text-xs text-zinc-400 hover:text-rose-400 hover:bg-rose-950/30"
              >
                Cancel Job
              </Button>
            </div>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-zinc-800/80 rounded-full h-2 overflow-hidden p-0.5 border border-zinc-700/50">
            <div
              className="bg-gradient-to-r from-indigo-500 to-indigo-400 h-full rounded-full transition-all duration-300 shadow-sm shadow-indigo-500/50"
              style={{ width: `${Math.max(activeJob.progress?.done || 5, 5)}%` }}
            />
          </div>
        </Card>
      )}

      {/* Commercial Lineup Bar (Budget vs Estimated Cost) */}
      <Card className="p-4 border-zinc-800 bg-zinc-900/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">
              Selected Lineup
            </div>
            <div className="text-lg font-bold text-zinc-100 tabular-nums">
              {selectedCreators.length}{' '}
              <span className="text-xs font-normal text-zinc-500">/ {rawCreators.length} total</span>
            </div>
          </div>

          <div className="h-8 w-px bg-zinc-800" />

          <div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">
              Lineup Estimated Cost
            </div>
            <div className={`text-lg font-bold tabular-nums ${isOverBudget ? 'text-rose-400' : 'text-emerald-400'}`}>
              {formatCurrency(totalEstimatedCost)}
            </div>
          </div>

          <div className="h-8 w-px bg-zinc-800" />

          <div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">
              Campaign Budget
            </div>
            <div className="text-lg font-bold text-zinc-100 tabular-nums">
              {formatCurrency(campaignBudget)}
            </div>
          </div>
        </div>

        {isOverBudget && (
          <div className="flex items-center gap-2 text-xs text-rose-300 bg-rose-950/40 border border-rose-800/60 px-3 py-1.5 rounded-lg">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>Selected lineup exceeds budget by {formatCurrency(totalEstimatedCost - campaignBudget)}</span>
          </div>
        )}
      </Card>

      {/* Filter & Sort Controls Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
        {/* Tier filter tabs */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-lg">
          {[
            { id: 'all', label: 'All' },
            { id: 'Strong fit', label: 'Strong' },
            { id: 'Possible fit', label: 'Possible' },
            { id: 'Weak fit', label: 'Weak' },
            { id: 'unanalyzed', label: 'Unanalyzed' },
          ].map((tier) => {
            const isActive = tierFilter === tier.id;
            return (
              <button
                key={tier.id}
                onClick={() => updateParams({ tier: tier.id === 'all' ? null : tier.id })}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  isActive
                    ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tier.label}
              </button>
            );
          })}
        </div>

        {/* Search, Selected Only, Sort & View Mode Toggle */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search creators..."
              value={searchQuery}
              onChange={(e) => updateParams({ q: e.target.value || null })}
              className="h-8 pl-8 pr-3 rounded-lg border border-zinc-800 bg-zinc-900 text-xs text-zinc-200 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 w-40 sm:w-48"
            />
          </div>

          {/* Selected Only toggle */}
          <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer select-none bg-zinc-900 border border-zinc-800 h-8 px-2.5 rounded-lg">
            <input
              type="checkbox"
              checked={selectedOnly}
              onChange={(e) => updateParams({ selectedOnly: e.target.checked ? 'true' : null })}
              className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-800 text-indigo-600 focus:ring-0 cursor-pointer"
            />
            <span>Selected only</span>
          </label>

          {/* Sort Controls */}
          <div className="flex items-center gap-1.5">
            <select
              value={sortField}
              onChange={(e) => updateParams({ sort: e.target.value })}
              className="h-8 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
            >
              <option value="fitScore">Sort: Fit Score</option>
              <option value="subscribers">Sort: Subscribers</option>
              <option value="medianViews">Sort: Median Views</option>
              <option value="engagementRate">Sort: Engagement</option>
              <option value="name">Sort: Alphabetical</option>
              <option value="createdAt">Sort: Date Added</option>
            </select>

            <button
              onClick={() => updateParams({ order: sortOrder === 'asc' ? 'desc' : 'asc' })}
              className="h-8 px-2 rounded-lg border border-zinc-800 bg-zinc-900 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Toggle sort direction"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* View mode toggle */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
            <button
              onClick={() => updateParams({ view: 'table' })}
              className={`p-1.5 rounded text-xs transition-colors ${
                viewMode === 'table' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Table View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => updateParams({ view: 'cards' })}
              className={`p-1.5 rounded text-xs transition-colors ${
                viewMode === 'cards' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Cards View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Multi-select Action Bar */}
      {checkedIds.size > 0 && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-950/80 border border-indigo-800/80 text-xs text-zinc-100 shadow-lg animate-fadeIn">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-indigo-300">
              {checkedIds.size} creator{checkedIds.size > 1 ? 's' : ''} selected
            </span>
            <button
              onClick={() => setCheckedIds(new Set())}
              className="text-zinc-400 hover:text-zinc-200 underline"
            >
              Clear selection
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBatchAction('select')}
              isLoading={batchActionMutation.isPending}
              className="text-xs h-7 bg-zinc-900/60 text-zinc-200"
            >
              Select for Lineup
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBatchAction('deselect')}
              isLoading={batchActionMutation.isPending}
              className="text-xs h-7 bg-zinc-900/60 text-zinc-200"
            >
              Deselect Lineup
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBatchAction('reanalyze')}
              isLoading={batchActionMutation.isPending}
              className="text-xs h-7 bg-zinc-900/60 text-zinc-200"
            >
              Re-analyze
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => handleBatchAction('remove')}
              isLoading={batchActionMutation.isPending}
              className="text-xs h-7"
            >
              Remove
            </Button>
          </div>
        </div>
      )}

      {/* Creators Content */}
      {isCreatorsLoading ? (
        <div className="flex items-center justify-center p-16 text-zinc-400">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm">Loading creators...</p>
          </div>
        </div>
      ) : filteredCreators.length === 0 ? (
        <Card className="p-12 text-center border-dashed border-zinc-800 space-y-4">
          <div className="w-12 h-12 rounded-full bg-zinc-800/80 flex items-center justify-center mx-auto text-zinc-400">
            <Users className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-zinc-200">
              {rawCreators.length === 0 ? 'No creators added yet' : 'No matching creators found'}
            </h3>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              {rawCreators.length === 0
                ? 'Add YouTube channels by handle, channel ID, or URL to begin discovery and AI risk vetting.'
                : 'Try adjusting your search or filters to see your candidate creators.'}
            </p>
          </div>
          {rawCreators.length === 0 && (
            <Button variant="primary" size="sm" onClick={() => setShowAddModal(true)} icon={Plus}>
              Add Creators
            </Button>
          )}
        </Card>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW */
        <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/40">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/90 border-b border-zinc-800 text-zinc-400 font-medium uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                      className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-0 cursor-pointer"
                      title="Select all"
                    />
                  </th>
                  <th className="py-3 px-3 w-10 text-center">Lineup</th>
                  <th className="py-3 px-4">Creator / Channel</th>
                  <th className="py-3 px-4 text-right">Subscribers</th>
                  <th className="py-3 px-4 text-right">Median Views</th>
                  <th className="py-3 px-4 text-right">Engagement</th>
                  <th className="py-3 px-4 text-right">Est. Cost</th>
                  <th className="py-3 px-4 text-center">Fit Score</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredCreators.map((creator) => {
                  const channel = creator.channel;
                  const metrics = creator.metrics;
                  const scores = creator.scores;
                  const fitScore = scores?.fitScore;
                  const tier = scores?.tier;

                  const medianViews = metrics
                    ? metrics.longForm?.medianViews || metrics.shorts?.medianViews || 0
                    : null;

                  const engagementRate = metrics
                    ? metrics.longForm?.medianEngagementRate || metrics.shorts?.medianEngagementRate || null
                    : null;

                  const isChecked = checkedIds.has(creator.id);

                  return (
                    <tr
                      key={creator.id}
                      className={`hover:bg-zinc-800/40 transition-colors ${
                        creator.selected ? 'bg-indigo-950/15' : ''
                      } ${isChecked ? 'bg-indigo-900/10' : ''}`}
                    >
                      {/* Checkbox for batch actions */}
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCheckOne(creator.id)}
                          className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-0 cursor-pointer"
                        />
                      </td>

                      {/* Lineup Selection Checkbox */}
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={creator.selected}
                          onChange={() => handleToggleSelect(creator)}
                          title={creator.selected ? 'Selected for lineup' : 'Click to select for lineup'}
                          className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>

                      {/* Creator Channel Info */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {channel?.avatarUrl ? (
                            <img
                              src={channel.avatarUrl}
                              alt={channel.title}
                              className="w-9 h-9 rounded-full object-cover shrink-0 bg-zinc-800"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold shrink-0">
                              {(channel?.title || creator.input).charAt(0).toUpperCase()}
                            </div>
                          )}

                          <div className="min-w-0 max-w-[200px] lg:max-w-xs">
                            <Link
                              to={`/campaigns/${campaignId}/creators/${creator.id}?${searchParams.toString()}`}
                              className="font-semibold text-zinc-100 hover:text-indigo-400 transition-colors truncate block"
                            >
                              {channel?.title || creator.input}
                            </Link>
                            <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                              <span>{channel?.customUrl || creator.normalizedKey}</span>
                              {channel?.channelId && (
                                <a
                                  href={`https://youtube.com/channel/${channel.channelId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-zinc-500 hover:text-zinc-300"
                                  title="View on YouTube"
                                >
                                  <ExternalLink className="w-3 h-3 inline" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Subscribers */}
                      <td className="py-3 px-4 text-right tabular-nums text-zinc-300 font-medium">
                        {channel?.hiddenSubscriberCount ? (
                          <span className="text-zinc-500 italic">Hidden</span>
                        ) : channel?.subscriberCount ? (
                          formatNumber(channel.subscriberCount)
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>

                      {/* Median Views */}
                      <td className="py-3 px-4 text-right tabular-nums text-zinc-300 font-medium">
                        {medianViews !== null ? (
                          formatNumber(medianViews)
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>

                      {/* Engagement */}
                      <td className="py-3 px-4 text-right tabular-nums text-zinc-300 font-medium">
                        {engagementRate !== null ? (
                          <span>{formatPercent(engagementRate)}</span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>

                      {/* Est. Cost */}
                      <td className="py-3 px-4 text-right tabular-nums text-zinc-300 font-medium">
                        {metrics?.estimatedCostPerVideoUsd ? (
                          <span>
                            {formatCurrency(metrics.estimatedCostPerVideoUsd.low)} -{' '}
                            {formatCurrency(metrics.estimatedCostPerVideoUsd.high)}
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>

                      {/* Fit Score & Tier */}
                      <td className="py-3 px-4 text-center">
                        {fitScore !== undefined && fitScore !== null ? (
                          <div className="inline-flex flex-col items-center">
                            <span className="text-sm font-bold tabular-nums text-zinc-100">
                              {fitScore}
                            </span>
                            <span
                              className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                                tier === 'Strong fit'
                                  ? 'text-emerald-400 bg-emerald-950/50 border border-emerald-800/40'
                                  : tier === 'Possible fit'
                                  ? 'text-amber-400 bg-amber-950/50 border border-amber-800/40'
                                  : 'text-zinc-400 bg-zinc-800/60'
                              }`}
                            >
                              {tier}
                            </span>
                          </div>
                        ) : (
                          <span className="text-zinc-600 text-xs">—</span>
                        )}
                      </td>

                      {/* Status / Quality */}
                      <td className="py-3 px-4 text-center">
                        {creator.status === 'analyzed' ? (
                          <span className="text-[11px] text-emerald-400 font-medium">
                            Analyzed
                          </span>
                        ) : creator.status === 'analyzing' ? (
                          <span className="text-[11px] text-indigo-400 font-medium animate-pulse">
                            Analyzing...
                          </span>
                        ) : creator.status === 'error' ? (
                          <span
                            className="text-[11px] text-rose-400 font-medium cursor-help"
                            title={creator.error || 'Analysis error'}
                          >
                            Error
                          </span>
                        ) : creator.status === 'resolved' ? (
                          <span className="text-[11px] text-zinc-400">Ready</span>
                        ) : (
                          <span className="text-[11px] text-zinc-500">Pending</span>
                        )}
                      </td>

                      {/* Action buttons */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            to={`/campaigns/${campaignId}/creators/${creator.id}?${searchParams.toString()}`}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-indigo-400 hover:bg-zinc-800 transition-colors"
                            title="View detailed scorecard"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Link>

                          <button
                            onClick={() =>
                              isSingleCreator
                                ? checkBudgetFitMutation.mutate(creator.id)
                                : analyzeSingleMutation.mutate(creator.id)
                            }
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                            title={isSingleCreator ? 'Check budget fit' : 'Analyze single creator'}
                          >
                            {isSingleCreator ? (
                              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <RefreshCw className="w-3.5 h-3.5" />
                            )}
                          </button>

                          <button
                            onClick={() => openEditModal(creator)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                            title="Edit notes and tags"
                          >
                            <FileEdit className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => setDeleteTarget(creator)}
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/20 transition-colors"
                            title="Remove creator"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* CARDS VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCreators.map((creator) => {
            const channel = creator.channel;
            const metrics = creator.metrics;
            const scores = creator.scores;
            const fitScore = scores?.fitScore;
            const tier = scores?.tier;
            const isChecked = checkedIds.has(creator.id);

            const medianViews = metrics
              ? metrics.longForm?.medianViews || metrics.shorts?.medianViews || 0
              : null;

            const engagementRate = metrics
              ? metrics.longForm?.medianEngagementRate || metrics.shorts?.medianEngagementRate || null
              : null;

            return (
              <Card
                key={creator.id}
                className={`p-4 border-zinc-800 bg-zinc-900/60 space-y-4 hover:border-zinc-700 transition-colors ${
                  creator.selected ? 'ring-1 ring-indigo-500/40' : ''
                } ${isChecked ? 'bg-indigo-950/20' : ''}`}
              >
                {/* Card Top: Checkbox, Channel, Fit Score */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleCheckOne(creator.id)}
                      className="w-3.5 h-3.5 mt-1 rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-0 cursor-pointer"
                    />

                    {channel?.avatarUrl ? (
                      <img
                        src={channel.avatarUrl}
                        alt={channel.title}
                        className="w-10 h-10 rounded-full object-cover shrink-0 bg-zinc-800"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold shrink-0">
                        {(channel?.title || creator.input).charAt(0).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0">
                      <Link
                        to={`/campaigns/${campaignId}/creators/${creator.id}?${searchParams.toString()}`}
                        className="font-semibold text-zinc-100 hover:text-indigo-400 transition-colors line-clamp-1 text-sm"
                      >
                        {channel?.title || creator.input}
                      </Link>
                      <div className="text-[11px] text-zinc-400 truncate">
                        {channel?.customUrl || creator.normalizedKey}
                      </div>
                    </div>
                  </div>

                  {fitScore !== undefined && fitScore !== null ? (
                    <div className="text-right shrink-0">
                      <span className="text-base font-extrabold text-zinc-100">{fitScore}</span>
                      <div
                        className={`text-[9px] font-medium px-1.5 py-0.2 rounded ${
                          tier === 'Strong fit'
                            ? 'text-emerald-400 bg-emerald-950/60'
                            : tier === 'Possible fit'
                            ? 'text-amber-400 bg-amber-950/60'
                            : 'text-zinc-400 bg-zinc-800/60'
                        }`}
                      >
                        {tier}
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-zinc-600 shrink-0">—</span>
                  )}
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80 text-[11px]">
                  <div>
                    <span className="text-zinc-500 block">Subs</span>
                    <span className="text-zinc-200 font-semibold font-mono">
                      {channel?.subscriberCount ? formatNumber(channel.subscriberCount) : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Median Views</span>
                    <span className="text-zinc-200 font-semibold font-mono">
                      {medianViews !== null ? formatNumber(medianViews) : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Eng. Rate</span>
                    <span className="text-zinc-200 font-semibold font-mono">
                      {engagementRate !== null ? formatPercent(engagementRate) : '—'}
                    </span>
                  </div>
                </div>

                {/* Card Footer: Lineup Toggle & Actions */}
                <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={creator.selected}
                      onChange={() => handleToggleSelect(creator)}
                      className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-0 cursor-pointer"
                    />
                    <span className="text-[11px] text-zinc-300">Selected for lineup</span>
                  </label>

                  <div className="flex items-center gap-1">
                    <Link
                      to={`/campaigns/${campaignId}/creators/${creator.id}?${searchParams.toString()}`}
                      className="p-1 rounded text-zinc-400 hover:text-indigo-400 hover:bg-zinc-800"
                      title="View scorecard"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() =>
                        isSingleCreator
                          ? checkBudgetFitMutation.mutate(creator.id)
                          : analyzeSingleMutation.mutate(creator.id)
                      }
                      className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                      title={isSingleCreator ? 'Check budget fit' : 'Analyze'}
                    >
                      {isSingleCreator ? (
                        <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => setDeleteTarget(creator)}
                      className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-rose-950/20"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Creators Dialog (Single vs Bulk tabs) */}
      <Dialog
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Candidate Creators"
      >
        <div className="space-y-4">
          {/* Tab Navigation */}
          <div className="flex items-center border-b border-zinc-800">
            <button
              type="button"
              onClick={() => setAddTab('single')}
              className={`py-2 px-4 text-xs font-semibold border-b-2 transition-colors ${
                addTab === 'single'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Single Creator (Live Preview)
            </button>
            <button
              type="button"
              onClick={() => setAddTab('bulk')}
              className={`py-2 px-4 text-xs font-semibold border-b-2 transition-colors ${
                addTab === 'bulk'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Bulk Import (Up to 25)
            </button>
          </div>

          {/* SINGLE TAB */}
          {addTab === 'single' ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
                  YouTube Handle or Channel URL
                </label>
                <div className="flex gap-2">
                  <Input
                    placeholder="@mkbhd or youtube.com/@mkbhd"
                    value={singleInput}
                    onChange={(e) => setSingleInput(e.target.value)}
                    className="font-mono text-xs flex-1"
                  />
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Enter an @handle, full YouTube channel URL, or channel ID (UC...).
                </p>
              </div>

              {/* Single Channel Live Preview Card */}
              {isPreviewLoading ? (
                <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xs text-zinc-400 gap-2">
                  <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  Resolving YouTube channel telemetry...
                </div>
              ) : previewError ? (
                <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-800/50 text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{previewError}</span>
                </div>
              ) : singlePreview?.channel ? (
                <div className="p-4 rounded-lg bg-zinc-950/80 border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Channel Live Preview
                    </span>
                    {singlePreview.isDuplicate && (
                      <span className="text-[11px] text-amber-400 font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Already Added
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {singlePreview.channel.avatarUrl ? (
                      <img
                        src={singlePreview.channel.avatarUrl}
                        alt={singlePreview.channel.title}
                        className="w-12 h-12 rounded-full object-cover bg-zinc-800 border border-zinc-700"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold">
                        {singlePreview.channel.title.charAt(0)}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-zinc-100 truncate">
                        {singlePreview.channel.title}
                      </h4>
                      <p className="text-xs text-zinc-400">
                        {singlePreview.channel.customUrl || singlePreview.channel.channelId}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800/80 text-xs">
                    <div>
                      <span className="text-zinc-500">Subscribers:</span>{' '}
                      <span className="text-zinc-200 font-semibold font-mono">
                        {singlePreview.channel.subscriberCount
                          ? formatNumber(singlePreview.channel.subscriberCount)
                          : 'Hidden'}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Total Videos:</span>{' '}
                      <span className="text-zinc-200 font-semibold font-mono">
                        {formatNumber(singlePreview.channel.videoCount)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" size="sm" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!singleInput.trim() || isPreviewLoading || singlePreview?.isDuplicate}
                  isLoading={addCreatorMutation.isPending}
                  onClick={handleSingleAdd}
                >
                  Add Creator
                </Button>
              </div>
            </div>
          ) : (
            /* BULK TAB */
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    YouTube Channel Handles or URLs (One per line)
                  </label>
                  <button
                    type="button"
                    onClick={() => setBulkInputText(SAMPLE_CREATOR_INPUTS)}
                    className="text-xs text-indigo-400 hover:underline flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    Fill Sample Creators
                  </button>
                </div>
                <textarea
                  rows={5}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900/80 p-3 text-xs text-zinc-100 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 font-mono"
                  placeholder="@mkbhd&#10;https://youtube.com/@jameshoffmann&#10;UCBJycsmduvYEL83R_U4JriQ"
                  value={bulkInputText}
                  onChange={(e) => setBulkInputText(e.target.value)}
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Supports @handles, channel URLs, or channel IDs (UC...). Max {CONFIG.MAX_CREATORS_PER_CAMPAIGN} creators per campaign.
                </p>
              </div>

              {/* Live Validation Preview Box */}
              {liveValidation.length > 0 && (
                <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950/70 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    <span>Live Validation Preview</span>
                    {isValidating && <span className="text-indigo-400 lowercase">checking...</span>}
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                    {liveValidation.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-xs py-1 px-2 rounded bg-zinc-900/60 border border-zinc-800/80"
                      >
                        <span className="font-mono truncate max-w-[240px] text-zinc-200">
                          {item.raw}
                        </span>
                        <div>
                          {item.status === 'valid' && (
                            <span className="text-emerald-400 flex items-center gap-1">
                              <Check className="w-3 h-3" /> Valid
                            </span>
                          )}
                          {item.status === 'duplicate' && (
                            <span className="text-amber-400 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> Duplicate
                            </span>
                          )}
                          {item.status === 'invalid' && (
                            <span className="text-rose-400 flex items-center gap-1" title={item.reason}>
                              <X className="w-3 h-3" /> {item.reason || 'Invalid'}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" size="sm" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={
                    liveValidation.filter((r) => r.status === 'valid').length === 0 ||
                    bulkAddMutation.isPending
                  }
                  isLoading={bulkAddMutation.isPending}
                  onClick={handleBulkAdd}
                >
                  Add Valid Creators ({liveValidation.filter((r) => r.status === 'valid').length})
                </Button>
              </div>
            </div>
          )}
        </div>
      </Dialog>

      {/* Edit Notes & Tags Modal */}
      <Dialog
        isOpen={Boolean(editingCreator)}
        onClose={() => setEditingCreator(null)}
        title={`Edit Notes & Tags: ${editingCreator?.channel?.title || editingCreator?.normalizedKey || ''}`}
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
              Internal Campaign Notes
            </label>
            <textarea
              rows={4}
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900/80 p-2.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              placeholder="e.g. Discussed exclusivity terms, creator prefers 60s integration in first half."
              maxLength={1000}
            />
            <span className="text-[10px] text-zinc-500 block text-right">
              {editNotes.length}/1000 characters
            </span>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
              Campaign Tags (up to 10)
            </label>
            <div className="flex gap-2 mb-2">
              <Input
                placeholder="Add tag (e.g. coffee, priority, tier-1)"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && tagInput.trim() && editTags.length < 10) {
                    e.preventDefault();
                    if (!editTags.includes(tagInput.trim())) {
                      setEditTags([...editTags, tagInput.trim()]);
                    }
                    setTagInput('');
                  }
                }}
                className="text-xs flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (tagInput.trim() && editTags.length < 10) {
                    if (!editTags.includes(tagInput.trim())) {
                      setEditTags([...editTags, tagInput.trim()]);
                    }
                    setTagInput('');
                  }
                }}
              >
                Add
              </Button>
            </div>

            <div className="flex flex-wrap gap-1.5 min-h-[30px]">
              {editTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-zinc-800 border border-zinc-700 text-zinc-300"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => setEditTags(editTags.filter((t) => t !== tag))}
                    className="text-zinc-500 hover:text-rose-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <Button variant="outline" size="sm" onClick={() => setEditingCreator(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={updateCreatorMutation.isPending}
              onClick={handleSaveEdit}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Remove Creator Candidate"
      >
        <div className="space-y-4">
          <p className="text-xs text-zinc-300">
            Are you sure you want to remove{' '}
            <strong className="text-zinc-100">
              {deleteTarget?.channel?.title || deleteTarget?.normalizedKey}
            </strong>{' '}
            from this campaign? This will delete all cached telemetry and recompute cohort rankings.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              isLoading={deleteCreatorMutation.isPending}
              onClick={async () => {
                if (!deleteTarget) return;
                await deleteCreatorMutation.mutateAsync(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Remove Creator
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
