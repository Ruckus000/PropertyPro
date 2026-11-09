'use client';

/**
 * The editor's look actions on `/api/v1/pm/site/look` (D9, D18):
 *
 * - `useSelectLook`: PATCH `{ lookId }`. Drafts the look; nothing public
 *   changes until the editor's Publish.
 * - `useKeepCurrentLook`: PATCH `{ keepCurrent: true, withdrawDraftedLook: true }`.
 *   Keeps the live look, taking a drafted one back off on any live layout (the
 *   manager's own edits stay), and marks the website setup done.
 *   `{ withdrawDraftedLook: false }` sends the plain form, which leaves a
 *   drafted look alone: the dashboard card's Dismiss uses it, so a look drafted
 *   in the editor is never discarded by closing a card.
 *
 * Both share one mutation scope, so they run one at a time, in the order they
 * were asked for: picking two cards quickly drafts them in that order, and the
 * last one wins.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { JSON_HEADERS, requestJson } from '@/lib/api/request-json';
import type { LookId } from '@/lib/site-looks/looks';

const LOOK_URL = '/api/v1/pm/site/look';

export interface KeepCurrentInput {
  /** Take a drafted look back off (the default). False sends `keepCurrent` alone. */
  withdrawDraftedLook?: boolean;
}

/** One scope per community, so every look action waits its turn behind the others. */
const lookScope = (communityId: number) => ({ id: `site-look-${communityId}` });

/**
 * A look switch rewrites draft sections and the draft look together, and a
 * publish rewrites everything, so every site query goes stale at once.
 */
function useInvalidateSite() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['pm', 'site'] });
}

/**
 * Keep the live look and mark the website setup done. Shares the look's
 * mutation scope.
 */
export function useKeepCurrentLook(communityId: number) {
  const invalidateSite = useInvalidateSite();
  return useMutation<unknown, Error, KeepCurrentInput | void>({
    scope: lookScope(communityId),
    mutationFn: (input) =>
      requestJson(LOOK_URL, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          communityId,
          keepCurrent: true,
          ...((input?.withdrawDraftedLook ?? true) ? { withdrawDraftedLook: true } : {}),
        }),
      }),
    onSuccess: invalidateSite,
  });
}

/**
 * Draft a look (`PATCH { lookId }`). The editor's Publish makes it live.
 */
export function useSelectLook(communityId: number) {
  const invalidateSite = useInvalidateSite();
  return useMutation<unknown, Error, LookId>({
    scope: lookScope(communityId),
    mutationFn: (lookId) =>
      requestJson(LOOK_URL, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ communityId, lookId }),
      }),
    onSuccess: invalidateSite,
  });
}
