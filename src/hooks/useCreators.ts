import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Creator,
  CreatorQuery,
  CreatorValidationResult,
  Job,
} from '@/shared/types.ts';
import { apiClient } from '../lib/api.ts';
import { useToast } from '../context/ToastContext.tsx';

export function useCreators(campaignId: string | undefined, query?: Partial<CreatorQuery>) {
  const queryParams = new URLSearchParams();
  if (query?.status) queryParams.set('status', query.status);
  if (query?.selected) queryParams.set('selected', query.selected);
  if (query?.tier && query.tier !== 'all') queryParams.set('tier', query.tier);
  if (query?.sort) queryParams.set('sort', query.sort);
  if (query?.order) queryParams.set('order', query.order);

  const qs = queryParams.toString();
  const url = `/api/v1/campaigns/${campaignId}/creators${qs ? `?${qs}` : ''}`;

  return useQuery({
    queryKey: ['campaign', campaignId, 'creators', query],
    queryFn: () => apiClient<Creator[]>(url),
    enabled: Boolean(campaignId),
    refetchInterval: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useCreator(campaignId: string | undefined, creatorId: string | undefined) {
  return useQuery({
    queryKey: ['campaign', campaignId, 'creators', creatorId],
    queryFn: async () => {
      try {
        return await apiClient<Creator>(`/api/v1/campaigns/${campaignId}/creators/${creatorId}`);
      } catch (err: any) {
        if (err.message?.includes('not found') || err.status === 404) {
          return null;
        }
        throw err;
      }
    },
    enabled: Boolean(campaignId && creatorId),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });
}

export function useCreatorMutations(campaignId: string | undefined) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['campaign', campaignId, 'creators'],
      exact: false,
      refetchType: 'all',
    });
    await queryClient.refetchQueries({
      queryKey: ['campaign', campaignId, 'creators'],
      exact: false,
    });
    await queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
  };

  const addCreatorMutation = useMutation({
    mutationFn: (data: { input: string; notes?: string; tags?: string[] }) =>
      apiClient<Creator>(`/api/v1/campaigns/${campaignId}/creators`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: async (newCreator) => {
      await invalidate();
      showToast(`Added creator candidate "${newCreator.channel?.title || newCreator.input}"`, 'success');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const bulkAddMutation = useMutation({
    mutationFn: (data: { inputs: string[] }) =>
      apiClient<{ results: CreatorValidationResult[]; addedCount: number }>(
        `/api/v1/campaigns/${campaignId}/creators/bulk`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      ),
    onSuccess: async (res) => {
      await invalidate();
      showToast(`Successfully added ${res.addedCount} candidate creators`, 'success');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const updateCreatorMutation = useMutation({
    mutationFn: ({
      creatorId,
      version,
      updates,
    }: {
      creatorId: string;
      version: number;
      updates: Partial<Pick<Creator, 'notes' | 'tags' | 'selected' | 'plannedPublishDate'>>;
    }) =>
      apiClient<Creator>(`/api/v1/campaigns/${campaignId}/creators/${creatorId}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...updates, version }),
      }),
    onMutate: async ({ creatorId, updates }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['campaign', campaignId, 'creators'] });
      const previous = queryClient.getQueryData<Creator[]>(['campaign', campaignId, 'creators']);

      if (previous) {
        queryClient.setQueryData<Creator[]>(
          ['campaign', campaignId, 'creators'],
          previous.map((c) => (c.id === creatorId ? { ...c, ...updates } : c))
        );
      }

      return { previous };
    },
    onError: (err: Error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['campaign', campaignId, 'creators'], context.previous);
      }
      showToast(err.message, 'error');
    },
    onSettled: () => {
      invalidate();
    },
  });

  const deleteCreatorMutation = useMutation({
    mutationFn: (creatorId: string) =>
      apiClient<{ message: string }>(`/api/v1/campaigns/${campaignId}/creators/${creatorId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      invalidate();
      showToast('Creator removed from campaign', 'info');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const runDiscoveryMutation = useMutation({
    mutationFn: (options?: { force?: boolean }) =>
      apiClient<{ jobId: string; status: string; message: string }>(
        `/api/v1/campaigns/${campaignId}/discovery/run`,
        {
          method: 'POST',
          body: JSON.stringify(options || {}),
        }
      ),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId, 'jobs'] });
      showToast('Discovery run launched', 'info');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const analyzeSingleMutation = useMutation({
    mutationFn: (creatorId: string) =>
      apiClient<{ jobId: string; status: string; message: string }>(
        `/api/v1/campaigns/${campaignId}/creators/${creatorId}/analyze`,
        {
          method: 'POST',
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId, 'jobs'] });
      showToast('Creator analysis launched', 'info');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const selectRecommendedMutation = useMutation({
    mutationFn: () =>
      apiClient<{ selectedCount: number; creators: Creator[] }>(
        `/api/v1/campaigns/${campaignId}/creators/select-recommended`,
        {
          method: 'POST',
        }
      ),
    onSuccess: (data) => {
      invalidate();
      showToast(`Selected top ${data.selectedCount} recommended creators`, 'success');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const batchActionMutation = useMutation({
    mutationFn: (data: { action: 'select' | 'deselect' | 'remove' | 'reanalyze'; creatorIds: string[] }) =>
      apiClient<{ success: boolean; modifiedCount: number }>(
        `/api/v1/campaigns/${campaignId}/creators/batch-action`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      ),
    onSuccess: (_, vars) => {
      invalidate();
      showToast(`Batch updated ${vars.creatorIds.length} creators (${vars.action})`, 'success');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  return {
    addCreatorMutation,
    bulkAddMutation,
    updateCreatorMutation,
    deleteCreatorMutation,
    runDiscoveryMutation,
    analyzeSingleMutation,
    selectRecommendedMutation,
    batchActionMutation,
    checkBudgetFitMutation: useMutation({
      mutationFn: async (creatorId: string) => {
        // Refetch/invalidate queries immediately before submitting to be absolutely fresh
        await queryClient.invalidateQueries({
          queryKey: ['campaign', campaignId, 'creators'],
          exact: false,
        });
        return apiClient<{
          creator: Creator;
          isWithinBudget: boolean;
          estimatedCostUsd: { low: number; high: number; midpoint: number };
          percentageOfBudget: number;
          budgetFitScore: number;
        }>(`/api/v1/campaigns/${campaignId}/creators/${creatorId}/budget-fit`, {
          method: 'POST',
        });
      },
      onSuccess: async (res) => {
        await invalidate();
        showToast(
          `Budget check complete for "${res.creator.channel?.title || res.creator.input}": Est. $${res.estimatedCostUsd.midpoint.toLocaleString()} (${res.percentageOfBudget}% of budget)`,
          'success'
        );
      },
      onError: async (err: any) => {
        await invalidate();
        const isConflict =
          err.status === 409 ||
          err.statusCode === 409 ||
          err.message?.toLowerCase().includes('version conflict') ||
          err.message?.toLowerCase().includes('modified by someone else');
        if (isConflict) {
          showToast('This creator was updated elsewhere — please try again', 'error');
        } else {
          showToast(err.message || 'Failed to check budget fit', 'error');
        }
      },
    }),
  };
}

// Hook to fetch YouTube quota status
export function useQuotaStatus(campaignId: string | undefined) {
  return useQuery({
    queryKey: ['quota-status', campaignId],
    queryFn: () =>
      apiClient<{ used: number; limit: number; threshold: number; remaining: number }>(
        `/api/v1/campaigns/${campaignId}/creators/quota/status`
      ),
    enabled: Boolean(campaignId),
    refetchInterval: 60000,
  });
}

// Hook to monitor active discovery job with polling
export function useActiveDiscoveryJob(campaignId: string | undefined) {
  return useQuery({
    queryKey: ['campaign', campaignId, 'discovery-job'],
    queryFn: async () => {
      const res = await apiClient<{ items: Job[] }>(`/api/v1/campaigns/${campaignId}/jobs`);
      const active = res.items.find(
        (j) => (j.type === 'DISCOVERY' || j.type === 'ANALYZE_CREATOR') && (j.status === 'running' || j.status === 'queued')
      );
      return active || null;
    },
    enabled: Boolean(campaignId),
    refetchInterval: (query) => {
      return query.state.data ? 2000 : 8000;
    },
  });
}
