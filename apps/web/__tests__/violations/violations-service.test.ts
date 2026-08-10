import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createScopedClientMock,
  postLedgerEntryMock,
  logAuditEventMock,
  sendNotificationMock,
  tables,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  postLedgerEntryMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  sendNotificationMock: vi.fn(),
  tables: {
    arcSubmissions: Symbol('arc_submissions'),
    assessmentLineItems: { id: Symbol('assessment_line_items.id') },
    documents: { id: Symbol('documents.id') },
    ledgerEntries: { id: Symbol('ledger_entries.id') },
    violationFines: { id: Symbol('violation_fines.id') },
    violations: {
      id: Symbol('violations.id'),
      status: Symbol('violations.status'),
      unitId: Symbol('violations.unit_id'),
      createdAt: Symbol('violations.created_at'),
    },
  },
}));

vi.mock('@propertypro/db', () => ({
  arcSubmissions: tables.arcSubmissions,
  assessmentLineItems: tables.assessmentLineItems,
  createScopedClient: createScopedClientMock,
  documents: tables.documents,
  ledgerEntries: tables.ledgerEntries,
  logAuditEvent: logAuditEventMock,
  postLedgerEntry: postLedgerEntryMock,
  violationFines: tables.violationFines,
  violations: tables.violations,
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...args: unknown[]) => ({ and: args }),
  desc: (...args: unknown[]) => ({ desc: args }),
  eq: (column: unknown, value: unknown) => ({ eq: [column, value] }),
  gte: (column: unknown, value: unknown) => ({ gte: [column, value] }),
  inArray: (column: unknown, value: unknown) => ({ inArray: [column, value] }),
  lte: (column: unknown, value: unknown) => ({ lte: [column, value] }),
}));

vi.mock('@/lib/services/notification-service', () => ({
  sendNotification: sendNotificationMock,
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(() => ({})),
}));

import {
  decideArcSubmissionForCommunity,
  imposeViolationFineForCommunity,
  updateViolationForCommunity,
} from '../../src/lib/services/violations-service';

function createArcSubmissionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 7,
    communityId: 42,
    unitId: 9,
    submittedByUserId: 'resident-1',
    title: 'Fence',
    description: 'Six-foot wood fence along the north property line',
    projectType: 'exterior_modification',
    estimatedStartDate: null,
    estimatedCompletionDate: null,
    attachmentDocumentIds: [],
    status: 'submitted',
    reviewNotes: null,
    decidedByUserId: null,
    decidedAt: null,
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function createViolationRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 10,
    communityId: 42,
    unitId: 9,
    reportedByUserId: 'resident-1',
    category: 'Parking',
    description: 'Blocked fire lane',
    status: 'reported',
    severity: 'minor',
    evidenceDocumentIds: [],
    noticeDate: null,
    hearingDate: null,
    resolutionDate: null,
    resolutionNotes: null,
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    ...overrides,
  };
}

function createViolationFineRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 88,
    communityId: 42,
    violationId: 10,
    amountCents: 2500,
    ledgerEntryId: 77,
    status: 'pending',
    issuedAt: new Date('2026-03-02T00:00:00.000Z'),
    paidAt: null,
    waivedAt: null,
    waivedByUserId: null,
    createdAt: new Date('2026-03-02T00:00:00.000Z'),
    updatedAt: new Date('2026-03-02T00:00:00.000Z'),
    ...overrides,
  };
}

