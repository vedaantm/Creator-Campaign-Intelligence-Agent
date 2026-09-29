import React from 'react';
import { Outlet, useParams, Link, useLocation } from 'react-router-dom';
import { Header } from './Header.tsx';
import { Sidebar } from './Sidebar.tsx';
import { ErrorBoundary } from '../common/ErrorBoundary.tsx';
import { useCampaign } from '../../hooks/useCampaigns.ts';
import { ChevronRight, Home } from 'lucide-react';
import { CONFIG } from '@/shared/config.ts';

export function CampaignLayout() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const location = useLocation();
  const { data: campaign, isLoading, isError } = useCampaign(campaignId);

  // Derive current step title
  const currentPathSegment = location.pathname.split('/').pop() || 'overview';
  const currentStep = CONFIG.WORKFLOW_STEPS.find((s) => s.path === currentPathSegment);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-zinc-400 text-sm">
            <svg className="animate-spin h-6 w-6 text-indigo-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Loading campaign workspace...
          </div>
        </div>
      </div>
    );
  }

  if (isError || !campaign) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
        <Header />
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 mb-4">
            ?
          </div>
          <h2 className="text-xl font-bold text-zinc-100 mb-2">Campaign Not Found</h2>
          <p className="text-sm text-zinc-400 max-w-sm mb-6">
            The campaign you are looking for does not exist or you do not have permission to view it.
          </p>
          <Link
            to="/campaigns"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition"
          >
            Back to Campaigns
          </Link>
        </div>
      </div>
    );
  }

  const isDemoMode = campaign?.id === 'cmp_demo_cci';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <Header />

      {/* Demo Mode Banner */}
      {isDemoMode && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-6 py-2 text-xs text-amber-300 flex items-center justify-between font-medium">
          <div className="flex items-center gap-2">
            <span className="bg-amber-500 text-zinc-950 font-bold px-2 py-0.5 rounded text-[10px] tracking-wide uppercase">
              Demo Data
            </span>
            <span>
              Viewing pre-recorded campaign <strong>"{campaign?.name}"</strong>. Every page is fully populated. Edit actions are disabled with tooltips.
            </span>
          </div>
          <Link to="/campaigns" className="underline hover:text-amber-200">
            Exit Demo
          </Link>
        </div>
      )}

      <div className="flex-1 flex flex-row w-full max-w-[1920px] mx-auto">
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0 bg-zinc-950">
          {/* Breadcrumbs Banner */}
          <div className="h-10 px-8 border-b border-zinc-800/80 bg-zinc-900/20 flex items-center gap-2 text-xs text-zinc-400">
            <Link to="/campaigns" className="hover:text-zinc-200 transition flex items-center gap-1">
              <Home className="w-3 h-3" />
              Campaigns
            </Link>
            <ChevronRight className="w-3 h-3 text-zinc-600" />
            <span className="text-zinc-300 font-medium truncate max-w-[200px]">{campaign.name}</span>
            <ChevronRight className="w-3 h-3 text-zinc-600" />
            <span className="text-indigo-400 font-medium">{currentStep?.title || 'Overview'}</span>
          </div>

          <div className="flex-1 p-8">
            <ErrorBoundary>
              <Outlet context={{ campaign }} />
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
