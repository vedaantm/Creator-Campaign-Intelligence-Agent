import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  SearchPack,
  SearchPackContent,
  Job,
} from '@/shared/types.ts';
import { apiClient } from '../lib/api.ts';
import { useToast } from '../context/ToastContext.tsx';

export function useSearchPack(campaignId: string | undefined) {
  return useQuery({
    queryKey: ['campaign', campaignId, 'searchPack'],
    queryFn: async () => {
      try {
        return await apiClient<SearchPack>(`/api/v1/campaigns/${campaignId}/search-pack`);
      } catch (err: any) {
        if (err.status === 404 || err.message?.includes('404')) {
          return null;
        }
        throw err;
      }
    },
    enabled: Boolean(campaignId),
  });
}

export function useActiveSearchPackJob(campaignId: string | undefined) {
  return useQuery({
    queryKey: ['campaign', campaignId, 'search-pack-job'],
    queryFn: async () => {
      const response = await apiClient<{ items: Job[] }>(`/api/v1/campaigns/${campaignId}/jobs`);
      const active = response.items.find(
        (j) => j.type === 'SEARCH_PACK_GENERATE' && (j.status === 'running' || j.status === 'queued')
      );
      return active || null;
    },
    enabled: Boolean(campaignId),
    refetchInterval: (query) => {
      return query.state.data ? 1500 : 6000;
    },
  });
}

export function useSearchPackMutations(campaignId: string | undefined) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['campaign', campaignId, 'searchPack'] });
    queryClient.invalidateQueries({ queryKey: ['campaign', campaignId, 'search-pack-job'] });
    queryClient.invalidateQueries({ queryKey: ['campaign', campaignId, 'activity'] });
  };

  const generateMutation = useMutation({
    mutationFn: (params?: { force?: boolean; preserveEdits?: boolean }) =>
      apiClient<{ jobId: string | null; message?: string; searchPack?: SearchPack }>(
        `/api/v1/campaigns/${campaignId}/search-pack/generate`,
        {
          method: 'POST',
          body: JSON.stringify(params || {}),
        }
      ),
    onSuccess: (res) => {
      invalidate();
      if (res.message) {
        showToast(res.message, 'info');
      } else {
        showToast('AI Max Search Capture Pack generation job started', 'info');
      }
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const patchMutation = useMutation({
    mutationFn: (params: { data: Partial<SearchPackContent>; version: number }) =>
      apiClient<SearchPack>(`/api/v1/campaigns/${campaignId}/search-pack`, {
        method: 'PATCH',
        body: JSON.stringify(params),
      }),
    onSuccess: (updated) => {
      invalidate();
      if (updated.status === 'final') {
        showToast('Search pack updated and marked final', 'success');
      } else {
        showToast('Search pack saved successfully', 'success');
      }
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiClient<{ success: boolean; message: string }>(`/api/v1/campaigns/${campaignId}/search-pack`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      invalidate();
      showToast('Search pack reset and deleted', 'info');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const pushSimulatedMutation = useMutation({
    mutationFn: () =>
      apiClient<{
        success: boolean;
        simulatedPayload: Record<string, unknown>;
        operationId: string;
        bannerNotice: string;
        searchPack: SearchPack;
      }>(`/api/v1/campaigns/${campaignId}/search-pack/push-simulated`, {
        method: 'POST',
      }),
    onSuccess: (res) => {
      invalidate();
      showToast(`Simulated Google Ads campaign created (Op ID: ${res.operationId})`, 'success');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  return {
    generateMutation,
    patchMutation,
    deleteMutation,
    pushSimulatedMutation,
  };
}
