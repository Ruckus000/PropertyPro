'use client';

/**
 * React Query hooks for `/api/v1/community/profile`: the association's name,
 * short name, address, office hours and public contact details, as the Settings
 * card reads and edits them. Both verbs are admin-only on the server, and the
 * read answers 403 `SUBSCRIPTION_REQUIRED` for a lapsed community.
 *
 * A save sends only the fields it names, and a field set to `null` is cleared.
 * The server answers with the whole profile as it now stands, and that answer
 * replaces the cached one. The unit count is part of the profile read but is
 * written through `useUpdateCommunityUnitCount`, never through this mutation.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';
import type {
  CommunityProfilePatchBody,
  CommunityProfilePayload,
} from '@/app/api/v1/community/profile/contract';

/** The fields a save may change: the route's PATCH body without the community, which the hook adds. */
export type CommunityProfilePatch = Omit<CommunityProfilePatchBody, 'communityId'>;

export function communityProfileQueryKey(communityId: number) {
  return ['community-profile', communityId] as const;
}

export function useCommunityProfile(communityId: number) {
  return useQuery<CommunityProfilePayload>({
    queryKey: communityProfileQueryKey(communityId),
    queryFn: () =>
      requestJson<CommunityProfilePayload>(`/api/v1/community/profile?communityId=${communityId}`),
  });
}

export function useUpdateCommunityProfile(communityId: number) {
  const qc = useQueryClient();
  return useMutation<CommunityProfilePayload, Error, CommunityProfilePatch>({
    mutationFn: (patch) =>
      requestJson<CommunityProfilePayload>('/api/v1/community/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...patch }),
      }),
    onSuccess: (profile) => {
      qc.setQueryData(communityProfileQueryKey(communityId), profile);
    },
  });
}
