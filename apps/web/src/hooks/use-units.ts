import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

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
