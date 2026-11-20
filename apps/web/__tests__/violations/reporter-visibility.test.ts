/**
 * D1a / D1b — the two rules every resident violations read applies
 * (`lib/violations/common.ts`). The predicate is rendered to real SQL from the
 * real drizzle tables: the failure it guards against (correlating the
 * user_roles subquery to the wrong community) is invisible structurally.
 */
import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

// Same table objects, without the client import that throws without DATABASE_URL.
vi.mock('@propertypro/db', () => import('../../../../packages/db/src/schema'));
vi.mock('@/lib/middleware/plan-guard', () => ({ requirePlanFeature: vi.fn() }));
vi.mock('@/lib/units/actor-units', () => ({ getActorUnitIds: vi.fn(), requireActorUnitId: vi.fn() }));

import { redactViolationReporter, residentVisibleViolationsWhere } from '@/lib/violations/common';

const RESIDENT = { isAdmin: false, designation: null };
const BOARD_SEAT = { isAdmin: false, designation: 'board_member' as const };
const MANAGER = { isAdmin: true, designation: null };

describe('residentVisibleViolationsWhere (D1a)', () => {
  it('adds nothing for managers and board seats: they see every case', () => {
    expect(residentVisibleViolationsWhere(MANAGER, 'u')).toBeUndefined();
    expect(residentVisibleViolationsWhere(BOARD_SEAT, 'u')).toBeUndefined();
  });

  it('hides only a resident-filed case still reported, unless the viewer filed it', () => {
    const where = residentVisibleViolationsWhere(RESIDENT, 'viewer-1');
    expect(where).toBeDefined();
    const { sql, params } = new PgDialect().sqlToQuery(where!);

    // Three ways to stay visible, OR-ed: past `reported`, filed by me, or
    // filed by someone with no resident role in THIS community.
    expect(sql).toBe(
      '("violations"."status" <> $1 or "violations"."reported_by_user_id" = $2 or ' +
        'NOT EXISTS (SELECT 1 FROM "user_roles" WHERE "user_roles"."user_id" = "violations"."reported_by_user_id" ' +
        'AND "user_roles"."community_id" = "violations"."community_id" AND "user_roles"."role" = \'resident\'))',
    );
    expect(params).toEqual(['reported', 'viewer-1']);
  });
});

describe('redactViolationReporter (D1b)', () => {
  const row = { id: 1, reportedByUserId: 'filer-1', reportedByRole: 'resident' as const };

  it('strips the reporter for any other resident, including the cited household', () => {
    expect(redactViolationReporter(row, RESIDENT, 'someone-else')).toEqual({
      id: 1,
      reportedByUserId: null,
      reportedByRole: null,
    });
  });

  it('keeps it for the filer and for board viewers', () => {
    expect(redactViolationReporter(row, RESIDENT, 'filer-1')).toBe(row);
    expect(redactViolationReporter(row, BOARD_SEAT, 'board-1')).toBe(row);
    expect(redactViolationReporter(row, MANAGER, 'mgr-1')).toBe(row);
  });

  it('does not invent a reportedByRole key on rows that never had one', () => {
    expect(redactViolationReporter({ id: 2, reportedByUserId: 'filer-1' }, RESIDENT, 'x')).toEqual({
      id: 2,
      reportedByUserId: null,
    });
  });
});
