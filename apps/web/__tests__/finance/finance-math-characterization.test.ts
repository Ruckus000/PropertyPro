/**
 * CHARACTERIZATION suite for the finance money math (roadmap 3.T2, TST-02 seam 1).
 *
 * Pins what the code DOES today — statements, delinquency, late-fee waiver,
 * line-item generation (due-day clamp + idempotency), the statement date window,
 * and the three assessment-automation crons (overdue transition, late-fee grace
 * + flat fee, recurrence). It is not a spec: where current behaviour looks wrong, the case
 * pins it anyway and carries a `// CHARACTERIZATION: suspected defect — …`
 * comment. Fixing one of those should turn exactly that case red, on purpose.
 *
 * Every other finance test mocks `finance-service` wholesale; here it runs for
 * real, and so does `assessment-automation-service` on top of it (so
 * `processRecurringAssessments` exercises the real `computeDueDate` through
 * `generateAssessmentLineItemsForCommunity`). Non-exported helpers
 * (`computeDueDate`, `shouldGenerateThisMonth`) are pinned through those
 * callers only.
 *
 * Scaffold: the `finance-service-webhook.test.ts` shape — `vi.hoisted` mocks,
 * `vi.mock('@propertypro/db')` with symbol-column tables, `makeScopedClient()`.
 * One extension: the filter mocks return tagged predicates and the scoped client
 * evaluates them against an in-memory table store, so a case like "a second
 * late-fee run adds nothing" exercises the service's REAL where-clause instead
 * of a canned response. `orderBy(...)` and `limit(n)` are honoured too, as SQL
 * would: `asc`/`desc` return tagged sort keys, and the store sorts by them
 * before applying the limit. Statement fixtures are seeded SHUFFLED, so the
 * order a statement shows — and which rows survive a per-source LIMIT — comes
 * from the service's declared ORDER BY, not from fixture order.
 *
 * TIME ZONES. Vitest does not pin TZ for this project (see vitest.shared.ts), and
 * the default pool is `forks`, so assigning `process.env.TZ` inside the test
 * process takes effect immediately in Node. This file forces `UTC` (production
 * — Vercel — runs UTC) and switches zone only inside the `inTimeZone(...)`
 * describes, each of which first proves the switch landed. The clock is always
 * faked with `vi.useFakeTimers({ toFake: ['Date'] })` + `vi.setSystemTime`.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createScopedClientMock,
  createUnscopedClientMock,
  postLedgerEntryMock,
  getUnitLedgerBalanceMock,
  listLedgerEntriesMock,
  logAuditEventMock,
  insertMock,
  selectFromMock,
  updateMock,
  assessmentLineItemsTable,
  assessmentsTable,
  rentObligationsTable,
  rentPaymentsTable,
  unitsTable,
  communitiesTable,
  usersTable,
  userRolesTable,
  eqMock,
  neMock,
  ltMock,
  lteMock,
  gteMock,
  inArrayMock,
  andMock,
  ascMock,
  descMock,
  isNullMock,
} = vi.hoisted(() => {
  // Column symbols carry `<table>.<rowField>` so the predicate evaluator below
  // can read the row property a filter targets.
  const col = (table: string, field: string) => Symbol(`${table}.${field}`);
  return {
    createScopedClientMock: vi.fn(),
    createUnscopedClientMock: vi.fn(),
    postLedgerEntryMock: vi.fn(),
    getUnitLedgerBalanceMock: vi.fn(),
    listLedgerEntriesMock: vi.fn(),
    logAuditEventMock: vi.fn(),
    insertMock: vi.fn(),
    selectFromMock: vi.fn(),
    updateMock: vi.fn(),
    assessmentLineItemsTable: {
      id: col('assessment_line_items', 'id'),
      assessmentId: col('assessment_line_items', 'assessmentId'),
      unitId: col('assessment_line_items', 'unitId'),
      amountCents: col('assessment_line_items', 'amountCents'),
      dueDate: col('assessment_line_items', 'dueDate'),
      status: col('assessment_line_items', 'status'),
      lateFeeCents: col('assessment_line_items', 'lateFeeCents'),
    },
    assessmentsTable: {
      id: col('assessments', 'id'),
      isActive: col('assessments', 'isActive'),
      frequency: col('assessments', 'frequency'),
      startDate: col('assessments', 'startDate'),
      endDate: col('assessments', 'endDate'),
      lateFeeAmountCents: col('assessments', 'lateFeeAmountCents'),
      lateFeeDaysGrace: col('assessments', 'lateFeeDaysGrace'),
    },
    rentObligationsTable: {
      id: col('rent_obligations', 'id'),
      unitId: col('rent_obligations', 'unitId'),
      dueDate: col('rent_obligations', 'dueDate'),
      status: col('rent_obligations', 'status'),
    },
    rentPaymentsTable: { id: col('rent_payments', 'id') },
    unitsTable: { id: col('units', 'id'), unitNumber: col('units', 'unitNumber') },
    communitiesTable: {
      id: col('communities', 'id'),
      deletedAt: col('communities', 'deletedAt'),
      communitySettings: col('communities', 'communitySettings'),
    },
    usersTable: { id: col('users', 'id') },
    userRolesTable: { id: col('user_roles', 'id') },
    eqMock: vi.fn((column: symbol, value: unknown) => ({ op: 'eq', column, value })),
    neMock: vi.fn((column: symbol, value: unknown) => ({ op: 'ne', column, value })),
    ltMock: vi.fn((column: symbol, value: unknown) => ({ op: 'lt', column, value })),
    lteMock: vi.fn((column: symbol, value: unknown) => ({ op: 'lte', column, value })),
    gteMock: vi.fn((column: symbol, value: unknown) => ({ op: 'gte', column, value })),
    inArrayMock: vi.fn((column: symbol, value: unknown[]) => ({ op: 'inArray', column, value })),
    andMock: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
    ascMock: vi.fn((column: symbol) => ({ dir: 'asc', column })),
    descMock: vi.fn((column: symbol) => ({ dir: 'desc', column })),
    isNullMock: vi.fn((column: symbol) => ({ op: 'isNull', column })),
  };
});

vi.mock('@propertypro/db', () => ({
  assessmentLineItems: assessmentLineItemsTable,
  assessments: assessmentsTable,
  rentObligations: rentObligationsTable,
  rentPayments: rentPaymentsTable,
  units: unitsTable,
  communities: communitiesTable,
  users: usersTable,
  userRoles: userRolesTable,
  createScopedClient: createScopedClientMock,
  getUnitLedgerBalance: getUnitLedgerBalanceMock,
  listLedgerEntries: listLedgerEntriesMock,
  logAuditEvent: logAuditEventMock,
  postLedgerEntry: postLedgerEntryMock,
}));

vi.mock('@propertypro/email', () => ({
  AssessmentPaymentReceivedEmail: (props: unknown) => ({ type: 'AssessmentPaymentReceivedEmail', props }),
  sendEmail: vi.fn(),
}));

vi.mock('@propertypro/db/filters', () => ({
  and: andMock,
  asc: ascMock,
  desc: descMock,
  eq: eqMock,
  gte: gteMock,
  inArray: inArrayMock,
  isNull: isNullMock,
  lt: ltMock,
  lte: lteMock,
  ne: neMock,
}));

vi.mock('@/lib/services/stripe-service', () => ({
  getStripeClient: vi.fn(),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

import {
  buildCommunityStatement,
  buildUnitStatement,
  generateAssessmentLineItemsForCommunity,
  listDelinquentUnits,
  resolveStatementDateRange,
  waiveLateFeesForUnit,
} from '../../src/lib/services/finance-service';
import {
  processLateFees,
  processOverdueTransitions,
  processRecurringAssessments,
} from '../../src/lib/services/assessment-automation-service';

// ─────────────────────────────────────────────────────────────────────────────
// In-memory table store + predicate evaluator behind the scoped client mock
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
interface Predicate {
  op: string;
  column?: symbol;
  value?: unknown;
  args?: Predicate[];
}

const store = new Map<object, Row[]>();
/** A table whose query rejects with this error (e.g. a missing relation). */
const selectErrors = new Map<object, unknown>();
/** Every `limit(n)` a query was given, by table. */
const limitCalls: Array<{ table: object; n: number }> = [];
let nextId = 1000;
let communityRows: Row[] = [];

function field(column: symbol | undefined): string {
  const description = column?.description ?? '';
  return description.slice(description.indexOf('.') + 1);
}

