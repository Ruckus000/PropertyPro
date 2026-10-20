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
