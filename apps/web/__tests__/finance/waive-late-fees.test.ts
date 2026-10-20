/**
 * waiveLateFeesForUnit — compare-and-swap on the fee it read (audit M-05).
 *
 * The waiver reads the unit's pending/overdue rows with a positive late fee,
 * then zeroes each one and posts a −fee ledger adjustment. Before the fix the
 * UPDATE matched by id alone, so a double-click or two admins waiving at once
 * each posted a credit for the same fee. The UPDATE now also requires the fee
 * and status it read; a row another waiver already zeroed matches nothing, and
 * then nothing is posted or counted.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createScopedClientMock,
  postLedgerEntryMock,
  logAuditEventMock,
  selectFromMock,
  updateMock,
  assessmentLineItemsTable,
  eqMock,
  andMock,
  inArrayMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  postLedgerEntryMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  selectFromMock: vi.fn(),
  updateMock: vi.fn(),
  assessmentLineItemsTable: {
    id: Symbol('assessment_line_items.id'),
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
  assessments: {},
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

import { waiveLateFeesForUnit } from '../../src/lib/services/finance-service';

const LINE_ITEM = {
  id: 44,
  assessmentId: 7,
  communityId: 11,
  unitId: 88,
  amountCents: 10_000,
  lateFeeCents: 2_500,
  status: 'overdue',
};

describe('waiveLateFeesForUnit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createScopedClientMock.mockImplementation(() => ({
      selectFrom: selectFromMock,
      update: updateMock,
    }));
    selectFromMock.mockResolvedValue([LINE_ITEM]);
    postLedgerEntryMock.mockResolvedValue({ id: 1 });
    logAuditEventMock.mockResolvedValue(undefined);
  });

  it('zeroes the fee only where it still holds the value read, then posts one −fee credit', async () => {
    updateMock.mockResolvedValue([{ ...LINE_ITEM, lateFeeCents: 0 }]);

    const result = await waiveLateFeesForUnit(11, 88, 'actor-1', 'req-1');

    expect(result).toEqual({ waivedCount: 1, waivedAmountCents: 2_500 });
    expect(updateMock).toHaveBeenCalledWith(
      assessmentLineItemsTable,
      { lateFeeCents: 0 },
      {
        and: [
          { column: assessmentLineItemsTable.id, value: 44 },
          { column: assessmentLineItemsTable.lateFeeCents, value: 2_500 },
          { column: assessmentLineItemsTable.status, values: ['pending', 'overdue'] },
        ],
      },
    );
    expect(postLedgerEntryMock).toHaveBeenCalledTimes(1);
    expect(postLedgerEntryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entryType: 'adjustment', amountCents: -2_500, sourceId: '44' }),
    );
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ newValues: { waivedCount: 1, waivedAmountCents: 2_500 } }),
    );
  });

  it('a concurrent waiver already zeroed the fee: the update matches nothing, so no credit is posted', async () => {
    updateMock.mockResolvedValue([]);

    const result = await waiveLateFeesForUnit(11, 88, 'actor-1', 'req-1');

    expect(result).toEqual({ waivedCount: 0, waivedAmountCents: 0 });
    expect(postLedgerEntryMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('counts only the rows it won when two items are read and one loses the race', async () => {
    const second = { ...LINE_ITEM, id: 45, lateFeeCents: 1_000 };
    selectFromMock.mockResolvedValue([LINE_ITEM, second]);
    updateMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...second, lateFeeCents: 0 }]);

    const result = await waiveLateFeesForUnit(11, 88, 'actor-1');

    expect(result).toEqual({ waivedCount: 1, waivedAmountCents: 1_000 });
    expect(postLedgerEntryMock).toHaveBeenCalledTimes(1);
    expect(postLedgerEntryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amountCents: -1_000, sourceId: '45' }),
    );
  });
});
