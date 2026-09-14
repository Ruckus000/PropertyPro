/**
 * The operator activity reader.
 *
 * The cases here are the ones whose failure is invisible on screen:
 *
 * - paging is keyed on `id`, not `created_at`. Production holds two
 *   `platform_admin_removed` rows whose `created_at` match to the microsecond,
 *   so a `created_at` cursor can return a row twice or skip it. Nothing about
 *   the rendered page would reveal either.
 * - `nextCursor` comes from the LAST row of the trimmed page. Taking it from
 *   the probe row (the `pageSize + 1`th, which is fetched and discarded) would
 *   skip one entry per page — off by exactly one, forever, silently.
 * - a failed read THROWS. Resolving to `[]` would render "no operator activity"
 *   on a broken query, which is the same misleading sentence `HealthReport.errors`
 *   spends a docblock refusing to produce.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Recorded {
  table: string;
  columns: string;
  eq: Array<[string, unknown]>;
  lt: Array<[string, unknown]>;
  order: Array<[string, unknown]>;
  limit: number | null;
}

let recorded: Recorded;
let result: { data: unknown[] | null; error: { message: string; code?: string } | null };

/**
 * A chainable PostgREST stub that RECORDS rather than pretends to query.
 *
 * Deliberately not a query engine: what these cases assert is the shape of the
 * request this module builds — which filters, which sort key, which bound — and
 * a stub that executed them would let a wrong sort key pass by returning rows
 * in the order the fixture already had them.
 */
function makeBuilder() {
  const builder = {
    select(columns: string) {
      recorded.columns = columns;
      return builder;
    },
    eq(column: string, value: unknown) {
      recorded.eq.push([column, value]);
      return builder;
    },
    lt(column: string, value: unknown) {
      recorded.lt.push([column, value]);
      return builder;
    },
    order(column: string, opts: unknown) {
      recorded.order.push([column, opts]);
      return builder;
    },
    limit(n: number) {
      recorded.limit = n;
      return Promise.resolve(result);
    },
  };
  return builder;
}

const captureException = vi.fn();
vi.mock('@sentry/nextjs', () => ({ captureException: (...a: unknown[]) => captureException(...a) }));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      recorded.table = table;
      return makeBuilder();
    },
  }),
}));

import {
  ACTIVITY_PAGE_SIZE,
  getAdminActivity,
} from '@/lib/server/admin-activity';

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 7,
  action: 'platform_admin_added',
  resource_type: 'platform_admin_users',
  resource_id: 'abc',
  admin_email: 'ops@getpropertypro.com',
  admin_user_id: 'uuid-1',
  community_id: null,
  old_values: null,
  new_values: { role: 'super_admin' },
  metadata: null,
  created_at: '2026-09-06T03:37:00.116Z',
  ...over,
});

beforeEach(() => {
  recorded = { table: '', columns: '', eq: [], lt: [], order: [], limit: null };
  result = { data: [], error: null };
});

describe('getAdminActivity', () => {
  it('reads the audit table newest-first by id, not by created_at', async () => {
    await getAdminActivity();
    expect(recorded.table).toBe('platform_admin_audit_log');
    expect(recorded.order).toEqual([['id', { ascending: false }]]);
  });

  it('asks for one row more than the page, to detect a next page without a count', async () => {
    await getAdminActivity({ pageSize: 25 });
    expect(recorded.limit).toBe(26);
  });

  it('defaults to the page size the log view uses', async () => {
    await getAdminActivity();
    expect(recorded.limit).toBe(ACTIVITY_PAGE_SIZE + 1);
  });

  it('applies each filter as an exact match, and the cursor as a strict id bound', async () => {
    await getAdminActivity({
      action: 'cron_job_retried',
      admin: 'ops@getpropertypro.com',
      communityId: 4,
      before: 99,
    });
    expect(recorded.eq).toEqual([
      ['action', 'cron_job_retried'],
      ['admin_email', 'ops@getpropertypro.com'],
      ['community_id', 4],
    ]);
    expect(recorded.lt).toEqual([['id', 99]]);
  });

  it('applies no filter and no cursor when none is given', async () => {
    await getAdminActivity();
    expect(recorded.eq).toEqual([]);
    expect(recorded.lt).toEqual([]);
  });

  // A LIBRARY-contract case, not a route case. The route's `positiveInt` rejects
  // 0 (community ids are bigserial, so they start at 1) and now says so with a
  // banner. This pins the module's own behaviour: a caller that passes 0 gets a
  // filter, because `if (filters.communityId)` would silently drop it and that is
  // the kind of falsy-check bug that only surfaces once some id can be 0.
  it('treats a caller-supplied communityId 0 as a filter, not as absent', async () => {
    await getAdminActivity({ communityId: 0 });
    expect(recorded.eq).toEqual([['community_id', 0]]);
  });

  it('drops the probe row and reports the last KEPT id as the cursor', async () => {
    result = {
      data: [row({ id: 10 }), row({ id: 9 }), row({ id: 8 })],
      error: null,
    };
    const page = await getAdminActivity({ pageSize: 2 });

    expect(page.entries.map((e) => e.id)).toEqual([10, 9]);
    // 9, not 8: the probe row is the next page's FIRST row and must not be skipped.
    expect(page.nextCursor).toBe(9);
  });

  it('reports no cursor when the page came back short of the probe', async () => {
    result = { data: [row({ id: 10 }), row({ id: 9 })], error: null };
    const page = await getAdminActivity({ pageSize: 2 });
    expect(page.entries).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it('maps snake_case columns onto the entry shape, payloads included', async () => {
    result = { data: [row({ community_id: 3, metadata: { reason: 'x' } })], error: null };
    const [entry] = (await getAdminActivity()).entries;

    expect(entry).toEqual({
      id: 7,
      action: 'platform_admin_added',
      resourceType: 'platform_admin_users',
      resourceId: 'abc',
      adminEmail: 'ops@getpropertypro.com',
      adminUserId: 'uuid-1',
      communityId: 3,
      oldValues: null,
      newValues: { role: 'super_admin' },
      metadata: { reason: 'x' },
      createdAt: '2026-09-06T03:37:00.116Z',
    });
  });

  it('THROWS on a read failure rather than resolving to an empty log', async () => {
    result = { data: null, error: { message: 'permission denied', code: '42501' } };
    await expect(getAdminActivity()).rejects.toThrow(/operator activity log/);
  });

  // Without this, a broken audit read is invisible: the page paints the message
  // and `RecentActivityCard` swallows it, so nothing reaches telemetry and the
  // failure persists unnoticed for as long as it lasts.
  it('captures a read failure to Sentry before rethrowing', async () => {
    result = { data: null, error: { message: 'permission denied', code: '42501' } };
    await expect(getAdminActivity()).rejects.toThrow();

    expect(captureException).toHaveBeenCalledTimes(1);
    const [captured, context] = captureException.mock.calls[0] as [Error, { tags: unknown }];
    expect(captured.message).toMatch(/permission denied/);
    expect(context.tags).toEqual({ admin_read: 'activity_log' });
  });

  it('does not report a successful read', async () => {
    result = { data: [row()], error: null };
    await getAdminActivity();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('treats a null data set with no error as genuinely empty', async () => {
    result = { data: null, error: null };
    const page = await getAdminActivity();
    expect(page).toEqual({ entries: [], nextCursor: null });
  });
});
