/**
 * Client-side fetch helpers for maintenance requests (admin).
 */
import type { MaintenanceRequestItem } from './maintenance-requests';

export type { MaintenanceRequestItem };

export interface ListAllRequestsParams {
  status?: string;
  category?: string;
  priority?: string;
  assignedToId?: string;
  page?: number;
  limit?: number;
}

export interface ListAllRequestsResponse {
  data: MaintenanceRequestItem[];
  meta: { total: number; page: number; limit: number };
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as Record<string, unknown>)['message'] as string ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function listAllRequests(
  communityId: number,
  params?: ListAllRequestsParams,
): Promise<ListAllRequestsResponse> {
  const sp = new URLSearchParams({ communityId: String(communityId) });
  if (params?.status) sp.set('status', params.status);
  if (params?.category) sp.set('category', params.category);
  if (params?.priority) sp.set('priority', params.priority);
  if (params?.assignedToId) sp.set('assignedToId', params.assignedToId);
  if (params?.page) sp.set('page', String(params.page));
  if (params?.limit) sp.set('limit', String(params.limit));
  return apiFetch<ListAllRequestsResponse>(`/api/v1/maintenance-requests?${sp.toString()}`);
}

export async function updateRequestStatus(
  id: number,
  communityId: number,
  updates: {
    status?: string;
    internalNotes?: string | null;
    resolutionDescription?: string | null;
    resolutionDate?: string | null;
    assignedToId?: string | null;
    category?: string;
    priority?: string;
  },
): Promise<{ data: MaintenanceRequestItem }> {
  return apiFetch<{ data: MaintenanceRequestItem }>(`/api/v1/maintenance-requests/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ communityId, ...updates }),
  });
}

export async function assignRequest(
  id: number,
  communityId: number,
  assignedToId: string | null,
): Promise<{ data: MaintenanceRequestItem }> {
  return updateRequestStatus(id, communityId, { assignedToId });
}
