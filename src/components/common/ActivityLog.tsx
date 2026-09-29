import React, { useState, useMemo } from 'react';
import {
  Activity,
  Sparkles,
  FileText,
  Users,
  Shield,
  Trash2,
  RotateCcw,
  Search,
  RefreshCw,
  Download,
  Filter,
  CheckCircle2,
  Clock,
  UserCheck,
  Tag,
  AlertTriangle,
} from 'lucide-react';
import { ActivityEntry } from '@/shared/types.ts';
import { formatRelativeTime } from '@/shared/format.ts';
import { useCampaignActivity } from '../../hooks/useCampaigns.ts';
import { Button, Card, Input } from './UIComponents.tsx';

export interface ActivityLogProps {
  campaignId?: string;
  activities?: ActivityEntry[];
  title?: string;
  description?: string;
  showSearch?: boolean;
  showExport?: boolean;
  limit?: number;
  compact?: boolean;
  className?: string;
}

// Action styling mapping for CRUD audit categories
function getActionMeta(action: string) {
  const normAction = action.toUpperCase();

  if (normAction.includes('CREATED') || normAction.includes('ADDED') || normAction.includes('RESTORED')) {
    return {
      icon: CheckCircle2,
      badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      iconColor: 'text-emerald-400 bg-emerald-950/40',
      label: normAction,
    };
  }

  if (normAction.includes('TRASHED') || normAction.includes('DELETED') || normAction.includes('REMOVED')) {
    return {
      icon: Trash2,
      badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
      iconColor: 'text-rose-400 bg-rose-950/40',
      label: normAction,
    };
  }

  if (normAction.includes('BRIEF')) {
    return {
      icon: FileText,
      badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      iconColor: 'text-amber-400 bg-amber-950/40',
      label: normAction,
    };
  }

  if (normAction.includes('CREATOR')) {
    return {
      icon: Users,
      badgeColor: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
      iconColor: 'text-indigo-400 bg-indigo-950/40',
      label: normAction,
    };
  }

  if (normAction.includes('PREMORTEM') || normAction.includes('RISK') || normAction.includes('SCORE')) {
    return {
      icon: Shield,
      badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
      iconColor: 'text-purple-400 bg-purple-950/40',
      label: normAction,
    };
  }

  if (normAction.includes('SEARCH') || normAction.includes('PACK')) {
    return {
      icon: Search,
      badgeColor: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
      iconColor: 'text-cyan-400 bg-cyan-950/40',
      label: normAction,
    };
  }

  if (normAction.includes('UPDATED') || normAction.includes('MODIFIED')) {
    return {
      icon: RefreshCw,
      badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
      iconColor: 'text-blue-400 bg-blue-950/40',
      label: normAction,
    };
  }

  return {
    icon: Sparkles,
    badgeColor: 'bg-zinc-800 text-zinc-300 border-zinc-700',
    iconColor: 'text-zinc-400 bg-zinc-800',
    label: normAction,
  };
}

