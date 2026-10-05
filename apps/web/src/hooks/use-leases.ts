'use client';

/**
 * Shared lease query keys and the resident directory.
 *
 * Leases v3: the roster's data and mutations live in `use-lease-roster.ts`.
 * This file keeps what that hook and the dialogs share — the `leases` key
 * space every mutation invalidates, and the community resident list used for
 * names and the resident picker.
 */
import { useQuery } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

export interface ResidentItem {
  id: string;
  name: string;
  email: string;
}

export const LEASE_KEYS = {
  all: ['leases'] as const,
  residents: (communityId: number) => ['residents', communityId] as const,
};

export function useResidentList(communityId: number) {
  return useQuery({
    queryKey: LEASE_KEYS.residents(communityId),
    queryFn: async () => {
      const params = new URLSearchParams({ communityId: String(communityId) });
      return requestJson<ResidentItem[]>(`/api/v1/residents?${params.toString()}`);
    },
    enabled: communityId > 0,
  });
}
