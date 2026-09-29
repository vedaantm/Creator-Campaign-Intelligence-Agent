import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CreatorBrief,
  CreatorBriefVersion,
  CreatorBriefContent,
  CreatorBriefStatus,
  Job,
} from '@/shared/types.ts';
import { apiClient } from '../lib/api.ts';
import { useToast } from '../context/ToastContext.tsx';

export function useBriefs(campaignId: string | undefined) {
  return useQuery({
    queryKey: ['campaign', campaignId, 'briefs'],
    queryFn: () => apiClient<CreatorBrief[]>(`/api/v1/campaigns/${campaignId}/briefs`),
    enabled: Boolean(campaignId),
  });
}

export function useBrief(campaignId: string | undefined, creatorId: string | undefined) {
  return useQuery({
    queryKey: ['campaign', campaignId, 'briefs', creatorId],
    queryFn: async () => {
      try {
        return await apiClient<CreatorBrief>(`/api/v1/campaigns/${campaignId}/briefs/${creatorId}`);
      } catch (err: any) {
        if (err.message?.includes('not found') || err.status === 404) {
          return null;
        }
        throw err;
      }
    },
    enabled: Boolean(campaignId && creatorId),
    retry: false,
  });
}

export function useBriefVersions(campaignId: string | undefined, creatorId: string | undefined) {
  return useQuery({
    queryKey: ['campaign', campaignId, 'briefs', creatorId, 'versions'],
    queryFn: () => apiClient<CreatorBriefVersion[]>(`/api/v1/campaigns/${campaignId}/briefs/${creatorId}/versions`),
    enabled: Boolean(campaignId && creatorId),
  });
}

export function useActiveBriefJob(campaignId: string | undefined) {
  return useQuery({
    queryKey: ['campaign', campaignId, 'brief-job'],
    queryFn: async () => {
      const jobs = await apiClient<Job[]>(`/api/v1/campaigns/${campaignId}/jobs`);
      const active = jobs.find(
        (j) =>
          (j.type === 'BRIEF_GENERATION' || j.type === 'BRIEF_REGENERATION') &&
          (j.status === 'running' || j.status === 'queued')
      );
      return active || null;
    },
    enabled: Boolean(campaignId),
    refetchInterval: (query) => {
      return query.state.data ? 2000 : 8000;
    },
  });
}

export function useBriefMutations(campaignId: string | undefined) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const invalidate = (creatorId?: string) => {
    queryClient.invalidateQueries({ queryKey: ['campaign', campaignId, 'briefs'] });
    if (creatorId) {
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId, 'briefs', creatorId] });
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId, 'briefs', creatorId, 'versions'] });
    }
    queryClient.invalidateQueries({ queryKey: ['campaign', campaignId, 'brief-job'] });
    queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
  };

  const generateBriefsMutation = useMutation({
    mutationFn: (data: { creatorIds?: string[]; instruction?: string; force?: boolean }) =>
      apiClient<{ jobId?: string; status?: string; message: string }>(
        `/api/v1/campaigns/${campaignId}/briefs/generate`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      ),
    onSuccess: (res) => {
      invalidate();
      showToast(res.message, 'success');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const regenerateBriefMutation = useMutation({
    mutationFn: ({
      creatorId,
      instruction,
      preserveEdits = true,
    }: {
      creatorId: string;
      instruction?: string;
      preserveEdits?: boolean;
    }) =>
      apiClient<{ jobId: string; status: string; message: string }>(
        `/api/v1/campaigns/${campaignId}/briefs/${creatorId}/regenerate`,
        {
          method: 'POST',
          body: JSON.stringify({ instruction, preserveEdits }),
        }
      ),
    onSuccess: (_, vars) => {
      invalidate(vars.creatorId);
      showToast('Brief regeneration started', 'success');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const updateBriefContentMutation = useMutation({
    mutationFn: ({
      creatorId,
      content,
      version,
      changeNote,
    }: {
      creatorId: string;
      content: CreatorBriefContent;
      version: number;
      changeNote?: string;
    }) =>
      apiClient<CreatorBrief>(`/api/v1/campaigns/${campaignId}/briefs/${creatorId}`, {
        method: 'PATCH',
        body: JSON.stringify({ content, version, changeNote }),
      }),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(['campaign', campaignId, 'briefs', vars.creatorId], data);
      invalidate(vars.creatorId);
      showToast('Brief changes saved and new version recorded', 'success');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const updateBriefStatusMutation = useMutation({
    mutationFn: ({
      creatorId,
      status,
      version,
    }: {
      creatorId: string;
      status: CreatorBriefStatus;
      version: number;
    }) =>
      apiClient<CreatorBrief>(`/api/v1/campaigns/${campaignId}/briefs/${creatorId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, version }),
      }),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(['campaign', campaignId, 'briefs', vars.creatorId], data);
      invalidate(vars.creatorId);
      showToast(`Brief status marked as ${data.status.toUpperCase()}`, 'success');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const restoreBriefVersionMutation = useMutation({
    mutationFn: ({
      creatorId,
      versionNumber,
    }: {
      creatorId: string;
      versionNumber: number;
    }) =>
      apiClient<CreatorBrief>(
        `/api/v1/campaigns/${campaignId}/briefs/${creatorId}/versions/${versionNumber}/restore`,
        {
          method: 'POST',
        }
      ),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(['campaign', campaignId, 'briefs', vars.creatorId], data);
      invalidate(vars.creatorId);
      showToast(`Restored version ${vars.versionNumber} as new v${data.currentVersion}`, 'success');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const deleteBriefMutation = useMutation({
    mutationFn: (creatorId: string) =>
      apiClient<{ message: string; creatorId: string }>(
        `/api/v1/campaigns/${campaignId}/briefs/${creatorId}`,
        {
          method: 'DELETE',
        }
      ),
    onSuccess: (_, creatorId) => {
      invalidate(creatorId);
      showToast('Brief deleted', 'info');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  return {
    generateBriefsMutation,
    regenerateBriefMutation,
    updateBriefContentMutation,
    updateBriefStatusMutation,
    restoreBriefVersionMutation,
    deleteBriefMutation,
  };
}
