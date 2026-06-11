'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A community where the caller is a property_manager and no root exists yet. */
export interface RootlessCommunity {
  id: number;
  name: string;
  slug: string;
}

/** Per-community outcome of a claim (mirrors the service `ClaimResult`). */
export interface ClaimResult {
  communityId: number;
  claimed: boolean;
  reason?: 'already_claimed' | 'error';
}

/**
 * Input to `useClaimRoot.mutate`: claim one community (`communityId`) OR every
 * rootless community where the caller is a property_manager (`claimAll: true`).
 */
export type ClaimRootInput =
  | { communityId: number; claimAll?: false }
  | { claimAll: true };

/** Result of opening a dispute (mirrors the service `OpenDisputeResult`). */
export type DisputeResult =
  | { disputed: false; reason: 'no_current_root' }
  | { disputed: true; alreadyOpen: boolean };

// ---------------------------------------------------------------------------
// Query key
// ---------------------------------------------------------------------------

export const MY_ROOTLESS_QUERY_KEY = ['my-rootless'] as const;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches the caller's rootless property_manager communities
 * (`GET /api/v1/communities/my-rootless`). The route emits the canonical
 * `{ data: { communities } }` envelope; `requestJson` strips the outer `data`,
 * leaving `{ communities }`, from which we return the array.
 *
 * `enabled` lets the caller gate the fetch on admin tier — a resident must
 * never fire this query (their list is always empty; skip the call entirely).
 */
export function useMyRootless(enabled = true) {
  return useQuery<RootlessCommunity[]>({
    queryKey: MY_ROOTLESS_QUERY_KEY,
    queryFn: async ({ signal }) => {
      const { communities } = await requestJson<{
        communities: RootlessCommunity[];
      }>('/api/v1/communities/my-rootless', { signal });
      return communities;
    },
    enabled,
  });
}

/**
 * Claims root for one community or all the caller's rootless communities
 * (`POST /api/v1/communities/claim-root`). The route emits
 * `{ data: { results } }`; `requestJson` unwraps to `{ results }`. On success
 * the `my-rootless` query is invalidated so the banner/screen refresh.
 */
export function useClaimRoot() {
  const qc = useQueryClient();
  return useMutation<ClaimResult[], Error, ClaimRootInput>({
    mutationFn: async (input) => {
      const { results } = await requestJson<{ results: ClaimResult[] }>(
        '/api/v1/communities/claim-root',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        },
      );
      return results;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: MY_ROOTLESS_QUERY_KEY });
    },
  });
}

/**
 * Opens a dispute against the current root claim for a community
 * (`POST /api/v1/communities/dispute-root-claim`). The route emits the dispute
 * result inside the canonical `{ data: ... }` envelope; `requestJson` unwraps it.
 */
export function useDisputeRootClaim() {
  return useMutation<DisputeResult, Error, { communityId: number }>({
    mutationFn: async ({ communityId }) => {
      return requestJson<DisputeResult>(
        '/api/v1/communities/dispute-root-claim',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ communityId }),
        },
      );
    },
  });
}
