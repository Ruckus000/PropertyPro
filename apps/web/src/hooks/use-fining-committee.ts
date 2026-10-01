'use client';

import { useQuery } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';
import { isFiningCommitteeEligible } from '@/lib/violations/fining-committee';

export interface FiningCommitteeOption {
  userId: string;
  name: string;
}

/**
 * Owners who may approve a fine (lib/violations/fining-committee): no board
 * seat, not the person imposing it. The fine service applies the same rule.
 */
export function useFiningCommitteeCandidates(communityId: number, actorUserId: string, enabled: boolean) {
  return useQuery<FiningCommitteeOption[]>({
    queryKey: ['fining-committee-candidates', communityId, actorUserId],
    queryFn: async ({ signal }) => {
      const rows = await requestJson<
        Array<{ userId: string; fullName: string | null; role: string; isUnitOwner: boolean | null; designation: string | null }>
      >(`/api/v1/residents?communityId=${communityId}&roles=resident`, { signal });
      return rows
        .filter((row) => isFiningCommitteeEligible(row, actorUserId))
        .map((row) => ({ userId: row.userId, name: row.fullName ?? 'Unknown owner' }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: communityId > 0 && enabled,
  });
}
