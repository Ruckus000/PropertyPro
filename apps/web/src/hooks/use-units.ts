import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

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
  createdAt: string;
  updatedAt: string;
}

export function useUnits(communityId: number) {
  return useQuery<Unit[]>({
    queryKey: ['units', communityId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/units?communityId=${communityId}`);
      if (!res.ok) throw new Error(`Failed to load units: ${res.status}`);
      const body = (await res.json()) as { data: Unit[] };
      return body.data;
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
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Failed to create unit: ${res.status}`);
      }
      const body = (await res.json()) as { data: Unit };
      return body.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['units', communityId] });
    },
  });
}
