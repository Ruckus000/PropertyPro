/**
 * Client-side fetch helpers for maintenance requests (resident).
 *
 * Plan B3 note: `listMyRequests` walks the canonical paginated
 * `/api/v1/maintenance-requests` envelope and JS-slices the result to the
 * requested `page` window. Same pattern as `listAllRequests` and #228
 * violations / #236 work-orders.
 */
import { JSON_HEADERS, requestJsonEnvelope } from './request-json';
import { walkAndSlice } from './walk-paginated';

export interface PhotoEntry {
  /**
   * The detail read (`GET /api/v1/maintenance-requests/[id]`) re-signs this from
   * `storagePath` on every read, and sends `null` when the object cannot be signed.
   */
  url: string | null;
  thumbnailUrl: string | null;
  storagePath: string;
  uploadedAt: string;
}

export interface CommentItem {
  id: number;
  requestId: number;
  userId: string;
  text: string;
  isInternal: boolean;
  createdAt: string;
}

export interface MaintenanceRequestItem {
  id: number;
  communityId: number;
  unitId: number | null;
  unitLabel: string | null;
  submittedById: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  assignedToId: string | null;
  resolutionDescription: string | null;
  resolutionDate: string | null;
  photos: PhotoEntry[] | null;
  internalNotes?: string | null;
  createdAt: string;
  updatedAt: string;
  comments: CommentItem[];
}

export interface ListRequestsResponse {
  data: MaintenanceRequestItem[];
  meta: { total: number; page: number; limit: number };
}

export interface CreateRequestPayload {
  communityId: number;
  title: string;
  description: string;
  category: string;
  priority: string;
  unitId?: number | null;
  unitLabel: string;
  storagePaths?: string[];
}

export async function listMyRequests(
  communityId: number,
  params?: { status?: string; page?: number; limit?: number },
): Promise<ListRequestsResponse> {
  const baseParams: Record<string, string> = {
    communityId: String(communityId),
  };
  if (params?.status) baseParams.status = params.status;

  return walkAndSlice<MaintenanceRequestItem>(
    '/api/v1/maintenance-requests',
    baseParams,
    { page: params?.page, limit: params?.limit },
  );
}

/** One request, with its comments (residents never receive internal ones). */
export async function getRequest(
  id: number,
  communityId: number,
): Promise<{ data: MaintenanceRequestItem }> {
  return requestJsonEnvelope<MaintenanceRequestItem>(
    `/api/v1/maintenance-requests/${id}?communityId=${communityId}`,
  );
}

export async function createMaintenanceRequest(
  payload: CreateRequestPayload,
): Promise<{ data: MaintenanceRequestItem }> {
  return requestJsonEnvelope<MaintenanceRequestItem>('/api/v1/maintenance-requests', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ action: 'create', ...payload }),
  });
}

/** The server stores a resident's comment as non-internal whatever is sent. */
export async function addComment(payload: {
  communityId: number;
  requestId: number;
  text: string;
  isInternal?: boolean;
}): Promise<{ data: CommentItem }> {
  return requestJsonEnvelope<CommentItem>('/api/v1/maintenance-requests', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ action: 'add_comment', ...payload }),
  });
}

export async function requestPhotoUploadUrl(payload: {
  communityId: number;
  requestId?: number | null;
  filename: string;
  fileSize: number;
  mimeType: string;
}): Promise<{ data: { uploadUrl: string; storagePath: string } }> {
  return requestJsonEnvelope<{ uploadUrl: string; storagePath: string }>('/api/v1/maintenance-requests', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ action: 'request_upload_url', ...payload }),
  });
}
