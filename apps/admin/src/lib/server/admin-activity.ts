/**
 * The operator activity log — who did what in this console, platform-wide.
 *
 * Reads `platform_admin_audit_log`, the append-only trail every privileged
 * admin mutation writes through `logAdminAction()` (`lib/audit/log-admin-action.ts`).
 *
 * ## Why this exists when Sentry and Vercel already hold logs
 *
 * It is the one log neither of them can produce. Sentry records what BROKE;
 * Vercel's runtime logs record what the platform SERVED. Neither can answer
 * "who made `expire-demos` run off-schedule at 03:14, and did they also change
 * a subscription?" — because the actor is a platform admin acting through this
 * console, and the action left no trace in either system. `logAdminAction`'s own
 * docblock makes the point for `cron_job_retried`: the web app's
 * `/api/v1/internal/*` routes authenticate with a platform-wide `CRON_SECRET`,
 * so without this row there is no record anywhere of who caused the run.
 *
 * ## Why this is not `community-activity.ts`
 *
 * That module reads the same table and is deliberately NOT generalised into
 * this one. It answers a different question with a different shape — the last
 * eight entries for ONE community, embedded in a workspace tab, with no
 * filters, no cursor and no payloads — and its docblock records that it is
 * owned by the Clients slice. Folding it in here would couple two surfaces with
 * unrelated release cadences to save one row mapper.
 *
 * ## Ordering and the cursor are both on `id`, not `created_at`
 *
 * `created_at` is not a total order on this table, and that is not theoretical:
 * production holds two `platform_admin_removed` rows whose `created_at` match
 * to the microsecond. Paging by a non-unique key lets a row be returned twice
 * or skipped entirely between pages. `id` is `bigserial`, so ordering by it
 * descending is both a total order and — because the table is append-only and
 * never renumbered — the same order `created_at` intends.
 *
 * Nothing is given up by sorting this way. `id` is `bigserial PRIMARY KEY`
 * (`packages/db/migrations/0052_platform_admin_audit_log.sql:73`), so the primary
 * key's own btree already serves `order by id desc limit n` as a backward index
 * scan — there is no index to add. An earlier version of this paragraph claimed
 * the opposite and prescribed a redundant `(id DESC)` index, which would have
 * misdirected the first person to profile this page.
 *
 * ## A cursor, not a cap — and why that is a deliberate departure
 *
 * Every other admin list takes `PLATFORM_LIST_LIMIT` and reports `wasTruncated`.
 * `lib/api/list-limits.ts` explains why, and names the exception in its own
 * docblock: "If a surface genuinely outgrows its cap, that is the signal to give
 * *that* endpoint a real cursor, not to raise the number." A log is the one
 * admin surface that is unbounded BY CONSTRUCTION — the table only ever grows,
 * it is append-only, and nothing prunes it — so it is that case, on day one.
 *
 * ## This throws, and reports
 *
 * Unlike `getHealthReport()`, which catches everything so the Health board can
 * render during an outage, a failed read here must NOT resolve to an empty
 * page. `[]` from this function means "no operator has done anything", which is
 * a claim a failed query is in no position to make — the same distinction
 * `HealthReport.errors` draws between `null` and `[]`. Callers render the
 * failure; they do not render silence.
 *
 * It also logs before rethrowing, because neither caller can be relied on to
 * report: `/health/logs` paints the message, and `RecentActivityCard` swallows
 * it outright so the board keeps rendering.
 *
 * ## Why that log is NOT a Sentry capture
 *
 * Capture-and-degrade is the ordinary admin-server convention — `billing.ts`,
 * `preferences.ts`, `search.ts`, `shell-signals.ts` and `push.ts` all do it. The
 * Health subsystem is the exception, and #1138 wrote down why while fixing the
 * neighbouring Sentry probe: "No Sentry capture: the Health board reads Sentry
 * issues, and a warning issue per load would itself show as a production error."
 *
 * That applies here with a sharper edge. `RecentActivityCard` renders on
 * `/health`, which `HealthFreshness` re-renders every 60 s AND on window focus —
 * so a broken audit read would mint a Sentry event once a minute per open tab.
 * `getHealthReport` sums the newest hourly bucket into `errorsLastHour`, and
 * `deriveCritical` raises the console-wide critical banner (and dispatches web
 * push) at a default threshold of 10. A single operator leaving the board open
 * for ten minutes would therefore be paged about the console's own monitoring
 * failing to read a table — by the monitoring.
 *
 * So this follows #1138: a structured `console.warn` carrying the same shape as
 * `health.sentry_request_failed`, plus the on-screen reporting both callers
 * already do. Weaker telemetry than a capture, deliberately, and the same
 * trade #1138 made. `console.error`/`console.warn` is not a Sentry signal in
 * this repo (there is no `captureConsoleIntegration`), so this reaches the
 * platform logs and nothing else — which is the point.
 *
 * @module lib/server/admin-activity
 */
