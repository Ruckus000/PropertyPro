'use client';

/**
 * React Query hook for the PR #8b atomic publish endpoint.
 *
 * usePublishSite(communityId) — POST /api/v1/pm/site/publish
 *   - Caller passes `expectedPublishedAt` (the timestamp of the most recent
 *     published state the editor has loaded) to gate optimistic concurrency.
 *   - On success, invalidates the whole `['pm','site']` query prefix so the
 *     editor reloads — blocks, hero and pages — and the pending-changes badge
 *     clears. See the note on `onSuccess`.
 *   - On 409 ConflictError, throws so the UI can show "Someone else
 *     published — reload and try again."
 *
 * The success body is the discriminated union from publishCommunitySite:
 *   { published: true,  publishedAt: string, promotedCount, retiredCount }
 *   { published: false, reason: 'nothing-to-publish' }
 *
 * `publishedAt` round-trips Date → ISO string through the wire, so we expose
 * it as `string` here. Callers that need a Date can `new Date(...)` it.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

export type PublishSiteResult =
  | {
      published: true;
      publishedAt: string;
      promotedCount: number;
      retiredCount: number;
    }
  | { published: false; reason: 'nothing-to-publish' };

export interface PublishSiteVariables {
  /**
   * ISO 8601 timestamp of the last `published_at` the editor loaded, or
   * `null` for a first-ever publish.
   */
  expectedPublishedAt: string | null;
  /**
   * When true, the server stamps `site_onboarding_completed_at = now()` after
   * the publish. Set by the onboarding wizard's final step; omitted by the
   * ongoing editor's PublishBar.
   */
  markOnboardingComplete?: boolean;
}

async function readJsonError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? `Request failed (HTTP ${res.status})`;
  } catch {
    return `Request failed (HTTP ${res.status})`;
  }
}

/** Sentinel error subclass so callers can distinguish 409 from other errors. */
export class PublishConflictError extends Error {
  readonly conflict = true as const;
  constructor(message: string) {
    super(message);
    this.name = 'PublishConflictError';
  }
}

export function usePublishSite(communityId: number) {
  const qc = useQueryClient();
  return useMutation<PublishSiteResult, Error, PublishSiteVariables>({
    mutationFn: async ({ expectedPublishedAt, markOnboardingComplete }) => {
      const res = await fetch('/api/v1/pm/site/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId,
          expectedPublishedAt,
          // Only include the flag when set so editor publishes send the exact
          // body shape they always have.
          ...(markOnboardingComplete ? { markOnboardingComplete: true } : {}),
        }),
      });
      if (res.status === 409) {
        throw new PublishConflictError(await readJsonError(res));
      }
      if (!res.ok) {
        throw new Error(await readJsonError(res));
      }
      const body = (await res.json()) as { data: PublishSiteResult };
      return body.data;
    },
    onSuccess: async () => {
      // The whole ['pm','site'] prefix, not a hand-listed pair of keys (D10′).
      //
      // This used to invalidate exactly two keys — ['pm','site','blocks',id] and
      // ['pm','site','hero',id]. That list is a maintenance trap: a publish
      // rewrites more editor state than blocks and the hero, and every hook
      // added under the prefix since has had to be remembered here or go stale
      // silently. It already had: a publish APPLIES staged page removals
      // (`site_pages.delete_staged_at`), so with the narrow list the Pages panel
      // and the publish sheet both keep rendering a page that no longer exists
      // until something else happens to refetch.
      //
      // `useDiscardDrafts` (use-content-blocks.ts) and `useDeleteSitePage`
      // (use-site-pages.ts) already invalidate this prefix for the same reason;
      // this matches them rather than inventing a third convention. The prefix
      // is not community-scoped, so it also drops other communities' cached
      // editor state — that is a redundant refetch for a PM who has more than
      // one community open, never a wrong render.
      await qc.invalidateQueries({ queryKey: ['pm', 'site'] });
    },
  });
}
