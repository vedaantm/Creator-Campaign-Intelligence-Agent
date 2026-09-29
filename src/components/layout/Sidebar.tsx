import React from 'react';
import { NavLink, useParams, useLocation } from 'react-router-dom';
import {
  FileText,
  ShieldCheck,
  Users,
  AlertTriangle,
  Send,
  CheckCircle,
  Search,
  Activity,
  BarChart3,
  Settings,
  Lock,
  Check,
  ChevronRight,
} from 'lucide-react';
import { CONFIG } from '@/shared/config.ts';
import { isBriefComplete } from '@/shared/types.ts';
import { useCampaign } from '../../hooks/useCampaigns.ts';
import { cn } from '../../lib/utils.ts';

const STEP_ICONS = [
  FileText, // Overview
  FileText, // 1. Brief
  ShieldCheck, // 2. Guidelines
  Users, // 3. Creators
  AlertTriangle, // 4. Pre-Mortem
  Send, // 5. Creator Briefs
  CheckCircle, // 6. Compliance
  Search, // 7. Search Capture
  Activity, // 8. Live Pulse
  BarChart3, // Report
  Settings, // Settings
];

export function Sidebar() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const { data: campaign } = useCampaign(campaignId);
  const location = useLocation();

  if (!campaignId) return null;

  const isDemoMode = campaignId === 'cmp_demo_cci' || window.location.pathname.startsWith('/demo');

  // All workflow steps are fully implemented and navigable across the 8-stage pipeline
  const isStepLocked = (stepIndex: number): { locked: boolean; reason?: string; linkTo?: string } => {
    if (isDemoMode) {
      return { locked: false };
    }
    if (!campaign) {
      return { locked: false };
    }

    const step = CONFIG.WORKFLOW_STEPS[stepIndex];
    const approvedCreatorIds = campaign.approvedLineup
      ? (Array.isArray(campaign.approvedLineup)
          ? campaign.approvedLineup
          : (campaign.approvedLineup.creatorIds || []))
      : [];

    const hasApprovedLineup = approvedCreatorIds.length > 0;

    // Phases/steps P5 to P9 require an approved Pre-Mortem lineup:
    // P5 (Creator Briefs), P6 (Compliance), P7 (Search Capture), P8 (Live Pulse), Report
    if (step.phase >= 5 && step.id !== 'settings' && step.id !== 'overview') {
      if (!hasApprovedLineup) {
        return {
          locked: true,
          reason: 'Requires an approved Pre-Mortem lineup.',
        };
      }
    }

    return { locked: false };
  };

  return (
    <aside className="w-64 border-r border-zinc-800 bg-zinc-950/60 p-4 flex flex-col shrink-0 min-h-[calc(100vh-4rem)]">
      <div className="mb-4 px-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Campaign Workflow</h2>
        <p className="text-[11px] text-zinc-400 mt-0.5">8-Stage Autonomous Pipeline</p>
      </div>

      <nav className="space-y-1 flex-1">
        {CONFIG.WORKFLOW_STEPS.map((step, idx) => {
          const Icon = STEP_ICONS[idx] || FileText;
          const { locked, reason } = isStepLocked(idx);
          const fullPath = `/campaigns/${campaignId}/${step.path}`;
          const isActive = location.pathname.startsWith(fullPath);

          if (locked) {
            return (
              <div
                key={step.id}
                className="group relative flex items-center justify-between px-3 py-2 text-xs font-medium text-zinc-600 rounded-lg cursor-not-allowed select-none transition-colors hover:bg-zinc-900/30"
                title={reason}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 text-zinc-600" />
                  <span>{step.title}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase font-semibold text-zinc-700 bg-zinc-900 px-1 rounded">
                    P{step.phase}
                  </span>
                  <Lock className="w-3.5 h-3.5 text-zinc-600" />
                </div>
              </div>
            );
          }

          return (
            <NavLink
              key={step.id}
              to={fullPath}
              className={({ isActive: isLinkActive }) =>
                cn(
                  'flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-colors group',
                  isLinkActive
                    ? 'bg-indigo-600/15 text-indigo-300 font-semibold border border-indigo-500/20'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
                )
              }
            >
              <div className="flex items-center gap-2.5">
                <Icon className={cn('w-4 h-4', isActive ? 'text-indigo-400' : 'text-zinc-500 group-hover:text-zinc-300')} />
                <span>{step.title}</span>
              </div>
              <ChevronRight
                className={cn('w-3.5 h-3.5 transition-transform', isActive ? 'text-indigo-400 translate-x-0.5' : 'text-zinc-600')}
              />
            </NavLink>
          );
        })}
      </nav>

      {/* Campaign Meta Card */}
      {campaign && (
        <div className="mt-auto pt-4 border-t border-zinc-800/80 px-2 text-xs">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span>Version:</span>
            <span className="font-mono text-zinc-300">v{campaign.version}</span>
          </div>
          <div className="flex items-center justify-between text-zinc-400">
            <span>Role:</span>
            <span className="text-zinc-300">Campaign Owner</span>
          </div>
        </div>
      )}
    </aside>
  );
}
