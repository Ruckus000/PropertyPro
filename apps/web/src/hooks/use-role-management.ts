'use client';

/**
 * Role-management hooks (role-v3 Phase 2c). Power the root-only
 * `/settings/roles` screen. Mirror the `use-claim-root` patterns: TanStack
 * Query + `requestJson` from `@/lib/api/request-json`.
 *
 * The one exception is `useSetDesignation`, which does a RAW `fetch` so it can
 * detect the HTTP 409 `NON_OWNER_ACK_REQUIRED` response and surface it as a
 * typed *result* (`{ ok: false, reason: 'non_owner_requires_ack' }`) rather
 * than a thrown error. Hooks ARE allowed to call `fetch` directly —
 * `guard:component-api-calls` only forbids fetch in components.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single member of the community roster (a row from `GET /api/v1/residents`). */
export interface RosterMember {
  userId: string;
  fullName: string;
  role: string;
}

/** A board designation the root manager can set, or `null` to clear it. */
export type BoardDesignation = 'board_president' | 'board_member' | null;

/**
 * Result of `useSetDesignation`. A 409 ack-required response is surfaced as a
 * typed result (NOT a thrown error) so the UI can offer an inline
 * "I confirm eligibility" affordance and re-submit with `acknowledgeNonOwner`.
 */
export type SetDesignationResult =
  | { ok: true }
  | { ok: false; reason: 'non_owner_requires_ack' };

// ---------------------------------------------------------------------------
// Query key
// ---------------------------------------------------------------------------

export const COMMUNITY_ROSTER_KEY = (communityId: number) =>
  ['community-roster', communityId] as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches the FULL member roster for a community
 * (`GET /api/v1/residents?communityId=<id>`). We deliberately pass NO `roles`
 * filter — the residents GET only accepts the legacy filter values
 * ({resident, manager, pm_admin}) and would 400 on `property_manager`. We
 * fetch everyone and partition client-side by `role`.
 *
 * The route emits the canonical `{ data: Row[] }` envelope; `requestJson`
 * strips the outer `data`, leaving the array.
 */
export function useCommunityRoster(communityId: number, enabled = true) {
  return useQuery<RosterMember[]>({
    queryKey: COMMUNITY_ROSTER_KEY(communityId),
    queryFn: async ({ signal }) => {
      const rows = await requestJson<
        Array<{ userId: string; fullName: string | null; role: string }>
      >(`/api/v1/residents?communityId=${communityId}`, { signal });
      return rows.map((row) => ({
        userId: row.userId,
        // The residents service can return `fullName: null`; coerce to a
        // human-readable fallback so names never render blank.
        fullName: (row.fullName as string | null) ?? 'Unknown user',
        role: row.role,
      }));
    },
    enabled: communityId > 0 && enabled,
  });
}

/**
 * Promotes a member to `property_manager`
 * (`POST /api/v1/communities/role-assignments`). On success the roster is
 * invalidated so the screen refreshes.
 */
export function useAssignPropertyManager(communityId: number) {
  const qc = useQueryClient();
  return useMutation<
    { assigned: boolean; alreadyAssigned: boolean },
    Error,
    { userId: string }
  >({
    mutationFn: async ({ userId }) =>
      requestJson<{ assigned: boolean; alreadyAssigned: boolean }>(
        '/api/v1/communities/role-assignments',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ communityId, userId }),
        },
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: COMMUNITY_ROSTER_KEY(communityId) });
    },
  });
}

/**
 * Demotes a `property_manager` back to resident
 * (`DELETE /api/v1/communities/role-assignments`). On success the roster is
 * invalidated.
 */
export function useRevokePropertyManager(communityId: number) {
  const qc = useQueryClient();
  return useMutation<
    { revoked: boolean; reason?: string },
    Error,
    { userId: string }
  >({
    mutationFn: async ({ userId }) =>
      requestJson<{ revoked: boolean; reason?: string }>(
        '/api/v1/communities/role-assignments',
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ communityId, userId }),
        },
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: COMMUNITY_ROSTER_KEY(communityId) });
    },
  });
}

/**
 * Transfers the root manager role to another property_manager
 * (`POST /api/v1/communities/transfer-root`). On success the roster is
 * invalidated (the caller becomes a plain property_manager).
 */
export function useTransferRoot(communityId: number) {
  const qc = useQueryClient();
  return useMutation<{ transferred: boolean }, Error, { toUserId: string }>({
    mutationFn: async ({ toUserId }) =>
      requestJson<{ transferred: boolean }>(
        '/api/v1/communities/transfer-root',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ communityId, toUserId }),
        },
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: COMMUNITY_ROSTER_KEY(communityId) });
    },
  });
}

/**
 * Sets (or clears) a board designation for a member
 * (`POST /api/v1/communities/designations`).
 *
 * RAW fetch (not `requestJson`) so a 409 `NON_OWNER_ACK_REQUIRED` is surfaced
 * as a typed result rather than a generic thrown Error. Setting a designation
 * on a non-owner (tenant) target requires `acknowledgeNonOwner: true`; without
 * it the route returns 409, which we map to
 * `{ ok: false, reason: 'non_owner_requires_ack' }`.
 */
export function useSetDesignation(communityId: number) {
  const qc = useQueryClient();
  return useMutation<
    SetDesignationResult,
    Error,
    {
      userId: string;
      designation: BoardDesignation;
      acknowledgeNonOwner?: boolean;
    }
  >({
    mutationFn: async (input) => {
      const res = await fetch('/api/v1/communities/designations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, ...input }),
      });
      if (res.status === 409) {
        return { ok: false, reason: 'non_owner_requires_ack' };
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(body?.error?.message ?? 'Request failed');
      }
      return { ok: true };
    },
    onSuccess: async (result) => {
      // An unack'd 409 made no change; invalidating is harmless but skip it.
      if (result.ok) {
        await qc.invalidateQueries({
          queryKey: COMMUNITY_ROSTER_KEY(communityId),
        });
      }
    },
  });
}
