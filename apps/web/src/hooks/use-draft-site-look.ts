'use client';

/**
 * React Query mutation for `PATCH /api/v1/pm/site/look`: draft a whole look,
 * which is its layout, colour set, colours and fonts and the home page's
 * sections as the switch leaves them (`draftLookSwitch`). Nothing is live until
 * Publish. Resolves to what the switch did to each section.
 *
 * Its own module, not a sibling of `useSaveSiteDesign` in `use-site-design.ts`:
 * the editor's first load imports that file for `useSiteDesign`, and the editor
 * has almost no size budget left. Only the Design panel, which is loaded on its
 * tab click, needs this.
 *
 * Invalidates the whole `['pm','site']` prefix rather than the design query
 * alone. A switch writes draft sections and the draft look in one transaction, so
 * the canvas, the change count and the design all go stale together. (Saving the
 * design can `setQueryData` instead because its response IS the design.)
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';
import type { LookId, LookSwitchCounts } from '@/lib/site-looks/looks';

export function useDraftSiteLook(communityId: number) {
  const qc = useQueryClient();
  return useMutation<LookSwitchCounts, Error, LookId>({
    mutationFn: (lookId) =>
      requestJson<LookSwitchCounts>('/api/v1/pm/site/look', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, lookId }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['pm', 'site'] });
    },
  });
}
