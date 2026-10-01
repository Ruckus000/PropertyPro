/**
 * The dashboard violations card must not show a resident other units' cases:
 * it takes the same unit scope as the violations API (getViolationReadUnitIds).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@propertypro/db', () => ({
  announcements: {},
  demoSeedRegistry: {},
  maintenanceRequests: {},
  meetings: {},
  users: {},
  violations: { unitId: 'violations.unit_id', status: 'status', createdAt: 'created_at', id: 'id' },
}));
vi.mock('@propertypro/db/filters', () => ({
  asc: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  isNull: vi.fn(),
  inArray: (column: unknown, values: unknown) => ({ inArray: [column, values] }),
  sql: () => 'sql',
}));

import { getDashboardViolationSummary } from '@/lib/dashboard/dashboard-queries';

function fakeScoped() {
  const wheres: unknown[] = [];
  const chain = { groupBy: async () => [], orderBy: () => ({ limit: async () => [] }) };
  const scoped = {
    selectFrom: vi.fn((_table: unknown, _columns: unknown, where?: unknown) => {
      wheres.push(where);
      return chain;
    }),
  };
  return { scoped: scoped as never, wheres, selectFrom: scoped.selectFrom };
}

describe('getDashboardViolationSummary scope', () => {
  it('is community-wide without a unit scope', async () => {
    const { scoped, wheres } = fakeScoped();
    await getDashboardViolationSummary(scoped);
    expect(wheres).toEqual([undefined, undefined]);
  });

  it('filters both the counts and the list to the resident’s units', async () => {
    const { scoped, wheres } = fakeScoped();
    await getDashboardViolationSummary(scoped, [3, 4]);
    expect(wheres).toEqual([
      { inArray: ['violations.unit_id', [3, 4]] },
      { inArray: ['violations.unit_id', [3, 4]] },
    ]);
  });

  it('a resident with no unit sees nothing and costs no query', async () => {
    const { scoped, selectFrom } = fakeScoped();
    const summary = await getDashboardViolationSummary(scoped, []);
    expect(selectFrom).not.toHaveBeenCalled();
    expect(summary.recentViolations).toEqual([]);
  });
});
