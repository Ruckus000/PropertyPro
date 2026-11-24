/**
 * deleteAssessmentForCommunity — what deleting an assessment does to its charges.
 *
 * Before the fix only the `assessments` row was soft-deleted: every line item it
 * generated stayed `pending`/`overdue` and its ledger charge stayed live, so the
 * units kept owing the money and the overdue/late-fee crons kept acting on it
 * (seen in production on 2026-11-24 with a $1 test assessment).
 *
 * The rule: unpaid charges (`pending`/`overdue`) become `waived` and each gets a
 * reversing `adjustment` entry for what it carried (amount + late fee), in one
 * transaction with the soft-delete. Paid charges are left alone: deleting an
 * assessment is not a refund.
 *
 * The update mock applies the WHERE it is given to an in-memory set of rows, so
 * a status predicate that stopped excluding `paid` would show up here as a
 * waived, credited paid charge.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createScopedClientMock,
  postLedgerEntryMock,
  logAuditEventMock,
  assessmentsTable,
  assessmentLineItemsTable,
  eqMock,
  andMock,
  inArrayMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  postLedgerEntryMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  assessmentsTable: {
    id: Symbol('assessments.id'),
  },
  assessmentLineItemsTable: {
    id: Symbol('assessment_line_items.id'),
    assessmentId: Symbol('assessment_line_items.assessment_id'),
    unitId: Symbol('assessment_line_items.unit_id'),
    status: Symbol('assessment_line_items.status'),
    lateFeeCents: Symbol('assessment_line_items.late_fee_cents'),
  },
  eqMock: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  andMock: vi.fn((...args: unknown[]) => ({ and: args })),
  inArrayMock: vi.fn((column: unknown, values: unknown[]) => ({ column, values })),
}));

vi.mock('@propertypro/db', () => ({
  assessmentLineItems: assessmentLineItemsTable,
  assessments: assessmentsTable,
  communities: {},
  createScopedClient: createScopedClientMock,
  financeStripeWebhookEvents: {},
  getUnitLedgerBalance: vi.fn(),
  listLedgerEntries: vi.fn(),
  logAuditEvent: logAuditEventMock,
  postLedgerEntry: postLedgerEntryMock,
  rentObligations: {},
  rentPayments: {},
  stripeConnectedAccounts: {},
  units: {},
  userRoles: {},
  users: {},
  violationFines: {},
  violations: {},
}));

vi.mock('@propertypro/email', () => ({
  AssessmentPaymentReceivedEmail: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock('@propertypro/db/filters', () => ({
  and: andMock,
  asc: vi.fn(),
  desc: vi.fn(),
  eq: eqMock,
  gte: vi.fn(),
  inArray: inArrayMock,
  lte: vi.fn(),
}));

vi.mock('@/lib/services/stripe-service', () => ({
  getStripeClient: vi.fn(),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(() => ({})),
}));

import { deleteAssessmentForCommunity } from '../../src/lib/services/finance-service';

type Row = Record<string, unknown> & { id: number; status: string };
type Predicate = { and: Predicate[] } | { column: symbol; value: unknown } | { column: symbol; values: unknown[] };

const COLUMN_TO_KEY = new Map<symbol, string>([
  [assessmentLineItemsTable.id, 'id'],
  [assessmentLineItemsTable.assessmentId, 'assessmentId'],
  [assessmentLineItemsTable.unitId, 'unitId'],
  [assessmentLineItemsTable.status, 'status'],
  [assessmentLineItemsTable.lateFeeCents, 'lateFeeCents'],
]);

function matches(row: Row, where: Predicate | undefined): boolean {
  if (!where) return true;
  if ('and' in where) return where.and.every((clause) => matches(row, clause));
  const key = COLUMN_TO_KEY.get(where.column);
  if (!key) throw new Error('predicate on a column this test does not model');
  if ('values' in where) return where.values.includes(row[key]);
  return row[key] === where.value;
}

const ASSESSMENT = {
  id: 7,
  communityId: 11,
  title: 'Roof special assessment',
  amountCents: 10_000,
  frequency: 'one_time',
};

function lineItem(id: number, unitId: number, status: string, lateFeeCents = 0): Row {
  return { id, assessmentId: 7, communityId: 11, unitId, amountCents: 10_000, lateFeeCents, status };
}

let lineItems: Row[];
let committed: boolean;
let tx: {
  selectFrom: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  softDelete: ReturnType<typeof vi.fn>;
  logAudit: ReturnType<typeof vi.fn>;
};

describe('deleteAssessmentForCommunity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    committed = false;
    lineItems = [
      lineItem(101, 1, 'pending'),
      lineItem(102, 2, 'overdue', 2_500),
      lineItem(103, 3, 'paid'),
    ];
    const client = {
      selectFrom: vi.fn().mockResolvedValue([ASSESSMENT]),
      update: vi.fn(async (_table: unknown, values: Record<string, unknown>, where: Predicate) => {
        const hit = lineItems.filter((row) => matches(row, where));
        for (const row of hit) Object.assign(row, values);
        return hit.map((row) => ({ ...row }));
      }),
      softDelete: vi.fn().mockResolvedValue([{ id: 7 }]),
      logAudit: vi.fn().mockResolvedValue(undefined),
    };
    tx = client;
    createScopedClientMock.mockImplementation(() => ({
      ...client,
      transaction: async <T>(fn: (inner: typeof client) => Promise<T>) => {
        const result = await fn(client);
        committed = true;
        return result;
      },
    }));
    postLedgerEntryMock.mockResolvedValue({ id: 1 });
    logAuditEventMock.mockResolvedValue(undefined);
  });

  it('waives the pending and overdue charges and leaves the paid one alone', async () => {
    await deleteAssessmentForCommunity(11, 7, 'actor-1', 'req-1');

    expect(lineItems.map((row) => [row.id, row.status])).toEqual([
      [101, 'waived'],
      [102, 'waived'],
      [103, 'paid'],
    ]);
  });

  it('reverses each cancelled charge on the ledger, late fee included, and posts nothing for the paid one', async () => {
    await deleteAssessmentForCommunity(11, 7, 'actor-1', 'req-1');

    expect(postLedgerEntryMock).toHaveBeenCalledTimes(2);
    expect(postLedgerEntryMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        entryType: 'adjustment',
        amountCents: -10_000,
        sourceType: 'assessment',
        sourceId: '101',
        unitId: 1,
        createdByUserId: 'actor-1',
        requestId: 'req-1',
      }),
    );
    expect(postLedgerEntryMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        entryType: 'adjustment',
        amountCents: -12_500,
        sourceType: 'assessment',
        sourceId: '102',
        unitId: 2,
      }),
    );
    expect(postLedgerEntryMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sourceId: '103' }),
    );
  });

  it('soft-deletes the assessment and audits it inside the same transaction', async () => {
    const result = await deleteAssessmentForCommunity(11, 7, 'actor-1', 'req-1');

    expect(committed).toBe(true);
    expect(tx.softDelete).toHaveBeenCalledWith(assessmentsTable, {
      column: assessmentsTable.id,
      value: 7,
    });
    expect(tx.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'delete',
        resourceType: 'assessment',
        resourceId: '7',
        oldValues: ASSESSMENT,
        newValues: { cancelledCount: 2, cancelledAmountCents: 22_500 },
      }),
    );
    // The audit row must commit or roll back with the writes it describes.
    expect(logAuditEventMock).not.toHaveBeenCalled();
    expect(result).toEqual({ cancelledCount: 2, cancelledAmountCents: 22_500 });
  });

  it('a ledger failure aborts the whole delete: the assessment is not soft-deleted', async () => {
    postLedgerEntryMock.mockRejectedValueOnce(new Error('ledger insert failed'));

    await expect(deleteAssessmentForCommunity(11, 7, 'actor-1')).rejects.toThrow('ledger insert failed');
    expect(committed).toBe(false);
    expect(tx.softDelete).not.toHaveBeenCalled();
  });

  it('an assessment whose charges are all paid is deleted with nothing cancelled', async () => {
    lineItems = [lineItem(103, 3, 'paid')];

    const result = await deleteAssessmentForCommunity(11, 7, 'actor-1');

    expect(result).toEqual({ cancelledCount: 0, cancelledAmountCents: 0 });
    expect(postLedgerEntryMock).not.toHaveBeenCalled();
    expect(lineItems[0]!.status).toBe('paid');
    expect(tx.softDelete).toHaveBeenCalledTimes(1);
  });

  it('only touches this assessment’s charges', async () => {
    lineItems.push({ ...lineItem(201, 1, 'pending'), assessmentId: 8 });

    await deleteAssessmentForCommunity(11, 7, 'actor-1');

    expect(lineItems.find((row) => row.id === 201)!.status).toBe('pending');
    expect(postLedgerEntryMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sourceId: '201' }),
    );
  });

  it('a missing assessment is a 404 and touches nothing', async () => {
    createScopedClientMock.mockImplementation(() => ({
      ...tx,
      selectFrom: vi.fn().mockResolvedValue([]),
      transaction: vi.fn(),
    }));

    await expect(deleteAssessmentForCommunity(11, 7, 'actor-1')).rejects.toThrow('Assessment not found');
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.softDelete).not.toHaveBeenCalled();
  });
});
