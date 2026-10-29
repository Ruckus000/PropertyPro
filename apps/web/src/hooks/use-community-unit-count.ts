'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';
import { communityProfileQueryKey } from '@/hooks/use-community-profile';
import type { CommunityProfilePayload } from '@/app/api/v1/community/profile/contract';

/**
 * Record how many units (condo) or parcels (HOA) the association has —
 * `PATCH /api/v1/community/unit-count`. The count decides whether Florida's
 * website rules apply (packages/shared `requirementLevel`); the site builder
 * asks for it when unknown. Admin-only on the server.
 *
 * Two screens save the count: the site editor's requirements pill and the
 * Settings card. The card's profile read (`useCommunityProfile`) carries it too,
 * so a save puts the count the server returned into the cached profile, if one is
 * cached, and whichever screen saved, that cache never shows the old number. With
 * no profile cached there is nothing to update; the next read fetches it. Nothing
 * else caches the count: the editor receives it as a server prop, and
 * `RequiredSectionsProvider` holds the edited value itself for the session.
 */
export function useUpdateCommunityUnitCount(communityId: number) {
  const qc = useQueryClient();
  return useMutation<{ unitCount: number }, Error, number>({
    mutationFn: (unitCount) =>
      requestJson<{ unitCount: number }>('/api/v1/community/unit-count', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, unitCount }),
      }),
    onSuccess: (saved) => {
      qc.setQueryData<CommunityProfilePayload>(communityProfileQueryKey(communityId), (profile) =>
        profile ? { ...profile, unitCount: saved.unitCount } : profile,
      );
    },
  });
}
