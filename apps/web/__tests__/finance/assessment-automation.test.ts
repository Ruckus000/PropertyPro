import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock all external dependencies
const mockSelectFrom = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockPostLedgerEntry = vi.fn();

const mockUnscopedDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
};

vi.mock('@propertypro/db', () => ({
  assessmentLineItems: { id: 'id', status: 'status', dueDate: 'dueDate', lateFeeCents: 'lateFeeCents', assessmentId: 'assessmentId', unitId: 'unitId', amountCents: 'amountCents', communityId: 'communityId' },
  assessments: { id: 'id', isActive: 'isActive', frequency: 'frequency', startDate: 'startDate', endDate: 'endDate', lateFeeAmountCents: 'lateFeeAmountCents', lateFeeDaysGrace: 'lateFeeDaysGrace', title: 'title' },
  communities: { id: 'id', name: 'name', deletedAt: 'deletedAt' },
  units: { id: 'id', communityId: 'communityId', deletedAt: 'deletedAt' },
  users: { id: 'id', email: 'email', fullName: 'fullName', deletedAt: 'deletedAt' },
  userRoles: { userId: 'userId', communityId: 'communityId', role: 'role', unitId: 'unitId' },
  createScopedClient: vi.fn(() => ({
    selectFrom: mockSelectFrom,
    update: mockUpdate,
    insert: mockInsert,
    communityId: 1,
  })),
  postLedgerEntry: mockPostLedgerEntry,
}));

vi.mock('@propertypro/db/filters', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  ne: vi.fn((a: unknown, b: unknown) => ({ ne: [a, b] })),
  lt: vi.fn((a: unknown, b: unknown) => ({ lt: [a, b] })),
  lte: vi.fn((a: unknown, b: unknown) => ({ lte: [a, b] })),
  inArray: vi.fn((a: unknown, b: unknown) => ({ inArray: [a, b] })),
  isNull: vi.fn((a: unknown) => ({ isNull: a })),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(() => mockUnscopedDb),
}));

vi.mock('@/lib/services/finance-service', () => ({
  generateAssessmentLineItemsForCommunity: vi.fn(),
}));