import { createAdminClient } from '@propertypro/db/supabase/admin';

import { assertNoDbError } from '@/lib/api/assert-no-db-error';

/** Rows per page. A page a human can scan, not a cap on the table. */
export const ACTIVITY_PAGE_SIZE = 100;

/** How many entries the Health board's card shows before linking through. */
export const ACTIVITY_CARD_SIZE = 5;

export interface AdminActivityEntry {
  id: number;
  action: string;
  resourceType: string;
  resourceId: string | null;
  /** Denormalized on the row, so the trail stays readable after the account is gone. */
  adminEmail: string | null;
  adminUserId: string;
  /** Null for genuinely platform-level actions, and for a community since deleted. */
  communityId: number | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminActivityFilters {
  /** Exact `action` match — the value comes from a row already on screen. */
  action?: string;
  /** Exact `admin_email` match, same provenance. */
  admin?: string;
  communityId?: number;
  /** Keyset cursor: return rows with `id` strictly below this. */
  before?: number;
  pageSize?: number;
}

export interface AdminActivityPage {
  entries: AdminActivityEntry[];
  /** Pass as `before` for the next page. `null` means this is the last one. */
  nextCursor: number | null;
}

/** One row as PostgREST returns it — snake_case, ISO strings. */
interface ActivityRow {
  id: number;
  action: string;
  resource_type: string;
  resource_id: string | null;
  admin_email: string | null;
  admin_user_id: string;
  community_id: number | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const COLUMNS =
  'id, action, resource_type, resource_id, admin_email, admin_user_id, community_id, old_values, new_values, metadata, created_at';

function mapRow(row: ActivityRow): AdminActivityEntry {
  return {
    id: row.id,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    adminEmail: row.admin_email,
    adminUserId: row.admin_user_id,
    communityId: row.community_id,
    oldValues: row.old_values,
    newValues: row.new_values,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

/**
 * One page of the operator trail, newest first.
 *
 * `platform_admin_audit_log` is absent from `AdminDatabase`
 * (`packages/db/src/supabase/admin-types.ts`), so this goes through the untyped
 * `createAdminClient()` — the same escape `community-activity.ts` documents.
 *
 * AUTHZ: none here. Every caller reaches this behind `requireAdminPageSession()`
 * or `requirePlatformAdmin()`; this module is service-role and must never be
 * called from a path that is not already gated.
 */
export async function getAdminActivity(
  filters: AdminActivityFilters = {},
): Promise<AdminActivityPage> {
  const pageSize = filters.pageSize ?? ACTIVITY_PAGE_SIZE;

  try {
    // `createAdminClient()` is INSIDE the try because it throws when the
    // service-role env is unset — a failure with no PostgREST `error` object for
    // `assertNoDbError` to see, and the one a misconfigured deployment hits first.
    const db = createAdminClient();

    // Filters go on BEFORE `.order()`/`.limit()`: those return PostgREST's
    // transform builder, which has no `.eq()` on it (see `tickets.ts`).
    let query = db.from('platform_admin_audit_log').select(COLUMNS);
    if (filters.action) query = query.eq('action', filters.action);
    if (filters.admin) query = query.eq('admin_email', filters.admin);
    if (filters.communityId !== undefined) {
      query = query.eq('community_id', filters.communityId);
    }
    if (filters.before !== undefined) query = query.lt('id', filters.before);

    // One row MORE than the page, to learn whether another page exists without a
    // second COUNT round-trip. The extra row is dropped below, never rendered.
    const { data, error } = await query.order('id', { ascending: false }).limit(pageSize + 1);
    assertNoDbError(error, 'Failed to load the operator activity log');

    const rows = (data ?? []) as unknown as ActivityRow[];
    const hasMore = rows.length > pageSize;
    const page = hasMore ? rows.slice(0, pageSize) : rows;

    return {
      entries: page.map(mapRow),
      // The LAST id on this page, so the next call asks for rows below it.
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    };
  } catch (caught) {
    // Log and RETHROW. The throw is the contract — callers must never be handed
    // an empty page for a failed read. The log is deliberately NOT a Sentry
    // capture; see the docblock for why, and do not "fix" it back.
    console.warn(
      JSON.stringify({
        event: 'health.activity_read_failed',
        message: caught instanceof Error ? caught.message : String(caught),
      }),
    );
    throw caught;
  }
}
