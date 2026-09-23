/**
 * /health/logs — the operator activity log.
 *
 * What this answers that nothing else can: who, in this console, did the
 * privileged thing — granted platform admin, retried a cron job, changed a
 * subscription, hard-deleted a demo. Sentry holds what BROKE and Vercel holds
 * what the platform SERVED; neither records an operator acting through here.
 *
 * ## Why its own route rather than a fourth section on /health
 *
 * `/health` re-runs six outbound probes with a 4 s ceiling each on every
 * render, and `HealthFreshness` calls `router.refresh()` every 60 seconds and
 * on window focus. Folding a paged, filterable list into that page would put
 * every filter change and every "load older" behind the whole probe set, and
 * would make the board's `checkedAt` contract meaningless for half its content.
 * The board links here and shows the five most recent entries inline.
 *
 * ## All state is in the URL
 *
 * `action`, `admin`, `communityId` and `before` are search params, so this page
 * and the list it renders are Server Components with no client JavaScript at
 * all. That makes a filtered view a link an operator can paste into a ticket —
 * which is the thing you actually want at 3am — and it removes a hydration
 * dependency from an incident surface (see `ActivityLogList`'s docblock).
 *
 * `dynamic = 'force-dynamic'` for the same reason the board is: this reads
 * privileged live data per request and must never be served from a cached
 * render.
 *
 * ## Why a failed read renders a banner rather than throwing
 *
 * `getAdminActivity()` throws deliberately, so a failure can never be mistaken
 * for "nobody has done anything". This page catches that and paints the
 * failure, rather than letting it reach an error boundary: the nearest one is
 * `app/error.tsx`, which sits OUTSIDE the `(console)` group and so renders with
 * no rail and no way back — the same trap `health/page.tsx`'s docblock records
 * for the root not-found. Catching here keeps the header, the filters and the
 * route intact while saying plainly that the read failed.
 *
 * AUTHZ: requireAdminPageSession() gates the page.
 */
import Link from 'next/link';
import { PageBody } from '@propertypro/ui';

import { ActivityLogList, buildHref } from '@/components/health/ActivityLogList';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import {
  ACTIVITY_PAGE_SIZE,
  getAdminActivity,
  type AdminActivityPage,
} from '@/lib/server/admin-activity';

export const dynamic = 'force-dynamic';

const BASE_PATH = '/health/logs';

/** A search param that may arrive repeated (`?action=a&action=b`). */
type Param = string | string[] | undefined;

/**
 * The first value, trimmed, or `undefined`.
 *
 * Next hands a repeated param through as an array. Taking `[0]` rather than
 * joining means a hand-edited or double-encoded URL narrows the query instead
 * of producing a value that matches no row and an empty page that looks like a
 * quiet platform.
 */
function one(value: Param): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  const trimmed = first?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * A positive integer, and whether a value was PRESENT but unusable.
 *
 * `Number()` is deliberate over `parseInt`: `parseInt('12abc')` is `12`, which
 * would silently answer a different question than the URL asked.
 *
 * The `rejected` half exists because "absent" and "invalid" must not look the
 * same on this page. Returning a bare `undefined` for both meant
 * `?communityId=abc` widened an audit view from one community to the entire
 * platform with nothing on screen saying the filter had been dropped — showing
 * MORE than was asked for, silently, which is the dangerous direction for this
 * surface to fail in.
 *
 * Zero is rejected along with the rest: `community_id` is `bigserial`, so ids
 * start at 1 and `?communityId=0` can only be a mistake. `getAdminActivity` and
 * `ActivityLogList` still handle a `0` defensively — they are library code with
 * their own contract — but the route will never hand them one.
 */
function positiveInt(value: Param): { value?: number; rejected: boolean } {
  const raw = one(value);
  if (raw === undefined) return { rejected: false };
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? { value: parsed, rejected: false }
    : { rejected: true };
}

export default async function HealthLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, Param>>;
}) {
  await requireAdminPageSession();

  const params = await searchParams;
  const communityId = positiveInt(params.communityId);
  const before = positiveInt(params.before);
  const filters = {
    action: one(params.action),
    admin: one(params.admin),
    communityId: communityId.value,
  };
  // Named so the banner can say WHICH param was dropped; order is the URL's.
  const rejected = [
    ...(communityId.rejected ? ['communityId'] : []),
    ...(before.rejected ? ['before'] : []),
  ];

  let page: AdminActivityPage = { entries: [], nextCursor: null };
  let error: string | undefined;
  try {
    page = await getAdminActivity({
      ...filters,
      before: before.value,
      pageSize: ACTIVITY_PAGE_SIZE,
    });
  } catch (caught) {
    // This IS the raw upstream string, and deliberately so.
    //
    // `assertNoDbError` composes `${context}: ${error.message}${code}`, so the
    // PostgREST/Postgres text is inside it; the catch is also unnarrowed, so a
    // missing service-role env surfaces `createAdminClient`'s own message here.
    // An earlier version of this comment claimed the opposite — that the message
    // was "ours rather than a raw vendor string" — which was simply false, and
    // was cited in review as though it were a guarantee.
    //
    // Keeping it is the decision, not an oversight. The audience is `super_admin`
    // and "permission denied for table platform_admin_audit_log (42501)" is the
    // sentence that tells an operator the grant or the migration is missing,
    // which is what a health console exists to say. `lib/server/health.ts`'s
    // probes already put unnarrowed caught messages onto the board next door.
    // `getAdminActivity` captures to Sentry before rethrowing, so the detail is
    // in telemetry either way.
    error = caught instanceof Error ? caught.message : 'The query failed.';
  }

  return (
    <PageBody>
      <AdminPageHeader
        title="Activity log"
        description="Every privileged action taken in this console, newest first. Append-only — entries are never edited or removed."
        backHref="/health"
        backLabel="Health"
        actions={
          // Only when a cursor is in force. With no `before`, this was a button
          // whose sole effect was to discard every filter — a destructive action
          // behind a label promising nothing but a change of position. It now
          // preserves the filters and clears only the cursor.
          before.value !== undefined ? (
            <Link
              href={buildHref(BASE_PATH, filters, { before: null })}
              className="inline-flex h-9 items-center rounded-md border border-edge bg-surface-card px-3 text-sm font-medium text-content hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edge-focus"
            >
              Newest first
            </Link>
          ) : undefined
        }
      />

      <ActivityLogList
        entries={page.entries}
        nextCursor={page.nextCursor}
        filters={filters}
        basePath={BASE_PATH}
        error={error}
        hasCursor={before.value !== undefined}
        rejected={rejected}
      />
    </PageBody>
  );
}
