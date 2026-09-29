import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Sparkles,
  Play,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Download,
  RefreshCw,
  Clock,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Calendar,
  Layers,
  ChevronRight,
  Trash2,
  AlertTriangle,
  Info,
  Edit3,
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
  useBriefs,
  useActiveBriefJob,
  useBriefMutations,
} from '../../hooks/useBriefs.ts';
import { Creator, CreatorBrief } from '@/shared/types.ts';
import { formatNumber } from '@/shared/format.ts';

export function BriefsListPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: campaign } = useCampaign(campaignId);
  const { data: briefData } = useCampaignBrief(campaignId);
  const { data: creators = [] } = useCreators(campaignId);
  const { data: briefs = [], isLoading: isBriefsLoading } = useBriefs(campaignId);
  const { data: activeJob } = useActiveBriefJob(campaignId);

  const {
    generateBriefsMutation,
    regenerateBriefMutation,
    deleteBriefMutation,
  } = useBriefMutations(campaignId);

  // Monitor active brief generation/regeneration job to refresh briefs list on completion
  const prevActiveJobRef = useRef(activeJob);
  useEffect(() => {
    if (prevActiveJobRef.current && !activeJob) {
      // Background job finished! Invalidate briefs list and campaign queries
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId, 'briefs'] });
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
    }
    prevActiveJobRef.current = activeJob;
  }, [activeJob, campaignId, queryClient]);

  // Modal states
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [batchInstruction, setBatchInstruction] = useState('');
  const [forceRegenerate, setForceRegenerate] = useState(false);

  const [regenTargetCreator, setRegenTargetCreator] = useState<Creator | null>(null);
  const [singleInstruction, setSingleInstruction] = useState('');
  const [preserveEdits, setPreserveEdits] = useState(true);

  const [briefToDelete, setBriefToDelete] = useState<string | null>(null);

  // Extract approved lineup creator IDs
  const approvedCreatorIds = useMemo(() => {
    if (!campaign?.approvedLineup) return [];
    if (Array.isArray(campaign.approvedLineup)) {
      return campaign.approvedLineup;
    }
    return campaign.approvedLineup.creatorIds || [];
  }, [campaign]);

  const approvedCreators = useMemo(() => {
    return approvedCreatorIds
      .map((id) => creators.find((c) => c.id === id))
      .filter(Boolean) as Creator[];
  }, [approvedCreatorIds, creators]);

  const briefMap = useMemo(() => {
    const map = new Map<string, CreatorBrief>();
    briefs.forEach((b) => map.set(b.creatorId, b));
    return map;
  }, [briefs]);

  // Check if lineup changed after briefs were created
  const lineupMismatchWarning = useMemo(() => {
    if (approvedCreatorIds.length === 0) return null;
    const missingBriefs = approvedCreatorIds.filter((id) => !briefMap.has(id));
    const extraBriefs = briefs.filter((b) => !approvedCreatorIds.includes(b.creatorId));

    if (missingBriefs.length > 0 || extraBriefs.length > 0) {
      return {
        missingCount: missingBriefs.length,
        extraCount: extraBriefs.length,
      };
    }
    return null;
  }, [approvedCreatorIds, briefs, briefMap]);

  // Check completion: Every approved creator has a brief with status 'final'
  const isStepComplete = useMemo(() => {
    if (approvedCreatorIds.length === 0) return false;
    return approvedCreatorIds.every((id) => {
      const b = briefMap.get(id);
      return b?.status === 'final';
    });
  }, [approvedCreatorIds, briefMap]);

  const completedCount = useMemo(() => {
    return approvedCreatorIds.filter((id) => briefMap.get(id)?.status === 'final').length;
  }, [approvedCreatorIds, briefMap]);

  const handleBatchGenerate = async () => {
    await generateBriefsMutation.mutateAsync({
      creatorIds: approvedCreatorIds,
      instruction: batchInstruction.trim() || undefined,
      force: forceRegenerate,
    });
    setShowGenerateModal(false);
    setBatchInstruction('');
  };

  const handleSingleRegenerate = async () => {
    if (!regenTargetCreator) return;
    await regenerateBriefMutation.mutateAsync({
      creatorId: regenTargetCreator.id,
      instruction: singleInstruction.trim() || undefined,
      preserveEdits,
    });
    setRegenTargetCreator(null);
    setSingleInstruction('');
  };

  const handleDownloadZip = () => {
    if (!campaignId) return;
    window.location.href = `/api/v1/campaigns/${campaignId}/briefs/export.zip`;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-28">
      <SEO
        title={campaign ? `${campaign.name} — Creator Briefs (Step 5)` : 'Creator Briefs — Step 5'}
        description="Tailored creator briefs with non-hallucinated timelines, tracking links, and mandatory FTC disclosures."
      />
      {/* Header & Stepper Badge */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-950/60 text-indigo-400 border border-indigo-800/60">
              Phase 5 • Step 5
            </span>
            {isStepComplete ? (
              <Badge variant="active" className="text-xs">
                <CheckCircle2 className="w-3 h-3 text-emerald-400 inline mr-1" />
                All Briefs Finalized
              </Badge>
            ) : (
              <Badge variant="draft" className="text-xs">
                <Clock className="w-3 h-3 text-amber-400 inline mr-1" />
                {completedCount}/{approvedCreatorIds.length} Finalized
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            Creator Collaboration Briefs
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Generate tailored commercial collaboration briefs for your approved creator lineup with verified video citations and contractual guardrails.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          {briefs.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadZip}
              className="text-xs gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Export All (.zip)
            </Button>
          )}

          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowGenerateModal(true)}
            disabled={approvedCreatorIds.length === 0}
            className="text-xs gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {briefs.length > 0 ? 'Batch Regenerate' : 'Generate All Briefs'}
          </Button>
        </div>
      </div>

      {/* ACTIVE BACKGROUND JOB BANNER */}
      {activeJob && (
        <Card className="p-4 border-indigo-500/50 bg-indigo-950/20 animate-pulse">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
              <div>
                <div className="text-xs font-semibold text-zinc-200">
                  {activeJob.progress.message || 'Generating creator briefs...'}
                </div>
                <div className="text-[11px] text-zinc-400">
                  Engine 2 is tailoring creative hooks, talking points, and contractual milestones.
                </div>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-indigo-300">
              {activeJob.progress.done}%
            </span>
          </div>
          <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-3">
            <div
              className="bg-indigo-500 h-full transition-all duration-300"
              style={{ width: `${Math.max(5, activeJob.progress.done)}%` }}
            />
          </div>
        </Card>
      )}

      {/* NO APPROVED LINEUP WARNING */}
      {approvedCreatorIds.length === 0 && (
        <Card className="p-8 border-amber-900/50 bg-amber-950/20 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-amber-900/40 border border-amber-800 text-amber-300 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-zinc-100">Approved Creator Lineup Required</h3>
            <p className="text-xs text-zinc-400 max-w-lg mx-auto">
              Only creators in an approved campaign lineup receive collaboration briefs. Please complete Step 4 (Pre-Mortem Simulator) and approve your lineup to proceed.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate(`/campaigns/${campaignId}/premortem`)}
            className="text-xs gap-1.5"
          >
            Go to Pre-Mortem Simulator
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </Card>
      )}

      {/* LINEUP MISMATCH WARNING BANNER */}
      {lineupMismatchWarning && (
        <div className="p-3.5 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="font-semibold text-amber-100">Lineup Modified Notice</div>
            <p className="text-zinc-300">
              Your approved lineup has changed since briefs were last created.
              {lineupMismatchWarning.missingCount > 0 && ` ${lineupMismatchWarning.missingCount} approved creator(s) lack a brief.`}
              {lineupMismatchWarning.extraCount > 0 && ` ${lineupMismatchWarning.extraCount} existing brief(s) belong to creators no longer in the lineup.`}
            </p>
          </div>
        </div>
      )}

      {/* APPROVED CREATOR BRIEFS GRID */}
      {approvedCreators.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Approved Creators ({approvedCreators.length})</span>
            <span>
              {completedCount} of {approvedCreators.length} Finalized
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {approvedCreators.map((creator) => {
              const brief = briefMap.get(creator.id);
              const title = creator.channel?.title || creator.normalizedKey;
              const hasBrief = Boolean(brief);

              return (
                <Card
                  key={creator.id}
                  className={`p-5 flex flex-col justify-between transition-all border ${
                    brief?.status === 'final'
                      ? 'border-emerald-800/40 bg-zinc-900/60'
                      : brief?.status === 'needsReview'
                      ? 'border-amber-800/50 bg-zinc-900/60'
                      : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Creator Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {creator.channel?.avatarUrl ? (
                          <img
                            src={creator.channel.avatarUrl}
                            alt={title}
                            className="w-10 h-10 rounded-full border border-zinc-700 shrink-0 object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 text-sm font-bold text-zinc-300">
                            {title.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-zinc-100 truncate" title={title}>
                            {title}
                          </h3>
                          <div className="text-[11px] text-zinc-400 truncate">
                            {creator.channel?.customUrl || creator.normalizedKey}
                          </div>
                        </div>
                      </div>

                      {/* Status Badge */}
                      {brief ? (
                        <div className="shrink-0">
                          {brief.status === 'final' ? (
                            <Badge variant="active" className="text-[10px] px-2 py-0.5">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400 inline mr-1" />
                              Final
                            </Badge>
                          ) : brief.status === 'needsReview' ? (
                            <Badge variant="draft" className="text-[10px] px-2 py-0.5 bg-amber-950/80 text-amber-300 border-amber-800/80">
                              <AlertCircle className="w-3 h-3 text-amber-400 inline mr-1" />
                              Needs Review
                            </Badge>
                          ) : (
                            <Badge variant="draft" className="text-[10px] px-2 py-0.5">
                              Draft
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <Badge variant="draft" className="text-[10px] px-2 py-0.5 text-zinc-500 bg-zinc-800/50">
                          Not Generated
                        </Badge>
                      )}
                    </div>

                    {/* Brief Telemetry or Placeholder */}
                    {brief ? (
                      <div className="space-y-2 pt-2 border-t border-zinc-800/70 text-xs">
                        <div className="text-zinc-300 line-clamp-2 leading-relaxed">
                          {brief.content.creatorSnapshot}
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                          <div>
                            <span className="text-zinc-500 block">Recommended:</span>
                            <span className="font-medium text-zinc-200 truncate block">
                              {brief.content.recommendedFormat.type}
                            </span>
                          </div>
                          <div>
                            <span className="text-zinc-500 block">Target Views:</span>
                            <span className="font-mono text-zinc-200 block">
                              {formatNumber(brief.content.successMetrics.targetViews)}
                            </span>
                          </div>
                        </div>

                        {/* Warnings if citations or claims flagged */}
                        {(brief.content.claimWarnings?.length > 0 || brief.content.citationWarnings?.length > 0) && (
                          <div className="p-2 rounded bg-amber-950/30 border border-amber-900/50 text-[10px] text-amber-300 flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                            <span>
                              {brief.content.citationWarnings?.length || 0} citation alert(s),{' '}
                              {brief.content.claimWarnings?.length || 0} unverified claim(s)
                            </span>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1">
                          <span>Version {brief.currentVersion}</span>
                          <span>Updated {new Date(brief.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="py-4 text-center border-t border-zinc-800/70">
                        <p className="text-xs text-zinc-500">
                          Brief pending generation based on channel benchmarks.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Card Action Buttons */}
                  <div className="flex items-center justify-between gap-2 pt-4 border-t border-zinc-800/60 mt-3">
                    {hasBrief ? (
                      <>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => navigate(`/campaigns/${campaignId}/briefs/${creator.id}`)}
                          className="text-xs flex-1 gap-1"
                        >
                          <Edit3 className="w-3 h-3" />
                          Open Editor
                        </Button>

                        <button
                          type="button"
                          onClick={() => setRegenTargetCreator(creator)}
                          className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                          title="Regenerate brief"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>

                        <a
                          href={`/api/v1/campaigns/${campaignId}/briefs/${creator.id}/export?format=md`}
                          download
                          className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                          title="Download Markdown"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>

                        <button
                          type="button"
                          onClick={() => setBriefToDelete(creator.id)}
                          className="p-2 rounded-lg bg-zinc-800 hover:bg-rose-950 text-zinc-400 hover:text-rose-300 transition-colors"
                          title="Delete brief"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          generateBriefsMutation.mutate({
                            creatorIds: [creator.id],
                            force: true,
                          });
                        }}
                        isLoading={generateBriefsMutation.isPending}
                        className="text-xs w-full gap-1.5"
                      >
                        <Sparkles className="w-3 h-3 text-indigo-400" />
                        Generate Brief
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* BATCH GENERATE MODAL */}
      <Dialog
        isOpen={showGenerateModal}
        onClose={() => setShowGenerateModal(false)}
        title="Batch Generate Creator Collaboration Briefs"
      >
        <div className="space-y-4 text-xs">
          <p className="text-zinc-300">
            Generate customized briefs for{' '}
            <strong className="text-zinc-100">{approvedCreatorIds.length} approved lineup creators</strong>.
            Each brief incorporates channel metrics, top past video formats, mandatory FTC disclosures, and approved brand facts.
          </p>

          <div className="space-y-1.5">
            <label className="text-zinc-300 font-semibold block">
              Optional Creative Direction / User Instruction:
            </label>
            <textarea
              value={batchInstruction}
              onChange={(e) => setBatchInstruction(e.target.value)}
              placeholder="e.g. Focus on camping & outdoor morning routines; keep tone lighthearted and humorous"
              rows={3}
              className="w-full rounded-lg bg-zinc-950 border border-zinc-800 p-2.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
            <p className="text-[11px] text-zinc-500">
              This direction will be provided to the AI strategist across all briefs.
            </p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={forceRegenerate}
              onChange={(e) => setForceRegenerate(e.target.checked)}
              className="rounded bg-zinc-950 border-zinc-800 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-zinc-300">
              Overwrite briefs that are already marked as Final
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
            <Button variant="outline" size="sm" onClick={() => setShowGenerateModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleBatchGenerate}
              isLoading={generateBriefsMutation.isPending}
              className="gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Start Generation
            </Button>
          </div>
        </div>
      </Dialog>

      {/* SINGLE REGENERATE MODAL */}
      <Dialog
        isOpen={Boolean(regenTargetCreator)}
        onClose={() => setRegenTargetCreator(null)}
        title={`Regenerate Brief: ${regenTargetCreator?.channel?.title || regenTargetCreator?.normalizedKey}`}
      >
        <div className="space-y-4 text-xs">
          <p className="text-zinc-300">
            Regenerate creative angles, hooks, and talking points with fresh AI guidance.
          </p>

          <div className="space-y-1.5">
            <label className="text-zinc-300 font-semibold block">
              Special Creative Instruction:
            </label>
            <textarea
              value={singleInstruction}
              onChange={(e) => setSingleInstruction(e.target.value)}
              placeholder="e.g. Focus more on technical pressure extraction and compare against manual espresso levers"
              rows={3}
              className="w-full rounded-lg bg-zinc-950 border border-zinc-800 p-2.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={preserveEdits}
              onChange={(e) => setPreserveEdits(e.target.checked)}
              className="rounded bg-zinc-950 border-zinc-800 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="text-zinc-200 font-medium block">Keep my manual edits (Recommended)</span>
              <span className="text-zinc-500 text-[11px] block">
                Preserves any fields you previously edited in the editor while regenerating remaining sections.
              </span>
            </div>
          </label>

          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
            <Button variant="outline" size="sm" onClick={() => setRegenTargetCreator(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSingleRegenerate}
              isLoading={regenerateBriefMutation.isPending}
              className="gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Regenerate Brief
            </Button>
          </div>
        </div>
      </Dialog>

      {/* DELETE CONFIRMATION MODAL */}
      <Dialog
        isOpen={Boolean(briefToDelete)}
        onClose={() => setBriefToDelete(null)}
        title="Delete Creator Collaboration Brief"
      >
        <div className="space-y-4 text-xs text-zinc-300">
          <p>
            Are you sure you want to delete this creator brief? All generated angles and version history for this creator will be removed.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setBriefToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                if (!briefToDelete) return;
                await deleteBriefMutation.mutateAsync(briefToDelete);
                setBriefToDelete(null);
              }}
              isLoading={deleteBriefMutation.isPending}
            >
              Delete Brief
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
