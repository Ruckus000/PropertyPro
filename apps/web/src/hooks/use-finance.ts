'use client';

import { useQuery } from '@tanstack/react-query';
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

/* ─────── Query Keys ─────── */

export const FINANCE_KEYS = {
  all: ['finance'] as const,
  assessments: (communityId: number) =>
    [...FINANCE_KEYS.all, 'assessments', communityId] as const,
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

export function useDelinquency(
  communityId: number,
  options?: FinanceQueryOptions,
) {
  return useQuery({
    queryKey: FINANCE_KEYS.delinquency(communityId),
    queryFn: () =>
      requestJson<DelinquentUnit[]>(
        `/api/v1/delinquency?communityId=${communityId}`,
      ),
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
        limit: '200',
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
