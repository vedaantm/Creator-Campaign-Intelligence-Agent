import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api.ts';
import { Campaign } from '@/shared/types.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { SEO } from '../common/SEO.tsx';

export function DemoPage() {
  const navigate = useNavigate();
  const { signInAsDemo } = useAuth();

  // Call ONLY the dedicated public demo endpoint (No auth token required)
  const { data: demoCampaign, isLoading, isError } = useQuery<Campaign>({
    queryKey: ['publicDemoCampaign'],
    queryFn: () => apiClient<Campaign>('/api/v1/demo/campaign'),
    staleTime: 10 * 60 * 1000,
    retry: false, // Never retry on failure
  });

  useEffect(() => {
    if (demoCampaign) {
      // Initialize demo auth state for interactive session
      signInAsDemo('owner');
      // Navigate to seeded campaign cockpit overview
      const campaignId = demoCampaign.id || 'cmp_demo_cci';
      navigate(`/campaigns/${campaignId}/overview`, { replace: true });
    }
  }, [demoCampaign, signInAsDemo, navigate]);

  if (isError) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6 text-center">
        <SEO title="Demo Mode — Error" description="Unable to load demo workspace." />
        <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
          !
        </div>
        <h2 className="text-lg font-bold mb-2">Unable to Load Demo Mode</h2>
        <p className="text-xs text-zinc-400 max-w-sm mb-6">
          The public demo workspace service is currently unreachable. Please return to the login page.
        </p>
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition"
        >
          Return to Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6 text-center">
      <SEO title="Initializing Demo Mode..." description="Loading Aura Smart Home Q4 Global Launch demo campaign." />
      <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 px-5 py-3 rounded-2xl shadow-xl">
        <svg className="animate-spin h-5 w-5 text-indigo-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <div className="text-left">
          <span className="text-xs font-semibold text-zinc-200 block">Initializing Demo Workspace</span>
          <span className="text-[11px] text-zinc-500">Loading Aura Smart Home — Q4 Global Launch...</span>
        </div>
      </div>
    </div>
  );
}
