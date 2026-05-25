'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { PaymentFeePolicy } from '@propertypro/shared';

/* ─────── Types ─────── */

type LineItemStatus = 'pending' | 'partially_paid' | 'paid' | 'overdue' | 'waived';

interface LedgerEntry {
  id: number;
  entryType: string;
  amountCents: number;
  description: string;
  createdAt: string;
}

interface UnitLineItem {
  id: number;
  assessmentId: number | null;
  unitId: number;
  amountCents: number;
  dueDate: string;
  status: LineItemStatus;
  paidAt: string | null;
  paymentIntentId: string | null;
  lateFeeCents: number;
}

interface CommunityLineItem extends UnitLineItem {
  unitNumber: string;
}

export interface UnitStatementData {
  unitId: number;
  balanceCents: number;
  ledgerEntries: LedgerEntry[];
  lineItems: UnitLineItem[];
}

export interface CommunityStatementData {
  balanceCents: number;
  ledgerEntries: LedgerEntry[];
  lineItems: CommunityLineItem[];
}

export interface StatementInner {
  mode: 'unit' | 'community';
  statement: UnitStatementData | CommunityStatementData;
}

export type PaymentPortalMode = 'unit' | 'community';

/* ─────── Hooks ─────── */

// Documented exception to the requestJson rule: (a) the statement query
// throws a bespoke literal 'Failed to load payment data' (and a second
// literal 'Expected community statement, received unit statement' for the
// discriminated-union mode mismatch case) — `requestJson` would surface
// the server error.message instead; (b) the fee-policy query SILENTLY
// returns 'association_absorbs' on non-OK (does NOT throw) — `requestJson`
// would always throw. Raw fetch preserves both behaviors byte-for-byte.
//
// As of B1 Slice 3, the statement route returns the canonical envelope
// `{ data: { mode, statement } }`. The hook still tolerates the legacy
// `{ data }` shape (without `mode`) for back-compat with cached fixtures
// and any test mocks that haven't been migrated.

export function usePaymentStatement(
  communityId: number,
  mode: PaymentPortalMode,
  unitId: number | undefined,
  options?: { enabled?: boolean },
): UseQueryResult<UnitStatementData | CommunityStatementData, Error> {
  return useQuery<UnitStatementData | CommunityStatementData, Error>({
    queryKey: ['payment-portal', communityId, mode, unitId],
    queryFn: async () => {
      const params = new URLSearchParams({ communityId: String(communityId) });
      if (unitId) params.set('unitId', String(unitId));
      const res = await fetch(`/api/v1/payments/statement?${params}`);
      if (!res.ok) throw new Error('Failed to load payment data');
      const json = (await res.json()) as {
        data?: StatementInner | UnitStatementData | CommunityStatementData;
      };

      const inner = json.data;
      if (inner && typeof inner === 'object' && 'mode' in inner && typeof inner.mode === 'string') {
        if (mode === 'community' && inner.mode !== 'community') {
          throw new Error('Expected community statement, received unit statement');
        }
        return inner.statement;
      }
      // Back-compat: legacy `{ data: <statement> }` shape (no `mode`
      // wrapper). Preserved for fixtures predating Slice 3.
      return inner as UnitStatementData | CommunityStatementData;
    },
    enabled: options?.enabled,
    staleTime: 30_000,
    retry: false,
  });
}

export function usePaymentFeePolicy(communityId: number): UseQueryResult<PaymentFeePolicy, Error> {
  return useQuery<PaymentFeePolicy, Error>({
    queryKey: ['fee-policy', communityId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/payments/fee-policy?communityId=${communityId}`);
      if (!res.ok) return 'association_absorbs';
      const json = (await res.json()) as { data?: { feePolicy?: PaymentFeePolicy } };
      return json.data?.feePolicy ?? 'association_absorbs';
    },
    staleTime: 60_000,
  });
}
