'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';
import { walkPaginated } from '@/lib/api/walk-paginated';

/* ─────── Types ─────── */

export interface Assessment {
  id: number;
  communityId: number;
  title: string;
  description: string | null;
  amountCents: number;
  frequency: 'monthly' | 'quarterly' | 'annual' | 'one_time';
  dueDay: number | null;
  lateFeeAmountCents: number;
  lateFeeDaysGrace: number;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface AssessmentLineItem {
  id: number;
  assessmentId: number | null;
  unitId: number;
  amountCents: number;
  dueDate: string;
  status: 'pending' | 'paid' | 'overdue' | 'waived';
  lateFeeCents: number;
  paidAt: string | null;
}

export interface DelinquentUnit {
  unitId: number;
  unitLabel?: string;
  ownerName?: string;
  overdueAmountCents: number;
  daysOverdue: number;
  lineItemCount: number;
  lienEligible: boolean;
}

export interface LedgerEntry {
  id: number;
  entryType: string;
  amountCents: number;
  description: string;
  unitId: number | null;
  unitLabel?: string;
  sourceType: string;
  sourceId: string | null;
  createdAt: string;
}

export interface LedgerFilters {
  entryType?: string;
  unitId?: number;
  startDate?: string;
  endDate?: string;
  /** Row cap. Defaults to 200; the server clamps to [1, 500]. */
  limit?: number;
}

export interface PaymentHistoryItem {
  id: number;
  unitId: number;
  amountCents: number;
  dueDate: string;
  paidAt: string | null;
  lateFeeCents: number;
}

interface FinanceQueryOptions {
  enabled?: boolean;
}

export interface AssessmentMutationPayload {
  title: string;
  description: string | null;
  amountCents: number;
  frequency: 'monthly' | 'quarterly' | 'annual' | 'one_time';
  dueDay: number | null;
  lateFeeAmountCents: number;
  lateFeeDaysGrace: number;
  startDate?: string;
  endDate?: string | null;
  isActive?: boolean;
}

/* ─────── Query Keys ─────── */

export const FINANCE_KEYS = {
  all: ['finance'] as const,
  assessments: (communityId: number) =>
    [...FINANCE_KEYS.all, 'assessments', communityId] as const,
  assessmentLineItems: (communityId: number, assessmentId: number) =>
    [...FINANCE_KEYS.assessments(communityId), assessmentId, 'line-items'] as const,
  delinquency: (communityId: number) =>
    [...FINANCE_KEYS.all, 'delinquency', communityId] as const,
  ledger: (communityId: number, filters?: LedgerFilters) =>
    [...FINANCE_KEYS.all, 'ledger', communityId, filters ?? {}] as const,
  payments: (communityId: number) =>
    [...FINANCE_KEYS.all, 'payments', communityId] as const,
};

/* ─────── Hooks ─────── */

export function useAssessments(
  communityId: number,
  options?: FinanceQueryOptions,
) {
  return useQuery({
    queryKey: FINANCE_KEYS.assessments(communityId),
    queryFn: ({ signal }) =>
      walkPaginated<Assessment>(
        '/api/v1/assessments',
        { communityId: String(communityId) },
        { signal },
      ),
    staleTime: 30_000,
    enabled: communityId > 0 && options?.enabled !== false,
  });
}

export function useAssessmentLineItems(
  communityId: number,
  assessmentId: number,
  options?: FinanceQueryOptions,
) {
  return useQuery({
    queryKey: FINANCE_KEYS.assessmentLineItems(communityId, assessmentId),
    queryFn: () =>
      requestJson<AssessmentLineItem[]>(
        `/api/v1/assessments/${assessmentId}/line-items?communityId=${communityId}`,
      ),
    staleTime: 30_000,
    enabled: communityId > 0 && assessmentId > 0 && options?.enabled !== false,
  });
}

export function useCreateAssessment(communityId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: AssessmentMutationPayload) =>
      requestJson<Assessment>('/api/v1/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, ...payload }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FINANCE_KEYS.assessments(communityId) });
    },
  });
}

export function useUpdateAssessment(communityId: number, assessmentId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: AssessmentMutationPayload) =>
      requestJson<Assessment>(`/api/v1/assessments/${assessmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, ...payload }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FINANCE_KEYS.assessments(communityId) });
    },
  });
}

export function useDeleteAssessment(communityId: number, assessmentId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      requestJson<{ success: true }>(
        `/api/v1/assessments/${assessmentId}?communityId=${communityId}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FINANCE_KEYS.assessments(communityId) });
      queryClient.invalidateQueries({
        queryKey: FINANCE_KEYS.assessmentLineItems(communityId, assessmentId),
      });
    },
  });
}

export function useGenerateAssessmentLineItems(communityId: number, assessmentId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dueDate?: string) =>
      requestJson<{ insertedCount: number; skippedCount: number; dueDate: string }>(
        `/api/v1/assessments/${assessmentId}/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ communityId, dueDate }),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: FINANCE_KEYS.assessmentLineItems(communityId, assessmentId),
      });
      queryClient.invalidateQueries({ queryKey: FINANCE_KEYS.ledger(communityId) });
      queryClient.invalidateQueries({ queryKey: FINANCE_KEYS.payments(communityId) });
    },
  });
}

export function useWaiveLateFees(communityId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (unitId: number) =>
      requestJson<unknown>(
        `/api/v1/delinquency/${unitId}/waive`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ communityId }),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FINANCE_KEYS.delinquency(communityId) });
      queryClient.invalidateQueries({ queryKey: FINANCE_KEYS.ledger(communityId) });
      queryClient.invalidateQueries({ queryKey: FINANCE_KEYS.payments(communityId) });
    },
  });
}

export function useDelinquency(
  communityId: number,
  options?: FinanceQueryOptions,
) {
  return useQuery({
    queryKey: FINANCE_KEYS.delinquency(communityId),
    queryFn: async () => {
      // Route returns canonical double-wrap { data: { data, meta } }; requestJson
      // unwraps the outer .data, leaving us the inner { data, meta } envelope.
      const result = await requestJson<{
        data: DelinquentUnit[];
        meta: { lienThresholdDays: number };
      }>(`/api/v1/delinquency?communityId=${communityId}`);
      return result.data;
    },
    staleTime: 60_000,
    enabled: communityId > 0 && options?.enabled !== false,
  });
}

export function useLedger(
  communityId: number,
  filters?: LedgerFilters,
  options?: FinanceQueryOptions,
) {
  return useQuery({
    queryKey: FINANCE_KEYS.ledger(communityId, filters),
    queryFn: () => {
      const params = new URLSearchParams({
        communityId: String(communityId),
        limit: String(filters?.limit ?? 200),
      });
      if (filters?.entryType) params.set('entryType', filters.entryType);
      if (filters?.unitId) params.set('unitId', String(filters.unitId));
      if (filters?.startDate) params.set('startDate', filters.startDate);
      if (filters?.endDate) params.set('endDate', filters.endDate);
      return requestJson<LedgerEntry[]>(`/api/v1/ledger?${params}`);
    },
    staleTime: 30_000,
    enabled: communityId > 0 && options?.enabled !== false,
  });
}

export function useRecentPayments(
  communityId: number,
  options?: FinanceQueryOptions,
) {
  return useQuery({
    queryKey: FINANCE_KEYS.payments(communityId),
    queryFn: () =>
      requestJson<PaymentHistoryItem[]>(
        `/api/v1/payments/history?communityId=${communityId}`,
      ),
    staleTime: 30_000,
    enabled: communityId > 0 && options?.enabled !== false,
  });
}
