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
import type { ResidentListRow } from '@/lib/services/resident-service';

export interface ResidentItem {
  id: string;
  name: string;
  email: string;
  /** A tenant (resident role, not an owner): the only people a lease can name (createLease enforces it). */
  canLease: boolean;
}

/**
 * What GET /api/v1/residents returns per person. Typed from the service's own
 * row type, so a change to the API's shape fails the typecheck here instead of
 * silently turning every name into "Unknown resident".
 */
type ResidentApiRow = Pick<ResidentListRow, 'userId' | 'fullName' | 'email' | 'role' | 'isUnitOwner'>;

/** API rows → the roster's directory entries. A person with several roles appears once. */
export function toResidentItems(rows: ResidentApiRow[]): ResidentItem[] {
  const byId = new Map<string, ResidentItem>();
  for (const r of rows) {
    const canLease = r.role === 'resident' && !r.isUnitOwner;
    const prev = byId.get(r.userId);
    byId.set(r.userId, {
      id: r.userId,
      name: r.fullName?.trim() || r.email || 'Unnamed resident',
      email: r.email ?? '',
      canLease: canLease || (prev?.canLease ?? false),
    });
  }
  return [...byId.values()];
}

export const LEASE_KEYS = {
  all: ['leases'] as const,
  // Under `leases`, not `['residents', id]`: the Directory caches the raw API
  // rows under that key, and sharing it would hand each side the other's shape.
  residents: (communityId: number) => ['leases', 'residents', communityId] as const,
};

export function useResidentList(communityId: number) {
  return useQuery({
    queryKey: LEASE_KEYS.residents(communityId),
    queryFn: async () => {
      const params = new URLSearchParams({ communityId: String(communityId) });
      return toResidentItems(await requestJson<ResidentApiRow[]>(`/api/v1/residents?${params.toString()}`));
    },
    enabled: communityId > 0,
  });
}
