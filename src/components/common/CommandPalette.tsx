import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  Search,
  Command,
  Layers,
  FileText,
  Sliders,
  Users,
  Shield,
  FileSpreadsheet,
  CheckCircle2,
  Zap,
  Activity,
  BarChart3,
  Settings,
  Trash2,
  ArrowRight,
  Sparkles,
  Layout,
  X,
} from 'lucide-react';
import { useCampaigns } from '../../hooks/useCampaigns.ts';

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const navigate = useNavigate();
  const location = useLocation();
  const { campaignId: currentCampaignIdFromParams } = useParams<{ campaignId?: string }>();

  const { data: campaignsData } = useCampaigns();
  const campaigns = campaignsData?.items || [];

  // Extract campaignId from pathname if useParams isn't in scope at root
  const activeCampaignId = useMemo(() => {
    if (currentCampaignIdFromParams) return currentCampaignIdFromParams;
    const match = location.pathname.match(/\/campaigns\/([^/]+)/);
    if (match && match[1] !== 'trash') {
      return match[1];
    }
    return campaigns.length > 0 ? campaigns[0].id : null;
  }, [currentCampaignIdFromParams, location.pathname, campaigns]);

  const activeCampaign = useMemo(() => {
    return campaigns.find((c) => c.id === activeCampaignId);
  }, [campaigns, activeCampaignId]);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Reset search and selection on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Build command items
  const commandItems = useMemo(() => {
    const items: Array<{
      id: string;
      category: 'CAMPAIGNS' | 'WORKFLOW' | 'ACTIONS';
      title: string;
      subtitle?: string;
      icon: React.ElementType;
      action: () => void;
      badge?: string;
    }> = [];

    const q = query.trim().toLowerCase();

    // 1. Workflow Sections for active campaign (or default campaign)
    if (activeCampaignId) {
      const targetCampName = activeCampaign?.name || 'Active Campaign';
      const workflowSteps = [
        { name: 'Overview & Cockpit', path: 'overview', icon: Layout, step: 'Overview' },
        { name: 'Step 1: Campaign Brief', path: 'brief', icon: FileText, step: 'Step 1' },
        { name: 'Step 2: Brand Guidelines', path: 'guidelines', icon: Sliders, step: 'Step 2' },
        { name: 'Step 3: Creator Discovery', path: 'creators', icon: Users, step: 'Step 3' },
        { name: 'Step 4: AI Pre-Mortem', path: 'premortem', icon: Shield, step: 'Step 4' },
        { name: 'Step 5: Creator Briefs', path: 'briefs', icon: FileSpreadsheet, step: 'Step 5' },
        { name: 'Step 6: Compliance Audit', path: 'compliance', icon: CheckCircle2, step: 'Step 6' },
        { name: 'Step 7: Search Capture', path: 'search-capture', icon: Zap, step: 'Step 7' },
        { name: 'Step 8: Live Pulse', path: 'live', icon: Activity, step: 'Step 8' },
        { name: 'Step 9: Executive Report', path: 'report', icon: BarChart3, step: 'Step 9' },
        { name: 'Step 10: Campaign Settings', path: 'settings', icon: Settings, step: 'Step 10' },
      ];

      workflowSteps.forEach((s) => {
        if (!q || s.name.toLowerCase().includes(q) || s.step.toLowerCase().includes(q) || targetCampName.toLowerCase().includes(q)) {
          items.push({
            id: `wf_${s.path}`,
            category: 'WORKFLOW',
            title: s.name,
            subtitle: `Jump to section in ${targetCampName}`,
            icon: s.icon,
            badge: s.step,
            action: () => {
              navigate(`/campaigns/${activeCampaignId}/${s.path}`);
              setIsOpen(false);
            },
          });
        }
      });
    }

    // 2. Campaign Workspaces
    campaigns.forEach((c) => {
      const brandName = (c.brief as any)?.brandName || 'Brand Workspace';
      if (!q || c.name.toLowerCase().includes(q) || brandName.toLowerCase().includes(q) || c.status.toLowerCase().includes(q)) {
        items.push({
          id: `camp_${c.id}`,
          category: 'CAMPAIGNS',
          title: c.name,
          subtitle: `${brandName} · Status: ${c.status} · Owner: ${c.ownerEmail}`,
          icon: Layers,
          badge: c.id === activeCampaignId ? 'Active' : undefined,
          action: () => {
            navigate(`/campaigns/${c.id}/overview`);
            setIsOpen(false);
          },
        });
      }
    });

    // 3. Global Actions
    const globalActions = [
      {
        id: 'action_all_campaigns',
        title: 'All Campaign Workspaces',
        subtitle: 'View list of all creator campaign projects',
        icon: Sparkles,
        action: () => {
          navigate('/campaigns');
          setIsOpen(false);
        },
      },
      {
        id: 'action_trash',
        title: 'Trash Bin',
        subtitle: 'View soft-deleted campaigns or restore workspace',
        icon: Trash2,
        action: () => {
          navigate('/campaigns/trash');
          setIsOpen(false);
        },
      },
    ];

    globalActions.forEach((a) => {
      if (!q || a.title.toLowerCase().includes(q) || a.subtitle.toLowerCase().includes(q)) {
        items.push({
          id: a.id,
          category: 'ACTIONS',
          title: a.title,
          subtitle: a.subtitle,
          icon: a.icon,
          action: a.action,
        });
      }
    });

    return items;
  }, [query, activeCampaignId, activeCampaign, campaigns, navigate]);

  // Adjust selected index on query change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Handle keyboard navigation inside search input
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (commandItems.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % commandItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + commandItems.length) % commandItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = commandItems[selectedIndex];
      if (selected) {
        selected.action();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-20 px-4 animate-in fade-in duration-150"
      onClick={() => setIsOpen(false)}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col text-zinc-100 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header Bar */}
        <div className="relative border-b border-zinc-800 p-4 flex items-center gap-3">
          <Search className="w-5 h-5 text-indigo-400 shrink-0" />
          <input
            type="text"
            autoFocus
            placeholder="Search campaigns, workflow steps (Brief, Creators, Compliance...), or actions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            className="w-full bg-transparent border-none text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Command Results */}
        <div className="max-h-96 overflow-y-auto p-2 divide-y divide-zinc-800/50">
          {commandItems.length > 0 ? (
            commandItems.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;

              return (
                <div
                  key={item.id}
                  onClick={() => item.action()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`p-3 rounded-xl flex items-center justify-between cursor-pointer transition ${
                    isSelected ? 'bg-indigo-600/20 border border-indigo-500/30 text-white' : 'hover:bg-zinc-800/60 text-zinc-300'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-2 rounded-lg shrink-0 ${
                        isSelected
                          ? 'bg-indigo-600 text-white'
                          : 'bg-zinc-800 text-zinc-400 border border-zinc-700/60'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-zinc-100 truncate">
                          {item.title}
                        </span>
                        {item.badge && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      {item.subtitle && (
                        <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                  </div>

                  <ArrowRight
                    className={`w-4 h-4 shrink-0 transition ${
                      isSelected ? 'text-indigo-400 translate-x-0.5' : 'text-zinc-600 opacity-0'
                    }`}
                  />
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-xs text-zinc-500">
              No workflow section or campaign matching &quot;{query}&quot;
            </div>
          )}
        </div>

        {/* Footer Quick Tips */}
        <div className="bg-zinc-950/80 border-t border-zinc-800 px-4 py-2.5 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300 border border-zinc-700">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300 border border-zinc-700">↵</kbd> select
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300 border border-zinc-700">esc</kbd> close
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-indigo-400">
            <Command className="w-3 h-3" />
            <span>Cmd + K</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Trigger Button component for Header or Toolbar
 */
export function CommandPaletteTrigger() {
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'k',
            ctrlKey: true,
            bubbles: true,
          })
        );
      }}
      className="hidden sm:flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700/80 rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition cursor-pointer shadow-sm"
      title="Open Command Palette (Ctrl+K)"
    >
      <Search className="w-3.5 h-3.5 text-indigo-400" />
      <span>Search or jump to...</span>
      <kbd className="ml-2 font-mono text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700">
        Ctrl K
      </kbd>
    </button>
  );
}
