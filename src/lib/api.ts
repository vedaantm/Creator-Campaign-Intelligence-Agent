import { ApiErrorResponse } from '@/shared/types.ts';

export class ClientApiError extends Error {
  public code: string;
  public status: number;
  public details?: unknown;
  public retryable?: boolean;
  public currentData?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
    retryable?: boolean,
    currentData?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ClientApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryable = retryable;
    this.currentData = currentData;
  }
}

let getAuthTokenFn: (() => Promise<string | null>) | null = null;

export function setAuthTokenProvider(provider: () => Promise<string | null>) {
  getAuthTokenFn = provider;
}

export async function apiClient<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  if (getAuthTokenFn) {
    const token = await getAuthTokenFn();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorData: ApiErrorResponse['error'] | null = null;
    try {
      const json = await response.json();
      if (json && json.error) {
        errorData = json.error;
      }
    } catch {
      // ignore
    }

    const message = errorData?.message || response.statusText || 'An error occurred';
    const code = errorData?.code || 'ERROR';
    const details = errorData?.details;
    const retryable = errorData?.retryable;

    throw new ClientApiError(
      response.status,
      code,
      message,
      details,
      retryable,
      errorData?.details as Record<string, unknown>
    );
  }

  // Handle empty responses (like 204)
  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => apiClient<T>(`/api/v1${path}`),
  post: <T>(path: string, body?: any) =>
    apiClient<T>(`/api/v1${path}`, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: any) =>
    apiClient<T>(`/api/v1${path}`, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => apiClient<T>(`/api/v1${path}`, { method: 'DELETE' }),
};

export async function getCampaign(campaignId: string) {
  return apiClient<any>(`/api/v1/campaigns/${campaignId}`);
}

export async function getCreators(campaignId: string) {
  return apiClient<any[]>(`/api/v1/campaigns/${campaignId}/creators`);
}

export async function updateCampaignBrief(campaignId: string, brief: any, version: number) {
  return apiClient<any>(`/api/v1/campaigns/${campaignId}/brief`, {
    method: 'PUT',
    body: JSON.stringify({ ...brief, version }),
  });
}

export async function getSearchPack(campaignId: string) {
  return apiClient<any>(`/api/v1/campaigns/${campaignId}/search-pack`);
}

export async function generateSearchPack(campaignId: string, options?: { force?: boolean }) {
  return apiClient<any>(`/api/v1/campaigns/${campaignId}/search-pack/generate`, {
    method: 'POST',
    body: JSON.stringify(options || {}),
  });
}

