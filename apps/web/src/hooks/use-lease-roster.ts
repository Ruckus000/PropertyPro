'use client';

/**
 * Leases v3 — data for the roster page, and one mutation per lease action.
 *
 * Reads: leases (with residents and deposits), units, the resident directory,
 * renewal offers for the visible leases, and the community's lease settings.
 * Every mutation invalidates the whole `leases` key space, because one action
 * (signing an offer, a transfer) changes several leases, units and offers.
 *
 * Idempotency keys are minted per dialog open (`newIdempotencyKey`) and sent
 * with creates, so a double click or a retried request returns the first
 * result instead of creating twice.
 */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';
import { useResidentList, LEASE_KEYS } from '@/hooks/use-leases';
import type { RosterLease, RosterOffer, RosterUnit } from '@/lib/leases/roster-model';

export interface LeaseSettings {
  alertWindows: number[];
  allowResidentsWithoutEmail: boolean;
}

export const ROSTER_KEYS = {
  leases: (communityId: number) => [...LEASE_KEYS.all, 'roster', communityId] as const,
  units: (communityId: number) => [...LEASE_KEYS.all, 'roster-units', communityId] as const,
  offers: (communityId: number, ids: string) => [...LEASE_KEYS.all, 'offers', communityId, ids] as const,
  settings: (communityId: number) => [...LEASE_KEYS.all, 'settings', communityId] as const,
};

export function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

export function useLeaseRosterData(communityId: number) {
  const leasesQuery = useQuery({
    queryKey: ROSTER_KEYS.leases(communityId),
    queryFn: () => requestJson<RosterLease[]>(`/api/v1/leases?communityId=${communityId}`),
    enabled: communityId > 0,
  });
  const unitsQuery = useQuery({
    queryKey: ROSTER_KEYS.units(communityId),
    queryFn: () => requestJson<RosterUnit[]>(`/api/v1/units?communityId=${communityId}`),
    enabled: communityId > 0,
  });
  const residentsQuery = useResidentList(communityId);
  const settingsQuery = useQuery({
    queryKey: ROSTER_KEYS.settings(communityId),
    queryFn: () => requestJson<LeaseSettings>(`/api/v1/leases/settings?communityId=${communityId}`),
    enabled: communityId > 0,
  });

  // Offers only matter for active leases; ask for exactly those.
  const activeIds = useMemo(
    () =>
      (leasesQuery.data ?? [])
        .filter((l) => l.status === 'active')
        .map((l) => l.id)
        .sort((a, b) => a - b)
        .join(','),
    [leasesQuery.data],
  );
  const offersQuery = useQuery({
    queryKey: ROSTER_KEYS.offers(communityId, activeIds),
    queryFn: () =>
      requestJson<RosterOffer[]>(`/api/v1/leases/offers?communityId=${communityId}&leaseIds=${activeIds}`),
    enabled: communityId > 0 && activeIds.length > 0,
  });

  const directory = useMemo(
    () => ({ users: new Map((residentsQuery.data ?? []).map((r) => [r.id, { name: r.name, email: r.email }])) }),
    [residentsQuery.data],
  );

  return {
    leases: leasesQuery.data ?? [],
    units: unitsQuery.data ?? [],
    offers: offersQuery.data ?? [],
    residents: residentsQuery.data ?? [],
    directory,
    settings: settingsQuery.data ?? { alertWindows: [30, 60, 90], allowResidentsWithoutEmail: false },
    isLoading: leasesQuery.isLoading || unitsQuery.isLoading,
    isError: leasesQuery.isError || unitsQuery.isError,
    /** Names or offers failed; the roster still renders, with gaps flagged. */
    hasPartialError: residentsQuery.isError || offersQuery.isError || settingsQuery.isError,
    refetch: () => {
      void leasesQuery.refetch();
      void unitsQuery.refetch();
    },
  };
}

/** One mutation factory: POST/PATCH/DELETE a v3 endpoint, then refresh everything lease-shaped. */
function useLeaseMutation<TInput extends object, TOut = unknown>(
  communityId: number,
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) =>
      method === 'DELETE'
        ? requestJson<TOut>(
            `${path}?${new URLSearchParams({ communityId: String(communityId), ...(input as Record<string, string>) }).toString()}`,
            { method },
          )
        : requestJson<TOut>(path, json(method, { communityId, ...input })),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: LEASE_KEYS.all });
      await queryClient.invalidateQueries({ queryKey: ['units', communityId] });
    },
  });
}