describe('assessment-automation-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: return one community with online payments ENABLED.
    //
    // `processLateFees` skips any community whose `assessmentPaymentsEnabled`
    // gate is off — charging a penalty for non-payment while the platform offers
    // no way to pay is the thing that gate exists to prevent. Most tests here
    // exercise fee CALCULATION, so they opt in; the gate itself is covered by
    // its own block below.
    // See docs/audits/2026-08-09-legal-risk-audit.md §2a.
    mockUnscopedDb.where.mockResolvedValue([
      {
        id: 1,
        name: 'Test Community',
        communitySettings: { assessmentPaymentsEnabled: true },
      },
    ]);
  });

  describe('processOverdueTransitions', () => {
    it('transitions pending items past due date to overdue', async () => {
      const { processOverdueTransitions } = await import(
        '../../src/lib/services/assessment-automation-service'
      );

      mockSelectFrom.mockResolvedValueOnce([
        { id: 10, unitId: 1, amountCents: 35000, dueDate: '2026-01-01' },
      ]);
      mockUpdate.mockResolvedValue(undefined);

      const summary = await processOverdueTransitions(new Date('2026-03-01'));

      expect(summary.communitiesScanned).toBe(1);
      expect(summary.itemsTransitioned).toBe(1);
      expect(summary.errors).toBe(0);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.anything(),
        { status: 'overdue' },
        expect.anything(),
      );
    });

    it('skips communities with no overdue items', async () => {
      const { processOverdueTransitions } = await import(
        '../../src/lib/services/assessment-automation-service'
      );

      mockSelectFrom.mockResolvedValueOnce([]);

      const summary = await processOverdueTransitions(new Date('2026-03-01'));

      expect(summary.communitiesScanned).toBe(1);
      expect(summary.itemsTransitioned).toBe(0);
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('processLateFees', () => {
    it('applies late fee when grace period has elapsed', async () => {
      const { processLateFees } = await import(
        '../../src/lib/services/assessment-automation-service'
      );

      // First selectFrom: overdue items with no late fee
      mockSelectFrom.mockResolvedValueOnce([
        { id: 10, assessmentId: 1, unitId: 1, dueDate: '2026-01-01', lateFeeCents: 0 },
      ]);
      // Second selectFrom: assessment with late fee config
      mockSelectFrom.mockResolvedValueOnce([
        { id: 1, lateFeeAmountCents: 2500, lateFeeDaysGrace: 15 },
      ]);
      mockUpdate.mockResolvedValue(undefined);
      mockPostLedgerEntry.mockResolvedValue(undefined);

      const summary = await processLateFees(new Date('2026-03-01'));

      expect(summary.communitiesScanned).toBe(1);
      expect(summary.feesApplied).toBe(1);
      expect(summary.totalFeeCents).toBe(2500);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.anything(),
        { lateFeeCents: 2500 },
        expect.anything(),
      );
    });

    it('skips items within grace period', async () => {
      const { processLateFees } = await import(
        '../../src/lib/services/assessment-automation-service'
      );

      // Item overdue by only 5 days, grace period is 15
      mockSelectFrom.mockResolvedValueOnce([
        { id: 10, assessmentId: 1, unitId: 1, dueDate: '2026-02-24', lateFeeCents: 0 },
      ]);
      mockSelectFrom.mockResolvedValueOnce([
        { id: 1, lateFeeAmountCents: 2500, lateFeeDaysGrace: 15 },
      ]);

      const summary = await processLateFees(new Date('2026-03-01'));

      expect(summary.feesApplied).toBe(0);
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('processRecurringAssessments', () => {
    it('returns zero totals when no active recurring assessments exist', async () => {
      const { processRecurringAssessments } = await import(
        '../../src/lib/services/assessment-automation-service'
      );

      // Community exists but has no active recurring assessments
      mockSelectFrom.mockResolvedValueOnce([]);

      const summary = await processRecurringAssessments(new Date('2026-03-01'));

      expect(summary.communitiesScanned).toBe(1);
      expect(summary.assessmentsProcessed).toBe(0);
      expect(summary.totalInserted).toBe(0);
      expect(summary.totalSkipped).toBe(0);
      expect(summary.errors).toBe(0);
    });

    it('generates line items for each unit in a community with active assessment', async () => {
      const { processRecurringAssessments } = await import(
        '../../src/lib/services/assessment-automation-service'
      );
      const { generateAssessmentLineItemsForCommunity } = await import(
        '../../src/lib/services/finance-service'
      );

      // Active recurring assessment (monthly, started Jan 2026)
      mockSelectFrom.mockResolvedValueOnce([
        { id: 5, frequency: 'monthly', startDate: '2026-01-01', endDate: null, isActive: true },
      ]);

      // generateAssessmentLineItemsForCommunity returns inserted/skipped counts
      // (plus the period's dueDate, which processRecurringAssessments ignores).
      vi.mocked(generateAssessmentLineItemsForCommunity).mockResolvedValueOnce({
        insertedCount: 4,
        skippedCount: 0,
        dueDate: '2026-03-01',
      });

      const summary = await processRecurringAssessments(new Date('2026-03-01'));

      expect(summary.communitiesScanned).toBe(1);
      expect(summary.assessmentsProcessed).toBe(1);
      expect(summary.totalInserted).toBe(4);
      expect(summary.totalSkipped).toBe(0);
      expect(summary.errors).toBe(0);
      expect(generateAssessmentLineItemsForCommunity).toHaveBeenCalledWith(1, 5, null);
    });

    it('skips assessments that already have line items for current period (idempotency)', async () => {
      const { processRecurringAssessments } = await import(
        '../../src/lib/services/assessment-automation-service'
      );
      const { generateAssessmentLineItemsForCommunity } = await import(
        '../../src/lib/services/finance-service'
      );

      mockSelectFrom.mockResolvedValueOnce([
        { id: 5, frequency: 'monthly', startDate: '2026-01-01', endDate: null, isActive: true },
      ]);

      // All units already have line items — everything skipped
      vi.mocked(generateAssessmentLineItemsForCommunity).mockResolvedValueOnce({
        insertedCount: 0,
        skippedCount: 4,
        dueDate: '2026-03-01',
      });

      const summary = await processRecurringAssessments(new Date('2026-03-01'));

      expect(summary.assessmentsProcessed).toBe(1);
      expect(summary.totalInserted).toBe(0);
      expect(summary.totalSkipped).toBe(4);
      expect(summary.errors).toBe(0);
    });

    it('handles errors in one community without stopping others', async () => {
      const { processRecurringAssessments } = await import(
        '../../src/lib/services/assessment-automation-service'
      );
      const { generateAssessmentLineItemsForCommunity } = await import(
        '../../src/lib/services/finance-service'
      );

      // Two communities
      mockUnscopedDb.where.mockResolvedValueOnce([
        { id: 1 },
        { id: 2 },
      ]);

      // Community 1: selectFrom throws
      mockSelectFrom.mockRejectedValueOnce(new Error('DB connection lost'));

      // Community 2: has an active assessment that succeeds
      mockSelectFrom.mockResolvedValueOnce([
        { id: 8, frequency: 'monthly', startDate: '2026-01-01', endDate: null, isActive: true },
      ]);
      vi.mocked(generateAssessmentLineItemsForCommunity).mockResolvedValueOnce({
        insertedCount: 3,
        skippedCount: 1,
        dueDate: '2026-03-01',
      });

      const summary = await processRecurringAssessments(new Date('2026-03-01'));

      expect(summary.communitiesScanned).toBe(2);
      expect(summary.errors).toBe(1);
      expect(summary.assessmentsProcessed).toBe(1);
      expect(summary.totalInserted).toBe(3);
      expect(summary.totalSkipped).toBe(1);
    });
  });

  // ── Late fees follow the payments gate ─────────────────────────────────────
  describe('processLateFees payments gate', () => {
    async function runWithSettings(communitySettings: unknown) {
      mockUnscopedDb.where.mockResolvedValue([
        { id: 1, name: 'Test Community', communitySettings },
      ]);
      const { processLateFees } = await import(
        '../../src/lib/services/assessment-automation-service'
      );
      return processLateFees(new Date('2026-03-01T00:00:00Z'));
    }

    it('applies no late fees when online payments are disabled', async () => {
      const summary = await runWithSettings({});

      expect(summary.feesApplied).toBe(0);
      expect(summary.totalFeeCents).toBe(0);
      // Reported, not silent — a cron that quietly stops working reads as
      // "nothing was overdue".
      expect(summary.communitiesSkippedPaymentsDisabled).toBe(1);
      // Short-circuits before touching the community's data at all.
      expect(mockSelectFrom).not.toHaveBeenCalled();
    });

    it.each([
      ['absent', {}],
      ['explicitly false', { assessmentPaymentsEnabled: false }],
      ['the string "true"', { assessmentPaymentsEnabled: 'true' }],
      ['null settings', null],
    ])('skips the community when the gate is %s', async (_label, settings) => {
      const summary = await runWithSettings(settings);
      expect(summary.communitiesSkippedPaymentsDisabled).toBe(1);
      expect(summary.feesApplied).toBe(0);
    });

    it('still counts skipped communities as scanned', async () => {
      const summary = await runWithSettings({});
      expect(summary.communitiesScanned).toBe(1);
    });
  });

});
