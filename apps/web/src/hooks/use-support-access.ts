'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * TanStack-Query hooks for the support-access settings API. Replaces the
 * previous `useState + useEffect + fetch + fetchData()` pattern in
 * `SupportAccessSettings.tsx`, including the post-toggle manual refetch
 * (now a query invalidation).
 *
 * As of B1 Slice 1, both the GET and POST endpoints return the canonical
 * `{ data: T }` envelope. The hooks unwrap `.data` manually rather than
 * adopting `requestJson` because they preserve bespoke error-literal
 * handling — migration to `requestJson` is B6 work.
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
      // GET returns canonical { data: SupportAccessData } (B1 Slice 1).
      // Check res.ok BEFORE parsing and read the success body exactly once;
      // a non-JSON/empty success body throws the load literal rather than
      // a silent `{}` that would crash the component on data.recentAccess.
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: { message?: string } }).error?.message ??
            'Failed to load support access settings',
        );
      }
      try {
        const json = (await res.json()) as { data?: SupportAccessData };
        if (!json.data) {
          throw new Error('Failed to load support access settings');
        }
        return json.data;
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
