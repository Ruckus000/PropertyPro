/**
 * Client-side fetch helpers for maintenance requests (resident).
 */

export interface PhotoEntry {
  url: string;
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
  storagePaths?: string[];
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

export async function listMyRequests(
  communityId: number,
  params?: { status?: string; page?: number; limit?: number },
): Promise<ListRequestsResponse> {
  const sp = new URLSearchParams({ communityId: String(communityId) });
  if (params?.status) sp.set('status', params.status);
  if (params?.page) sp.set('page', String(params.page));
  if (params?.limit) sp.set('limit', String(params.limit));
  return apiFetch<ListRequestsResponse>(`/api/v1/maintenance-requests?${sp.toString()}`);
}

export async function getRequest(
  id: number,
  communityId: number,
): Promise<{ data: MaintenanceRequestItem }> {
  return apiFetch<{ data: MaintenanceRequestItem }>(
    `/api/v1/maintenance-requests/${id}?communityId=${communityId}`,
  );
}

export async function createMaintenanceRequest(
  payload: CreateRequestPayload,
): Promise<{ data: MaintenanceRequestItem }> {
  return apiFetch<{ data: MaintenanceRequestItem }>('/api/v1/maintenance-requests', {
    method: 'POST',
    body: JSON.stringify({ action: 'create', ...payload }),
  });
}

export async function addComment(payload: {
  communityId: number;
  requestId: number;
  text: string;
  isInternal?: boolean;
}): Promise<{ data: CommentItem }> {
  return apiFetch<{ data: CommentItem }>('/api/v1/maintenance-requests', {
    method: 'POST',
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
  return apiFetch<{ data: { uploadUrl: string; storagePath: string } }>('/api/v1/maintenance-requests', {
    method: 'POST',
    body: JSON.stringify({ action: 'request_upload_url', ...payload }),
  });
}
