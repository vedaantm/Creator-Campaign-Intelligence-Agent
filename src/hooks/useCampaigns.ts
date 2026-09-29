import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api.ts';
import {
  Campaign,
  CreateCampaignInput,
  UpdateCampaignInput,
  CampaignQuery,
  PaginatedResponse,
  ActivityEntry,
  Job,
  HealthResponse,
  CampaignBrief,
} from '@/shared/types.ts';
import { CONFIG } from '@/shared/config.ts';
import { useToast } from '../context/ToastContext.tsx';
import { useEffect, useRef } from 'react';

// Query Keys
export const queryKeys = {
  health: ['health'] as const,
  campaigns: (filters?: Partial<CampaignQuery>) => ['campaigns', filters] as const,
  trash: ['campaigns', 'trash'] as const,
  campaign: (id: string) => ['campaign', id] as const,
  activity: (id: string) => ['campaign', id, 'activity'] as const,
  jobs: (campaignId: string) => ['campaign', campaignId, 'jobs'] as const,
  job: (jobId: string) => ['job', jobId] as const,
};

// Health Hook
export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: () => apiClient<HealthResponse>('/api/v1/health'),
    refetchInterval: 30000,
  });
}

// Campaign List Hook
export function useCampaigns(filters: Partial<CampaignQuery> = {}) {
  const queryParams = new URLSearchParams();
  if (filters.status) queryParams.set('status', filters.status);
  if (filters.search) queryParams.set('search', filters.search);
  if (filters.sort) queryParams.set('sort', filters.sort);
  if (filters.order) queryParams.set('order', filters.order);
  if (filters.cursor) queryParams.set('cursor', filters.cursor);
  if (filters.limit) queryParams.set('limit', String(filters.limit));

  const queryStr = queryParams.toString();
  const url = `/api/v1/campaigns${queryStr ? `?${queryStr}` : ''}`;

  return useQuery({
    queryKey: queryKeys.campaigns(filters),
    queryFn: () => apiClient<PaginatedResponse<Campaign>>(url),
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

// Trash Hook
export function useCampaignsTrash() {
  return useQuery({
    queryKey: queryKeys.trash,
    queryFn: () => apiClient<PaginatedResponse<Campaign>>('/api/v1/campaigns/trash'),
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

// Single Campaign Hook
export function useCampaign(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.campaign(id || ''),
    queryFn: () => apiClient<Campaign>(`/api/v1/campaigns/${id}`),
    enabled: Boolean(id),
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

// Activity Hook
export function useCampaignActivity(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.activity(id || ''),
    queryFn: () => apiClient<PaginatedResponse<ActivityEntry>>(`/api/v1/campaigns/${id}/activity`),
    enabled: Boolean(id),
  });
}

// Campaign Mutations Hook
export function useCampaignMutations() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const createMutation = useMutation({
    mutationFn: (data: CreateCampaignInput) =>
      apiClient<Campaign>('/api/v1/campaigns', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (newCampaign) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      showToast(`Campaign "${newCampaign.name}" created`, 'success');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCampaignInput }) =>
      apiClient<Campaign>(`/api/v1/campaigns/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.campaign(updated.id), updated);
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.activity(updated.id) });
      showToast(`Campaign "${updated.name}" updated`, 'success');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const softDeleteMutation = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      apiClient<Campaign>(`/api/v1/campaigns/${id}`, {
        method: 'DELETE',
        body: JSON.stringify({ version }),
      }),
    onSuccess: (deleted) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.trash });
      showToast(`Campaign "${deleted.name}" moved to trash`, 'info', {
        label: 'Undo',
        onClick: () => {
          restoreMutation.mutate(deleted.id);
        },
      });
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) =>
      apiClient<Campaign>(`/api/v1/campaigns/${id}/restore`, {
        method: 'POST',
      }),
    onSuccess: (restored) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.trash });
      showToast(`Campaign "${restored.name}" restored`, 'success');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiClient<{ message: string }>(`/api/v1/campaigns/${id}/permanent`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trash });
      showToast('Campaign permanently deleted', 'info');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) =>
      apiClient<Campaign>(`/api/v1/campaigns/${id}/duplicate`, {
        method: 'POST',
      }),
    onSuccess: (duplicated) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      showToast(`Duplicated as "${duplicated.name}"`, 'success');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const importMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiClient<Campaign>('/api/v1/campaigns/import', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (imported) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      showToast(`Imported campaign "${imported.name}"`, 'success');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  return {
    createMutation,
    updateMutation,
    softDeleteMutation,
    restoreMutation,
    permanentDeleteMutation,
    duplicateMutation,
    importMutation,
  };
}

// Background Job Hook
export function useJob(jobId: string | null) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const query = useQuery({
    queryKey: queryKeys.job(jobId || ''),
    queryFn: () => apiClient<Job>(`/api/v1/jobs/${jobId}`),
    enabled: Boolean(jobId),
    refetchInterval: (queryData) => {
      const status = queryData?.state?.data?.status;
      if (status === 'running' || status === 'queued') {
        return CONFIG.JOB_POLL_INTERVAL_MS;
      }
      return false;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) =>
      apiClient<Job>(`/api/v1/jobs/${id}/cancel`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.job(jobId || '') });
      showToast('Cancellation requested', 'info');
    },
  });

  // Watch for job completion
  const lastNotifiedStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (query.data && query.data.status !== lastNotifiedStatusRef.current) {
      lastNotifiedStatusRef.current = query.data.status;
      if (query.data.status === 'succeeded') {
        showToast('Background job completed successfully', 'success');
        queryClient.invalidateQueries({ queryKey: ['campaign', query.data.campaignId] });
      } else if (query.data.status === 'failed') {
        showToast(`Job failed: ${query.data.error?.message || 'Unknown error'}`, 'error');
      }
    }
  }, [query.data, showToast, queryClient]);

  return {
    job: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    cancelJob: () => jobId && cancelMutation.mutate(jobId),
    isCancelling: cancelMutation.isPending,
  };
}

// Campaign Brief Hooks (Phase 2)
export function useCampaignBrief(campaignId: string | undefined) {
  return useQuery({
    queryKey: ['campaign', campaignId, 'brief'],
    queryFn: () =>
      apiClient<{ brief: CampaignBrief | null; version: number; isComplete: boolean }>(
        `/api/v1/campaigns/${campaignId}/brief`
      ),
    enabled: Boolean(campaignId),
  });
}

export function useBriefMutations(campaignId: string | undefined) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const saveBriefMutation = useMutation({
    mutationFn: ({ brief, version }: { brief: Partial<CampaignBrief>; version: number }) =>
      apiClient<{ brief: CampaignBrief; version: number; isComplete: boolean; campaign: Campaign }>(
        `/api/v1/campaigns/${campaignId}/brief`,
        {
          method: 'PATCH',
          body: JSON.stringify({ ...brief, version }),
        }
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(['campaign', campaignId, 'brief'], {
        brief: data.brief,
        version: data.version,
        isComplete: data.isComplete,
      });
      if (data.campaign) {
        queryClient.setQueryData(queryKeys.campaign(campaignId || ''), data.campaign);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.campaign(campaignId || '') });
      queryClient.invalidateQueries({ queryKey: queryKeys.activity(campaignId || '') });
      showToast('Campaign brief saved successfully', 'success');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  return {
    saveBriefMutation,
  };
}

