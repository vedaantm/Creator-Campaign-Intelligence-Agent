import React, { useState } from 'react';
import { useOutletContext, useNavigate, Link } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  ArrowRight,
  Edit2,
  Check,
  ChevronRight,
  Activity as ActivityIcon,
  Shield,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Campaign, CampaignStatus, ALLOWED_STATUS_TRANSITIONS, isBriefComplete } from '@/shared/types.ts';
import { CONFIG } from '@/shared/config.ts';
import { formatRelativeTime } from '@/shared/format.ts';
import { useCampaignMutations } from '../../hooks/useCampaigns.ts';
import { useCreators } from '../../hooks/useCreators.ts';
import { useBriefs } from '../../hooks/useBriefs.ts';
import { Button, Card, Badge, Input } from '../common/UIComponents.tsx';
import { ActivityLog } from '../common/ActivityLog.tsx';
import { SEO } from '../common/SEO.tsx';

export function CampaignOverviewPage() {
  const { campaign } = useOutletContext<{ campaign: Campaign }>();
  const navigate = useNavigate();
  const { updateMutation } = useCampaignMutations();

  const { data: creators = [] } = useCreators(campaign.id);
  const { data: briefs = [] } = useBriefs(campaign.id);

  // Derive approved lineup IDs
  const approvedCreatorIds = campaign.approvedLineup
    ? Array.isArray(campaign.approvedLineup)
      ? campaign.approvedLineup
      : campaign.approvedLineup.creatorIds || []
    : [];

  // Function to compute completion status for each workflow step
  const getStepStatus = (idx: number) => {
    switch (idx) {
      case 0: // Step 1: Brief
        return isBriefComplete(campaign.brief);
      case 1: // Step 2: Guidelines
        return Boolean(campaign.brief && campaign.brief.brandName);
      case 2: // Step 3: Creators
        return creators.length > 0;
      case 3: // Step 4: Pre-Mortem
        return Boolean(approvedCreatorIds.length > 0);
      case 4: // Step 5: Creator Briefs
        return (
          approvedCreatorIds.length > 0 &&
          briefs.length > 0 &&
          approvedCreatorIds.every((id) => briefs.find((b) => b.creatorId === id)?.status === 'final')
        );
      case 5: // Step 6: Compliance
        return true;
      case 6: // Step 7: Search Capture
        return true;
      case 7: // Step 8: Live Pulse
        return true;
      case 8: // Step 9: Report
        return true;
      default:
        return false;
    }
  };

  // Status transitions
  const allowedNextStatuses = ALLOWED_STATUS_TRANSITIONS[campaign.status] || [];

  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(campaign.name);

  const handleSaveName = async () => {
    if (!editedName.trim() || editedName === campaign.name) {
      setIsEditingName(false);
      return;
    }
    await updateMutation.mutateAsync({
      id: campaign.id,
      data: { name: editedName.trim(), version: campaign.version },
    });
    setIsEditingName(false);
  };

  const handleStatusChange = async (nextStatus: CampaignStatus) => {
    await updateMutation.mutateAsync({
      id: campaign.id,
      data: { status: nextStatus, version: campaign.version },
    });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <SEO
        title={`${campaign.name} — Overview`}
        description={`Workflow overview cockpit for ${campaign.name}. Manage creators, briefs, pre-mortem simulations, and live search performance.`}
      />
      {/* Overview Top Header Card */}
      <Card className="relative overflow-hidden border-zinc-800 bg-gradient-to-b from-zinc-900/80 to-zinc-950/60 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-3">
              <Badge variant={campaign.status}>{campaign.status}</Badge>
              <span className="text-xs text-zinc-500 font-mono">v{campaign.version}</span>
              <span className="text-xs text-zinc-500">·</span>
              <span className="text-xs text-zinc-400">Created {formatRelativeTime(campaign.createdAt)}</span>
            </div>

            {/* Editable Campaign Name */}
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="text-xl font-bold py-1 h-9"
                  autoFocus
                />
                <Button size="sm" onClick={handleSaveName} icon={Check}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setIsEditingName(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3 group">
                <h1 className="text-2xl font-bold text-zinc-100">{campaign.name}</h1>
                <button
                  type="button"
                  onClick={() => setIsEditingName(true)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-zinc-100 rounded transition"
                  title="Edit campaign name"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
            )}

            <p className="text-sm text-zinc-400">
              Autonomous creator campaign workflow. Pre-flight scoring, pre-mortem simulation, search demand capture, and live pulse monitoring.
            </p>
          </div>

          {/* Quick Status Shift & Continue button */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            {allowedNextStatuses.length > 0 && (
              <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 p-1 rounded-lg">
                <span className="text-xs text-zinc-400 px-2">Transition to:</span>
                {allowedNextStatuses.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleStatusChange(s)}
                    disabled={updateMutation.isPending}
                    className="text-xs font-semibold px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition uppercase capitalize"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <Button
              variant="primary"
              onClick={() => navigate(`/campaigns/${campaign.id}/brief`)}
              icon={ArrowRight}
            >
              Continue Workflow
            </Button>
          </div>
        </div>
      </Card>

      {/* Workflow Stepper Checklist Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Workflow Checklist</h2>
            <p className="text-xs text-zinc-400">8 integrated steps from candidate creator scoring to live pulse.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {CONFIG.WORKFLOW_STEPS.slice(1, 10).map((step, idx) => {
            const isCompleted = getStepStatus(idx);
            const isCurrent = !isCompleted && (idx === 0 || getStepStatus(idx - 1));

            return (
              <div
                key={step.id}
                onClick={() => navigate(`/campaigns/${campaign.id}/${step.path}`)}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                  isCurrent
                    ? 'border-indigo-500/40 bg-indigo-950/10 hover:bg-indigo-950/20'
                    : isCompleted
                    ? 'border-emerald-500/30 bg-emerald-950/5 hover:bg-emerald-950/15'
                    : 'border-zinc-800/80 bg-zinc-900/30 hover:bg-zinc-900/60'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      Step 0{idx + 1}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {isCompleted && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      )}
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                        Phase {step.phase}
                      </span>
                    </div>
                  </div>
                  <h3 className="text-sm font-semibold text-zinc-200 mb-1">{step.title}</h3>
                </div>

                <div className="flex items-center justify-between pt-3 mt-3 border-t border-zinc-800/60 text-xs">
                  <span className={`text-[11px] ${isCompleted ? 'text-emerald-400 font-medium' : isCurrent ? 'text-indigo-400 font-medium' : 'text-zinc-500'}`}>
                    {isCompleted ? 'Completed' : isCurrent ? 'In Progress' : `Phase ${step.phase}`}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Activity Log */}
      <ActivityLog campaignId={campaign.id} />
    </div>
  );
}
