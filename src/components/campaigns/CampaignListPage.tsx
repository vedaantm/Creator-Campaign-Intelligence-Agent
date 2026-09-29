import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Search,
  Filter,
  ArrowUpDown,
  Layers,
  MoreVertical,
  Copy,
  Trash2,
  FileDown,
  Upload,
  Edit2,
  Clock,
  UserCheck,
  Archive,
  RefreshCw,
  Scale,
} from 'lucide-react';
import { useCampaigns, useCampaignMutations, queryKeys } from '../../hooks/useCampaigns.ts';
import { apiClient } from '../../lib/api.ts';
import { Campaign, CampaignStatus, ActivityEntry, Creator, CreatorBrief, PaginatedResponse } from '@/shared/types.ts';
import { formatRelativeTime } from '@/shared/format.ts';
import { Button, Input, Card, Badge, Dialog } from '../common/UIComponents.tsx';
import { CampaignComparisonModal } from './CampaignComparisonModal.tsx';
import { SEO } from '../common/SEO.tsx';

export function CampaignListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Search, filter, and sort in URL
  const search = searchParams.get('search') || '';
  const status = (searchParams.get('status') as CampaignStatus) || undefined;
  const sort = (searchParams.get('sort') as 'updatedAt' | 'name' | 'createdAt') || 'updatedAt';
  const order = (searchParams.get('order') as 'asc' | 'desc') || 'desc';

  const { data, isLoading, isError, refetch } = useCampaigns({
    search: search || undefined,
    status,
    sort,
    order,
  });

  const {
    createMutation,
    updateMutation,
    softDeleteMutation,
    duplicateMutation,
    importMutation,
  } = useCampaignMutations();

  // Helper to pre-fetch high-probability navigation paths for a campaign on card hover/focus
  const prefetchCampaign = useCallback((campaignId: string) => {
    // 1. Pre-fetch single campaign details
    queryClient.prefetchQuery({
      queryKey: queryKeys.campaign(campaignId),
      queryFn: () => apiClient<Campaign>(`/api/v1/campaigns/${campaignId}`),
      staleTime: 2 * 60 * 1000,
    });

    // 2. Pre-fetch activity log for campaign overview cockpit
    queryClient.prefetchQuery({
      queryKey: queryKeys.activity(campaignId),
      queryFn: () => apiClient<PaginatedResponse<ActivityEntry>>(`/api/v1/campaigns/${campaignId}/activity`),
      staleTime: 1 * 60 * 1000,
    });

    // 3. Pre-fetch creators list (for overview & Step 3)
    queryClient.prefetchQuery({
      queryKey: ['campaign', campaignId, 'creators', undefined],
      queryFn: () => apiClient<Creator[]>(`/api/v1/campaigns/${campaignId}/creators`),
      staleTime: 5 * 60 * 1000,
    });

    // 4. Pre-fetch creator briefs (for overview & Step 5)
    queryClient.prefetchQuery({
      queryKey: ['campaign', campaignId, 'briefs'],
      queryFn: () => apiClient<CreatorBrief[]>(`/api/v1/campaigns/${campaignId}/briefs`),
      staleTime: 5 * 60 * 1000,
    });
  }, [queryClient]);

  // Pre-fetch top active campaign on initial load to make primary navigation instant
  useEffect(() => {
    if (data?.items && data.items.length > 0) {
      const topActive = data.items.find((c) => c.status === 'active') || data.items[0];
      if (topActive) {
        prefetchCampaign(topActive.id);
      }
    }
  }, [data?.items, prefetchCampaign]);

  // Dialog & View states
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [renameTarget, setRenameTarget] = useState<Campaign | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);

  // Comparison view state
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [compareTargetA, setCompareTargetA] = useState<string | undefined>(undefined);
  const [compareTargetB, setCompareTargetB] = useState<string | undefined>(undefined);

  // Import handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        await importMutation.mutateAsync(json);
      } catch (err) {
        alert('Invalid JSON file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const updateSearchParam = (key: string, val: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (val) {
      next.set(key, val);
    } else {
      next.delete(key);
    }
    setSearchParams(next);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaignName.trim()) return;
    const created = await createMutation.mutateAsync({ name: newCampaignName.trim() });
    setIsNewDialogOpen(false);
    setNewCampaignName('');
    navigate(`/campaigns/${created.id}/brief`, { replace: true });
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameValue.trim()) return;
    await updateMutation.mutateAsync({
      id: renameTarget.id,
      data: { name: renameValue.trim(), version: renameTarget.version },
    });
    setRenameTarget(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await softDeleteMutation.mutateAsync({ id: deleteTarget.id, version: deleteTarget.version });
    setDeleteTarget(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <SEO
        title="Campaign Workspaces"
        description="Manage YouTube creator campaigns, AI scoring, pre-mortem risk simulations, and live search demand."
      />
      {/* Title & Primary Action Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-8 border-b border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Campaign Workspaces</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Manage YouTube creator campaigns, AI scoring, pre-mortem risk simulations, and live search demand.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data?.items && data.items.length >= 2 && (
            <Button
              variant="outline"
              onClick={() => {
                if (data.items.length >= 2) {
                  setCompareTargetA(data.items[0].id);
                  setCompareTargetB(data.items[1].id);
                }
                setIsCompareOpen(true);
              }}
              icon={Scale}
            >
              Compare Campaigns
            </Button>
          )}
          <label className="cursor-pointer">
            <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
            <span className="inline-flex items-center justify-center font-medium rounded-lg text-sm px-3.5 py-2 gap-2 border border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800 transition cursor-pointer">
              <Upload className="w-4 h-4" />
              Import
            </span>
          </label>
          <Button
            variant="primary"
            onClick={() => setIsNewDialogOpen(true)}
            icon={Plus}
          >
            New Campaign
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 my-6">
        {/* Search */}
        <div className="md:col-span-6 relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3 pointer-events-none" />
          <input
            type="text"
            placeholder="Search campaigns by name..."
            value={search}
            onChange={(e) => updateSearchParam('search', e.target.value || null)}
            className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 transition"
          />
        </div>

        {/* Status Filter */}
        <div className="md:col-span-3">
          <select
            value={status || ''}
            onChange={(e) => updateSearchParam('status', e.target.value || null)}
            className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
            aria-label="Filter by status"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {/* Sort */}
        <div className="md:col-span-3 flex gap-2">
          <select
            value={sort}
            onChange={(e) => updateSearchParam('sort', e.target.value)}
            className="flex-1 bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
            aria-label="Sort by"
          >
            <option value="updatedAt">Last Updated</option>
            <option value="createdAt">Date Created</option>
            <option value="name">Campaign Name</option>
          </select>
          <button
            onClick={() => updateSearchParam('order', order === 'asc' ? 'desc' : 'asc')}
            className="p-2 border border-zinc-800 bg-zinc-900/60 rounded-lg text-zinc-400 hover:text-zinc-200 transition"
            title={`Sort order: ${order}`}
            aria-label="Toggle sort order"
          >
            <ArrowUpDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-44 bg-zinc-900/40 rounded-xl border border-zinc-800/60 animate-pulse p-5" />
          ))}
        </div>
      )}

      {/* Error View */}
      {isError && (
        <Card className="text-center py-12">
          <p className="text-rose-400 font-semibold mb-2">Failed to load campaigns</p>
          <Button variant="secondary" size="sm" onClick={() => refetch()} icon={RefreshCw}>
            Retry
          </Button>
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && !isError && data?.items.length === 0 && (
        <Card className="text-center py-16 px-4">
          <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-4">
            <Layers className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-zinc-200 mb-1">No campaigns found</h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto mb-6">
            {search || status
              ? 'No campaigns match your current filters. Clear filters or create a new campaign.'
              : 'Create your first YouTube creator campaign to initiate AI candidate scoring, briefing, and risk analysis.'}
          </p>
          <Button variant="primary" onClick={() => setIsNewDialogOpen(true)} icon={Plus}>
            Create New Campaign
          </Button>
        </Card>
      )}

      {/* Campaign Grid */}
      {!isLoading && !isError && data && data.items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {data.items.map((campaign) => (
            <div
              key={campaign.id}
              onClick={() => navigate(`/campaigns/${campaign.id}/overview`)}
              onMouseEnter={() => prefetchCampaign(campaign.id)}
              onFocus={() => prefetchCampaign(campaign.id)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(`/campaigns/${campaign.id}/overview`);
                }
              }}
              className="group relative flex flex-col justify-between p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/80 hover:border-zinc-700 focus:border-indigo-500 focus:outline-none transition-all cursor-pointer shadow-sm hover:shadow-md"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <Badge variant={campaign.status}>{campaign.status}</Badge>
                  <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                    <UserCheck className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Owner</span>
                  </div>
                </div>

                <h3 className="text-base font-semibold text-zinc-100 group-hover:text-indigo-300 transition-colors line-clamp-1 mb-1.5">
                  {campaign.name}
                </h3>

                <p className="text-xs text-zinc-400 line-clamp-2 mb-4">
                  {campaign.brief && typeof campaign.brief === 'object' && 'product' in campaign.brief
                    ? String((campaign.brief as Record<string, unknown>).product)
                    : 'Workflow initiated: Briefing stage.'}
                </p>
              </div>

              <div>
                {/* Stepper Progress Bar */}
                <div className="space-y-1 mb-4">
                  <div className="flex justify-between text-[11px] text-zinc-400">
                    <span>Workflow Progress</span>
                    <span className="font-medium text-zinc-300">
                      {campaign.status === 'completed' ? '8 of 8 steps' : campaign.status === 'active' ? '5 of 8 steps' : '1 of 8 steps'}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full"
                      style={{
                        width:
                          campaign.status === 'completed'
                            ? '100%'
                            : campaign.status === 'active'
                            ? '65%'
                            : '12%',
                      }}
                    />
                  </div>
                </div>

                {/* Footer metadata & Actions */}
                <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-zinc-500" />
                    {formatRelativeTime(campaign.updatedAt)}
                  </span>

                  <div
                    className="flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()} // Prevent card navigation
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setCompareTargetA(campaign.id);
                        const other = data?.items.find((c) => c.id !== campaign.id);
                        if (other) setCompareTargetB(other.id);
                        setIsCompareOpen(true);
                      }}
                      className="p-1.5 text-zinc-400 hover:text-indigo-400 hover:bg-zinc-800 rounded transition"
                      title="Compare side-by-side"
                    >
                      <Scale className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRenameTarget(campaign);
                        setRenameValue(campaign.name);
                      }}
                      className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition"
                      title="Rename"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateMutation.mutate(campaign.id)}
                      className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition"
                      title="Duplicate"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <a
                      href={`/api/v1/campaigns/${campaign.id}/export`}
                      download
                      className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition"
                      title="Export JSON"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(campaign)}
                      className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 rounded transition"
                      title="Move to Trash"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Campaign Dialog */}
      <Dialog
        isOpen={isNewDialogOpen}
        onClose={() => setIsNewDialogOpen(false)}
        title="Create New Campaign"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Campaign Name"
            placeholder="e.g. Apex ANC Earbuds Global Launch"
            value={newCampaignName}
            onChange={(e) => setNewCampaignName(e.target.value)}
            required
            autoFocus
          />
          <p className="text-xs text-zinc-400">
            A campaign houses creator shortlists, risk simulations, compliance briefs, and live demand tracking.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsNewDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={createMutation.isPending}
              disabled={!newCampaignName.trim()}
            >
              Create & Setup Brief
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog
        isOpen={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        title="Rename Campaign"
      >
        <form onSubmit={handleRename} className="space-y-4">
          <Input
            label="New Campaign Name"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            required
            autoFocus
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={updateMutation.isPending}>
              Save Name
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Move to Trash Confirm Dialog */}
      <Dialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Move Campaign to Trash?"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-300">
            Are you sure you want to move <span className="font-semibold text-white">"{deleteTarget?.name}"</span> to trash?
          </p>
          <p className="text-xs text-zinc-400">
            You can restore this campaign at any time from the Trash Bin.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleDelete}
              isLoading={softDeleteMutation.isPending}
            >
              Move to Trash
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Side-by-Side Campaign Comparison View */}
      <CampaignComparisonModal
        isOpen={isCompareOpen}
        onClose={() => setIsCompareOpen(false)}
        campaigns={data?.items || []}
        initialCampaignIdA={compareTargetA}
        initialCampaignIdB={compareTargetB}
      />
    </div>
  );
}
