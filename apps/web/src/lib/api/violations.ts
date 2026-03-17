/**
 * Client-side fetch helpers for violations management.
 */

import type { ViolationSeverity, ViolationStatus } from '@propertypro/db';

export interface ViolationItem {
  id: number;
  communityId: number;
  unitId: number;
  reportedByUserId: string | null;
  category: string;
  description: string;
  status: ViolationStatus;
  severity: ViolationSeverity;
  evidenceDocumentIds: number[];
  noticeDate: string | null;
  hearingDate: string | null;
  resolutionDate: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ViolationFineItem {
  id: number;
  communityId: number;
  violationId: number;
  amountCents: number;
  ledgerEntryId: number | null;
  status: 'pending' | 'paid' | 'waived';
  issuedAt: string;
  paidAt: string | null;
  waivedAt: string | null;
  waivedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListViolationsResponse {
  data: ViolationItem[];
  meta: { total: number; page: number; limit: number };
}

export interface ViolationDetailResponse {
  data: ViolationItem & { fines?: ViolationFineItem[] };
}

export interface CreateViolationPayload {
  communityId: number;
  unitId: number;
  category: string;
  description: string;
  severity?: ViolationSeverity;
  evidenceDocumentIds?: number[];
}

export interface UpdateViolationPayload {
  communityId: number;
  category?: string;
  description?: string;
  severity?: ViolationSeverity;
  status?: ViolationStatus;
  evidenceDocumentIds?: number[];
  noticeDate?: string | null;
  hearingDate?: string | null;
  resolutionNotes?: string | null;
}

export interface ImposeFinePayload {
  communityId: number;
  amountCents: number;
  dueDate?: string;
  graceDays?: number;
  notes?: string | null;
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

export async function listViolations(
  communityId: number,
  params?: {
    status?: ViolationStatus;
    severity?: ViolationSeverity;
    unitId?: number;
    createdAfter?: string;
    createdBefore?: string;
    page?: number;
    limit?: number;
  },
): Promise<ListViolationsResponse> {
  const sp = new URLSearchParams({ communityId: String(communityId) });
  if (params?.status) sp.set('status', params.status);
  if (params?.severity) sp.set('severity', params.severity);
  if (params?.unitId) sp.set('unitId', String(params.unitId));
  if (params?.createdAfter) sp.set('createdAfter', params.createdAfter);
  if (params?.createdBefore) sp.set('createdBefore', params.createdBefore);
  if (params?.page) sp.set('page', String(params.page));
  if (params?.limit) sp.set('limit', String(params.limit));
  return apiFetch<ListViolationsResponse>(`/api/v1/violations?${sp.toString()}`);
}

export async function getViolation(
  id: number,
  communityId: number,
  options?: { includeFines?: boolean },
): Promise<ViolationDetailResponse> {
  const sp = new URLSearchParams({ communityId: String(communityId) });
  if (options?.includeFines) sp.set('include', 'fines');
  return apiFetch<ViolationDetailResponse>(
    `/api/v1/violations/${id}?${sp.toString()}`,
  );
}

export async function createViolation(
  payload: CreateViolationPayload,
): Promise<{ data: ViolationItem }> {
  return apiFetch<{ data: ViolationItem }>('/api/v1/violations', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateViolation(
  id: number,
  payload: UpdateViolationPayload,
): Promise<{ data: ViolationItem }> {
  return apiFetch<{ data: ViolationItem }>(`/api/v1/violations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function imposeFine(
  violationId: number,
  payload: ImposeFinePayload,
): Promise<{ data: { fine: ViolationFineItem; ledgerEntryId: number; lineItemId: number } }> {
  return apiFetch(`/api/v1/violations/${violationId}/fine`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function resolveViolation(
  id: number,
  communityId: number,
  resolutionNotes?: string,
): Promise<{ data: ViolationItem }> {
  return apiFetch<{ data: ViolationItem }>(`/api/v1/violations/${id}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ communityId, resolutionNotes }),
  });
}

export async function dismissViolation(
  id: number,
  communityId: number,
  resolutionNotes?: string,
): Promise<{ data: ViolationItem }> {
  return apiFetch<{ data: ViolationItem }>(`/api/v1/violations/${id}/dismiss`, {
    method: 'POST',
    body: JSON.stringify({ communityId, resolutionNotes }),
  });
}
