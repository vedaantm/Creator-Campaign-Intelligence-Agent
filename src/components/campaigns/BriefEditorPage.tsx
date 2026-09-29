import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  RefreshCw,
  History,
  Copy,
  Download,
  Save,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  Calendar,
  Layers,
  ExternalLink,
  Plus,
  Trash2,
  GitCompare,
  RotateCcw,
  Check,
  X,
  Info,
  HelpCircle,
  FileText,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import {
  Button,
  Card,
  Badge,
  Dialog,
} from '../common/UIComponents.tsx';
import { useCampaign } from '../../hooks/useCampaigns.ts';
import { useCreators, useCreatorMutations } from '../../hooks/useCreators.ts';
import { useQueryClient } from '@tanstack/react-query';
import {
  useBrief,
  useBriefVersions,
  useBriefMutations,
  useActiveBriefJob,
} from '../../hooks/useBriefs.ts';
import {
  CreatorBrief,
  CreatorBriefContent,
  CreatorBriefStatus,
  CreatorBriefVersion,
  ContentAngle,
  GuidelineRuleItem,
} from '@/shared/types.ts';
import { formatNumber, formatPercent } from '@/shared/format.ts';
import { useToast } from '../../context/ToastContext.tsx';

export function BriefEditorPage() {
  const { campaignId, creatorId } = useParams<{ campaignId: string; creatorId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data: campaign } = useCampaign(campaignId);
  const { data: creators = [] } = useCreators(campaignId);
  const { data: brief, isLoading: isBriefLoading } = useBrief(campaignId, creatorId);
  const { data: versions = [] } = useBriefVersions(campaignId, creatorId);
  const { data: activeJob } = useActiveBriefJob(campaignId);

  const {
    regenerateBriefMutation,
    updateBriefContentMutation,
    updateBriefStatusMutation,
    restoreBriefVersionMutation,
  } = useBriefMutations(campaignId);

  const { updateCreatorMutation } = useCreatorMutations(campaignId);

  // Monitor active brief generation/regeneration job to refresh data on completion and prevent stale version conflict on save
  const prevActiveJobRef = useRef(activeJob);
  useEffect(() => {
    if (prevActiveJobRef.current && !activeJob) {
      // Background job finished! Invalidate and refetch queries to update our local state with the latest brief & version from server
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId, 'briefs'] });
      if (creatorId) {
        queryClient.invalidateQueries({ queryKey: ['campaign', campaignId, 'briefs', creatorId] });
        queryClient.invalidateQueries({ queryKey: ['campaign', campaignId, 'briefs', creatorId, 'versions'] });
      }
    }
    prevActiveJobRef.current = activeJob;
  }, [activeJob, campaignId, creatorId, queryClient]);

  // Local draft state for editing
  const [contentDraft, setContentDraft] = useState<CreatorBriefContent | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // UI state
  const [isVersionDrawerOpen, setIsVersionDrawerOpen] = useState(false);
  const [compareVersion, setCompareVersion] = useState<CreatorBriefVersion | null>(null);
  const [showRegenModal, setShowRegenModal] = useState(false);
  const [regenInstruction, setRegenInstruction] = useState('');
  const [preserveEdits, setPreserveEdits] = useState(true);

  // Current creator and approved lineup navigation
  const approvedCreatorIds = useMemo(() => {
    if (!campaign?.approvedLineup) return [];
    if (Array.isArray(campaign.approvedLineup)) {
      return campaign.approvedLineup;
    }
    return campaign.approvedLineup.creatorIds || [];
  }, [campaign]);

  const currentCreator = useMemo(() => {
    return creators.find((c) => c.id === creatorId) || null;
  }, [creators, creatorId]);

  const { prevCreatorId, nextCreatorId, creatorIndex, totalApproved } = useMemo(() => {
    const idx = approvedCreatorIds.indexOf(creatorId || '');
    return {
      prevCreatorId: idx > 0 ? approvedCreatorIds[idx - 1] : null,
      nextCreatorId: idx >= 0 && idx < approvedCreatorIds.length - 1 ? approvedCreatorIds[idx + 1] : null,
      creatorIndex: idx >= 0 ? idx + 1 : 1,
      totalApproved: approvedCreatorIds.length || 1,
    };
  }, [approvedCreatorIds, creatorId]);

  // Sync brief content into local editing draft
  useEffect(() => {
    if (brief?.content) {
      setContentDraft(JSON.parse(JSON.stringify(brief.content)));
      setHasUnsavedChanges(false);
    }
  }, [brief]);

  // Track field changes
  const handleFieldChange = (fieldPath: string, newValue: any) => {
    if (!contentDraft) return;

    setContentDraft((prev) => {
      if (!prev) return prev;
      const copy = JSON.parse(JSON.stringify(prev));

      const parts = fieldPath.split('.');
      let curr = copy;
      for (let i = 0; i < parts.length - 1; i++) {
        curr = curr[parts[i]];
      }
      curr[parts[parts.length - 1]] = newValue;

      return copy;
    });

    setHasUnsavedChanges(true);
  };

  const handleSave = async () => {
    if (!creatorId || !brief || !contentDraft) return;

    await updateBriefContentMutation.mutateAsync({
      creatorId,
      content: contentDraft,
      version: brief.version,
    });

    setHasUnsavedChanges(false);
  };

  const handleReset = () => {
    if (brief?.content) {
      setContentDraft(JSON.parse(JSON.stringify(brief.content)));
      setHasUnsavedChanges(false);
      showToast('Changes discarded', 'info');
    }
  };

  const handleStatusChange = async (newStatus: CreatorBriefStatus) => {
    if (!creatorId || !brief) return;
    await updateBriefStatusMutation.mutateAsync({
      creatorId,
      status: newStatus,
      version: brief.version,
    });
  };

  const handleRegenerate = async () => {
    if (!creatorId) return;
    await regenerateBriefMutation.mutateAsync({
      creatorId,
      instruction: regenInstruction.trim() || undefined,
      preserveEdits,
    });
    setShowRegenModal(false);
    setRegenInstruction('');
  };

  const handleRestoreVersion = async (versionNumber: number) => {
    if (!creatorId) return;
    await restoreBriefVersionMutation.mutateAsync({
      creatorId,
      versionNumber,
    });
    setCompareVersion(null);
    setIsVersionDrawerOpen(false);
  };

  const handleCopyText = () => {
    if (!contentDraft || !currentCreator) return;
    const textLines = [
      `CREATOR COLLABORATION BRIEF: ${currentCreator.channel?.title || currentCreator.normalizedKey}`,
      `Campaign: ${campaign?.name || 'Campaign'}`,
      `Status: ${brief?.status.toUpperCase() || 'DRAFT'}`,
      '',
      `1. CREATOR CONTEXT`,
      contentDraft.creatorSnapshot,
      '',
      `2. OBJECTIVE`,
      contentDraft.campaignObjective,
      '',
      `3. RECOMMENDED FORMAT`,
      `Type: ${contentDraft.recommendedFormat.type} (${contentDraft.recommendedFormat.targetLength})`,
      `Placement: ${contentDraft.recommendedFormat.placement}`,
      `Rationale: ${contentDraft.recommendedFormat.rationale}`,
      '',
      `4. CONTENT ANGLES`,
      ...contentDraft.contentAngles.map((a, i) => `Angle ${i + 1}: ${a.title}\nHook: "${a.hook}"\nOutline: ${a.outline.join(' -> ')}`),
      '',
      `5. KEY TALKING POINTS`,
      ...contentDraft.keyMessages.map((m) => `- ${m}`),
      '',
      `6. MANDATORY DISCLOSURES`,
      `Description: ${contentDraft.mandatoryDisclosures.descriptionText}`,
      `Verbal: "${contentDraft.mandatoryDisclosures.verbalText}"`,
      '',
      `7. TRACKED LINK`,
      contentDraft.callToAction,
      '',
      `8. DELIVERABLE TIMELINE`,
      `Draft due: ${contentDraft.deliverablesAndTimeline.draftDue}`,
      `Feedback window: ${contentDraft.deliverablesAndTimeline.feedbackWithinDays} days`,
      `Final cut: ${contentDraft.deliverablesAndTimeline.finalDue}`,
      `Target publish date: ${contentDraft.deliverablesAndTimeline.publishDate}`,
    ];

    navigator.clipboard.writeText(textLines.join('\n'));
    showToast('Brief copied to clipboard as formatted text', 'success');
  };

  const handlePlannedPublishDateChange = async (dateStr: string) => {
    if (!currentCreator || !creatorId) return;
    try {
      await updateCreatorMutation.mutateAsync({
        creatorId,
        version: currentCreator.version,
        updates: { plannedPublishDate: dateStr || null },
      });
      // Also update draft timeline publishDate
      if (contentDraft) {
        handleFieldChange('deliverablesAndTimeline.publishDate', dateStr);
      }
      showToast('Creator planned publish date updated', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const isFieldEdited = (fieldPath: string): boolean => {
    if (!brief) return false;
    return brief.editedFields.some(
      (p) => p === fieldPath || p.startsWith(`${fieldPath}.`) || fieldPath.startsWith(`${p}.`)
    );
  };

  if (isBriefLoading) {
    return (
      <div className="py-24 text-center space-y-4">
        <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
        <p className="text-xs text-zinc-400">Loading creator collaboration brief...</p>
      </div>
    );
  }

  if (!brief || !contentDraft) {
    return (
      <div className="p-16 text-center space-y-4 max-w-md mx-auto">
        <div className="w-12 h-12 rounded-full bg-zinc-800/80 border border-zinc-700 flex items-center justify-center mx-auto text-zinc-400">
          <FileText className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-zinc-200">Brief Not Found</h3>
        <p className="text-sm text-zinc-400">
          A collaboration brief has not been generated for this creator yet, or the creator is not in the approved lineup.
        </p>
        <div className="pt-2 flex justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/campaigns/${campaignId}/briefs`)}
          >
            Back to Briefs
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate(`/campaigns/${campaignId}/creators`)}
          >
            Go to Creators
          </Button>
        </div>
      </div>
    );
  }

  const creatorTitle = currentCreator?.channel?.title || currentCreator?.normalizedKey || creatorId || 'Creator';

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-36">
      {/* Top Breadcrumb & Navigation Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/campaigns/${campaignId}/briefs`)}
            className="text-xs gap-1.5 text-zinc-400 hover:text-zinc-200"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All Briefs
          </Button>

          <div className="h-4 w-[1px] bg-zinc-800" />

          {/* Previous / Next Navigation */}
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <button
              onClick={() => prevCreatorId && navigate(`/campaigns/${campaignId}/briefs/${prevCreatorId}`)}
              disabled={!prevCreatorId}
              className="p-1 rounded bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none"
              title="Previous Creator"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono px-1">
              {creatorIndex} of {totalApproved}
            </span>
            <button
              onClick={() => nextCreatorId && navigate(`/campaigns/${campaignId}/briefs/${nextCreatorId}`)}
              disabled={!nextCreatorId}
              className="p-1 rounded bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none"
              title="Next Creator"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyText}
            className="text-xs gap-1.5"
            title="Copy as plain text"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy Text
          </Button>

          <a
            href={`/api/v1/campaigns/${campaignId}/briefs/${creatorId}/export?format=md`}
            download
            className="inline-flex items-center justify-center font-medium rounded-lg transition-colors border border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 text-xs px-2.5 py-1.5 gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Download .md
          </a>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsVersionDrawerOpen(true)}
            className="text-xs gap-1.5"
          >
            <History className="w-3.5 h-3.5" />
            History ({versions.length || 1})
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRegenModal(true)}
            className="text-xs gap-1.5 text-indigo-300 border-indigo-900/60 hover:bg-indigo-950/40"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Regenerate
          </Button>
        </div>
      </div>

      {/* Creator Header & Status Control Bar */}
      <Card className="p-5 border-zinc-800 bg-zinc-900/40 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {currentCreator?.channel?.avatarUrl ? (
              <img
                src={currentCreator.channel.avatarUrl}
                alt={creatorTitle}
                className="w-12 h-12 rounded-full border border-zinc-700 object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-200">
                {creatorTitle.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-100">{creatorTitle}</h2>
                {currentCreator?.scores?.tier && (
                  <Badge variant="active" className="text-[10px] px-2 py-0.5">
                    {currentCreator.scores.tier}
                  </Badge>
                )}
                <span className="text-xs font-mono text-zinc-500">v{brief.currentVersion}</span>
              </div>
              <div className="text-xs text-zinc-400 flex items-center gap-3 mt-0.5">
                <span>{currentCreator?.channel?.customUrl || currentCreator?.normalizedKey}</span>
                <span>•</span>
                <span>Median: {formatNumber(contentDraft.successMetrics.medianViewsBenchmark)} views</span>
                <span>•</span>
                <span>Updated: {new Date(brief.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* Status Segmented Control */}
          <div className="flex items-center gap-2 bg-zinc-950 p-1.5 rounded-lg border border-zinc-800">
            <span className="text-[11px] font-semibold text-zinc-400 px-2 uppercase tracking-wider">Status:</span>
            {(['draft', 'needsReview', 'final'] as CreatorBriefStatus[]).map((st) => {
              const isActive = brief.status === st;
              const labels: Record<CreatorBriefStatus, string> = {
                draft: 'Draft',
                needsReview: 'Needs Review',
                final: 'Final',
              };

              let activeClass = 'bg-zinc-800 text-zinc-100 shadow-sm';
              if (isActive && st === 'final') activeClass = 'bg-emerald-950 text-emerald-300 border border-emerald-800';
              if (isActive && st === 'needsReview') activeClass = 'bg-amber-950 text-amber-300 border border-amber-800';

              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => handleStatusChange(st)}
                  className={`text-xs px-3 py-1 rounded-md font-medium transition-all ${
                    isActive ? activeClass : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {labels[st]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Creator's Planned Publish Date (Saved on Creator Document) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-zinc-800/80 text-xs">
          <div className="flex items-center gap-2 text-zinc-300">
            <Calendar className="w-4 h-4 text-indigo-400" />
            <span className="font-semibold">Creator's Planned Publish Date:</span>
            <span className="text-zinc-500">(Saved directly to creator document)</span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={currentCreator?.plannedPublishDate || contentDraft.deliverablesAndTimeline.publishDate || ''}
              onChange={(e) => handlePlannedPublishDateChange(e.target.value)}
              className="rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </Card>

      {/* WARNINGS SUMMARY BANNER IF CLAIMS OR CITATIONS FLAGGED */}
      {(contentDraft.claimWarnings?.length > 0 || contentDraft.citationWarnings?.length > 0) && (
        <Card className="p-4 border-amber-800/60 bg-amber-950/30 space-y-2">
          <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            Automated Validation Alerts Detected ({contentDraft.citationWarnings.length + contentDraft.claimWarnings.length})
          </div>
          <ul className="text-xs text-zinc-300 space-y-1 pl-6 list-disc">
            {contentDraft.citationWarnings.map((w, idx) => (
              <li key={`cit_${idx}`}>
                <span className="text-amber-400 font-semibold">Citation Warning ({w.field}):</span> {w.reason}
              </li>
            ))}
            {contentDraft.claimWarnings.map((w, idx) => (
              <li key={`clm_${idx}`}>
                <span className="text-amber-400 font-semibold">Unapproved Claim in Message #{w.messageIndex + 1}:</span> {w.reason}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* SECTION 1: CREATOR CONTEXT & SNAPSHOT */}
      <Card className="p-5 border-zinc-800 bg-zinc-900/50 space-y-3">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-zinc-100">1. Creator Context & Fit Snapshot</h3>
            {isFieldEdited('creatorSnapshot') && (
              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800">
                Edited
              </span>
            )}
          </div>
          <span className="text-xs text-zinc-500">2 sentences citing past videos</span>
        </div>

        <textarea
          value={contentDraft.creatorSnapshot}
          onChange={(e) => handleFieldChange('creatorSnapshot', e.target.value)}
          rows={3}
          className="w-full rounded-lg bg-zinc-950 border border-zinc-800 p-3 text-xs text-zinc-200 leading-relaxed focus:outline-none focus:border-indigo-500"
        />
      </Card>

      {/* SECTION 2: CAMPAIGN OBJECTIVE */}
      <Card className="p-5 border-zinc-800 bg-zinc-900/50 space-y-3">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-zinc-100">2. Campaign Objective</h3>
            {isFieldEdited('campaignObjective') && (
              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800">
                Edited
              </span>
            )}
          </div>
          <span className="text-xs text-zinc-500">Tied to campaign goal</span>
        </div>

        <textarea
          value={contentDraft.campaignObjective}
          onChange={(e) => handleFieldChange('campaignObjective', e.target.value)}
          rows={2}
          className="w-full rounded-lg bg-zinc-950 border border-zinc-800 p-3 text-xs text-zinc-200 leading-relaxed focus:outline-none focus:border-indigo-500"
        />
      </Card>

      {/* SECTION 3: RECOMMENDED FORMAT */}
      <Card className="p-5 border-zinc-800 bg-zinc-900/50 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-zinc-100">3. Recommended Format</h3>
            {isFieldEdited('recommendedFormat') && (
              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800">
                Edited
              </span>
            )}
          </div>
          <span className="text-xs text-zinc-500">Based on channel upload history</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="text-zinc-400 font-semibold block mb-1">Format Type:</label>
            <select
              value={contentDraft.recommendedFormat.type}
              onChange={(e) => handleFieldChange('recommendedFormat.type', e.target.value)}
              className="w-full rounded-lg bg-zinc-950 border border-zinc-800 p-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="dedicated video">Dedicated Video</option>
              <option value="integrated segment">Integrated Segment</option>
              <option value="Short">Short</option>
            </select>
          </div>

          <div>
            <label className="text-zinc-400 font-semibold block mb-1">Target Length:</label>
            <input
              type="text"
              value={contentDraft.recommendedFormat.targetLength}
              onChange={(e) => handleFieldChange('recommendedFormat.targetLength', e.target.value)}
              className="w-full rounded-lg bg-zinc-950 border border-zinc-800 p-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="text-zinc-400 font-semibold block mb-1">Placement:</label>
            <input
              type="text"
              value={contentDraft.recommendedFormat.placement}
              onChange={(e) => handleFieldChange('recommendedFormat.placement', e.target.value)}
              className="w-full rounded-lg bg-zinc-950 border border-zinc-800 p-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="text-zinc-400 font-semibold block mb-1 text-xs">Format Rationale:</label>
          <textarea
            value={contentDraft.recommendedFormat.rationale}
            onChange={(e) => handleFieldChange('recommendedFormat.rationale', e.target.value)}
            rows={2}
            className="w-full rounded-lg bg-zinc-950 border border-zinc-800 p-2.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </Card>

      {/* SECTION 4: CONTENT ANGLES (EXACTLY 3) */}
      <Card className="p-5 border-zinc-800 bg-zinc-900/50 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-zinc-100">4. Proposed Creative Angles (3 Concepts)</h3>
            {isFieldEdited('contentAngles') && (
              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800">
                Edited
              </span>
            )}
          </div>
          <span className="text-xs text-zinc-500">Each tailored to past uploads</span>
        </div>

        <div className="space-y-4">
          {contentDraft.contentAngles.map((angle, idx) => {
            const hasCitWarning = contentDraft.citationWarnings?.some((w) =>
              w.field.includes(`contentAngles.${idx}`)
            );

            return (
              <div
                key={idx}
                className={`p-4 rounded-xl border bg-zinc-950/60 space-y-3 text-xs ${
                  hasCitWarning ? 'border-amber-700/80 bg-amber-950/10' : 'border-zinc-800/80'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-indigo-400 uppercase text-[11px] tracking-wider">
                      Option {idx + 1}
                    </span>
                    {isFieldEdited(`contentAngles.${idx}`) && (
                      <span className="text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-400 border border-indigo-800">
                        Edited
                      </span>
                    )}
                  </div>
                  {hasCitWarning && (
                    <span className="text-[10px] text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Citation alert
                    </span>
                  )}
                </div>

                <div>
                  <label className="text-zinc-400 font-semibold block mb-1">Angle Title:</label>
                  <input
                    type="text"
                    value={angle.title}
                    onChange={(e) => handleFieldChange(`contentAngles.${idx}.title`, e.target.value)}
                    className="w-full rounded-lg bg-zinc-900 border border-zinc-800 p-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 font-semibold"
                  />
                </div>

                <div>
                  <label className="text-zinc-400 font-semibold block mb-1">First 10-Second Hook:</label>
                  <input
                    type="text"
                    value={angle.hook}
                    onChange={(e) => handleFieldChange(`contentAngles.${idx}.hook`, e.target.value)}
                    className="w-full rounded-lg bg-zinc-900 border border-zinc-800 p-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-zinc-400 font-semibold block mb-1">Story Beats Outline:</label>
                  <div className="space-y-1.5">
                    {angle.outline.map((beat, bIdx) => (
                      <div key={bIdx} className="flex items-center gap-2">
                        <span className="text-zinc-500 font-mono w-4">{bIdx + 1}.</span>
                        <input
                          type="text"
                          value={beat}
                          onChange={(e) => {
                            const newOutline = [...angle.outline];
                            newOutline[bIdx] = e.target.value;
                            handleFieldChange(`contentAngles.${idx}.outline`, newOutline);
                          }}
                          className="flex-1 rounded bg-zinc-900 border border-zinc-800 px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                        />
                        {angle.outline.length > 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newOutline = angle.outline.filter((_, i) => i !== bIdx);
                              handleFieldChange(`contentAngles.${idx}.outline`, newOutline);
                            }}
                            className="text-zinc-500 hover:text-rose-400 p-1"
                            title="Remove beat"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                    {angle.outline.length < 6 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          handleFieldChange(`contentAngles.${idx}.outline`, [...angle.outline, 'Next story beat']);
                        }}
                        className="text-[11px] h-6 px-2 text-indigo-400 hover:text-indigo-300"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Add Beat
                      </Button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-zinc-400 font-semibold block mb-1">Why It Fits This Creator (Cites Past Video):</label>
                  <textarea
                    value={angle.whyItFitsThisCreator}
                    onChange={(e) => handleFieldChange(`contentAngles.${idx}.whyItFitsThisCreator`, e.target.value)}
                    rows={2}
                    className="w-full rounded-lg bg-zinc-900 border border-zinc-800 p-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* SECTION 5: KEY MESSAGES */}
      <Card className="p-5 border-zinc-800 bg-zinc-900/50 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-zinc-100">5. Key Talking Points (3–5 Messages)</h3>
            {isFieldEdited('keyMessages') && (
              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800">
                Edited
              </span>
            )}
          </div>
          <span className="text-xs text-zinc-500">Drawn strictly from approved facts</span>
        </div>

        <div className="space-y-2 text-xs">
          {contentDraft.keyMessages.map((msg, idx) => {
            const warning = contentDraft.claimWarnings?.find((w) => w.messageIndex === idx);

            return (
              <div key={idx} className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 font-mono w-4">{idx + 1}.</span>
                  <input
                    type="text"
                    value={msg}
                    onChange={(e) => {
                      const newMsgs = [...contentDraft.keyMessages];
                      newMsgs[idx] = e.target.value;
                      handleFieldChange('keyMessages', newMsgs);
                    }}
                    className={`flex-1 rounded-lg bg-zinc-950 border p-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 ${
                      warning ? 'border-amber-700 bg-amber-950/20' : 'border-zinc-800'
                    }`}
                  />
                  {contentDraft.keyMessages.length > 3 && (
                    <button
                      type="button"
                      onClick={() => {
                        const newMsgs = contentDraft.keyMessages.filter((_, i) => i !== idx);
                        handleFieldChange('keyMessages', newMsgs);
                      }}
                      className="text-zinc-500 hover:text-rose-400 p-1"
                      title="Remove message"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {warning && (
                  <div className="pl-6 text-[11px] text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    <span>{warning.reason}</span>
                  </div>
                )}
              </div>
            );
          })}

          {contentDraft.keyMessages.length < 6 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                handleFieldChange('keyMessages', [...contentDraft.keyMessages, 'New approved key message']);
              }}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Key Message
            </Button>
          )}
        </div>
      </Card>

      {/* SECTION 6: BRAND GUIDELINES (DOS AND DON'TS) */}
      <Card className="p-5 border-zinc-800 bg-zinc-900/50 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-zinc-100">6. Brand Guidelines & Safety Guardrails</h3>
            {(isFieldEdited('dos') || isFieldEdited('donts')) && (
              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800">
                Edited
              </span>
            )}
          </div>
          <span className="text-xs text-zinc-500">Each cites a rule code</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Dos */}
          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
            <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              Do:
            </div>
            <div className="space-y-2">
              {contentDraft.dos.map((d, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] font-mono text-zinc-300">
                      {d.ruleCode}
                    </span>
                    <input
                      type="text"
                      value={d.instruction}
                      onChange={(e) => {
                        const newDos = [...contentDraft.dos];
                        newDos[idx] = { ...d, instruction: e.target.value };
                        handleFieldChange('dos', newDos);
                      }}
                      className="flex-1 rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Don'ts */}
          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
            <div className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4" />
              Do NOT:
            </div>
            <div className="space-y-2">
              {contentDraft.donts.map((d, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] font-mono text-zinc-300">
                      {d.ruleCode}
                    </span>
                    <input
                      type="text"
                      value={d.instruction}
                      onChange={(e) => {
                        const newDonts = [...contentDraft.donts];
                        newDonts[idx] = { ...d, instruction: e.target.value };
                        handleFieldChange('donts', newDonts);
                      }}
                      className="flex-1 rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* SECTION 7 & 8: MANDATORY DISCLOSURES & TRACKED CTA */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Mandatory Disclosures */}
        <Card className="p-5 border-zinc-800 bg-zinc-900/50 space-y-3 text-xs">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-1.5">
              <Info className="w-4 h-4 text-indigo-400" />
              7. Mandatory Disclosures
            </h3>
            <span className="text-[10px] font-mono text-zinc-500">FTC Rule Invariant</span>
          </div>

          <div>
            <label className="text-zinc-400 font-semibold block mb-1">Description Disclosure:</label>
            <input
              type="text"
              value={contentDraft.mandatoryDisclosures.descriptionText}
              onChange={(e) => handleFieldChange('mandatoryDisclosures.descriptionText', e.target.value)}
              className="w-full rounded bg-zinc-950 border border-zinc-800 p-2 text-xs text-zinc-200 font-mono"
            />
          </div>

          <div>
            <label className="text-zinc-400 font-semibold block mb-1">Verbal Disclosure (Within first 30s):</label>
            <textarea
              value={contentDraft.mandatoryDisclosures.verbalText}
              onChange={(e) => handleFieldChange('mandatoryDisclosures.verbalText', e.target.value)}
              rows={2}
              className="w-full rounded bg-zinc-950 border border-zinc-800 p-2 text-xs text-zinc-200"
            />
          </div>
        </Card>

        {/* Tracked Call to Action */}
        <Card className="p-5 border-zinc-800 bg-zinc-900/50 space-y-3 text-xs">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-1.5">
              <ExternalLink className="w-4 h-4 text-indigo-400" />
              8. Tracked Landing Page Link
            </h3>
            <span className="text-[10px] font-mono text-zinc-500">UTM Auto-Encoded</span>
          </div>

          <p className="text-zinc-400 text-[11px]">
            Must be pinned in the top 3 lines of video description:
          </p>

          <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800 font-mono text-[11px] text-indigo-300 break-all select-all">
            {contentDraft.callToAction}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(contentDraft.callToAction);
              showToast('Tracked URL copied', 'success');
            }}
            className="text-xs text-zinc-400 hover:text-zinc-200"
          >
            <Copy className="w-3 h-3 mr-1" />
            Copy Tracked Link
          </Button>
        </Card>
      </div>

      {/* SECTION 9 & 10: TIMELINE & SUCCESS METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Timeline */}
        <Card className="p-5 border-zinc-800 bg-zinc-900/50 space-y-3 text-xs">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-indigo-400" />
              9. Deliverables Schedule
            </h3>
            <span className="text-[10px] text-zinc-500">Standard Milestones</span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between p-2 rounded bg-zinc-950 border border-zinc-800">
              <span className="text-zinc-400">First Cut / Video Draft Due:</span>
              <span className="font-mono text-zinc-200 font-bold">{contentDraft.deliverablesAndTimeline.draftDue}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-zinc-950 border border-zinc-800">
              <span className="text-zinc-400">Feedback Window:</span>
              <span className="font-mono text-zinc-200 font-bold">Within {contentDraft.deliverablesAndTimeline.feedbackWithinDays} business days</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-zinc-950 border border-zinc-800">
              <span className="text-zinc-400">Final Approved Cut Due:</span>
              <span className="font-mono text-zinc-200 font-bold">{contentDraft.deliverablesAndTimeline.finalDue}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-zinc-950 border border-zinc-800">
              <span className="text-zinc-400">Target Publish Date:</span>
              <span className="font-mono text-indigo-400 font-bold">{contentDraft.deliverablesAndTimeline.publishDate}</span>
            </div>
          </div>
        </Card>

        {/* Success Metrics */}
        <Card className="p-5 border-zinc-800 bg-zinc-900/50 space-y-3 text-xs">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              10. Performance Expectations
            </h3>
            <span className="text-[10px] text-zinc-500">Benchmarked against channel</span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
              <span className="text-zinc-500 block text-[10px]">Target Views (90% median)</span>
              <span className="text-lg font-bold font-mono text-zinc-100 block">
                {formatNumber(contentDraft.successMetrics.targetViews)}
              </span>
              <span className="text-[10px] text-zinc-500 block">
                Channel median: {formatNumber(contentDraft.successMetrics.medianViewsBenchmark)}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
              <span className="text-zinc-500 block text-[10px]">Target Engagement Rate</span>
              <span className="text-lg font-bold font-mono text-zinc-100 block">
                {formatPercent(contentDraft.successMetrics.targetEngagementRate)}
              </span>
              <span className="text-[10px] text-zinc-500 block">
                Channel median: {formatPercent(contentDraft.successMetrics.medianEngagementBenchmark)}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-zinc-500 leading-relaxed pt-1">
            Metrics represent baseline contractual delivery thresholds for post-campaign sponsor review.
          </p>
        </Card>
      </div>

      {/* FLOATING SAVE BAR WITH UNSAVED CHANGES GUARD */}
      {hasUnsavedChanges && (
        <div data-sticky-bottom-bar="true" className="fixed bottom-6 inset-x-0 z-40 max-w-xl mx-auto px-4 animate-slideUp">
          <div className="p-3 rounded-xl bg-zinc-900 border border-indigo-500/80 shadow-2xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-zinc-200">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span className="font-semibold">Unsaved edits in brief</span>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs text-zinc-400">
                Discard
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                isLoading={updateBriefContentMutation.isPending}
                className="text-xs gap-1.5 shadow-lg shadow-indigo-500/20"
              >
                <Save className="w-3.5 h-3.5" />
                Save Brief (New Version)
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* VERSION HISTORY DRAWER */}
      {isVersionDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 flex justify-end">
          <div className="w-full max-w-md bg-zinc-900 border-l border-zinc-800 h-full p-6 flex flex-col justify-between overflow-y-auto space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-base font-bold text-zinc-100">Brief Version History</h3>
                </div>
                <button
                  onClick={() => setIsVersionDrawerOpen(false)}
                  className="text-zinc-500 hover:text-zinc-300 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-zinc-400">
                History is immutable. Restoring any previous version safely creates a new snapshot without overwriting past work.
              </p>

              <div className="space-y-3 pt-2">
                {versions.length === 0 ? (
                  <p className="text-xs text-zinc-500 italic">No historical snapshots recorded yet.</p>
                ) : (
                  versions.map((v) => {
                    const isCurrent = v.versionNumber === brief.currentVersion;

                    return (
                      <div
                        key={v.id || v.versionNumber}
                        className={`p-3.5 rounded-xl border space-y-2 text-xs transition-all ${
                          isCurrent
                            ? 'border-indigo-700 bg-indigo-950/20 shadow-sm'
                            : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-zinc-100 font-mono text-sm">
                              v{v.versionNumber}
                            </span>
                            {isCurrent && (
                              <Badge variant="active" className="text-[10px] px-1.5 py-0.5">
                                Current
                              </Badge>
                            )}
                            <Badge variant="draft" className="text-[10px] px-1.5 py-0.5">
                              {v.status}
                            </Badge>
                          </div>
                          <span className="text-[11px] text-zinc-500">
                            {new Date(v.savedAt).toLocaleDateString()}
                          </span>
                        </div>

                        {v.changeNote && (
                          <p className="text-zinc-300 text-xs italic">"{v.changeNote}"</p>
                        )}

                        <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1 border-t border-zinc-800/60">
                          <span>{v.editedFields.length} edited fields</span>
                          <span>by {v.savedBy}</span>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCompareVersion(v)}
                            className="text-[11px] h-7 px-2.5 text-zinc-300"
                          >
                            <GitCompare className="w-3 h-3 mr-1" />
                            Compare
                          </Button>
                          {!isCurrent && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleRestoreVersion(v.versionNumber)}
                              isLoading={restoreBriefVersionMutation.isPending}
                              className="text-[11px] h-7 px-2.5 text-indigo-300 hover:text-indigo-200"
                            >
                              <RotateCcw className="w-3 h-3 mr-1" />
                              Restore as New
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <Button variant="outline" size="sm" onClick={() => setIsVersionDrawerOpen(false)} className="w-full">
              Close Drawer
            </Button>
          </div>
        </div>
      )}

      {/* SIDE-BY-SIDE VERSION COMPARE DIALOG */}
      {compareVersion && (
        <Dialog
          isOpen={Boolean(compareVersion)}
          onClose={() => setCompareVersion(null)}
          title={`Compare v${compareVersion.versionNumber} with Current (v${brief.currentVersion})`}
        >
          <div className="space-y-4 text-xs max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              {/* Snapshot Version */}
              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                <div className="border-b border-zinc-800 pb-2">
                  <div className="font-bold text-zinc-200 text-sm">v{compareVersion.versionNumber} Snapshot</div>
                  <div className="text-[11px] text-zinc-500">Saved: {new Date(compareVersion.savedAt).toLocaleString()}</div>
                </div>

                <div className="space-y-2">
                  <span className="font-semibold text-zinc-400 block">Creator Snapshot:</span>
                  <p className="text-zinc-300 leading-relaxed">{compareVersion.content.creatorSnapshot}</p>
                </div>

                <div className="space-y-1">
                  <span className="font-semibold text-zinc-400 block">Recommended Format:</span>
                  <div className="text-zinc-300">
                    {compareVersion.content.recommendedFormat.type} ({compareVersion.content.recommendedFormat.targetLength})
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="font-semibold text-zinc-400 block">Angles:</span>
                  <ul className="list-disc pl-4 space-y-1 text-zinc-300">
                    {compareVersion.content.contentAngles.map((a, i) => (
                      <li key={i}>{a.title}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Current Version */}
              <div className="p-3.5 rounded-xl bg-zinc-950 border border-indigo-800/80 space-y-3">
                <div className="border-b border-zinc-800 pb-2">
                  <div className="font-bold text-indigo-300 text-sm">v{brief.currentVersion} (Current)</div>
                  <div className="text-[11px] text-zinc-500">Updated: {new Date(brief.updatedAt).toLocaleString()}</div>
                </div>

                <div className="space-y-2">
                  <span className="font-semibold text-zinc-400 block">Creator Snapshot:</span>
                  <p className="text-zinc-300 leading-relaxed">{contentDraft.creatorSnapshot}</p>
                </div>

                <div className="space-y-1">
                  <span className="font-semibold text-zinc-400 block">Recommended Format:</span>
                  <div className="text-zinc-300">
                    {contentDraft.recommendedFormat.type} ({contentDraft.recommendedFormat.targetLength})
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="font-semibold text-zinc-400 block">Angles:</span>
                  <ul className="list-disc pl-4 space-y-1 text-zinc-300">
                    {contentDraft.contentAngles.map((a, i) => (
                      <li key={i}>{a.title}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-zinc-800">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleRestoreVersion(compareVersion.versionNumber)}
                isLoading={restoreBriefVersionMutation.isPending}
                className="gap-1 text-indigo-300"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restore v{compareVersion.versionNumber} as New Version
              </Button>

              <Button variant="outline" size="sm" onClick={() => setCompareVersion(null)}>
                Close Comparison
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* REGENERATE MODAL WITH PRESERVE EDITS WARNING */}
      <Dialog
        isOpen={showRegenModal}
        onClose={() => setShowRegenModal(false)}
        title={`Regenerate Collaboration Brief: ${creatorTitle}`}
      >
        <div className="space-y-4 text-xs">
          <p className="text-zinc-300">
            Regenerate AI-synthesized sections using updated brief direction or specific tone requests.
          </p>

          <div className="space-y-1.5">
            <label className="text-zinc-300 font-semibold block">
              Creative Instruction / Direction:
            </label>
            <textarea
              value={regenInstruction}
              onChange={(e) => setRegenInstruction(e.target.value)}
              placeholder="e.g. Make it more focused on outdoor trail setups; emphasize travel portability over studio aesthetics"
              rows={3}
              className="w-full rounded-lg bg-zinc-950 border border-zinc-800 p-2.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer pt-1 p-3 rounded-lg bg-zinc-950 border border-zinc-800">
            <input
              type="checkbox"
              checked={preserveEdits}
              onChange={(e) => setPreserveEdits(e.target.checked)}
              className="rounded bg-zinc-900 border-zinc-700 text-indigo-600 focus:ring-indigo-500 mt-0.5"
            />
            <div>
              <span className="text-zinc-200 font-semibold block">Keep my manual edits (Default)</span>
              <span className="text-zinc-400 text-[11px] block mt-0.5">
                Preserves any fields you previously modified in the editor.
              </span>
            </div>
          </label>

          {/* Warning listing fields that will be replaced */}
          <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-900/40 text-[11px] text-amber-200 space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              Impact Preview:
            </div>
            {preserveEdits && brief.editedFields.length > 0 ? (
              <p>
                The following {brief.editedFields.length} user-edited field(s) will be strictly kept:{' '}
                <span className="font-mono text-zinc-300">{brief.editedFields.slice(0, 3).join(', ')}{brief.editedFields.length > 3 ? '...' : ''}</span>. All other sections will be refreshed.
              </p>
            ) : (
              <p>
                All creative angles, talking points, and snapshot text will be regenerated with new AI output.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
            <Button variant="outline" size="sm" onClick={() => setShowRegenModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleRegenerate}
              isLoading={regenerateBriefMutation.isPending}
              className="gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Regenerate Brief
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