function matches(row: Row, where: Predicate | undefined): boolean {
  if (!where) return true;
  const actual = row[field(where.column)] as string | number;
  switch (where.op) {
    case 'and':
      return (where.args ?? []).every((clause) => matches(row, clause));
    case 'eq':
      return actual === where.value;
    case 'ne':
      return actual !== where.value;
    case 'lt':
      return actual < (where.value as string | number);
    case 'lte':
      return actual <= (where.value as string | number);
    case 'gte':
      return actual >= (where.value as string | number);
    case 'inArray':
      return (where.value as unknown[]).includes(actual);
    default:
      throw new Error(`predicate evaluator: unsupported op ${where.op}`);
  }
}

interface SortKey {
  dir: 'asc' | 'desc';
  column: symbol;
}

function compareBy(keys: SortKey[]) {
  return (a: Row, b: Row): number => {
    for (const key of keys) {
      const x = a[field(key.column)] as string | number;
      const y = b[field(key.column)] as string | number;
      if (x === y) continue;
      const cmp = x < y ? -1 : 1;
      return key.dir === 'asc' ? cmp : -cmp;
    }
    return 0;
  };
}

/** Deterministic Fisher-Yates (LCG seed), so fixture order carries no meaning. */
function shuffled<T>(items: T[], seedValue = 7): T[] {
  const out = [...items];
  let state = seedValue;
  for (let i = out.length - 1; i > 0; i--) {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Every `orderBy(...)` a query was given, by table. */
const orderByCalls: Array<{ table: object; keys: SortKey[] }> = [];

function makeQuery(table: object, where: Predicate | undefined) {
  let limit: number | null = null;
  let order: SortKey[] = [];
  const query = {
    orderBy: vi.fn((...keys: SortKey[]) => {
      order = keys;
      orderByCalls.push({ table, keys });
      return query;
    }),
    limit: vi.fn((n: number) => {
      limit = n;
      limitCalls.push({ table, n });
      return query;
    }),
    then<T1, T2>(
      onFulfilled: (rows: Row[]) => T1 | PromiseLike<T1>,
      onRejected?: (err: unknown) => T2 | PromiseLike<T2>,
    ): Promise<T1 | T2> {
      const run = async (): Promise<Row[]> => {
        if (selectErrors.has(table)) throw selectErrors.get(table);
        const rows = (store.get(table) ?? []).filter((row) => matches(row, where));
        if (order.length > 0) rows.sort(compareBy(order));
        return (limit === null ? rows : rows.slice(0, limit)).map((row) => ({ ...row }));
      };
      return run().then(onFulfilled, onRejected);
    },
  };
  return query;
}

function makeScopedClient() {
  return {
    selectFrom: selectFromMock,
    insert: insertMock,
    update: updateMock,
  };
}

function seed(table: object, rows: Row[]): void {
  store.set(table, rows.map((row) => ({ ...row })));
}

function rowsOf(table: object): Row[] {
  return store.get(table) ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Clock and time-zone helpers
// ─────────────────────────────────────────────────────────────────────────────

const ORIGINAL_TZ = process.env.TZ;

function setNow(iso: string): Date {
  const now = new Date(iso);
  vi.setSystemTime(now);
  return now;
}

/**
 * Runs the enclosing describe with `process.env.TZ` set. Node re-reads the zone
 * on assignment in the main thread of a process, which is what vitest's
 * default `forks` pool gives each file. The first case of every such describe
 * proves the switch landed, so a pool change cannot make these vacuous.
 */
function inTimeZone(tz: string, expectedLocalHourAtEpoch: number): void {
  beforeEach(() => {
    process.env.TZ = tz;
  });
  afterEach(() => {
    process.env.TZ = 'UTC';
  });
  it(`sentinel: process time zone is ${tz}`, () => {
    expect(new Date(0).getHours()).toBe(expectedLocalHourAtEpoch);
  });
}

beforeAll(() => {
  process.env.TZ = 'UTC';
});

afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  store.clear();
  selectErrors.clear();
  limitCalls.length = 0;
  orderByCalls.length = 0;
  nextId = 1000;
  communityRows = [{ id: 11, communitySettings: { assessmentPaymentsEnabled: true } }];

  createScopedClientMock.mockImplementation(() => makeScopedClient());
  createUnscopedClientMock.mockImplementation(() => ({
    select: () => ({ from: () => ({ where: () => Promise.resolve(communityRows) }) }),
  }));
  selectFromMock.mockImplementation((table: object, _projection: unknown, where?: Predicate) =>
    makeQuery(table, where),
  );
  insertMock.mockImplementation(async (table: object, values: Row[]) => {
    const inserted = values.map((value) => ({ id: nextId++, ...value }));
    store.set(table, [...rowsOf(table), ...inserted]);
    return inserted;
  });
  updateMock.mockImplementation(async (table: object, patch: Row, where: Predicate) => {
    const updated: Row[] = [];
    for (const row of rowsOf(table)) {
      if (matches(row, where)) {
        Object.assign(row, patch);
        updated.push({ ...row });
      }
    }
    return updated;
  });
  postLedgerEntryMock.mockImplementation(async () => ({ id: nextId++ }));
  logAuditEventMock.mockResolvedValue(undefined);
  listLedgerEntriesMock.mockResolvedValue([]);
  getUnitLedgerBalanceMock.mockResolvedValue(0);
});

afterEach(() => {
  vi.useRealTimers();
});

function lineItem(overrides: Row): Row {
  return {
    assessmentId: 7,
    communityId: 11,
    unitId: 88,
    amountCents: 30000,
    status: 'pending',
    paidAt: null,
    paymentIntentId: null,
    lateFeeCents: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function assessment(overrides: Row): Row {
  return {
    id: 7,
    communityId: 11,
    title: 'Monthly dues',
    description: null,
    amountCents: 30000,
    frequency: 'monthly',
    dueDay: 1,
    lateFeeAmountCents: 2500,
    lateFeeDaysGrace: 15,
    startDate: '2025-01-01',
    endDate: null,
    isActive: true,
    createdByUserId: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 0. Overdue transition — processOverdueTransitions
//    pending → overdue when dueDate < local today (strictly before).
// ═════════════════════════════════════════════════════════════════════════════

describe('0. overdue transition (processOverdueTransitions)', () => {
  beforeEach(() => {
    seed(assessmentLineItemsTable, [
      lineItem({ id: 1, status: 'pending', dueDate: '2026-03-09' }), // yesterday → overdue
      lineItem({ id: 2, status: 'pending', dueDate: '2026-03-10' }), // today → stays pending
      lineItem({ id: 3, status: 'pending', dueDate: '2026-03-11' }), // tomorrow → stays pending
      lineItem({ id: 4, status: 'paid', dueDate: '2026-01-01' }),
      lineItem({ id: 5, status: 'waived', dueDate: '2026-01-01' }),
      lineItem({ id: 6, status: 'overdue', dueDate: '2026-01-01' }),
    ]);
  });

  function statuses(): Record<string, unknown> {
    return Object.fromEntries(rowsOf(assessmentLineItemsTable).map((r) => [r.id, r.status]));
  }

  it('moves only pending items due strictly before today; due-today stays pending', async () => {
    const summary = await processOverdueTransitions(setNow('2026-03-10T23:59:59.999Z'));
    expect(summary).toEqual({ communitiesScanned: 1, itemsTransitioned: 1, errors: 0 });
    expect(statuses()).toEqual({ 1: 'overdue', 2: 'pending', 3: 'pending', 4: 'paid', 5: 'waived', 6: 'overdue' });
  });

  it('there is no grace here: one day past due is overdue at the first run after midnight', async () => {
    const summary = await processOverdueTransitions(setNow('2026-03-11T00:00:00.000Z'));
    expect(summary.itemsTransitioned).toBe(2);
    expect(statuses()).toMatchObject({ 1: 'overdue', 2: 'overdue', 3: 'pending' });
  });

  it('a second run transitions nothing', async () => {
    await processOverdueTransitions(setNow('2026-03-10T12:00:00.000Z'));
    const second = await processOverdueTransitions(setNow('2026-03-10T13:00:00.000Z'));
    expect(second.itemsTransitioned).toBe(0);
  });

  describe('in America/New_York', () => {
    inTimeZone('America/New_York', 19);

    it('"today" is the process-local date', async () => {
      // Pinned, not flagged (Vercel runs UTC): 02:00 UTC on March 10 is 22:00 EDT on
      // March 9, so local today is the 9th and the item due the 9th is not yet overdue.
      const summary = await processOverdueTransitions(setNow('2026-03-10T02:00:00.000Z'));
      expect(summary.itemsTransitioned).toBe(0);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. Grace days — processLateFees
//    daysOverdue = floor((now - dueDate@UTC-midnight) / 86_400_000); fee only
//    when daysOverdue > lateFeeDaysGrace (the code skips on `<=`).
// ═════════════════════════════════════════════════════════════════════════════

describe('1. late-fee grace window (processLateFees)', () => {
  beforeEach(() => {
    seed(assessmentsTable, [assessment({ id: 7, lateFeeAmountCents: 2500, lateFeeDaysGrace: 15 })]);
    seed(assessmentLineItemsTable, [
      lineItem({ id: 10, status: 'overdue', dueDate: '2026-03-01', lateFeeCents: 0 }),
    ]);
  });

  it('exactly `grace` whole days after the due date: no fee yet', async () => {
    const summary = await processLateFees(setNow('2026-03-16T00:00:00.000Z'));
    expect(summary.feesApplied).toBe(0);
    expect(postLedgerEntryMock).not.toHaveBeenCalled();
  });

  it('the last millisecond of day `grace` still floors to `grace`: no fee', async () => {
    const summary = await processLateFees(setNow('2026-03-16T23:59:59.999Z'));
    expect(summary.feesApplied).toBe(0);
  });

  it('`grace + 1` whole days: fee applied, notes carry the floor-ed day count', async () => {
    const summary = await processLateFees(setNow('2026-03-17T00:00:00.000Z'));
    expect(summary).toMatchObject({ feesApplied: 1, totalFeeCents: 2500, errors: 0 });
    expect(postLedgerEntryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entryType: 'fee',
        amountCents: 2500,
        sourceType: 'assessment',
        sourceId: '10',
        unitId: 88,
        metadata: expect.objectContaining({
          notes: 'Late fee: 16 days overdue, grace period: 15 days',
        }),
      }),
    );
  });

  it('grace 0: same UTC day as the due date is day 0 (no fee); the next UTC midnight is day 1 (fee)', async () => {
    seed(assessmentsTable, [assessment({ id: 7, lateFeeAmountCents: 2500, lateFeeDaysGrace: 0 })]);

    const sameDay = await processLateFees(setNow('2026-03-01T18:00:00.000Z'));
    expect(sameDay.feesApplied).toBe(0);

    const nextDay = await processLateFees(setNow('2026-03-02T00:00:00.000Z'));
    expect(nextDay.feesApplied).toBe(1);
  });

  describe('in America/New_York', () => {
    inTimeZone('America/New_York', 19);

    it('the grace count is pure epoch arithmetic, so the process zone does not move it', async () => {
      // 23:59 UTC on day 15 is 19:59 EDT the same day: still 15 days, no fee.
      const summary = await processLateFees(setNow('2026-03-16T23:59:00.000Z'));
      expect(summary.feesApplied).toBe(0);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Flat, non-compounding late fee
// ═════════════════════════════════════════════════════════════════════════════

describe('2. flat, non-compounding late fee (processLateFees)', () => {
  beforeEach(() => {
    seed(assessmentsTable, [assessment({ id: 7, lateFeeAmountCents: 2500, lateFeeDaysGrace: 5 })]);
    seed(assessmentLineItemsTable, [
      lineItem({ id: 10, unitId: 1, status: 'overdue', dueDate: '2026-01-01', amountCents: 30000 }),
      lineItem({ id: 11, unitId: 2, status: 'overdue', dueDate: '2026-01-01', amountCents: 90000 }),
      // Already carries a fee: must not be touched again.
      lineItem({ id: 12, unitId: 3, status: 'overdue', dueDate: '2026-01-01', lateFeeCents: 1000 }),
      // Pending (not yet transitioned to overdue): not a late-fee candidate.
      lineItem({ id: 13, unitId: 4, status: 'pending', dueDate: '2026-01-01' }),
    ]);
  });

  it('charges the flat assessment fee (not a % of the amount) once per item; a second run adds nothing', async () => {
    const first = await processLateFees(setNow('2026-03-01T00:00:00.000Z'));
    expect(first).toMatchObject({ feesApplied: 2, totalFeeCents: 5000 });
    expect(postLedgerEntryMock.mock.calls.map(([, entry]) => (entry as Row).amountCents)).toEqual([2500, 2500]);

    const fees = Object.fromEntries(rowsOf(assessmentLineItemsTable).map((r) => [r.id, r.lateFeeCents]));
    expect(fees).toEqual({ 10: 2500, 11: 2500, 12: 1000, 13: 0 });

    postLedgerEntryMock.mockClear();
    const second = await processLateFees(setNow('2026-04-01T00:00:00.000Z'));
    expect(second).toMatchObject({ feesApplied: 0, totalFeeCents: 0 });
    expect(postLedgerEntryMock).not.toHaveBeenCalled();
  });

  it('writes the fee only where lateFeeCents is still 0, and posts the ledger entry only for a row it updated', async () => {
    // Fixed 2026-09-30 (was a suspected defect: the UPDATE was keyed on `id` alone
    // and the ledger post was unconditional, so two overlapping runs that both read
    // the row at lateFeeCents 0 each posted a `fee` entry). Now guaranteed: the
    // UPDATE is `id = ? AND late_fee_cents = 0`, and a run whose UPDATE matched no
    // row (another run got there first) posts nothing and counts nothing.
    seed(assessmentLineItemsTable, [lineItem({ id: 10, status: 'overdue', dueDate: '2026-01-01' })]);
    await processLateFees(setNow('2026-03-01T00:00:00.000Z'));
    expect(updateMock).toHaveBeenCalledWith(
      assessmentLineItemsTable,
      { lateFeeCents: 2500 },
      {
        op: 'and',
        args: [
          { op: 'eq', column: assessmentLineItemsTable.id, value: 10 },
          { op: 'eq', column: assessmentLineItemsTable.status, value: 'overdue' },
          { op: 'eq', column: assessmentLineItemsTable.lateFeeCents, value: 0 },
        ],
      },
    );
    expect(postLedgerEntryMock).toHaveBeenCalledTimes(1);
  });

  it('an overlapping run that loses the race to the UPDATE posts no second fee', async () => {
    seed(assessmentLineItemsTable, [lineItem({ id: 10, status: 'overdue', dueDate: '2026-01-01' })]);
    // Both runs SELECT the row at lateFeeCents 0; the other run's UPDATE lands
    // between this run's SELECT and its own UPDATE.
    const realUpdate = updateMock.getMockImplementation()!;
    updateMock.mockImplementationOnce(async (table: object, patch: Row, where: Predicate) => {
      const row = rowsOf(assessmentLineItemsTable).find((r) => r.id === 10)!;
      row.lateFeeCents = 2500;
      return realUpdate(table, patch, where);
    });
    const summary = await processLateFees(setNow('2026-03-01T00:00:00.000Z'));
    expect(summary).toMatchObject({ feesApplied: 0, totalFeeCents: 0 });
    expect(postLedgerEntryMock).not.toHaveBeenCalled();
    expect(rowsOf(assessmentLineItemsTable)[0]?.lateFeeCents).toBe(2500);
  });

  it('an item paid between the overdue SELECT and the fee UPDATE gets no fee and no ledger post', async () => {
    // The UPDATE re-checks `status = 'overdue'`: the SELECT is not a lock, so a
    // payment landing in between must not be followed by a late fee on a paid item.
    seed(assessmentLineItemsTable, [lineItem({ id: 10, status: 'overdue', dueDate: '2026-01-01' })]);
    const realUpdate = updateMock.getMockImplementation()!;
    updateMock.mockImplementationOnce(async (table: object, patch: Row, where: Predicate) => {
      const row = rowsOf(assessmentLineItemsTable).find((r) => r.id === 10)!;
      row.status = 'paid';
      return realUpdate(table, patch, where);
    });
    const summary = await processLateFees(setNow('2026-03-01T00:00:00.000Z'));
    expect(summary).toMatchObject({ feesApplied: 0, totalFeeCents: 0 });
    expect(postLedgerEntryMock).not.toHaveBeenCalled();
    expect(rowsOf(assessmentLineItemsTable)[0]).toMatchObject({ status: 'paid', lateFeeCents: 0 });
  });

  it.each([0, -100])('an assessment fee of %i cents is skipped', async (feeCents) => {
    seed(assessmentsTable, [assessment({ id: 7, lateFeeAmountCents: feeCents, lateFeeDaysGrace: 5 })]);
    const summary = await processLateFees(setNow('2026-03-01T00:00:00.000Z'));
    expect(summary.feesApplied).toBe(0);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it.each([
    ['false', { assessmentPaymentsEnabled: false }],
    ['missing', {}],
    ['null settings', null],
  ])('payments gate %s: community skipped and counted, no fee, no ledger post', async (_label, settings) => {
    communityRows = [{ id: 11, communitySettings: settings }];
    const summary = await processLateFees(setNow('2026-03-01T00:00:00.000Z'));
    expect(summary).toMatchObject({
      communitiesScanned: 1,
      communitiesSkippedPaymentsDisabled: 1,
      feesApplied: 0,
      totalFeeCents: 0,
    });
    expect(selectFromMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(postLedgerEntryMock).not.toHaveBeenCalled();
  });

  it('an item with no parent assessment is skipped', async () => {
    seed(assessmentLineItemsTable, [
      lineItem({ id: 10, assessmentId: null, status: 'overdue', dueDate: '2026-01-01' }),
    ]);
    const summary = await processLateFees(setNow('2026-03-01T00:00:00.000Z'));
    expect(summary.feesApplied).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Due-day clamp — computeDueDate, through generateAssessmentLineItemsForCommunity
// ═════════════════════════════════════════════════════════════════════════════

describe('3. due date computation (via generateAssessmentLineItemsForCommunity)', () => {
  async function dueDateFor(
    assessmentOverrides: Row,
    nowIso: string,
    override?: string | null,
  ): Promise<string> {
    seed(assessmentsTable, [assessment({ id: 7, ...assessmentOverrides })]);
    seed(unitsTable, [{ id: 1 }]);
    seed(assessmentLineItemsTable, []);
    setNow(nowIso);
    const result = await generateAssessmentLineItemsForCommunity(11, 7, 'actor-1', override);
    return result.dueDate;
  }

  it.each([
    ['dueDay 31 in Feb of a common year clamps to the 28th', 31, '2026-02-10T12:00:00.000Z', '2026-02-28'],
    ['dueDay 31 in Feb of a leap year clamps to the 29th', 31, '2028-02-10T12:00:00.000Z', '2028-02-29'],
    ['dueDay 31 in a 30-day month clamps to the 30th', 31, '2026-04-15T12:00:00.000Z', '2026-04-30'],
    ['dueDay 30 in a 30-day month is the 30th', 30, '2026-04-15T12:00:00.000Z', '2026-04-30'],
    ['dueDay 15 is the 15th', 15, '2026-04-02T12:00:00.000Z', '2026-04-15'],
    ['null dueDay defaults to the 1st', null, '2026-04-15T12:00:00.000Z', '2026-04-01'],
    ['dueDay 0 clamps up to the 1st', 0, '2026-04-15T12:00:00.000Z', '2026-04-01'],
  ])('%s', async (_label, dueDay, nowIso, expected) => {
    expect(await dueDateFor({ frequency: 'monthly', dueDay }, nowIso)).toBe(expected);
  });

  it('the due date is in the CURRENT month even when dueDay has already passed', async () => {
    expect(await dueDateFor({ frequency: 'monthly', dueDay: 5 }, '2026-04-28T12:00:00.000Z')).toBe('2026-04-05');
  });

  it('one_time uses the assessment startDate verbatim, ignoring dueDay and the clock', async () => {
    expect(
      await dueDateFor({ frequency: 'one_time', dueDay: 31, startDate: '2025-12-25' }, '2026-04-15T12:00:00.000Z'),
    ).toBe('2025-12-25');
  });

  it('an explicit override wins over frequency, dueDay and the clock', async () => {
    expect(
      await dueDateFor({ frequency: 'one_time', startDate: '2025-12-25' }, '2026-04-15T12:00:00.000Z', '2026-06-15'),
    ).toBe('2026-06-15');
  });

  it('an override that is not YYYY-MM-DD is a 400', async () => {
    await expect(
      dueDateFor({ frequency: 'monthly' }, '2026-04-15T12:00:00.000Z', '06/15/2026'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it.each(['2026-02-31', '2026-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-01-00'])(
    'an override that is not a real calendar date (%s) is a 400, not a 500 from the INSERT',
    async (override) => {
      // Fixed 2026-09-30 (was a suspected defect: `parseDateOnly` was a regex only,
      // so '2026-02-31' reached the INSERT and Postgres' out-of-range error surfaced
      // as a 500). Now guaranteed: the value must round-trip as a calendar date.
      await expect(
        dueDateFor({ frequency: 'monthly' }, '2026-04-15T12:00:00.000Z', override),
      ).rejects.toMatchObject({ statusCode: 400, message: 'dueDate must be a valid calendar date' });
      expect(insertMock).not.toHaveBeenCalled();
    },
  );

  it('a real leap day is accepted as an override', async () => {
    expect(await dueDateFor({ frequency: 'monthly' }, '2026-04-15T12:00:00.000Z', '2028-02-29')).toBe('2028-02-29');
  });

  describe('in America/Los_Angeles', () => {
    inTimeZone('America/Los_Angeles', 16);

    it('the month is the process-local month, not the UTC month', async () => {
      // CHARACTERIZATION: suspected defect — computeDueDate reads `new Date()` through
      // local-time startOfMonth/endOfMonth. The recurring cron fires at 05:00 UTC on
      // the 1st; in any zone west of UTC-5 that instant is still the last day of the
      // PREVIOUS month, so May's run generates April's due date (and, being keyed on
      // dueDate, re-uses April's idempotency set). Harmless on Vercel (UTC); wrong on
      // any host with TZ set west of UTC-5.
      expect(await dueDateFor({ frequency: 'monthly', dueDay: 1 }, '2026-05-01T05:00:00.000Z')).toBe('2026-04-01');
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Recurrence — processRecurringAssessments (+ shouldGenerateThisMonth)
// ═════════════════════════════════════════════════════════════════════════════

describe('4. recurrence (processRecurringAssessments → real generateAssessmentLineItemsForCommunity)', () => {
  beforeEach(() => {
    seed(unitsTable, [{ id: 1 }]);
    seed(assessmentLineItemsTable, []);
  });

  function generatedDueDates(): string[] {
    return rowsOf(assessmentLineItemsTable).map((row) => row.dueDate as string);
  }

  async function runInMonth(month: number, assessmentOverrides: Row) {
    seed(assessmentsTable, [assessment({ id: 7, ...assessmentOverrides })]);
    seed(assessmentLineItemsTable, []);
    const now = setNow(new Date(Date.UTC(2026, month - 1, 1, 5, 0, 0)).toISOString());
    return processRecurringAssessments(now);
  }

  // (m - 5) % 3 === 0 → {2, 5, 8, 11}. For m < 5 the difference is negative, and
  // JS `%` keeps the sign: (2-5)%3 is -0, which `=== 0` accepts, while (1-5)%3 is
  // -1. So months before the start month still land on the right cycle. The start
  // is in the PREVIOUS year so the startDate bound (no period before the start
  // month) does not mask the cadence in months 1-4.
  it.each([
    [1, false], [2, true], [3, false], [4, false], [5, true], [6, false],
    [7, false], [8, true], [9, false], [10, false], [11, true], [12, false],
  ])('quarterly anchored on a May start: month %i generates=%s', async (month, expected) => {
    const summary = await runInMonth(month, { frequency: 'quarterly', startDate: '2025-05-01' });
    expect(summary.assessmentsProcessed).toBe(expected ? 1 : 0);
  });

  it('quarterly cadence is anchored to the start month, not to calendar quarters', async () => {
    // Doc drift, not a defect: the service docblock says "Quarterly: only generates
    // in months 1, 4, 7, 10". It generates in start-month ± 3k. A January-start
    // quarterly does match that list; this February-start one does not.
    const jan = await runInMonth(1, { frequency: 'quarterly', startDate: '2026-02-01' });
    const feb = await runInMonth(2, { frequency: 'quarterly', startDate: '2026-02-01' });
    expect([jan.assessmentsProcessed, feb.assessmentsProcessed]).toEqual([0, 1]);
  });

  it.each([
    [8, false], [9, true], [10, false],
  ])('annual with a September start: month %i generates=%s', async (month, expected) => {
    const summary = await runInMonth(month, { frequency: 'annual', startDate: '2025-09-10' });
    expect(summary.assessmentsProcessed).toBe(expected ? 1 : 0);
  });

  it('monthly generates every month, at the clamped due day', async () => {
    const summary = await runInMonth(2, { frequency: 'monthly', dueDay: 31 });
    expect(summary).toMatchObject({ assessmentsProcessed: 1, totalInserted: 1, totalSkipped: 0 });
    expect(generatedDueDates()).toEqual(['2026-02-28']);
  });

  it('one_time and inactive assessments are excluded by the query predicate', async () => {
    seed(assessmentsTable, [
      assessment({ id: 7, frequency: 'one_time' }),
      assessment({ id: 8, frequency: 'monthly', isActive: false }),
    ]);
    const summary = await processRecurringAssessments(setNow('2026-04-01T05:00:00.000Z'));
    expect(summary.assessmentsProcessed).toBe(0);
  });

  it.each([
    ['2026-04-01', true],
    ['2026-04-30', true],
    ['2026-05-15', true],
    ['2026-03-31', false],
    ['2026-03-01', false],
  ])('endDate %s: the April period is billed=%s (end month inclusive)', async (endDate, expected) => {
    // Fixed 2026-09-30 (was a suspected defect: `now > new Date(endDate + 'T00:00Z')`
    // made the end date exclusive from its first millisecond, so the 05:00 UTC run on
    // the 1st skipped an assessment ending that day — its last installment). Now
    // guaranteed: endDate is a calendar date compared at MONTH granularity, inclusive —
    // a period (month) is billed iff its first day is on or before endDate. So "ends
    // 2026-04-01" bills April. Mirrors the startDate rule (months before the start
    // month are skipped), and does not depend on dueDay, so editing dueDay cannot
    // move the final installment in or out of range.
    const summary = await runInMonth(4, { frequency: 'monthly', endDate });
    expect(summary.assessmentsProcessed).toBe(expected ? 1 : 0);
    expect(generatedDueDates()).toEqual(expected ? ['2026-04-01'] : []);
  });

  it('endDate is month-granular, not due-date-granular: dueDay 15 with an end of the 1st still bills that month', async () => {
    const summary = await runInMonth(4, { frequency: 'monthly', dueDay: 15, endDate: '2026-04-01' });
    expect(summary.assessmentsProcessed).toBe(1);
    expect(generatedDueDates()).toEqual(['2026-04-15']);
  });

  it.each([
    ['monthly', '2026-09-01', 4, false],
    ['monthly', '2026-04-20', 4, true],
    ['monthly', '2026-03-31', 4, true],
    ['quarterly', '2026-07-01', 4, false],
    ['annual', '2027-04-01', 4, false],
  ])('%s starting %s: the month-%i period is billed=%s (months before the start month are skipped)', async (frequency, startDate, month, expected) => {
    // Fixed 2026-09-30 (was a suspected defect: nothing compared the period with
    // startDate, so a monthly assessment created today with a September start posted
    // an April charge — line item + ledger `assessment` entry — at the next cron
    // run). Now guaranteed for every recurring frequency: a period is billed only
    // from the start date's month on. Month-granular, like endDate: a start mid-month
    // bills that month.
    const summary = await runInMonth(month, { frequency, startDate });
    expect(summary.assessmentsProcessed).toBe(expected ? 1 : 0);
    expect(generatedDueDates()).toEqual(expected ? ['2026-04-01'] : []);
  });

  it('the `now` argument gates the month, but the due date comes from the wall clock', async () => {
    // CHARACTERIZATION: suspected defect (LATENT) — processRecurringAssessments(now)
    // does not pass `now` to generateAssessmentLineItemsForCommunity, whose
    // computeDueDate calls `new Date()`. The only production caller
    // (api/v1/internal/generate-assessments/route.ts) passes no `now`, so today the
    // two clocks agree and nothing is wrong. It bites the first time anyone adds a
    // `now` (a backfill, a delayed re-run, a test): the month gate follows the
    // argument, the due date follows the wall clock.
    seed(assessmentsTable, [assessment({ id: 7, frequency: 'quarterly', startDate: '2026-04-01' })]);
    setNow('2026-06-15T12:00:00.000Z');
    const summary = await processRecurringAssessments(new Date('2026-04-01T05:00:00.000Z'));
    expect(summary.assessmentsProcessed).toBe(1);
    expect(generatedDueDates()).toEqual(['2026-06-01']);
  });

  describe('in America/New_York', () => {
    inTimeZone('America/New_York', 19);

    it('a start date on the 1st reads as the PREVIOUS month, so quarterly/annual miss their own start month', async () => {
      // CHARACTERIZATION: suspected defect — shouldGenerateThisMonth parses startDate
      // as UTC midnight and then reads it with LOCAL getMonth(); `now.getMonth()` is
      // local too. In New York, '2026-04-01T00:00Z' is 20:00 on March 31, so the start
      // month is 3. The 05:00 UTC run on April 1 (01:00 EDT, local month 4) then
      // computes (4 - 3) % 3 = 1 and skips; the annual one waits for March. On UTC
      // (Vercel) both generate in April.
      const quarterly = await runInMonth(4, { frequency: 'quarterly', startDate: '2026-04-01' });
      const annual = await runInMonth(4, { frequency: 'annual', startDate: '2026-04-01' });
      expect([quarterly.assessmentsProcessed, annual.assessmentsProcessed]).toEqual([0, 0]);
    });
  });

  it('control for the time-zone case: on UTC both generate in April', async () => {
    const quarterly = await runInMonth(4, { frequency: 'quarterly', startDate: '2026-04-01' });
    const annual = await runInMonth(4, { frequency: 'annual', startDate: '2026-04-01' });
    expect([quarterly.assessmentsProcessed, annual.assessmentsProcessed]).toEqual([1, 1]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Delinquency — listDelinquentUnits
// ═════════════════════════════════════════════════════════════════════════════

describe('5. delinquency (listDelinquentUnits)', () => {
  beforeEach(() => {
    seed(assessmentLineItemsTable, [
      lineItem({ id: 1, unitId: 1, status: 'overdue', dueDate: '2026-02-08', amountCents: 30000, lateFeeCents: 2500 }),
      lineItem({ id: 2, unitId: 1, status: 'pending', dueDate: '2026-03-10', amountCents: 30000 }),
      lineItem({ id: 3, unitId: 2, status: 'overdue', dueDate: '2026-02-09', amountCents: 10000 }),
      lineItem({ id: 4, unitId: 3, status: 'paid', dueDate: '2026-01-01', amountCents: 50000 }),
      lineItem({ id: 5, unitId: 3, status: 'waived', dueDate: '2026-01-01', amountCents: 50000 }),
      lineItem({ id: 6, unitId: 4, status: 'pending', dueDate: '2026-03-11', amountCents: 50000 }),
    ]);
    setNow('2026-03-10T12:00:00.000Z');
  });

  it('queries pending|overdue items due strictly before local today (same predicate as the overdue cron)', async () => {
    await listDelinquentUnits(11, 30);
    expect(inArrayMock).toHaveBeenCalledWith(assessmentLineItemsTable.status, ['pending', 'overdue']);
    expect(ltMock).toHaveBeenCalledWith(assessmentLineItemsTable.dueDate, '2026-03-10');
    expect(lteMock).not.toHaveBeenCalledWith(assessmentLineItemsTable.dueDate, expect.anything());
  });

  it('sums amount + lateFee per unit, takes the per-unit max days, sorts by amount desc', async () => {
    // Unit 1's pending item due today (id 2) is not late yet, so it is not summed.
    const result = await listDelinquentUnits(11, 30);
    expect(result).toEqual([
      { unitId: 1, overdueAmountCents: 32500, daysOverdue: 30, lineItemCount: 1, lienEligible: true },
      { unitId: 2, overdueAmountCents: 10000, daysOverdue: 29, lineItemCount: 1, lienEligible: false },
    ]);
  });

  it.each([
    [29, [true, true]],
    [30, [true, false]],
    [31, [false, false]],
  ])('lien threshold %i days → lienEligible %j (>= boundary)', async (threshold, expected) => {
    const result = await listDelinquentUnits(11, threshold);
    expect(result.map((row) => row.lienEligible)).toEqual(expected);
  });

  it('an item due today is not delinquent; one due yesterday is, at 1 day', async () => {
    // Fixed 2026-09-30 (was a suspected defect: `lte(dueDate, today)` listed a unit
    // whose only item was due today — not late by any rule — as delinquent, while
    // processOverdueTransitions uses `lt`). Now guaranteed: delinquency and the
    // overdue cron agree that an installment is late only from the day after it is
    // due. lienEligible is unchanged (`daysOverdue >= threshold`).
    seed(assessmentLineItemsTable, [
      lineItem({ id: 9, unitId: 5, status: 'pending', dueDate: '2026-03-10', amountCents: 30000 }),
      lineItem({ id: 10, unitId: 6, status: 'pending', dueDate: '2026-03-09', amountCents: 20000 }),
    ]);
    expect(await listDelinquentUnits(11, 1)).toEqual([
      { unitId: 6, overdueAmountCents: 20000, daysOverdue: 1, lineItemCount: 1, lienEligible: true },
    ]);
  });

  it('daysOverdue is clamped at 0 for a row dated after now', async () => {
    // Unreachable through the query predicate on a UTC host; pinned by handing the
    // service the row directly (e.g. DB clock ahead of the app clock).
    selectFromMock.mockImplementationOnce(() =>
      Promise.resolve([lineItem({ id: 9, unitId: 5, status: 'pending', dueDate: '2026-03-20' })]),
    );
    const [row] = await listDelinquentUnits(11, 1);
    expect(row?.daysOverdue).toBe(0);
  });

  describe('in America/New_York', () => {
    inTimeZone('America/New_York', 19);

    it('an item due yesterday reports 2 days overdue', async () => {
      // CHARACTERIZATION: suspected defect — daysOverdue is differenceInCalendarDays
      // (LOCAL calendar days) between now and the due date parsed as UTC midnight.
      // West of UTC, '2026-03-09T00:00Z' is the evening of March 8 locally, so every
      // item is one day older than on a UTC host (1 day, above) — enough to flip
      // lienEligible at the threshold boundary. (Moved from an item due today when
      // delinquency became strictly-before-today: that item is no longer listed.)
      seed(assessmentLineItemsTable, [
        lineItem({ id: 9, unitId: 5, status: 'pending', dueDate: '2026-03-09', amountCents: 30000 }),
      ]);
      const [row] = await listDelinquentUnits(11, 2);
      expect(row).toMatchObject({ daysOverdue: 2, lienEligible: true });
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. Statements — buildUnitStatement / buildCommunityStatement
// ═════════════════════════════════════════════════════════════════════════════

describe('6. statements', () => {
  function rent(overrides: Row): Row {
    return {
      leaseId: 42,
      communityId: 11,
      unitId: 88,
      amountCents: 160000,
      status: 'pending',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  const PAID_AT = new Date('2026-02-03T10:00:00.000Z');

  describe('buildUnitStatement', () => {
    beforeEach(() => {
      // Seeded shuffled: the order below is NOT the order a statement shows.
      seed(assessmentLineItemsTable, shuffled([
        lineItem({ id: 13, unitId: 88, dueDate: '2026-04-01' }), // outside the window
        lineItem({ id: 12, unitId: 88, dueDate: '2026-03-01', status: 'overdue', lateFeeCents: 2500 }),
        lineItem({ id: 99, unitId: 77, dueDate: '2026-03-01' }), // another unit
        lineItem({ id: 11, unitId: 88, dueDate: '2026-02-01', status: 'paid', paidAt: PAID_AT, paymentIntentId: 'pi_1' }),
      ]));
      seed(rentObligationsTable, shuffled([
        rent({ id: 500, dueDate: '2026-03-01', lateFeeCents: 999 }), // stray fee must not reach the statement
        rent({ id: 400, dueDate: '2026-03-15' }),
      ]));
      getUnitLedgerBalanceMock.mockResolvedValue(32500);
    });

    it('merges assessment and rent rows, newest first, rent late fee forced to 0', async () => {
      const statement = await buildUnitStatement(11, 88, '2026-01-01', '2026-03-31');
      expect(statement.unitId).toBe(88);
      expect(statement.balanceCents).toBe(32500);
      expect(getUnitLedgerBalanceMock).toHaveBeenCalledWith(expect.anything(), 88);
      expect(listLedgerEntriesMock).toHaveBeenCalledWith(expect.anything(), {
        unitId: 88,
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        limit: 500,
      });
      expect(statement.lineItems).toEqual([
        { id: 400, assessmentId: null, unitId: 88, dueDate: '2026-03-15', status: 'pending', amountCents: 160000, lateFeeCents: 0, paidAt: null, paymentIntentId: null },
        { id: 12, assessmentId: 7, unitId: 88, dueDate: '2026-03-01', status: 'overdue', amountCents: 30000, lateFeeCents: 2500, paidAt: null, paymentIntentId: null },
        { id: 500, assessmentId: null, unitId: 88, dueDate: '2026-03-01', status: 'pending', amountCents: 160000, lateFeeCents: 0, paidAt: null, paymentIntentId: null },
        { id: 11, assessmentId: 7, unitId: 88, dueDate: '2026-02-01', status: 'paid', amountCents: 30000, lateFeeCents: 0, paidAt: PAID_AT, paymentIntentId: 'pi_1' },
      ]);
    });

    it('each source is ordered dueDate desc, id desc and capped at 200 before the merge', async () => {
      await buildUnitStatement(11, 88, '2026-01-01', '2026-03-31');
      expect(orderByCalls).toEqual([
        { table: assessmentLineItemsTable, keys: [
          { dir: 'desc', column: assessmentLineItemsTable.dueDate },
          { dir: 'desc', column: assessmentLineItemsTable.id },
        ] },
        { table: rentObligationsTable, keys: [
          { dir: 'desc', column: rentObligationsTable.dueDate },
          { dir: 'desc', column: rentObligationsTable.id },
        ] },
      ]);
      expect(limitCalls).toEqual([
        { table: assessmentLineItemsTable, n: 200 },
        { table: rentObligationsTable, n: 200 },
      ]);
    });

    it('the merged list is sliced back to 200, oldest dropped', async () => {
      const day = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
      // 150 of each; rent on even days, assessments on odd days, newest first.
      seed(assessmentLineItemsTable, shuffled(Array.from({ length: 150 }, (_, i) =>
        lineItem({ id: 10_000 - i, unitId: 88, dueDate: day(299 - 2 * i) }))));
      seed(rentObligationsTable, shuffled(Array.from({ length: 150 }, (_, i) =>
        rent({ id: 20_000 - i, unitId: 88, dueDate: day(298 - 2 * i) }))));

      const statement = await buildUnitStatement(11, 88);
      expect(statement.lineItems).toHaveLength(200);
      expect(statement.lineItems[0]?.dueDate).toBe(day(299));
      expect(statement.lineItems[199]?.dueDate).toBe(day(100));
    });

    it.each([
      ['an assessment', 'assessment'],
      ['a rent', 'rent'],
    ])('%s source with more than 200 rows contributes its NEWEST 200', async (_label, which) => {
      const day = (i: number) => new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
      const rows = Array.from({ length: 250 }, (_, i) => ({ id: 1 + i, unitId: 88, dueDate: day(i) }));
      if (which === 'assessment') {
        seed(assessmentLineItemsTable, shuffled(rows.map((r) => lineItem(r))));
        seed(rentObligationsTable, []);
      } else {
        seed(assessmentLineItemsTable, []);
        seed(rentObligationsTable, shuffled(rows.map((r) => rent(r))));
      }
      const statement = await buildUnitStatement(11, 88);
      expect(statement.lineItems).toHaveLength(200);
      expect(statement.lineItems[0]?.dueDate).toBe(day(249));
      expect(statement.lineItems[199]?.dueDate).toBe(day(50));
    });

    it('the merged list is cut to 200 silently: a same-date rent row behind 200 assessment rows vanishes', async () => {
      // CHARACTERIZATION: suspected defect — silent truncation at 200. The merge is a
      // stable sort on dueDate (ids come from two different tables, so no id
      // tiebreak would be meaningful; same-date ties keep concatenation order,
      // assessments first) and is then cut to 200 with no signal to the caller — no
      // `truncated` flag, no count, no cursor. A statement for a unit with more than
      // 200 items in the window just omits the rest: here the one same-date rent
      // obligation disappears behind 200 assessment rows, and the statement still
      // looks complete.
      seed(assessmentLineItemsTable, shuffled(Array.from({ length: 200 }, (_, i) =>
        lineItem({ id: 5000 - i, unitId: 88, dueDate: '2026-03-01' }))));
      seed(rentObligationsTable, [rent({ id: 9999, dueDate: '2026-03-01' })]);

      const statement = await buildUnitStatement(11, 88);
      expect(statement.lineItems).toHaveLength(200);
      expect(statement.lineItems.some((row) => row.id === 9999)).toBe(false);
    });

    it('a missing rent_obligations relation (42P01, direct or as cause) is swallowed', async () => {
      selectErrors.set(rentObligationsTable, Object.assign(new Error('relation does not exist'), { code: '42P01' }));
      const direct = await buildUnitStatement(11, 88, '2026-01-01', '2026-03-31');
      expect(direct.lineItems.map((row) => row.id)).toEqual([12, 11]);

      selectErrors.set(rentObligationsTable, Object.assign(new Error('wrapped'), { cause: { code: '42P01' } }));
      const wrapped = await buildUnitStatement(11, 88, '2026-01-01', '2026-03-31');
      expect(wrapped.lineItems.map((row) => row.id)).toEqual([12, 11]);
    });

    it('any other rent query error propagates', async () => {
      selectErrors.set(rentObligationsTable, Object.assign(new Error('permission denied'), { code: '42501' }));
      await expect(buildUnitStatement(11, 88)).rejects.toThrow('permission denied');
    });
  });

  describe('buildCommunityStatement', () => {
    beforeEach(() => {
      seed(unitsTable, [
        { id: 1, unitNumber: '101' },
        { id: 2, unitNumber: '102' },
        { id: 3, unitNumber: '103' },
      ]);
      seed(assessmentLineItemsTable, shuffled([
        lineItem({ id: 20, unitId: 404, dueDate: '2026-02-01' }), // unit not in the lookup
        lineItem({ id: 21, unitId: 1, dueDate: '2026-03-01', lateFeeCents: 2500 }),
      ]));
      seed(rentObligationsTable, [rent({ id: 600, unitId: 2, dueDate: '2026-03-05', lateFeeCents: 999 })]);
      const balances: Record<number, number> = { 1: 1000, 2: -250, 3: 0 };
      getUnitLedgerBalanceMock.mockImplementation(async (_scoped: unknown, unitId: number) => balances[unitId]);
    });

    it('balance is the sum of per-unit ledger balances over every unit', async () => {
      const statement = await buildCommunityStatement(11, '2026-01-01', '2026-03-31');
      expect(statement.balanceCents).toBe(750);
      expect(getUnitLedgerBalanceMock.mock.calls.map(([, unitId]) => unitId)).toEqual([1, 2, 3]);
      expect(listLedgerEntriesMock).toHaveBeenCalledWith(expect.anything(), {
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        limit: 500,
      });
    });

    it('hydrates unitNumber (\'\' when unknown), forces rent late fee to 0, sorts newest first', async () => {
      const statement = await buildCommunityStatement(11, '2026-01-01', '2026-03-31');
      expect(statement.lineItems.map((row) => [row.id, row.unitNumber, row.lateFeeCents])).toEqual([
        [600, '102', 0],
        [21, '101', 2500],
        [20, '', 0],
      ]);
    });

    it('each source contributes its NEWEST 200 (dueDate desc, id desc before the LIMIT)', async () => {
      const day = (i: number) => new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
      seed(assessmentLineItemsTable, shuffled(Array.from({ length: 250 }, (_, i) =>
        lineItem({ id: 1 + i, unitId: 1, dueDate: day(2 * i + 1) }))));
      seed(rentObligationsTable, shuffled(Array.from({ length: 250 }, (_, i) =>
        rent({ id: 1 + i, unitId: 2, dueDate: day(2 * i) }))));
      const statement = await buildCommunityStatement(11);
      expect(statement.lineItems).toHaveLength(200);
      // Newest 200 of the 500 combined days (0..499) are days 300..499.
      expect(statement.lineItems[0]?.dueDate).toBe(day(499));
      expect(statement.lineItems[199]?.dueDate).toBe(day(300));
      expect(orderByCalls.map((c) => c.keys.map((k) => k.dir))).toEqual([['desc', 'desc'], ['desc', 'desc']]);
    });

    it('a missing rent_obligations relation is swallowed', async () => {
      selectErrors.set(rentObligationsTable, Object.assign(new Error('relation does not exist'), { code: '42P01' }));
      const statement = await buildCommunityStatement(11);
      expect(statement.lineItems.map((row) => row.id)).toEqual([21, 20]);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. Late-fee waiver — waiveLateFeesForUnit
// ═════════════════════════════════════════════════════════════════════════════

describe('7. late-fee waiver (waiveLateFeesForUnit)', () => {
  beforeEach(() => {
    seed(assessmentLineItemsTable, [
      lineItem({ id: 1, unitId: 88, status: 'overdue', lateFeeCents: 2500, dueDate: '2026-01-01' }),
      lineItem({ id: 2, unitId: 88, status: 'overdue', lateFeeCents: 0, dueDate: '2026-02-01' }),
      lineItem({ id: 3, unitId: 88, status: 'pending', lateFeeCents: 1000, dueDate: '2026-03-01' }),
      lineItem({ id: 4, unitId: 88, status: 'overdue', lateFeeCents: -300, dueDate: '2026-03-01' }),
      lineItem({ id: 5, unitId: 88, status: 'paid', lateFeeCents: 4000, dueDate: '2025-12-01' }),
      lineItem({ id: 6, unitId: 77, status: 'overdue', lateFeeCents: 4000, dueDate: '2026-01-01' }),
    ]);
  });

  it('waives only positive fees on this unit\'s pending|overdue items; total is their sum', async () => {
    const result = await waiveLateFeesForUnit(11, 88, 'actor-1', 'req-1');
    expect(result).toEqual({ waivedCount: 2, waivedAmountCents: 3500 });

    const fees = Object.fromEntries(rowsOf(assessmentLineItemsTable).map((r) => [r.id, r.lateFeeCents]));
    expect(fees).toEqual({ 1: 0, 2: 0, 3: 0, 4: -300, 5: 4000, 6: 4000 });
    expect(logAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
      newValues: { waivedCount: 2, waivedAmountCents: 3500 },
    }));
  });

  it('posts one negative adjustment per waived item (-|fee|)', async () => {
    await waiveLateFeesForUnit(11, 88, 'actor-1');
    expect(postLedgerEntryMock.mock.calls.map(([, entry]) => {
      const e = entry as Row;
      return [e.entryType, e.amountCents, e.sourceId, e.sourceType];
    })).toEqual([
      ['adjustment', -2500, '1', 'manual'],
      ['adjustment', -1000, '3', 'manual'],
    ]);
  });

  it('nothing to waive: zeros, no writes, no audit', async () => {
    const result = await waiveLateFeesForUnit(11, 12345, 'actor-1');
    expect(result).toEqual({ waivedCount: 0, waivedAmountCents: 0 });
    expect(updateMock).not.toHaveBeenCalled();
    expect(postLedgerEntryMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. Statement date window — resolveStatementDateRange
// ═════════════════════════════════════════════════════════════════════════════

describe('8. statement date window (resolveStatementDateRange)', () => {
  beforeEach(() => {
    setNow('2026-03-10T12:00:00.000Z');
  });

  it('defaults to the 90 days ending local today', () => {
    expect(resolveStatementDateRange(null, null)).toEqual({ startDate: '2025-12-10', endDate: '2026-03-10' });
  });

  it('fills whichever side is missing from the default', () => {
    expect(resolveStatementDateRange('2026-01-01', null)).toEqual({ startDate: '2026-01-01', endDate: '2026-03-10' });
    expect(resolveStatementDateRange(null, '2026-02-01')).toEqual({ startDate: '2025-12-10', endDate: '2026-02-01' });
  });

  it('start == end is allowed; start > end is a 400', () => {
    expect(resolveStatementDateRange('2026-02-01', '2026-02-01')).toEqual({ startDate: '2026-02-01', endDate: '2026-02-01' });
    expect(() => resolveStatementDateRange('2026-02-02', '2026-02-01')).toThrow(
      'startDate must be less than or equal to endDate',
    );
  });

  it('an explicit start after the DEFAULT end is also a 400', () => {
    expect(() => resolveStatementDateRange('2026-03-11', null)).toThrow(
      'startDate must be less than or equal to endDate',
    );
  });

  describe('in America/New_York', () => {
    inTimeZone('America/New_York', 19);

    it('"today" is the process-local date', () => {
      // Pinned, not flagged: 02:00 UTC on March 10 is 22:00 EDT on March 9, so the
      // default window ends on the 9th. Only matters on a non-UTC host.
      setNow('2026-03-10T02:00:00.000Z');
      expect(resolveStatementDateRange(null, null)).toEqual({ startDate: '2025-12-09', endDate: '2026-03-09' });
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. Line generation idempotency — generateAssessmentLineItemsForCommunity
// ═════════════════════════════════════════════════════════════════════════════

describe('9. line-item generation idempotency (generateAssessmentLineItemsForCommunity)', () => {
  beforeEach(() => {
    seed(assessmentsTable, [assessment({ id: 7, frequency: 'monthly', dueDay: 1, amountCents: 30000 })]);
    seed(unitsTable, [{ id: 1 }, { id: 2 }, { id: 3 }]);
    setNow('2026-04-10T12:00:00.000Z');
  });

  it('skips units that already have an item for (assessmentId, dueDate); posts ledger only for new ones', async () => {
    seed(assessmentLineItemsTable, [
      lineItem({ id: 1, assessmentId: 7, unitId: 1, dueDate: '2026-04-01' }),
      lineItem({ id: 2, assessmentId: 7, unitId: 2, dueDate: '2026-04-01' }),
      // Same units, other period / other assessment: do not count as existing.
      lineItem({ id: 3, assessmentId: 7, unitId: 3, dueDate: '2026-03-01' }),
      lineItem({ id: 4, assessmentId: 8, unitId: 3, dueDate: '2026-04-01' }),
    ]);

    const result = await generateAssessmentLineItemsForCommunity(11, 7, 'actor-1');
    expect(result).toEqual({ insertedCount: 1, skippedCount: 2, dueDate: '2026-04-01' });
    expect(insertMock).toHaveBeenCalledWith(assessmentLineItemsTable, [
      { assessmentId: 7, unitId: 3, amountCents: 30000, dueDate: '2026-04-01', status: 'pending', lateFeeCents: 0 },
    ]);
    expect(postLedgerEntryMock).toHaveBeenCalledTimes(1);
    expect(postLedgerEntryMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      entryType: 'assessment',
      amountCents: 30000,
      unitId: 3,
      description: 'Monthly dues (2026-04-01)',
    }));
  });

  it('a second run for the same period inserts nothing and posts nothing', async () => {
    seed(assessmentLineItemsTable, []);
    const first = await generateAssessmentLineItemsForCommunity(11, 7, 'actor-1');
    expect(first).toEqual({ insertedCount: 3, skippedCount: 0, dueDate: '2026-04-01' });

    insertMock.mockClear();
    postLedgerEntryMock.mockClear();
    logAuditEventMock.mockClear();
    const second = await generateAssessmentLineItemsForCommunity(11, 7, 'actor-1');
    expect(second).toEqual({ insertedCount: 0, skippedCount: 3, dueDate: '2026-04-01' });
    expect(insertMock).not.toHaveBeenCalled();
    expect(postLedgerEntryMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('idempotency is keyed on the billing period: changing dueDay mid-period does not charge the period twice', async () => {
    // Fixed 2026-09-30 (was a suspected defect: the "already generated" set was
    // looked up by (assessmentId, dueDate), so editing dueDay from 1 to 15 after
    // April's run made the next run charge every unit a second April installment).
    // Now guaranteed: the lookup is by the assessment's PERIOD — the calendar month
    // for monthly — so any April item for this assessment counts as April billed.
    // App-level only: assessment_line_items still has no unique index, so two
    // concurrent generations can each read an empty set (deferred — roadmap 3.T2).
    seed(assessmentLineItemsTable, [1, 2, 3].map((unitId) =>
      lineItem({ id: unitId, assessmentId: 7, unitId, dueDate: '2026-04-01' })));
    seed(assessmentsTable, [assessment({ id: 7, frequency: 'monthly', dueDay: 15, amountCents: 30000 })]);

    const result = await generateAssessmentLineItemsForCommunity(11, 7, 'actor-1');
    expect(result).toEqual({ insertedCount: 0, skippedCount: 3, dueDate: '2026-04-15' });
    expect(insertMock).not.toHaveBeenCalled();
    expect(postLedgerEntryMock).not.toHaveBeenCalled();
  });

  it('monthly period bounds: the last day of the previous month and the first of the next do not count', async () => {
    seed(assessmentLineItemsTable, [
      lineItem({ id: 1, assessmentId: 7, unitId: 1, dueDate: '2026-03-31' }),
      lineItem({ id: 2, assessmentId: 7, unitId: 2, dueDate: '2026-05-01' }),
      lineItem({ id: 3, assessmentId: 7, unitId: 3, dueDate: '2026-04-30' }),
    ]);
    const result = await generateAssessmentLineItemsForCommunity(11, 7, 'actor-1');
    expect(result).toEqual({ insertedCount: 2, skippedCount: 1, dueDate: '2026-04-01' });
  });

  it('an override date inside an already-billed month is skipped; one in another month is billed', async () => {
    seed(assessmentLineItemsTable, [1, 2, 3].map((unitId) =>
      lineItem({ id: unitId, assessmentId: 7, unitId, dueDate: '2026-04-01' })));
    const sameMonth = await generateAssessmentLineItemsForCommunity(11, 7, 'actor-1', '2026-04-20');
    expect(sameMonth).toEqual({ insertedCount: 0, skippedCount: 3, dueDate: '2026-04-20' });
    const nextMonth = await generateAssessmentLineItemsForCommunity(11, 7, 'actor-1', '2026-05-20');
    expect(nextMonth).toEqual({ insertedCount: 3, skippedCount: 0, dueDate: '2026-05-20' });
  });

  it.each([
    // [label, frequency, startDate, existing dueDate, now, expected inserted]
    ['quarterly: an item in the quarter\'s first month blocks a mid-quarter run', 'quarterly', '2025-05-01', '2026-02-01', '2026-03-10T12:00:00.000Z', 0],
    ['quarterly: the quarter window is anchored on the start month (Feb-Apr), so a Jan item does not block March', 'quarterly', '2025-05-01', '2026-01-01', '2026-03-10T12:00:00.000Z', 3],
    ['quarterly: the next quarter is a new period', 'quarterly', '2025-05-01', '2026-02-01', '2026-05-10T12:00:00.000Z', 3],
    ['annual: an item earlier in the assessment year blocks a later run', 'annual', '2025-09-10', '2025-09-01', '2026-08-10T12:00:00.000Z', 0],
    ['annual: the next assessment year is a new period', 'annual', '2025-09-10', '2025-09-01', '2026-09-10T12:00:00.000Z', 3],
  ])('%s', async (_label, frequency, startDate, existingDueDate, nowIso, expectedInserted) => {
    seed(assessmentsTable, [assessment({ id: 7, frequency, startDate, dueDay: 1, amountCents: 30000 })]);
    seed(assessmentLineItemsTable, [1, 2, 3].map((unitId) =>
      lineItem({ id: unitId, assessmentId: 7, unitId, dueDate: existingDueDate })));
    setNow(nowIso);
    const result = await generateAssessmentLineItemsForCommunity(11, 7, 'actor-1');
    expect(result.insertedCount).toBe(expectedInserted);
  });

  it('one_time keeps exact-dueDate idempotency', async () => {
    seed(assessmentsTable, [assessment({ id: 7, frequency: 'one_time', startDate: '2026-04-20', amountCents: 30000 })]);
    seed(assessmentLineItemsTable, [
      lineItem({ id: 1, assessmentId: 7, unitId: 1, dueDate: '2026-04-20' }),
      lineItem({ id: 2, assessmentId: 7, unitId: 2, dueDate: '2026-04-01' }),
    ]);
    const result = await generateAssessmentLineItemsForCommunity(11, 7, 'actor-1');
    expect(result).toEqual({ insertedCount: 2, skippedCount: 1, dueDate: '2026-04-20' });
  });

  it('a community with no units is a 422', async () => {
    seed(unitsTable, []);
    await expect(generateAssessmentLineItemsForCommunity(11, 7, 'actor-1')).rejects.toMatchObject({
      statusCode: 422,
      message: 'Cannot generate line items: no units found for this community',
    });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('an unknown assessment is a 404', async () => {
    await expect(generateAssessmentLineItemsForCommunity(11, 999, 'actor-1')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
