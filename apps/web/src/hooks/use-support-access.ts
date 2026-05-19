'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * TanStack-Query hooks for the support-access settings API. Replaces the
 * previous `useState + useEffect + fetch + fetchData()` pattern in
 * `SupportAccessSettings.tsx`, including the post-toggle manual refetch
 * (now a query invalidation).
 *
 * The GET /api/v1/settings/support-access response is non-standard — it
 * returns a flat `{ consentActive, consent, recentAccess }` object, NOT the
 * canonical `{ data: T }` envelope. `requestJson` would try to unwrap a
 * `.data` key that does not exist, so the read hook does its own fetch.
 *
 * The POST endpoint returns `{ ok: true }` (also no `{ data }` envelope),
 * so the mutation hook likewise does its own fetch.
 */

export interface ConsentGrant {
  id: number;
  community_id: number;
  granted_by: string;
  granted_at: string;
  revoked_at: string | null;
}

export interface AccessLogEntry {
  id: number;
  event: string;
  admin_user_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface SupportAccessData {
  consentActive: boolean;
  consent: ConsentGrant | null;
  recentAccess: AccessLogEntry[];
}

export const SUPPORT_ACCESS_QUERY_KEY = (communityId: number) =>
  ['support-access', communityId] as const;

export function useSupportAccess(communityId: number) {
  return useQuery<SupportAccessData>({
    queryKey: SUPPORT_ACCESS_QUERY_KEY(communityId),
    enabled: Boolean(communityId) && communityId > 0,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ communityId: String(communityId) });
      const res = await fetch(`/api/v1/settings/support-access?${params.toString()}`, {
        signal,
      });
      // Documented exception to the requestJson rule: GET returns flat
      // { consentActive, consent, recentAccess }, not { data }. Check
      // res.ok BEFORE parsing and read the success body exactly once; a
      // non-JSON/empty success body throws the load literal rather than a
      // silent `{}` that would crash the component on data.recentAccess.
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: { message?: string } }).error?.message ??
            'Failed to load support access settings',
        );
      }
      try {
        return (await res.json()) as SupportAccessData;
      } catch {
        throw new Error('Failed to load support access settings');
      }
    },
  });
}

export function useToggleSupportAccess(communityId: number) {
  const queryClient = useQueryClient();

  return useMutation<{ ok: true }, Error, { enabled: boolean }>({
    mutationFn: async ({ enabled }) => {
      const res = await fetch('/api/v1/settings/support-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, enabled }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: { message?: string } }).error?.message ??
            'Failed to update support access',
        );
      }
      return { ok: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: SUPPORT_ACCESS_QUERY_KEY(communityId),
      });
    },
  });
}
