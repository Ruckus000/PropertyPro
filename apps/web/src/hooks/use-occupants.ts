'use client';

/**
 * Household members (`/api/v1/occupants`): people on file with no portal
 * login. Managers only. `occupantToResident` folds them into the Directory's
 * residents list with portal status `no_login`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, requestJson } from '@/lib/api/request-json';
import { walkPaginated } from '@/lib/api/walk-paginated';
import type { OccupantDto } from '@/app/api/v1/occupants/contract';
import type { ResidentRecord } from '@/hooks/use-residents-management';

export type Occupant = OccupantDto;

export interface OccupantFields {
  unitId: number;
  fullName: string;
  email: string | null;
  phone: string | null;
  isOwnerHousehold: boolean;
}

/** Synthetic id in the residents list's `userId` slot; never sent to a members API. */
export const occupantKey = (id: number) => `occupant:${id}`;
/** The occupant id behind a synthetic key, or null for a real member's userId. */
export const occupantIdOf = (key: string): number | null =>
  key.startsWith('occupant:') ? Number(key.slice('occupant:'.length)) : null;

export function occupantToResident(o: Occupant): ResidentRecord {
  return {
    userId: occupantKey(o.id),
    occupantId: o.id,
    ownerHousehold: o.isOwnerHousehold,
    fullName: o.fullName,
    email: o.email,
    phone: o.phone,
    role: 'resident',
    unitId: o.unitId,
    isUnitOwner: false,
    designation: null,
    portalStatus: 'no_login',
    lastSignInAt: null,
    lastInvitedAt: null,
    updatedAt: o.updatedAt,
  };
}

const key = (communityId: number) => ['occupants', communityId] as const;

export function useOccupants(communityId: number, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: key(communityId),
    queryFn: ({ signal }) => walkPaginated<Occupant>('/api/v1/occupants', { communityId: String(communityId) }, { signal }),
    enabled: options?.enabled !== false,
  });
}

function useOccupantMutation<TInput>(communityId: number, method: 'POST' | 'PATCH' | 'DELETE') {
  const qc = useQueryClient();
  return useMutation<unknown, Error, TInput>({
    mutationFn: (input) =>
      requestJson('/api/v1/occupants', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, ...input }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(communityId) }),
    // A 409 means someone else saved first: refetch so the next save is current.
    onError: (error) => {
      if (error instanceof ApiRequestError && error.status === 409) void qc.invalidateQueries({ queryKey: key(communityId) });
    },
  });
}

export const useCreateOccupant = (communityId: number) => useOccupantMutation<OccupantFields>(communityId, 'POST');
export const useUpdateOccupant = (communityId: number) =>
  useOccupantMutation<Partial<OccupantFields> & { id: number; expectedUpdatedAt?: string }>(communityId, 'PATCH');
export const useRemoveOccupant = (communityId: number) => useOccupantMutation<{ id: number }>(communityId, 'DELETE');
