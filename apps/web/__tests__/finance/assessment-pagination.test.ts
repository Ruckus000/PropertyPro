import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createScopedClientMock,
  selectFromMock,
  orderByMock,
  limitMock,
  assessmentsTable,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  selectFromMock: vi.fn(),
  orderByMock: vi.fn(),
  limitMock: vi.fn(),
  assessmentsTable: {
    id: Symbol('assessments.id'),
    isActive: Symbol('assessments.is_active'),
    createdAt: Symbol('assessments.created_at'),
  },
}));

vi.mock('@propertypro/db', () => ({
  assessmentLineItems: {},
  assessments: assessmentsTable,
  clampPageSize: (input: number | null | undefined) => {
    if (input === null || input === undefined) return 50;
    if (!Number.isFinite(input) || !Number.isInteger(input)) return 50;
    if (input < 1) return 1;
    if (input > 100) return 100;
    return input;
  },
  communities: {},
  createScopedClient: createScopedClientMock,
  financeStripeWebhookEvents: {},
  getUnitLedgerBalance: vi.fn(),
  leases: {},
  listLedgerEntries: vi.fn(),
  logAuditEvent: vi.fn(),
  postLedgerEntry: vi.fn(),
  rentObligations: {},
  rentPayments: {},
  stripeConnectedAccounts: {},
  units: {},
  users: {},
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...clauses: unknown[]) => ({ __and: clauses }),
  asc: (col: unknown) => ({ __asc: col }),
  desc: (col: unknown) => ({ __desc: col }),
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  gte: (col: unknown, val: unknown) => ({ __gte: { col, val } }),
  inArray: (col: unknown, vals: unknown[]) => ({ __inArray: { col, vals } }),
  lt: (col: unknown, val: unknown) => ({ __lt: { col, val } }),
  lte: (col: unknown, val: unknown) => ({ __lte: { col, val } }),
  or: (...clauses: unknown[]) => ({ __or: clauses }),
}));

vi.mock('@/lib/services/stripe-service', () => ({
  getStripeClient: vi.fn(),
}));

vi.mock('@/lib/services/violations-service', () => ({
  markMatchingViolationFinePaid: vi.fn(),
}));

vi.mock('@/lib/services/oauth-state', () => ({
  signPayload: vi.fn(),
  verifySignature: vi.fn(),
}));

vi.mock('@/lib/finance/common', () => ({
  requirePaymentsEnabled: vi.fn(),
  centsToDollars: (cents: number) => cents / 100,
  parseDateOnly: (value: string) => value,
}));

vi.mock('@/lib/units/actor-units', () => ({
  listActorUnitIds: vi.fn(),
}));

vi.mock('@/lib/utils/finance-pdf', () => ({
  generateCommunityFinanceStatementPdf: vi.fn(),
  generateFinanceStatementPdf: vi.fn(),
}));

vi.mock('@/lib/services/csv-export', () => ({
  generateCSV: vi.fn(),
}));

vi.mock('@propertypro/email', () => ({
  AssessmentPaymentReceivedEmail: vi.fn(),
  sendEmail: vi.fn(),
}));

import { paginateAssessmentsForCommunity } from '../../src/lib/services/finance-service';

function encodeCursor(payload: { isActive: boolean; createdAt: string; id: number }) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function row(id: number, isActive: boolean, createdAt: string) {
  return {
    id,
    communityId: 42,
    title: `Assessment ${id}`,
    description: null,
    amountCents: 35000,
    frequency: 'monthly',
    dueDay: 1,
    lateFeeAmountCents: 0,
    lateFeeDaysGrace: 0,
    startDate: '2026-01-01',
    endDate: null,
    isActive,
    createdByUserId: null,
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  orderByMock.mockReturnValue({ limit: limitMock });
  selectFromMock.mockReturnValue({ orderBy: orderByMock });
  createScopedClientMock.mockReturnValue({ selectFrom: selectFromMock });
});

describe('paginateAssessmentsForCommunity', () => {
  it('preserves active-first newest order with id tiebreaker and emits an opaque cursor', async () => {
    limitMock.mockResolvedValueOnce([
      row(5, true, '2026-05-01T12:00:00.000Z'),
      row(4, true, '2026-04-01T12:00:00.000Z'),
      row(3, false, '2026-03-01T12:00:00.000Z'),
    ]);

    const result = await paginateAssessmentsForCommunity(42, { pageSize: 2 });

    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(selectFromMock).toHaveBeenCalledWith(assessmentsTable, {}, undefined);
    expect(orderByMock).toHaveBeenCalledWith(
      { __desc: assessmentsTable.isActive },
      { __desc: assessmentsTable.createdAt },
      { __desc: assessmentsTable.id },
    );
    expect(limitMock).toHaveBeenCalledWith(3);
    expect(result.data.map((assessment) => assessment.id)).toEqual([5, 4]);
    expect(result.pagination.hasMore).toBe(true);

    const decoded = JSON.parse(
      Buffer.from(result.pagination.nextCursor!, 'base64url').toString('utf8'),
    );
    expect(decoded).toEqual({
      isActive: true,
      createdAt: '2026-04-01T12:00:00.000Z',
      id: 4,
    });
  });

  it('uses a lexicographic cursor predicate that exactly matches the order keys', async () => {
    limitMock.mockResolvedValueOnce([row(2, true, '2026-04-01T12:00:00.000Z')]);

    await paginateAssessmentsForCommunity(42, {
      cursor: encodeCursor({
        isActive: true,
        createdAt: '2026-04-01T12:00:00.000Z',
        id: 4,
      }),
      pageSize: 10,
    });

    expect(selectFromMock.mock.calls[0]![2]).toEqual({
      __or: [
        { __lt: { col: assessmentsTable.isActive, val: true } },
        {
          __and: [
            { __eq: { col: assessmentsTable.isActive, val: true } },
            {
              __or: [
                { __lt: { col: assessmentsTable.createdAt, val: new Date('2026-04-01T12:00:00.000Z') } },
                {
                  __and: [
                    { __eq: { col: assessmentsTable.createdAt, val: new Date('2026-04-01T12:00:00.000Z') } },
                    { __lt: { col: assessmentsTable.id, val: 4 } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('treats malformed cursors as first page and clamps page size', async () => {
    limitMock.mockResolvedValueOnce([row(1, true, '2026-05-01T12:00:00.000Z')]);

    const result = await paginateAssessmentsForCommunity(42, {
      cursor: 'not-json',
      pageSize: 500,
    });

    expect(selectFromMock).toHaveBeenCalledWith(assessmentsTable, {}, undefined);
    expect(limitMock).toHaveBeenCalledWith(101);
    expect(result.pagination).toEqual({
      nextCursor: null,
      hasMore: false,
      pageSize: 100,
    });
  });

  it('treats decoded non-object cursors as first page', async () => {
    limitMock.mockResolvedValueOnce([row(1, true, '2026-05-01T12:00:00.000Z')]);

    await paginateAssessmentsForCommunity(42, {
      cursor: Buffer.from(JSON.stringify(123), 'utf8').toString('base64url'),
      pageSize: 10,
    });

    expect(selectFromMock).toHaveBeenCalledWith(assessmentsTable, {}, undefined);
  });
});
