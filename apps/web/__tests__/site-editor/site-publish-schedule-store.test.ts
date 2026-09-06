/**
 * `cancelPendingScheduleInTx` — the statement an immediate publish runs to
 * disarm a scheduled one.
 *
 * Unit-tested here because the predicate is the load-bearing part and it is
 * easy to widen by accident. The WIRING (that `publishCommunitySite` calls
 * this, inside its transaction) is exercised by the db-backed integration
 * suite, not here — a unit test of that would have to fake the whole publish
 * transaction and would assert its own mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@propertypro/db/filters', () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      __sql: { strings: [...strings], values },
    }),
    { raw: (v: string) => v },
  ),
}));

import { cancelPendingScheduleInTx } from '@/lib/services/site-publish-schedule-store';

function tx(result: unknown) {
  return { execute: vi.fn().mockResolvedValue(result) };
}

describe('cancelPendingScheduleInTx', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cancels only a PENDING schedule, never one already being published', async () => {
    /*
     * A `running` row has been claimed by a tick that is publishing right now.
     * Cancelling it would race that tick's own completion write and, worse,
     * free the one-active-schedule slot so a second schedule could be armed
     * mid-publish.
     */
    const t = tx([]);
    await cancelPendingScheduleInTx(t, 42);

    const stmt = t.execute.mock.calls[0]![0].__sql;
    const text = stmt.strings.join('?');
    expect(text).toContain("SET status = 'canceled'");
    expect(text).toContain("status = 'pending'");
    expect(text).not.toContain('running');
    expect(text).toContain('deleted_at IS NULL');
    expect(stmt.values).toContain(42);
  });

  it('reports the schedule it disarmed, so the PM can be told', async () => {
    const t = tx([{ id: 9, scheduled_for: new Date('2026-08-01T15:00:00Z') }]);

    await expect(cancelPendingScheduleInTx(t, 42)).resolves.toEqual({
      id: 9,
      scheduledFor: '2026-08-01T15:00:00.000Z',
    });
  });

  it('returns null when there was nothing armed', async () => {
    // Distinct from "cancelled something" — the caller renders a note only when
    // a schedule actually existed.
    await expect(cancelPendingScheduleInTx(tx([]), 42)).resolves.toBeNull();
  });

  it('handles a driver that wraps rows in { rows }', async () => {
    const t = tx({ rows: [{ id: 3, scheduled_for: new Date('2026-08-01T15:00:00Z') }] });
    await expect(cancelPendingScheduleInTx(t, 42)).resolves.toMatchObject({ id: 3 });
  });
});
