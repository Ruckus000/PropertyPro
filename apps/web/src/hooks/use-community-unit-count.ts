'use client';

import { useMutation } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

/**
 * Record how many units (condo) or parcels (HOA) the association has —
 * `PATCH /api/v1/community/unit-count`. The count decides whether Florida's
 * website rules apply (packages/shared `requirementLevel`); the site builder
 * asks for it when unknown. Admin-only on the server.
 *
 * No cache to invalidate: the value reaches the editor as a server prop, and
 * `RequiredSectionsProvider` holds the edited value itself for the session.
 */
export function useUpdateCommunityUnitCount(communityId: number) {
  return useMutation<{ unitCount: number }, Error, number>({
    mutationFn: (unitCount) =>
      requestJson<{ unitCount: number }>('/api/v1/community/unit-count', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, unitCount }),
      }),
  });
}