export type ResidentPick =
  | { userId: string; isPrimary?: boolean }
  | { occupantId: number; isPrimary?: boolean }
  | { newOccupant: { fullName: string; phone?: string | null; email?: string | null }; isPrimary?: boolean };

export interface DepositInput {
  amount: string;
  heldMethod?: 'separate_noninterest' | 'separate_interest' | 'surety_bond' | null;
  depository?: string | null;
  receivedOn?: string | null;
  noticeSentOn?: string | null;
}

export function useLeaseActions(communityId: number) {
  return {
    createLease: useLeaseMutation<{
      unitId: number;
      residents: ResidentPick[];
      startDate: string;
      endDate: string | null;
      rentAmount: string;
      zeroRentReason?: string | null;
      zeroRentNote?: string | null;
      noticeDays?: number | null;
      deposit?: DepositInput | null;
      notes?: string | null;
      idempotencyKey: string;
    }, RosterLease>(communityId, 'POST', '/api/v1/leases'),
    updateLease: useLeaseMutation<{
      id: number;
      version?: number;
      endDate?: string | null;
      rentAmount?: string | null;
      zeroRentReason?: string | null;
      zeroRentNote?: string | null;
      noticeDays?: number | null;
      notes?: string | null;
      moveOutOn?: string | null;
      endVia?: 'notice' | 'declined' | 'early' | 'transfer' | 'expiry' | null;
      endReason?: string | null;
      noticeReceivedOn?: string | null;
      status?: 'cancelled';
      cancelledReason?: string;
      signedDocumentId?: number | null;
    }, RosterLease>(communityId, 'PATCH', '/api/v1/leases'),
    deleteLease: useLeaseMutation<{ id: string }>(communityId, 'DELETE', '/api/v1/leases'),
    sendOffer: useLeaseMutation<{
      leaseId: number;
      offerRent: string;
      zeroRentReason?: string | null;
      zeroRentNote?: string | null;
      termMonths?: number | null;
      customEndDate?: string | null;
      startDate?: string;
      depositAmount?: string | null;
      proposedResidents?: ResidentPick[];
      expiresOn: string;
      idempotencyKey: string;
    }, RosterOffer>(communityId, 'POST', '/api/v1/leases/offers'),
    respondToOffer: useLeaseMutation<{
      offerId: number;
      action: 'accept' | 'decline' | 'withdraw' | 'expire' | 'sign';
      respondedOn?: string;
      moveOutOn?: string;
      signedDocumentId?: number | null;
      noticeDays?: number | null;
      idempotencyKey?: string;
    }, RosterOffer>(communityId, 'PATCH', '/api/v1/leases/offers'),
    recordDeposit: useLeaseMutation<DepositInput & { leaseId: number }>(communityId, 'POST', '/api/v1/leases/deposits'),
    updateDeposit: useLeaseMutation<{
      depositId: number;
      heldMethod?: DepositInput['heldMethod'];
      depository?: string | null;
      receivedOn?: string | null;
      noticeSentOn?: string | null;
      disposition?: 'refunded_full' | 'claim_sent' | null;
      dispositionOn?: string | null;
      claimedAmount?: string | null;
    }>(communityId, 'PATCH', '/api/v1/leases/deposits'),
    transfer: useLeaseMutation<{
      fromLeaseId: number;
      toUnitId: number;
      moveOutOn: string;
      startDate: string;
      endDate: string | null;
      rentAmount: string;
      zeroRentReason?: string | null;
      zeroRentNote?: string | null;
      noticeDays?: number | null;
      carryDeposit: boolean;
      depositAmount?: string | null;
      reason?: string | null;
      idempotencyKey: string;
    }>(communityId, 'POST', '/api/v1/leases/transfer'),
    setUnitOffline: useLeaseMutation<{
      unitId: number;
      offline: { reason: string; note?: string | null; since: string; until?: string | null } | null;
    }>(communityId, 'PATCH', '/api/v1/leases/unit-status'),
    updateSettings: useLeaseMutation<{ alertWindows?: number[]; allowResidentsWithoutEmail?: boolean }, LeaseSettings>(
      communityId,
      'PATCH',
      '/api/v1/leases/settings',
    ),
  };
}

export type LeaseActions = ReturnType<typeof useLeaseActions>;