describe('violations-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendNotificationMock.mockResolvedValue(undefined);
    logAuditEventMock.mockResolvedValue(undefined);
  });

  // HB 1203 requires an ARC/ACC denial to state the specific reason and cite the
  // rule or covenant relied on. The route contract enforces this too, but this
  // service is the last line — it is what any non-route caller reaches, and it
  // is where the `?? existing.reviewNotes` fallback lives.
  describe('decideArcSubmissionForCommunity — HB 1203 denial reasons', () => {
    function mockSubmission(row: Record<string, unknown>) {
      const update = vi.fn().mockResolvedValue([{ ...row, status: 'denied' }]);
      createScopedClientMock.mockReturnValue({
        selectFrom: vi.fn().mockResolvedValue([row]),
        update,
        insert: vi.fn(),
      });
      return update;
    }

    it('rejects a denial with no written reason', async () => {
      const update = mockSubmission(createArcSubmissionRow({ reviewNotes: null }));

      await expect(
        decideArcSubmissionForCommunity(42, 7, 'reviewer-1', {
          decision: 'denied',
          reviewNotes: null,
        }),
      ).rejects.toMatchObject({ statusCode: 422 });

      expect(update).not.toHaveBeenCalled();
      expect(logAuditEventMock).not.toHaveBeenCalled();
      expect(sendNotificationMock).not.toHaveBeenCalled();
    });

    it('rejects a denial whose written reason is only whitespace', async () => {
      const update = mockSubmission(createArcSubmissionRow({ reviewNotes: null }));

      await expect(
        decideArcSubmissionForCommunity(42, 7, 'reviewer-1', {
          decision: 'denied',
          reviewNotes: '   \n\t ',
        }),
      ).rejects.toMatchObject({ statusCode: 422 });

      expect(update).not.toHaveBeenCalled();
    });

    it('accepts a denial whose reason was already recorded by an earlier review step', async () => {
      // The service falls back to `existing.reviewNotes`, so notes left during
      // `review` satisfy the requirement without being resent on the decision.
      const update = mockSubmission(
        createArcSubmissionRow({
          status: 'under_review',
          reviewNotes: 'Denied under Declaration Art. VII §3 — exceeds 4ft height limit.',
        }),
      );

      await expect(
        decideArcSubmissionForCommunity(42, 7, 'reviewer-1', {
          decision: 'denied',
          reviewNotes: null,
        }),
      ).resolves.toMatchObject({ status: 'denied' });

      expect(update).toHaveBeenCalledWith(
        tables.arcSubmissions,
        expect.objectContaining({ status: 'denied' }),
        { eq: [undefined, 7] },
      );
    });

    it('does not require a reason to APPROVE', async () => {
      const row = createArcSubmissionRow({ reviewNotes: null });
      const update = vi.fn().mockResolvedValue([{ ...row, status: 'approved' }]);
      createScopedClientMock.mockReturnValue({
        selectFrom: vi.fn().mockResolvedValue([row]),
        update,
        insert: vi.fn(),
      });

      await expect(
        decideArcSubmissionForCommunity(42, 7, 'reviewer-1', {
          decision: 'approved',
          reviewNotes: null,
        }),
      ).resolves.toMatchObject({ status: 'approved' });

      expect(update).toHaveBeenCalled();
    });
  });

  it('throws a conflict error when a concurrent status change wins the update race', async () => {
    const selectFrom = vi.fn().mockResolvedValue([
      createViolationRow({ status: 'reported' }),
    ]);
    const update = vi.fn().mockResolvedValue([]);

    createScopedClientMock.mockReturnValue({
      selectFrom,
      update,
      insert: vi.fn(),
    });

    await expect(
      updateViolationForCommunity(42, 10, 'actor-1', { status: 'noticed' }),
    ).rejects.toMatchObject({
      message: 'Violation was modified by another user. Please refresh and try again.',
      statusCode: 409,
    });

    expect(update).toHaveBeenCalledWith(
      tables.violations,
      expect.objectContaining({ status: 'noticed' }),
      {
        and: [
          { eq: [tables.violations.id, 10] },
          { eq: [tables.violations.status, 'reported'] },
        ],
      },
    );
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('soft-deletes the fine and ledger entry if line-item creation fails', async () => {
    const lineItemError = new Error('line item insert failed');
    const selectFrom = vi.fn().mockResolvedValue([
      createViolationRow({ status: 'noticed' }),
    ]);
    const insert = vi
      .fn()
      .mockResolvedValueOnce([createViolationFineRow()])
      .mockRejectedValueOnce(lineItemError);
    const update = vi.fn().mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    createScopedClientMock.mockReturnValue({
      selectFrom,
      insert,
      update,
    });
    postLedgerEntryMock.mockResolvedValue({ id: 77 });

    await expect(
      imposeViolationFineForCommunity(42, 10, 'actor-1', { amountCents: 2500 }),
    ).rejects.toThrow('line item insert failed');

    expect(update).toHaveBeenNthCalledWith(
      1,
      tables.violationFines,
      { deletedAt: expect.any(Date) },
      { eq: [tables.violationFines.id, 88] },
    );
    expect(update).toHaveBeenNthCalledWith(
      2,
      tables.ledgerEntries,
      { deletedAt: expect.any(Date) },
      { eq: [tables.ledgerEntries.id, 77] },
    );

    consoleSpy.mockRestore();
  });
});
