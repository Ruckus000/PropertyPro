'use client';

/**
 * Put the public site back to an earlier publish, from the website home
 * (spec corrections 3 and 4).
 *
 * Restore never surprises the person who clicked it:
 *
 * 1. **It restores what the page showed.** The page's loader read the site's
 *    publish token and the version before the last publish. If the live site
 *    has moved on since (a colleague published), Restore refuses before
 *    writing anything, rather than undoing a publish the person never saw.
 * 2. **Unpublished edits are cleared first** (`DELETE /api/v1/pm/site/drafts`):
 *    draft sections, pages added and not yet published, staged page removals
 *    and a drafted look. A revert only rewrites draft SECTIONS, so without this
 *    a staged page removal would go live with the restore, and an added page
 *    would go live empty.
 * 3. `POST /api/v1/pm/site/publish/revert` stages the chosen version, then
 *    `POST /api/v1/pm/site/publish` makes it live, guarded by the same token,
 *    so a publish that lands in between is refused (409), never overwritten.
 * 4. **Nothing half-done is left behind.** If the revert or the publish fails,
 *    the staged version is cleared again, so a later Publish by anyone cannot
 *    put it live by surprise. The site is then exactly as it was.
 *
 * `restoreLatest` restores the version before the last publish;
 * `restoreSnapshot` one version from the list (Professional plans show it;
 * revert itself is on every plan). Both throw a `RestoreError` whose message is
 * the sentence to show.
 */
import { useCallback } from 'react';
import { JSON_HEADERS, requestJson } from '@/lib/api/request-json';
import { usePublishSite } from '@/hooks/use-publish-site';

export const RESTORE_STALE_MESSAGE =
  'Someone published the site since this page opened. Reload the page and try again.';
export const RESTORE_NOT_CHANGED_MESSAGE = "Your site wasn't changed. Unpublished edits were cleared.";
const RESTORE_FAILED_MESSAGE = "We couldn't restore your site just now. Please try again.";
const RESTORE_LEFT_STAGED_MESSAGE =
  "We couldn't restore your site, and the earlier version is waiting as unpublished edits. Open the editor and discard them before anyone publishes.";

export type RestoreErrorKind = 'stale' | 'not_changed' | 'failed' | 'left_staged';

export class RestoreError extends Error {
  readonly kind: RestoreErrorKind;
  constructor(kind: RestoreErrorKind, message: string) {
    super(message);
    this.name = 'RestoreError';
    this.kind = kind;
  }
}

export interface RestorePreviousSiteOptions {
  /** The publish token the page loaded with (`WebsiteHomeData.publishToken`). */
  publishToken: string | null;
  /** The version before the last publish, as the page loaded it (`previousSnapshotId`). */
  previousSnapshotId: number | null;
}

export function useRestorePreviousSite(
  communityId: number,
  { publishToken, previousSnapshotId }: RestorePreviousSiteOptions,
): {
  restoreLatest: () => Promise<void>;
  restoreSnapshot: (snapshotId: number) => Promise<void>;
} {
  const { mutateAsync: publishSite } = usePublishSite(communityId);

  const restoreSnapshot = useCallback(
    async (snapshotId: number) => {
      const discardDrafts = () =>
        requestJson('/api/v1/pm/site/drafts', {
          method: 'DELETE',
          headers: JSON_HEADERS,
          body: JSON.stringify({ communityId }),
        });

      // 1. The live site must still be the one the page showed. Nothing is written yet.
      let live: string | null;
      try {
        ({ latestPublishedAt: live } = await requestJson<{ latestPublishedAt: string | null }>(
          `/api/v1/pm/site/blocks?communityId=${communityId}`,
        ));
      } catch {
        throw new RestoreError('failed', RESTORE_FAILED_MESSAGE);
      }
      if ((live ?? null) !== publishToken) throw new RestoreError('stale', RESTORE_STALE_MESSAGE);

      // 2. Clear unpublished edits, pages included. If this fails nothing has changed.
      try {
        await discardDrafts();
      } catch {
        throw new RestoreError('failed', RESTORE_FAILED_MESSAGE);
      }

      // 3. Stage the version, then publish it under the page-load token.
      try {
        await requestJson('/api/v1/pm/site/publish/revert', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ communityId, snapshotId }),
        });
        await publishSite({ expectedPublishedAt: publishToken });
      } catch {
        // 4. Never leave the old version staged for someone else's next Publish.
        try {
          await discardDrafts();
        } catch {
          throw new RestoreError('left_staged', RESTORE_LEFT_STAGED_MESSAGE);
        }
        throw new RestoreError('not_changed', RESTORE_NOT_CHANGED_MESSAGE);
      }
    },
    [communityId, publishSite, publishToken],
  );

  const restoreLatest = useCallback(async () => {
    if (previousSnapshotId == null) {
      throw new RestoreError('failed', "There's no earlier version of your site to go back to.");
    }
    await restoreSnapshot(previousSnapshotId);
  }, [previousSnapshotId, restoreSnapshot]);

  return { restoreLatest, restoreSnapshot };
}
