import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Sparkles,
  LogOut,
  ChevronDown,
  Layers,
  Database,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  User,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useHealth, useCampaigns } from '../../hooks/useCampaigns.ts';
import { CommandPaletteTrigger } from '../common/CommandPalette.tsx';

export function Header() {
  const { user, demoUser, signOut } = useAuth();
  const { campaignId } = useParams<{ campaignId?: string }>();
  const navigate = useNavigate();
  const { data: health } = useHealth();
  const { data: campaignsData } = useCampaigns();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const activeEmail = user?.email || demoUser?.email || 'Anonymous';
  const isDemoMode = Boolean(demoUser);

  const currentCampaign = campaignsData?.items.find((c) => c.id === campaignId);

  return (
    <header className="h-16 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-40">
      {/* Brand & Campaign Switcher */}
      <div className="flex items-center gap-6">
        <Link to="/campaigns" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-tight text-zinc-100 flex items-center gap-1.5">
              Creator Campaign AI
              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Phase 1
              </span>
            </span>
            <span className="text-[11px] text-zinc-400">Intelligence Agent</span>
          </div>
        </Link>

        {/* Campaign Switcher */}
        {campaignsData && campaignsData.items.length > 0 && (
          <div className="hidden md:flex items-center gap-2 pl-4 border-l border-zinc-800 text-sm">
            <Layers className="w-4 h-4 text-zinc-400" />
            <select
              value={campaignId || ''}
              onChange={(e) => {
                if (e.target.value) {
                  navigate(`/campaigns/${e.target.value}/overview`);
                } else {
                  navigate('/campaigns');
                }
              }}
              className="bg-zinc-900 border border-zinc-700/80 rounded-md px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 max-w-[200px] truncate"
              aria-label="Select campaign"
            >
              <option value="">All Campaigns</option>
              {campaignsData.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right status & User profile */}
      <div className="flex items-center gap-3 md:gap-4">
        {/* Command Palette Trigger */}
        <CommandPaletteTrigger />

        {/* Demo Data Badge */}
        {isDemoMode && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30 animate-pulse">
            <Database className="w-3.5 h-3.5" />
            Demo Mode Active
          </span>
        )}

        {/* System Health Dot */}
        <div
          className="flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-900/60 px-2.5 py-1 rounded-full border border-zinc-800"
          title={`Status: ${health?.status || 'checking'}, Secrets configured: Gemini: ${health?.secrets.gemini ? 'Yes' : 'No'}`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              health?.status === 'ok'
                ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
                : health?.status === 'degraded'
                ? 'bg-amber-500'
                : 'bg-zinc-600'
            }`}
          />
          <span className="hidden sm:inline">
            {health?.database === 'ok' ? 'API Active' : 'Connecting'}
          </span>
        </div>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2.5 p-1 rounded-lg hover:bg-zinc-800/60 transition text-left cursor-pointer"
            aria-expanded={dropdownOpen}
          >
            <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 font-medium text-xs overflow-hidden">
              {user?.photoURL ? (
                <img src={user.photoURL} alt={activeEmail} className="w-full h-full object-cover" />
              ) : (
                <User className="w-4 h-4 text-zinc-400" />
              )}
            </div>
            <div className="hidden lg:flex flex-col text-left">
              <span className="text-xs font-medium text-zinc-200 truncate max-w-[140px]">
                {user?.displayName || demoUser?.displayName || activeEmail.split('@')[0]}
              </span>
              <span className="text-[10px] text-zinc-400 truncate max-w-[140px]">{activeEmail}</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl py-1 z-50 animate-in fade-in slide-in-from-top-2">
              <div className="px-4 py-2 border-b border-zinc-800">
                <p className="text-xs font-semibold text-zinc-200 truncate">
                  {user?.displayName || demoUser?.displayName || 'User'}
                </p>
                <p className="text-[11px] text-zinc-400 truncate">{activeEmail}</p>
              </div>

              <div className="p-1">
                <Link
                  to="/campaigns"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 rounded-lg transition"
                >
                  <Layers className="w-4 h-4 text-zinc-400" />
                  All Campaigns
                </Link>
                <Link
                  to="/campaigns/trash"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 rounded-lg transition"
                >
                  <Database className="w-4 h-4 text-zinc-400" />
                  Trash Bin
                </Link>
              </div>

              <div className="border-t border-zinc-800 p-1">
                <button
                  onClick={async () => {
                    setDropdownOpen(false);
                    await signOut();
                    navigate('/login');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-400 hover:bg-rose-950/30 rounded-lg transition"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
