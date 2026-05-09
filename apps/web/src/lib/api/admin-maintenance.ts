/**
 * Client-side fetch helpers for maintenance requests (admin).
 *
 * Plan B3 note: `listAllRequests` walks the canonical paginated
 * `/api/v1/maintenance-requests` envelope and JS-slices the result to the
 * requested `page` window. Same pattern as #228 violations, #236 work-orders.
 */
import type { MaintenanceRequestItem } from './maintenance-requests';
import { walkAndSlice } from './walk-paginated';

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
  const baseParams: Record<string, string> = {
    communityId: String(communityId),
  };
  if (params?.status) baseParams.status = params.status;
  if (params?.category) baseParams.category = params.category;
  if (params?.priority) baseParams.priority = params.priority;
  if (params?.assignedToId) baseParams.assignedToId = params.assignedToId;

  return walkAndSlice<MaintenanceRequestItem>(
    '/api/v1/maintenance-requests',
    baseParams,
    { page: params?.page, limit: params?.limit },
  );
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