export function ActivityLog({
  campaignId,
  activities: passedActivities,
  title = 'Recent Activity & Audit Trail',
  description = 'Complete audit log of user actions, entity updates, and status transitions.',
  showSearch = true,
  showExport = true,
  limit = 20,
  compact = false,
  className = '',
}: ActivityLogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');

  // Query activities if campaignId is passed
  const {
    data: fetchedData,
    isLoading,
    isRefetching,
    refetch,
  } = useCampaignActivity(campaignId);

  // Determine active entries list
  const rawEntries: ActivityEntry[] = useMemo(() => {
    if (passedActivities) return passedActivities;
    return fetchedData?.items || [];
  }, [passedActivities, fetchedData]);

  // Filter entries based on search & category filter
  const filteredEntries = useMemo(() => {
    return rawEntries.filter((entry) => {
      // Category filter
      if (filterType !== 'ALL') {
        const norm = entry.action.toUpperCase();
        if (filterType === 'CAMPAIGN' && !norm.includes('CAMPAIGN')) return false;
        if (filterType === 'BRIEF' && !norm.includes('BRIEF')) return false;
        if (filterType === 'CREATOR' && !norm.includes('CREATOR')) return false;
        if (filterType === 'PREMORTEM' && !norm.includes('PREMORTEM') && !norm.includes('RISK')) return false;
      }

      // Text search
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        entry.summary.toLowerCase().includes(q) ||
        entry.actorEmail.toLowerCase().includes(q) ||
        entry.action.toLowerCase().includes(q) ||
        entry.entityType.toLowerCase().includes(q)
      );
    });
  }, [rawEntries, searchQuery, filterType]);

  // Handle Export Audit Trail as JSON
  const handleExportCSV = () => {
    if (filteredEntries.length === 0) return;
    const headers = ['ID', 'Timestamp', 'Actor Email', 'Action', 'Entity Type', 'Entity ID', 'Summary'];
    const csvRows = [
      headers.join(','),
      ...filteredEntries.map((e) =>
        [
          `"${e.id}"`,
          `"${e.at}"`,
          `"${e.actorEmail}"`,
          `"${e.action}"`,
          `"${e.entityType}"`,
          `"${e.entityId}"`,
          `"${e.summary.replace(/"/g, '""')}"`,
        ].join(',')
      ),
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `activity-audit-log-${campaignId || 'workspace'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header section */}
      {!compact && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-400" />
              {title}
            </h2>
            {description && <p className="text-xs text-zinc-400 mt-0.5">{description}</p>}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {campaignId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetch()}
                isLoading={isRefetching}
                icon={RefreshCw}
                title="Refresh audit log"
              >
                Refresh
              </Button>
            )}
            {showExport && filteredEntries.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                icon={Download}
              >
                Export CSV
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      {showSearch && !compact && rawEntries.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search actions, emails, or summary..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950/60 border border-zinc-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-[11px] text-zinc-500 px-1 flex items-center gap-1">
              <Filter className="w-3 h-3" />
              Category:
            </span>
            {['ALL', 'CAMPAIGN', 'BRIEF', 'CREATOR', 'PREMORTEM'].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setFilterType(type)}
                className={`text-[11px] font-medium px-2 py-1 rounded-md transition ${
                  filterType === type
                    ? 'bg-indigo-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-750'
                }`}
              >
                {type === 'ALL' ? 'All' : type.charAt(0) + type.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Activity Log List */}
      <Card className="p-0 overflow-hidden divide-y divide-zinc-800/80 border-zinc-800">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
            Loading audit log...
          </div>
        ) : filteredEntries.length > 0 ? (
          filteredEntries.slice(0, limit).map((act) => {
            const meta = getActionMeta(act.action);
            const Icon = meta.icon;

            return (
              <div
                key={act.id}
                className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-900/40 transition"
              >
                <div className="flex items-start sm:items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${meta.iconColor}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-200">{act.summary}</span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${meta.badgeColor}`}
                      >
                        {act.action}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                      <span className="flex items-center gap-1 text-zinc-400">
                        <UserCheck className="w-3 h-3 text-zinc-500" />
                        {act.actorEmail}
                      </span>
                      {act.entityType && (
                        <>
                          <span className="text-zinc-600">·</span>
                          <span className="flex items-center gap-1 text-zinc-500 font-mono">
                            <Tag className="w-3 h-3" />
                            {act.entityType}:{act.entityId.slice(0, 8)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-zinc-500 shrink-0 flex items-center gap-1.5 sm:self-center self-end">
                  <Clock className="w-3 h-3 text-zinc-600" />
                  <time dateTime={act.at} title={new Date(act.at).toLocaleString()}>
                    {formatRelativeTime(act.at)}
                  </time>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center text-xs text-zinc-500 flex flex-col items-center justify-center gap-2">
            <Activity className="w-6 h-6 text-zinc-600" />
            <p>No activity recorded matching your current criteria.</p>
            {searchQuery || filterType !== 'ALL' ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setFilterType('ALL');
                }}
                className="text-indigo-400 hover:underline mt-1"
              >
                Clear search & filters
              </button>
            ) : null}
          </div>
        )}
      </Card>
    </div>
  );
}
