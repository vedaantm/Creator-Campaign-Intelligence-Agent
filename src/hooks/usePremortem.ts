import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PremortemRun,
  WhatIfResponse,
  Job,
} from '@/shared/types.ts';
import { apiClient } from '../lib/api.ts';
import { useToast } from '../context/ToastContext.tsx';

export function usePremortemRuns(campaignId: string | undefined) {
  return useQuery({
    queryKey: ['campaign', campaignId, 'premortem-runs'],
    queryFn: () => apiClient<PremortemRun[]>(`/api/v1/campaigns/${campaignId}/premortem/runs`),
    enabled: Boolean(campaignId),
  });
}

export function usePremortemRun(campaignId: string | undefined, runId: string | undefined) {
  return useQuery({
    queryKey: ['campaign', campaignId, 'premortem-runs', runId],
    queryFn: () => apiClient<PremortemRun>(`/api/v1/campaigns/${campaignId}/premortem/runs/${runId}`),
    enabled: Boolean(campaignId && runId),
  });
}

export function useActivePremortemJob(campaignId: string | undefined) {
  return useQuery({
    queryKey: ['campaign', campaignId, 'premortem-job'],
    queryFn: async () => {
      const res = await apiClient<{ items: Job[] }>(`/api/v1/campaigns/${campaignId}/jobs`);
      const active = res.items.find(
        (j) => j.type === 'PREMORTEM' && (j.status === 'running' || j.status === 'queued')
      );
      return active || null;
    },
    enabled: Boolean(campaignId),
    refetchInterval: (query) => {
      return query.state.data ? 2000 : 10000;
    },
  });
}

export function usePremortemMutations(campaignId: string | undefined) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['campaign', campaignId, 'premortem-runs'] });
    queryClient.invalidateQueries({ queryKey: ['campaign', campaignId, 'creators'] });
    queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
  };

  const startRunMutation = useMutation({
    mutationFn: (data: { creatorIds: string[] }) =>
      apiClient<{ jobId: string; status: string; message: string }>(
        `/api/v1/campaigns/${campaignId}/premortem/runs`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId, 'jobs'] });
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId, 'premortem-job'] });
      showToast('Pre-Mortem simulation started', 'info');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const approveRunMutation = useMutation({
    mutationFn: (runId: string) =>
      apiClient<{ success: boolean; approvedRunId: string }>(
        `/api/v1/campaigns/${campaignId}/premortem/runs/${runId}/approve`,
        {
          method: 'POST',
        }
      ),
    onSuccess: () => {
      invalidate();
      showToast('Creator lineup successfully approved for commercial execution!', 'success');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const deleteRunMutation = useMutation({
    mutationFn: (runId: string) =>
      apiClient<{ message: string; runId: string }>(
        `/api/v1/campaigns/${campaignId}/premortem/runs/${runId}`,
        {
          method: 'DELETE',
        }
      ),
    onSuccess: () => {
      invalidate();
      showToast('Pre-Mortem run deleted', 'info');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const whatIfMutation = useMutation({
    mutationFn: (creatorIds: string[]) =>
      apiClient<WhatIfResponse>(`/api/v1/campaigns/${campaignId}/premortem/what-if`, {
        method: 'POST',
        body: JSON.stringify({ creatorIds }),
      }),
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  return {
    startRunMutation,
    approveRunMutation,
    deleteRunMutation,
    whatIfMutation,
  };
}
