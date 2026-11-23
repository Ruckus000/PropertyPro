/**
 * Generating assessment charges twice at once must charge each unit once.
 *
 * The generator reads the period's existing line items, then inserts the
 * missing ones. Two calls that both read before either inserts (a double-click
 * on "Generate charges", or the button while the daily cron runs) would each
 * charge every unit. The backstop is the partial unique index
 * `assessment_line_items_unit_period_uniq` plus ON CONFLICT DO NOTHING, and
 * only Postgres can show that, so this runs against a real database.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import {
  initTestKit,
  seedCommunities,
  seedUsers,
  teardownTestKit,
  requireCommunity,
  requireUser,
  getDescribeDb,
  requireDatabaseUrlInCI,
  readNumberField,
  type TestKitState,
} from './helpers/multi-tenant-test-kit';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS } from '../fixtures/multi-tenant-users';
import { generateAssessmentLineItemsForCommunity } from '@/lib/services/finance-service';

requireDatabaseUrlInCI('assessment-generate-concurrency');

const describeDb = getDescribeDb();

describeDb('generating assessment charges concurrently', () => {
  let state: TestKitState;
  let communityId: number;
  let managerId: string;
  let unitIds: number[];

  async function seedAssessment(values: {
    frequency: 'one_time' | 'monthly';
    startDate: string;
    dueDay: number | null;
  }): Promise<number> {
    const { assessments, createScopedClient } = state.dbModule;
    const [row] = await createScopedClient(communityId).insert(assessments, {
      title: `Concurrency ${values.frequency} ${state.runSuffix}`,
      description: null,
      amountCents: 25000,
      lateFeeAmountCents: 0,
      lateFeeDaysGrace: 0,
      endDate: null,
      isActive: true,
      ...values,
    });
    return readNumberField(row!, 'id');
  }

  async function counts(assessmentId: number): Promise<{ lineItems: number; ledger: number }> {
    const { assessmentLineItems, ledgerEntries } = state.dbModule;
    const items = await state.db
      .select({ id: assessmentLineItems.id })
      .from(assessmentLineItems)
      .where(eq(assessmentLineItems.assessmentId, assessmentId));
    const ledger = items.length === 0
      ? []
      : await state.db
        .select({ id: ledgerEntries.id })
        .from(ledgerEntries)
        .where(and(
          eq(ledgerEntries.entryType, 'assessment'),
          eq(ledgerEntries.sourceType, 'assessment'),
          inArray(ledgerEntries.sourceId, items.map((i) => String(i.id))),
        ));
    return { lineItems: items.length, ledger: ledger.length };
  }

  beforeAll(async () => {
    state = await initTestKit();
    await seedCommunities(
      state,
      MULTI_TENANT_COMMUNITIES.filter((c) => c.key === 'communityA'),
    );
    communityId = requireCommunity(state, 'communityA').id;
    await seedUsers(state, MULTI_TENANT_USERS.filter((u) => u.key === 'camA'));
    managerId = requireUser(state, 'camA').id;

    const { units, createScopedClient } = state.dbModule;
    const scoped = createScopedClient(communityId);
    for (const n of [1, 2, 3]) {
      await scoped.insert(units, { unitNumber: `GEN-${n}-${state.runSuffix}`, building: 'A', floor: n });
    }
    const rows = await scoped.selectFrom<{ id: number }>(units, { id: units.id });
    unitIds = rows.map((r) => Number(r.id));
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  it('concurrent generation bills each unit once', async () => {
    expect(unitIds.length).toBe(3);
    const assessmentId = await seedAssessment({ frequency: 'one_time', startDate: '2099-01-15', dueDay: null });

    const generate = () => generateAssessmentLineItemsForCommunity(communityId, assessmentId, managerId);
    const results = await Promise.all([generate(), generate()]);

    expect(await counts(assessmentId)).toEqual({ lineItems: 3, ledger: 3 });
    // A unit the other call charged first counts as skipped, never as an error.
    expect(results.reduce((n, r) => n + r.insertedCount, 0)).toBe(3);
    expect(results.reduce((n, r) => n + r.skippedCount, 0)).toBe(3);
  });

  it('the cron and the manual button in the same period bill each unit once', async () => {
    const assessmentId = await seedAssessment({ frequency: 'monthly', startDate: '2026-01-01', dueDay: 5 });

    const results = await Promise.all([
      // The cron: no actor, the period's due date passed explicitly.
      generateAssessmentLineItemsForCommunity(communityId, assessmentId, null, '2099-03-05'),
      // The manager's "Generate charges" for the same period.
      generateAssessmentLineItemsForCommunity(communityId, assessmentId, managerId, '2099-03-05'),
    ]);

    expect(await counts(assessmentId)).toEqual({ lineItems: 3, ledger: 3 });
    expect(results.reduce((n, r) => n + r.insertedCount, 0)).toBe(3);
    expect(results.reduce((n, r) => n + r.skippedCount, 0)).toBe(3);
  });
});
