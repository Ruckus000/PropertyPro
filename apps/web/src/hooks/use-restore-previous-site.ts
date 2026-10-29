'use client';

/**
 * Put the public site back to an earlier publish, from the website home
 * (spec corrections 3 and 4).
 *
 * Restore is a revert and then a publish:
 *
 * 1. Read the site's publish token (the newest published state), so a site
 *    published by someone else in the meantime is refused (409) by step 3
 *    instead of being overwritten.
 * 2. `POST /api/v1/pm/site/publish/revert` writes the chosen version into the
 *    draft layer. That replaces the whole draft layer, so unpublished edits are
 *    discarded; the website home says so before it asks.
 * 3. `POST /api/v1/pm/site/publish` with that token makes it live.
 *
 * `restoreLatest` goes back to how the site was before the last publish. Each
 * snapshot holds the state AFTER its publish, so that is the second-newest
 * snapshot, read at the moment of the click. `restoreSnapshot` restores one
 * version from the list (Professional plans show the list; revert itself is on
 * every plan).
 *
 * Both throw an `Error` with a sentence to show when anything fails; a
 * conflict is a `PublishConflictError`.
 */
import { useCallback } from 'react';
import { JSON_HEADERS, requestJson } from '@/lib/api/request-json';
import { usePublishSite } from '@/hooks/use-publish-site';

interface HistoryEntry {
  id: number;
  restorable: boolean;
}

export function useRestorePreviousSite(communityId: number): {
  restoreLatest: () => Promise<void>;
  restoreSnapshot: (snapshotId: number) => Promise<void>;
} {
  const publish = usePublishSite(communityId);
  const { mutateAsync: publishSite } = publish;

  const restoreSnapshot = useCallback(
    async (snapshotId: number) => {
      // Before the revert: the token is the live state this restore replaces.
      const { latestPublishedAt } = await requestJson<{ latestPublishedAt: string | null }>(
        `/api/v1/pm/site/blocks?communityId=${communityId}`,
      );
      await requestJson('/api/v1/pm/site/publish/revert', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ communityId, snapshotId }),
      });
      await publishSite({ expectedPublishedAt: latestPublishedAt ?? null });
    },
    [communityId, publishSite],
  );

  const restoreLatest = useCallback(async () => {
    const page = await requestJson<{ data: HistoryEntry[] }>(
      `/api/v1/pm/site/publish/history?communityId=${communityId}&pageSize=2`,
    );
    const previous = page.data[1];
    if (!previous) throw new Error("There's no earlier version of your site to go back to.");
    if (!previous.restorable) {
      throw new Error('The version before your last publish is too old to restore.');
    }
    await restoreSnapshot(previous.id);
  }, [communityId, restoreSnapshot]);

  return { restoreLatest, restoreSnapshot };
}
