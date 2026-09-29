import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Play,
  Film,
  Award,
  DollarSign,
  TrendingUp,
  Tag,
  Clock,
  Calendar,
  Layers,
  HelpCircle,
  RefreshCw,
  Plus,
  X,
  Check,
  FileText,
  Video,
} from 'lucide-react';
import {
  Button,
  Card,
  Badge,
  Input,
} from '../common/UIComponents.tsx';
import { useCampaign } from '../../hooks/useCampaigns.ts';
import {
  useCreators,
  useCreator,
  useCreatorMutations,
} from '../../hooks/useCreators.ts';
import { formatNumber, formatCurrency, formatPercent } from '@/shared/format.ts';
import { CONFIG } from '@/shared/config.ts';
import { CreatorVideo } from '@/shared/types.ts';

export function CreatorDetailPage() {
  const { campaignId, creatorId } = useParams<{ campaignId: string; creatorId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { data: campaign } = useCampaign(campaignId);
  const { data: creators = [] } = useCreators(campaignId, {
    tier: (searchParams.get('tier') as any) || undefined,
    sort: (searchParams.get('sort') as any) || 'fitScore',
    order: (searchParams.get('order') as any) || 'desc',
  });

  const { data: creator, isLoading } = useCreator(campaignId, creatorId);
  const { updateCreatorMutation, analyzeSingleMutation, checkBudgetFitMutation } = useCreatorMutations(campaignId);

  // Highlighting video upon citation click
  const [highlightedVideoTitle, setHighlightedVideoTitle] = useState<string | null>(null);
  const videoListRef = useRef<HTMLDivElement>(null);

  // Inline notes & tags state with auto-save
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [plannedDate, setPlannedDate] = useState('');
  const [isSavingInline, setIsSavingInline] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle');

  // Sync initial notes/tags/date from creator
  useEffect(() => {
    if (creator) {
      setNotes(creator.notes || '');
      setTags(creator.tags || []);
      setPlannedDate(creator.plannedPublishDate ? creator.plannedPublishDate.slice(0, 10) : '');
    }
  }, [creator?.id]);

  // Debounced auto-save for notes
  useEffect(() => {
    if (!creator) return;
    if (notes === (creator.notes || '')) return;

    setSaveStatus('saving');
    const timer = setTimeout(async () => {
      try {
        await updateCreatorMutation.mutateAsync({
          creatorId: creator.id,
          version: creator.version,
          updates: { notes },
        });
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('idle');
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [notes]);

  // Compute Prev / Next creators in current sorted order
  const { prevCreator, nextCreator } = useMemo(() => {
    if (!creator || creators.length === 0) return { prevCreator: null, nextCreator: null };
    const idx = creators.findIndex((c) => c.id === creator.id);
    if (idx === -1) return { prevCreator: null, nextCreator: null };

    return {
      prevCreator: idx > 0 ? creators[idx - 1] : null,
      nextCreator: idx < creators.length - 1 ? creators[idx + 1] : null,
    };
  }, [creators, creator]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-20 text-zinc-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Loading creator details...</p>
        </div>
      </div>
    );
  }

  if (!creator) {
    return (
      <div className="p-16 text-center space-y-4 max-w-md mx-auto">
        <div className="w-12 h-12 rounded-full bg-zinc-800/80 border border-zinc-700 flex items-center justify-center mx-auto text-zinc-400">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-zinc-200">Creator Not Found</h3>
        <p className="text-sm text-zinc-400">
          This creator candidate could not be found or may have been removed from the campaign.
        </p>
        <div className="pt-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate(`/campaigns/${campaignId}/creators`)}
          >
            Back to Creators List
          </Button>
        </div>
      </div>
    );
  }

  const channel = creator.channel;
  const metrics = creator.metrics;
  const scores = creator.scores;
  const weights = CONFIG.DEFAULT_SCORING_WEIGHTS;

  const handleToggleSelected = () => {
    updateCreatorMutation.mutate({
      creatorId: creator.id,
      version: creator.version,
      updates: { selected: !creator.selected },
    });
  };

  const handleDateChange = (newDate: string) => {
    setPlannedDate(newDate);
    updateCreatorMutation.mutate({
      creatorId: creator.id,
      version: creator.version,
      updates: { plannedPublishDate: newDate ? new Date(newDate).toISOString() : null },
    });
  };

  const handleAddTag = () => {
    const trimmed = newTagInput.trim().toLowerCase();
    if (!trimmed || tags.includes(trimmed) || tags.length >= 10) return;
    const updated = [...tags, trimmed];
    setTags(updated);
    setNewTagInput('');
    updateCreatorMutation.mutate({
      creatorId: creator.id,
      version: creator.version,
      updates: { tags: updated },
    });
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const updated = tags.filter((t) => t !== tagToRemove);
    setTags(updated);
    updateCreatorMutation.mutate({
      creatorId: creator.id,
      version: creator.version,
      updates: { tags: updated },
    });
  };

  // Sub-scores breakdown list
  const scoreBreakdown = [
    { key: 'nicheFit', label: 'Niche Fit', score: scores?.nicheFit ?? 0, weight: weights.nicheFit, justification: scores?.justifications.nicheFit, citations: scores?.citations.nicheFit, lowConf: scores?.lowConfidence.nicheFit },
    { key: 'audienceFit', label: 'Audience Resonance', score: scores?.audienceFit ?? 0, weight: weights.audienceFit, justification: scores?.justifications.audienceFit, citations: scores?.citations.audienceFit, lowConf: scores?.lowConfidence.audienceFit },
    { key: 'toneFit', label: 'Brand Tone Fit', score: scores?.toneFit ?? 0, weight: weights.toneFit, justification: scores?.justifications.toneFit, citations: scores?.citations.toneFit, lowConf: scores?.lowConfidence.toneFit },
    { key: 'brandSafety', label: 'Brand Safety & Integrity', score: scores?.brandSafety ?? 0, weight: weights.brandSafety, justification: scores?.justifications.brandSafety, citations: [], lowConf: scores?.lowConfidence.brandSafety },
    { key: 'engagement', label: 'Engagement Rate', score: scores?.engagementScore ?? 0, weight: weights.engagement, justification: 'Calculated from long-form and Shorts viewer interaction vs channel peers.', citations: [], lowConf: false },
    { key: 'reach', label: 'Audience Reach', score: scores?.reachScore ?? 0, weight: weights.reach, justification: 'Weighted median views benchmarked against niche baseline standards.', citations: [], lowConf: false },
    { key: 'consistency', label: 'Upload Consistency', score: scores?.consistencyScore ?? 0, weight: weights.consistency, justification: 'Evaluated from standard deviation of publishing intervals across recent uploads.', citations: [], lowConf: false },
    { key: 'recency', label: 'Publishing Recency', score: scores?.recencyScore ?? 0, weight: weights.recency, justification: 'Linear decay scaling based on days elapsed since the latest video.', citations: [], lowConf: false },
    { key: 'budgetFit', label: 'Budget Fit', score: scores?.budgetFitScore ?? 0, weight: weights.budgetFit, justification: 'Midpoint cost compared against per-video campaign allocation target.', citations: [], lowConf: false },
  ];

  const handleCitationClick = (videoTitle: string) => {
    setHighlightedVideoTitle(videoTitle);
    if (videoListRef.current) {
      videoListRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const recentVideosList: CreatorVideo[] = creator.recentVideos || [];

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-28">
      {/* Top Navigation & Pagination */}
      <div className="flex items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <button
          onClick={() => navigate(`/campaigns/${campaignId}/creators?${searchParams.toString()}`)}
          className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Creators List
        </button>

        <div className="flex items-center gap-2">
          {prevCreator && (
            <Link
              to={`/campaigns/${campaignId}/creators/${prevCreator.id}?${searchParams.toString()}`}
              className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-100 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Prev: {prevCreator.channel?.title || prevCreator.normalizedKey}
            </Link>
          )}
          {nextCreator && (
            <Link
              to={`/campaigns/${campaignId}/creators/${nextCreator.id}?${searchParams.toString()}`}
              className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-100 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors"
            >
              Next: {nextCreator.channel?.title || nextCreator.normalizedKey}
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>

      {/* Hero Creator Header Card */}
      <Card className="p-6 border-zinc-800 bg-zinc-900/60">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            {channel?.avatarUrl ? (
              <img
                src={channel.avatarUrl}
                alt={channel.title}
                className="w-16 h-16 rounded-full object-cover shrink-0 bg-zinc-800 border-2 border-zinc-700"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center text-xl text-zinc-400 font-bold shrink-0">
                {(channel?.title || creator.input).charAt(0).toUpperCase()}
              </div>
            )}

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-xl font-bold text-zinc-100">
                  {channel?.title || creator.input}
                </h1>
                {scores?.tier && (
                  <span
                    className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                      scores.tier === 'Strong fit'
                        ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/60'
                        : scores.tier === 'Possible fit'
                        ? 'text-amber-400 bg-amber-950/60 border border-amber-800/60'
                        : 'text-zinc-400 bg-zinc-800/80 border border-zinc-700'
                    }`}
                  >
                    {scores.tier}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
                <span>{channel?.customUrl || creator.normalizedKey}</span>
                {channel?.country && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Country: {channel.country}</span>
                  </>
                )}
                {channel?.channelAgeMonths !== undefined && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Age: {channel.channelAgeMonths} mos</span>
                  </>
                )}
                {channel?.channelId && (
                  <>
                    <span aria-hidden="true">·</span>
                    <a
                      href={`https://youtube.com/channel/${channel.channelId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:underline inline-flex items-center gap-1"
                    >
                      Open YouTube
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Overall Composite Score Box */}
            <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800 text-center min-w-[110px]">
              <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
                Fit Score
              </div>
              <div className="text-3xl font-extrabold text-zinc-100 tabular-nums">
                {scores?.fitScore ?? '—'}
                <span className="text-xs font-normal text-zinc-500">/100</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button
                variant={creator.selected ? 'primary' : 'outline'}
                size="sm"
                onClick={handleToggleSelected}
                className="gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                {creator.selected ? 'Selected for Lineup' : 'Select for Lineup'}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => checkBudgetFitMutation.mutate(creator.id)}
                isLoading={checkBudgetFitMutation.isPending}
                className="text-xs text-emerald-400 border-emerald-800/50 hover:bg-emerald-950/30"
              >
                <DollarSign className="w-3.5 h-3.5 mr-1" />
                Check Budget Fit
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => analyzeSingleMutation.mutate(creator.id)}
                isLoading={analyzeSingleMutation.isPending}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1" />
                Full AI Re-Analysis
              </Button>
            </div>
          </div>
        </div>

        {/* Brand Safety Warning Banner */}
        {scores?.brandSafetyWarning && (
          <div className="mt-4 p-3.5 rounded-lg bg-amber-950/40 border border-amber-800/60 text-xs text-amber-300 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold block mb-0.5">Brand Safety Hard Cap Applied (Max Score: 50)</strong>
              <span>{scores.brandSafetyWarning}</span>
            </div>
          </div>
        )}

        {/* 2-Sentence Plain-English Summary */}
        {scores?.summary && (
          <div className="mt-4 p-3 rounded-lg bg-zinc-950/70 border border-zinc-800 text-xs text-zinc-300 italic leading-relaxed">
            "{scores.summary}"
          </div>
        )}
      </Card>

      {/* Lineup Planning & Commercial Terms Bar */}
      <Card className="p-5 border-zinc-800 bg-zinc-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-400" />
            Lineup Planning & Publishing Schedule
          </h3>
          <p className="text-xs text-zinc-400">
            Designate publishing dates for approved creator deliverables.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-400 font-medium">Planned Publish Date:</label>
            <input
              type="date"
              value={plannedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="h-8 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg">
            <input
              type="checkbox"
              checked={creator.selected}
              onChange={handleToggleSelected}
              className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-indigo-600 focus:ring-0 cursor-pointer"
            />
            <span className="text-xs text-zinc-200 font-medium">Selected for campaign</span>
          </label>
        </div>
      </Card>

      {/* Comprehensive Telemetry Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="p-3.5 border-zinc-800 bg-zinc-900/60 space-y-1">
          <span className="text-[11px] text-zinc-400 uppercase font-semibold">Subscribers</span>
          <div className="text-base font-bold text-zinc-100 font-mono">
            {channel?.hiddenSubscriberCount ? (
              <span className="text-xs text-zinc-500 italic">Hidden</span>
            ) : channel?.subscriberCount ? (
              formatNumber(channel.subscriberCount)
            ) : (
              '—'
            )}
          </div>
          <span className="text-[10px] text-zinc-500 block">Total audience</span>
        </Card>

        <Card className="p-3.5 border-zinc-800 bg-zinc-900/60 space-y-1">
          <span className="text-[11px] text-zinc-400 uppercase font-semibold">Long-Form Views</span>
          <div className="text-base font-bold text-zinc-100 font-mono">
            {metrics?.longForm?.medianViews ? formatNumber(metrics.longForm.medianViews) : '—'}
          </div>
          <span className="text-[10px] text-zinc-500 block">Median ({metrics?.longForm?.count || 0} vids)</span>
        </Card>

        <Card className="p-3.5 border-zinc-800 bg-zinc-900/60 space-y-1">
          <span className="text-[11px] text-zinc-400 uppercase font-semibold">Shorts Views</span>
          <div className="text-base font-bold text-zinc-100 font-mono">
            {metrics?.shorts?.medianViews ? formatNumber(metrics.shorts.medianViews) : '—'}
          </div>
          <span className="text-[10px] text-zinc-500 block">Median ({metrics?.shorts?.count || 0} vids)</span>
        </Card>

        <Card className="p-3.5 border-zinc-800 bg-zinc-900/60 space-y-1">
          <span className="text-[11px] text-zinc-400 uppercase font-semibold">Engagement</span>
          <div className="text-base font-bold text-emerald-400 font-mono">
            {metrics?.longForm?.medianEngagementRate
              ? formatPercent(metrics.longForm.medianEngagementRate)
              : metrics?.shorts?.medianEngagementRate
              ? formatPercent(metrics.shorts.medianEngagementRate)
              : '—'}
          </div>
          <span className="text-[10px] text-zinc-500 block">Likes+comments / views</span>
        </Card>

        <Card className="p-3.5 border-zinc-800 bg-zinc-900/60 space-y-1">
          <span className="text-[11px] text-zinc-400 uppercase font-semibold">Upload Pacing</span>
          <div className="text-base font-bold text-zinc-100 font-mono">
            {metrics?.uploadsPerMonth !== undefined ? `${metrics.uploadsPerMonth}/mo` : '—'}
          </div>
          <span className="text-[10px] text-zinc-500 block">
            {metrics?.daysSinceLastUpload !== undefined
              ? `${metrics.daysSinceLastUpload}d ago`
              : 'Recency'}
          </span>
        </Card>

        <Card className="p-3.5 border-zinc-800 bg-zinc-900/60 space-y-1">
          <span className="text-[11px] text-zinc-400 uppercase font-semibold">Estimated Cost</span>
          <div className="text-sm font-bold text-zinc-100 font-mono">
            {metrics?.estimatedCostPerVideoUsd
              ? `${formatCurrency(metrics.estimatedCostPerVideoUsd.low)} - ${formatCurrency(metrics.estimatedCostPerVideoUsd.high)}`
              : '—'}
          </div>
          <span className="text-[10px] text-zinc-500 block">Per video (CPM based)</span>
        </Card>
      </div>

      {/* Sub-score Breakdown with Clickable Grounding Citations */}
      <Card className="p-6 border-zinc-800 bg-zinc-900/50 space-y-6">
        <div className="border-b border-zinc-800/80 pb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              Sub-Score Analysis & Citations
            </h2>
            <p className="text-xs text-zinc-400">
              Quantitative telemetry combined with Gemini AI audit. Click video citations to inspect videos below.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {scoreBreakdown.map((item) => (
            <div key={item.key} className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-200">{item.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500 font-mono">wt: {item.weight}%</span>
                  <span className="text-xs font-bold text-zinc-100 font-mono tabular-nums">
                    {item.score}/100
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-1.5 rounded-full ${
                    item.score >= 75
                      ? 'bg-emerald-500'
                      : item.score >= 50
                      ? 'bg-amber-500'
                      : 'bg-zinc-500'
                  }`}
                  style={{ width: `${item.score}%` }}
                />
              </div>

              {/* Justification & Citations */}
              <p className="text-xs text-zinc-400 leading-relaxed">
                {item.justification || 'No justification available'}
              </p>

              {item.citations && item.citations.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-zinc-800/60">
                  <span className="text-[10px] uppercase font-semibold text-zinc-500">Cited Video:</span>
                  {item.citations.map((cite, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleCitationClick(cite)}
                      className="text-[11px] font-mono text-indigo-400 hover:text-indigo-300 underline text-left truncate max-w-[280px]"
                      title="Click to view and highlight in recent videos list"
                    >
                      "{cite}"
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Brand Safety Section */}
      <Card className="p-6 border-zinc-800 bg-zinc-900/50 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2">
            {scores?.brandSafetyFlags && scores.brandSafetyFlags.length > 0 ? (
              <ShieldAlert className="w-5 h-5 text-rose-400" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            )}
            <div>
              <h3 className="text-sm font-bold text-zinc-100">Brand Safety Assessment</h3>
              <p className="text-xs text-zinc-400">
                Evaluation of controversial claims, extreme themes, or competitor disparagement.
              </p>
            </div>
          </div>

          <Badge variant={scores?.brandSafetyFlags && scores.brandSafetyFlags.length > 0 ? 'archived' : 'active'}>
            {scores?.brandSafetyFlags && scores.brandSafetyFlags.length > 0
              ? `${scores.brandSafetyFlags.length} Flagged`
              : 'Clean & Verified'}
          </Badge>
        </div>

        {scores?.brandSafetyFlags && scores.brandSafetyFlags.length > 0 ? (
          <div className="divide-y divide-rose-900/30">
            {scores.brandSafetyFlags.map((flag, idx) => (
              <div key={idx} className="py-2.5 flex items-start justify-between gap-4 text-xs">
                <div className="space-y-0.5">
                  <span className="text-rose-300 font-medium">{flag.concern}</span>
                  <div className="text-zinc-500">
                    Flagged in:{' '}
                    <button
                      onClick={() => handleCitationClick(flag.videoTitle)}
                      className="text-indigo-400 hover:underline font-mono"
                    >
                      "{flag.videoTitle}"
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-emerald-950/20 border border-emerald-900/40 text-xs text-emerald-300 flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>No safety concerns flagged. Content history is consistent with brand guidelines.</span>
          </div>
        )}
      </Card>

      {/* Recent Videos List (with Citation Highlighting) */}
      <div ref={videoListRef} className="space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <div>
            <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              <Video className="w-4 h-4 text-indigo-400" />
              Recent Video Sample ({recentVideosList.length} Analyzed)
            </h3>
            <p className="text-xs text-zinc-400">
              Fetched via YouTube playlistItems and video telemetry with duration and disclosure parsing.
            </p>
          </div>

          {highlightedVideoTitle && (
            <button
              onClick={() => setHighlightedVideoTitle(null)}
              className="text-xs text-zinc-400 hover:text-zinc-200 underline"
            >
              Clear highlight
            </button>
          )}
        </div>

        {recentVideosList.length === 0 ? (
          <Card className="p-8 text-center text-xs text-zinc-500 italic">
            No video records currently stored. Run discovery to fetch recent videos.
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentVideosList.map((vid) => {
              const isShort = vid.isShort;
              const isHighlighted =
                highlightedVideoTitle &&
                vid.title.toLowerCase().includes(highlightedVideoTitle.toLowerCase());

              return (
                <Card
                  key={vid.videoId}
                  className={`p-4 border-zinc-800 bg-zinc-900/60 space-y-3 transition-all ${
                    isHighlighted
                      ? 'ring-2 ring-indigo-500 border-indigo-400 bg-indigo-950/30'
                      : 'hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-xs font-semibold text-zinc-100 line-clamp-2" title={vid.title}>
                      {vid.title}
                    </h4>
                    <div className="flex items-center gap-1 shrink-0">
                      {isShort && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-950/60 border border-rose-800/60 text-rose-300">
                          Shorts
                        </span>
                      )}
                      {vid.hasSponsorshipSignals && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-300">
                          #ad
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Thumbnail / Duration banner */}
                  <div className="aspect-video w-full rounded-lg bg-zinc-950 relative overflow-hidden flex items-center justify-center border border-zinc-800">
                    {vid.thumbnailUrl ? (
                      <img
                        src={vid.thumbnailUrl}
                        alt={vid.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Play className="w-8 h-8 text-zinc-700" />
                    )}
                    <span className="absolute bottom-1.5 right-1.5 text-[10px] font-mono bg-black/80 px-1.5 py-0.5 rounded text-zinc-200">
                      {Math.floor(vid.durationSeconds / 60)}:{String(vid.durationSeconds % 60).padStart(2, '0')}
                    </span>
                  </div>

                  {/* Metrics info */}
                  <div className="grid grid-cols-3 gap-1 pt-1 border-t border-zinc-800/60 text-[11px] text-zinc-400 font-mono">
                    <div>
                      <span className="text-zinc-500 block text-[9px] uppercase">Views</span>
                      <span className="text-zinc-200 font-semibold">{formatNumber(vid.viewCount)}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[9px] uppercase">Likes</span>
                      <span className="text-zinc-200 font-semibold">
                        {vid.likesHidden ? 'Hidden' : formatNumber(vid.likeCount || 0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[9px] uppercase">Comments</span>
                      <span className="text-zinc-200 font-semibold">{formatNumber(vid.commentCount)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1">
                    <span>
                      {vid.publishedAt ? new Date(vid.publishedAt).toLocaleDateString() : 'Date unavailable'}
                    </span>
                    <a
                      href={`https://youtube.com/watch?v=${vid.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:underline flex items-center gap-0.5"
                    >
                      Watch <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Inline Notes & Tags Editor */}
      <Card className="p-6 border-zinc-800 bg-zinc-900/50 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-zinc-100">Creator Internal Notes & Tags</h3>
          </div>
          {saveStatus === 'saving' && (
            <span className="text-xs text-indigo-400 animate-pulse">Saving...</span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <Check className="w-3 h-3" /> Auto-saved
            </span>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
              Negotiation & Briefing Notes
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900/80 p-3 text-xs text-zinc-100 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
              placeholder="e.g. Expressed interest in sponsored espresso workflow demo; fits premium educational tone."
              maxLength={1000}
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
              Campaign Tags ({tags.length}/10)
            </label>
            <div className="flex gap-2 mb-2">
              <Input
                placeholder="Add tag and press Enter"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                className="text-xs max-w-xs"
              />
              <Button variant="outline" size="sm" onClick={handleAddTag}>
                Add Tag
              </Button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs bg-zinc-800 border border-zinc-700 text-zinc-300"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="text-zinc-500 hover:text-rose-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
