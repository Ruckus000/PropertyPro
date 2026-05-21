'use client';

import { useQuery } from '@tanstack/react-query';
import type { Infer } from '@propertypro/api-contract';
import { requestJson } from '@/lib/api/request-json';
import type { meCommunitiesContract } from '@/app/api/v1/me/communities/contract';

/**
 * Item type derived from the route contract (Plan A1 drain). Stays in
 * lockstep with the route's declared response schema — no duplicated
 * interface to drift. Exported for consumers that need to type a
 * single community row.
 */
export type UserCommunity = Infer<typeof meCommunitiesContract>[number];

/**
 * Loads the authenticated user's communities for the community switcher.
 *
 * Uses `requestJson<...>` to strip the canonical `{ data: ... }` envelope,
 * so the hook returns `UserCommunity[]` directly — callers read it via
 * `useQuery`'s own `data` field (no awkward `.data.data` access).
 */
export function useUserCommunities() {
  return useQuery<UserCommunity[]>({
    queryKey: ['user-communities'],
    queryFn: () => requestJson<UserCommunity[]>('/api/v1/me/communities'),
    staleTime: 60_000,
  });
}
