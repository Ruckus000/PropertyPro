/**
 * The finance display reads name a unit by its NUMBER ("Unit 1B"), never by its
 * database id ("Unit #2"). Unit ids and numbers are deliberately different here
 * (id 2 is "1B", id 3 is "2A" in "Bldg A") so a regression to the id shows.
 *
 * Runs the real `withUnitLabels` against a tiny in-memory scoped client: each
 * `selectFrom(table, …)` resolves to that table's seeded rows (the units lookup
 * honours its `inArray` id filter).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { tables, createScopedClientMock, listLedgerEntriesMock } = vi.hoisted(() => ({
  tables: {
    units: { name: 'units', id: 'units.id', unitNumber: 'units.unitNumber', building: 'units.building' },
    assessmentLineItems: {
      name: 'assessment_line_items',
      assessmentId: 'ali.assessmentId',
      unitId: 'ali.unitId',
      status: 'ali.status',
      dueDate: 'ali.dueDate',
      paidAt: 'ali.paidAt',
      id: 'ali.id',
    },
    rentObligations: {
      name: 'rent_obligations',
      unitId: 'ro.unitId',
      status: 'ro.status',
      updatedAt: 'ro.updatedAt',
      id: 'ro.id',
    },
  },
  createScopedClientMock: vi.fn(),
  listLedgerEntriesMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  units: tables.units,
  assessmentLineItems: tables.assessmentLineItems,
  rentObligations: tables.rentObligations,
  createScopedClient: createScopedClientMock,
  listLedgerEntries: listLedgerEntriesMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...args: unknown[]) => ({ op: 'and', args }),
  asc: (column: unknown) => ({ dir: 'asc', column }),
  desc: (column: unknown) => ({ dir: 'desc', column }),
  eq: (column: unknown, value: unknown) => ({ op: 'eq', column, value }),
  inArray: (column: unknown, value: unknown[]) => ({ op: 'inArray', column, value }),
}));

vi.mock('@propertypro/db/unsafe', () => ({ createUnscopedClient: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));
vi.mock('@propertypro/email', () => ({ AssessmentPaymentReceivedEmail: vi.fn(), sendEmail: vi.fn() }));
vi.mock('@/lib/services/stripe-service', () => ({ getStripeClient: vi.fn() }));

import {
  listAssessmentLineItemsForCommunity,
  listLedgerForCommunity,
  listPaymentHistoryForCommunity,
} from '../../src/lib/services/finance-service';

type Row = Record<string, unknown>;
const store = new Map<object, Row[]>();

function query(table: object, where?: { op: string; value?: unknown }) {
  const run = async () => {
    const rows = store.get(table) ?? [];
    if (table === tables.units && where?.op === 'inArray') {
      return rows.filter((row) => (where.value as unknown[]).includes(row.id));
    }
    return rows;
  };
  const q = {
    orderBy: () => q,
    then: <T>(onFulfilled: (rows: Row[]) => T, onRejected?: (err: unknown) => T) =>
      run().then(onFulfilled, onRejected),
  };
  return q;
}

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  store.set(tables.units, [
    { id: 2, unitNumber: '1B', building: null },
    { id: 3, unitNumber: '2A', building: 'Bldg A' },
  ]);
  createScopedClientMock.mockReturnValue({
    selectFrom: (table: object, _projection: unknown, where?: { op: string; value?: unknown }) =>
      query(table, where),
  });
});

function lineItem(id: number, unitId: number, status = 'pending'): Row {
  return {
    id,
    assessmentId: 7,
    unitId,
    amountCents: 30000,
    dueDate: '2026-09-01',
    status,
    paidAt: status === 'paid' ? new Date('2026-09-02T00:00:00.000Z') : null,
    lateFeeCents: 0,
  };
}

describe('finance display reads label units by number', () => {
  it('assessment line items (assessment manager table)', async () => {
    store.set(tables.assessmentLineItems, [lineItem(10, 2), lineItem(11, 3)]);

    const rows = await listAssessmentLineItemsForCommunity(42, 7);

    expect(rows.map((row) => [row.unitId, row.unitLabel])).toEqual([
      [2, 'Unit 1B'],
      [3, 'Bldg A • Unit 2A'],
    ]);
  });

  it('payment history (recent payments table)', async () => {
    store.set(tables.assessmentLineItems, [lineItem(10, 2, 'paid')]);
    store.set(tables.rentObligations, [
      { id: 50, unitId: 3, leaseId: 9, amountCents: 160000, dueDate: '2026-09-01', status: 'paid', updatedAt: new Date('2026-09-01T00:00:00.000Z') },
    ]);

    const rows = await listPaymentHistoryForCommunity(42);

    expect(rows.map((row) => [row.unitId, row.unitLabel])).toEqual([
      [2, 'Unit 1B'],
      [3, 'Bldg A • Unit 2A'],
    ]);
  });

  it('ledger (ledger table): unit entries labelled, community entries left alone', async () => {
    listLedgerEntriesMock.mockResolvedValue([
      { id: 1, unitId: 2, entryType: 'payment' },
      { id: 2, unitId: null, entryType: 'adjustment' },
      { id: 3, unitId: 99, entryType: 'fee' },
    ]);

    const rows = await listLedgerForCommunity(42, {});

    expect(rows).toEqual([
      { id: 1, unitId: 2, entryType: 'payment', unitLabel: 'Unit 1B' },
      { id: 2, unitId: null, entryType: 'adjustment' },
      // A unit that no longer exists falls back to its id rather than failing.
      { id: 3, unitId: 99, entryType: 'fee', unitLabel: 'Unit #99' },
    ]);
  });
});
