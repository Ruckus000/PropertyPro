import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock all external dependencies
const mockSelectFrom = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockPostLedgerEntry = vi.fn();
const mockSendEmail = vi.fn();

const mockUnscopedDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  innerJoin: vi.fn().mockReturnThis(),
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

vi.mock('@propertypro/email', () => ({
  AssessmentDueReminderEmail: () => null,
  sendEmail: mockSendEmail,
}));

vi.mock('@/lib/services/finance-service', () => ({
  generateAssessmentLineItemsForCommunity: vi.fn(),
}));

vi.mock('@/lib/finance/common', () => ({
  centsToDollars: vi.fn((c: number) => (c / 100).toFixed(2)),
}));

describe('assessment-automation-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: return one community
    mockUnscopedDb.where.mockResolvedValue([{ id: 1, name: 'Test Community' }]);
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

  describe('processAssessmentDueReminders', () => {
    it('sends reminder emails for items due in 7 days', async () => {
      const { processAssessmentDueReminders } = await import(
        '../../src/lib/services/assessment-automation-service'
      );

      // Items due in 7 days
      mockSelectFrom.mockResolvedValueOnce([
        { id: 10, assessmentId: 1, unitId: 1, amountCents: 35000, dueDate: '2026-03-08', lateFeeCents: 0 },
      ]);
      // Assessment titles
      mockSelectFrom.mockResolvedValueOnce([
        { id: 1, title: 'Monthly Maintenance' },
      ]);
      // Owner lookup via unscoped db
      mockUnscopedDb.where
        .mockResolvedValueOnce([{ id: 1, name: 'Test Community' }]) // communities
        .mockResolvedValueOnce([{ unitId: 1, email: 'owner@test.com', fullName: 'Test Owner' }]); // users

      mockSendEmail.mockResolvedValue({ success: true });

      const summary = await processAssessmentDueReminders(new Date('2026-03-01'));

      expect(summary.communitiesScanned).toBe(1);
      expect(summary.emailsSent).toBe(1);
      expect(summary.errors).toBe(0);
      expect(mockSendEmail).toHaveBeenCalledOnce();
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'owner@test.com',
          category: 'transactional',
        }),
      );
    });

    it('handles email send failure gracefully', async () => {
      const { processAssessmentDueReminders } = await import(
        '../../src/lib/services/assessment-automation-service'
      );

      mockSelectFrom.mockResolvedValueOnce([
        { id: 10, assessmentId: 1, unitId: 1, amountCents: 35000, dueDate: '2026-03-08', lateFeeCents: 0 },
      ]);
      mockSelectFrom.mockResolvedValueOnce([
        { id: 1, title: 'Monthly Maintenance' },
      ]);
      mockUnscopedDb.where
        .mockResolvedValueOnce([{ id: 1, name: 'Test Community' }])
        .mockResolvedValueOnce([{ unitId: 1, email: 'owner@test.com', fullName: 'Test Owner' }]);

      mockSendEmail.mockRejectedValue(new Error('Email service down'));

      const summary = await processAssessmentDueReminders(new Date('2026-03-01'));

      expect(summary.emailsSent).toBe(0);
      expect(summary.errors).toBe(1);
    });
  });
});
