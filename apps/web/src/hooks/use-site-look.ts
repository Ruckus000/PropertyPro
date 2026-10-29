'use client';

/**
 * The look picker's three actions on `/api/v1/pm/site/look` (D9, D18):
 *
 * - `selectLook(lookId)`: PATCH `{ lookId }`. Drafts the look, so leaving the
 *   picker and coming back keeps the choice. Nothing public changes.
 * - `publishLook(lookId)`: POST. Drafts the look if needed and publishes the
 *   site, in one click. It sends the site's publish token
 *   (`useSitePublishToken`), so a site published elsewhere since the page
 *   loaded is refused (409) instead of being overwritten.
 * - `keepCurrent()`: PATCH `{ keepCurrent: true }`. Keeps the live look and
 *   marks the website setup done.
 *
 * All three share one mutation scope, so they run one at a time, in the order
 * they were asked for: clicking two cards quickly drafts them in that order
 * (the last one wins), and Publish waits for a card's draft to land.
 *
 * The Design panel keeps its own `useDraftSiteLook` for the same PATCH; that
 * panel stops listing looks once this picker exists (Task 27).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSitePublishToken } from '@/hooks/use-content-blocks';
import { JSON_HEADERS, requestJson } from '@/lib/api/request-json';
import type { LookId } from '@/lib/site-looks/looks';

const LOOK_URL = '/api/v1/pm/site/look';

export interface PublishLookResult {
  /** When the site went live with the look; null when nothing needed publishing. */
  publishedAt: string | null;
  lookId: LookId;
}

export function useSiteLook(communityId: number) {
  const qc = useQueryClient();
  const token = useSitePublishToken(communityId);
  const scope = { id: `site-look-${communityId}` };
  // A look switch rewrites draft sections and the draft look together, and a
  // publish rewrites everything, so every site query goes stale at once.
  const invalidateSite = () => qc.invalidateQueries({ queryKey: ['pm', 'site'] });

  const selectLook = useMutation<unknown, Error, LookId>({
    scope,
    mutationFn: (lookId) =>
      requestJson(LOOK_URL, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ communityId, lookId }),
      }),
    onSuccess: invalidateSite,
  });

  const publishLook = useMutation<PublishLookResult, Error, LookId>({
    scope,
    mutationFn: (lookId) => {
      if (!token.isSuccess) {
        throw new Error("We couldn't check your site's latest version. Reload the page and try again.");
      }
      return requestJson<PublishLookResult>(LOOK_URL, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ communityId, lookId, expectedPublishedAt: token.data }),
      });
    },
    onSuccess: invalidateSite,
  });

  const keepCurrent = useMutation<unknown, Error, void>({
    scope,
    mutationFn: () =>
      requestJson(LOOK_URL, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ communityId, keepCurrent: true }),
      }),
    onSuccess: invalidateSite,
  });

  return { selectLook, publishLook, keepCurrent, tokenReady: token.isSuccess };
}
