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
 * `idx_platform_admin_audit_log_created_at` is the only time-ordered index, so
 * an `id desc` scan is not index-assisted. At this table's size (7 rows in
 * production on 2026-09-14) that is irrelevant, and the correct fix when it
 * stops being irrelevant is an index on `id desc`, not a wrong sort key.
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
 * ## This throws
 *
 * Unlike `getHealthReport()`, which catches everything so the Health board can
 * render during an outage, a failed read here must NOT resolve to an empty
 * page. `[]` from this function means "no operator has done anything", which is
 * a claim a failed query is in no position to make — the same distinction
 * `HealthReport.errors` draws between `null` and `[]`. Callers render the
 * failure; they do not render silence.
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
}
