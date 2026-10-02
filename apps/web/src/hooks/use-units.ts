import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiRequestError, requestJson } from '@/lib/api/request-json';

export type UnitOccupancy = 'owner_occupied' | 'rented' | 'vacant';

export interface Unit {
  id: number;
  communityId: number;
  unitNumber: string;
  building: string | null;
  floor: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  rentAmount: string | null;
  ownerUserId: string | null;
  /** Manager-only (null for everyone else). See migration `unit_occupancy`. */
  occupancy: UnitOccupancy | null;
  /** False while `occupancy` is a backfilled guess no manager has confirmed. */
  occupancyConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
}

export function useUnits(communityId: number) {
  return useQuery<Unit[]>({
    queryKey: ['units', communityId],
    enabled: communityId > 0,
    queryFn: async () => {
      return requestJson<Unit[]>(`/api/v1/units?communityId=${communityId}`);
    },
  });
}

export interface CreateUnitInput {
  communityId: number;
  unitNumber: string;
  building?: string | null;
  floor?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  sqft?: number | null;
  rentAmount?: string | null;
  /** Setting it on create records it as manager-confirmed. */
  occupancy?: UnitOccupancy | null;
}

export function useCreateUnit(communityId: number) {
  const qc = useQueryClient();
  return useMutation<Unit, Error, CreateUnitInput>({
    mutationFn: async (input) => {
      const res = await fetch('/api/v1/units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? `Failed to create unit: ${res.status}`);
      }
      const body = (await res.json()) as { data: Unit };
      return body.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['units', communityId] });
    },
  });
}

export interface UpdateUnitInput {
  unitId: number;
  unitNumber?: string;
  building?: string | null;
  floor?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  sqft?: number | null;
  /** Sending it (even unchanged) records the manager's confirmation. */
  occupancy?: UnitOccupancy | null;
  /** The unit's `updatedAt` as shown: a save over someone else's change is refused (409). */
  expectedUpdatedAt?: string;
}

export function useUpdateUnit(communityId: number) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, UpdateUnitInput>({
    mutationFn: (input) =>
      requestJson('/api/v1/units', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, ...input }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['units', communityId] }),
    // Someone else saved first: fetch their version, so what is on screen —
    // and the token the next save sends — is current.
    onError: (error) => {
      if (error instanceof ApiRequestError && error.status === 409) {
        void qc.invalidateQueries({ queryKey: ['units', communityId] });
      }
    },
  });
}

export function useDeleteUnit(communityId: number) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, number>({
    mutationFn: (unitId) =>
      requestJson('/api/v1/units', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, unitId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['units', communityId] }),
  });
}
