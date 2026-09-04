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
 *   { published: true,  publishedAt: string, promotedCount, retiredCount,
 *     addedPageCount?, removedPageCount? }
 *   { published: false, reason: 'nothing-to-publish' }
 *
 * `publishedAt` round-trips Date → ISO string through the wire, so we expose
 * it as `string` here. Callers that need a Date can `new Date(...)` it.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CROSS_NOTIFICATION_KEYS, NOTIFICATION_KEYS } from '@/hooks/use-notifications';

export type PublishSiteResult =
  | {
      published: true;
      publishedAt: string;
      promotedCount: number;
      retiredCount: number;
      /**
       * Pages added / removed by this publish (Phase 11b-3). See
       * `PublishCommunitySiteResult` for what each counts and what
       * `addedPageCount` deliberately excludes.
       *
       * OPTIONAL on the wire, and that is not laziness: this type describes a
       * JSON response, and a client can be newer than the server it is talking
       * to — a Vercel deploy replaces the app while browser tabs stay open on
       * the previous bundle, and the reverse holds mid-rollout. Requiring them
       * would make `describeOutcome` interpolate `undefined` into the sentence
       * a PM reads after an irreversible action. Absent means "this server did
       * not say", which the copy treats as "do not claim anything about pages".
       */
      addedPageCount?: number;
      removedPageCount?: number;
      /**
       * Present only when the publish requested a resident notification.
       *
       * Optional for the same reason as the page counts above — a browser tab
       * can be older or newer than the server it talks to — and additionally
       * because a quiet publish never produces one. Absent means "no
       * notification was attempted"; it must never be read as success.
       *
       * `partial` means the announcement exists (residents see it in the app)
       * but the email fan-out failed. It is reported separately so the sheet
       * never tells a PM their residents were emailed when they were not.
       */
      residentNotification?:
        | { status: 'sent'; announcementId: number; recipientCount: number }
        | { status: 'partial'; announcementId: number; reason: string }
        | { status: 'failed'; reason: string };
      /**
       * Set only when this publish disarmed a pending scheduled publish.
       *
       * Optional for the same deploy-skew reason as the page counts above — a
       * tab can be older or newer than the server it talks to. Absent means
       * "this server did not say", never "there was none".
       */
      canceledSchedule?: { id: number; scheduledFor: string };
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
  /**
   * Opt-in resident notification. Omitted for a quiet publish, which is the
   * editor's default.
   */
  notifyResidents?: { summary: string };
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
    mutationFn: async ({ expectedPublishedAt, markOnboardingComplete, notifyResidents }) => {
      const res = await fetch('/api/v1/pm/site/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId,
          expectedPublishedAt,
          // Only include the flag when set so editor publishes send the exact
          // body shape they always have.
          ...(markOnboardingComplete ? { markOnboardingComplete: true } : {}),
          // Same reasoning: a quiet publish sends no key at all, so the
          // server's `notifyResidents` stays undefined rather than arriving as
          // an empty object the schema would then have to reject.
          ...(notifyResidents ? { notifyResidents } : {}),
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
    onSuccess: async (result) => {
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

      /*
       * A notifying publish also writes an ANNOUNCEMENT and in-app
       * notifications — resources outside this prefix, which would otherwise
       * keep serving a feed and an unread count that predate the publish.
       * `use-notification-realtime` only covers a recipient who happens to be
       * live-subscribed at that moment.
       *
       * Gated on the field being PRESENT, not on `status === 'sent'`: a
       * `partial` created the announcement and its feed rows too, and
       * refetching after a `failed` costs one request and is never wrong.
       *
       * Deliberately NOT invalidating `['announcements', …]`: that key is
       * module-private to `use-announcements` and no `useQuery` anywhere
       * registers it, so it would be a provable no-op. The announcements list
       * is server-rendered and picks the row up on navigation.
       */
      if (result.published && result.residentNotification) {
        await Promise.all([
          qc.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all(communityId) }),
          qc.invalidateQueries({ queryKey: CROSS_NOTIFICATION_KEYS.all() }),
        ]);
      }
    },
  });
}
