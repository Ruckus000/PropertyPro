import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createScopedClientMock,
  postLedgerEntryMock,
  logAuditEventMock,
  sendNotificationMock,
  createNotificationsForEventMock,
  listUnitResidentUserIdsMock,
  tables,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  postLedgerEntryMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  sendNotificationMock: vi.fn(),
  createNotificationsForEventMock: vi.fn(),
  listUnitResidentUserIdsMock: vi.fn(),
  tables: {
    arcSubmissions: {
      id: Symbol('arc_submissions.id'),
      unitId: Symbol('arc_submissions.unit_id'),
    },
    assessmentLineItems: { id: Symbol('assessment_line_items.id') },
    documents: { id: Symbol('documents.id') },
    ledgerEntries: { id: Symbol('ledger_entries.id') },
    violationFines: { id: Symbol('violation_fines.id') },
    userRoles: {
      userId: Symbol('user_roles.user_id'),
      role: Symbol('user_roles.role'),
      isUnitOwner: Symbol('user_roles.is_unit_owner'),
      designation: Symbol('user_roles.designation'),
    },
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
  userRoles: tables.userRoles,
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
  createNotificationsForEvent: createNotificationsForEventMock,
}));

vi.mock('@/lib/units/actor-units', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/units/actor-units')>()),
  listUnitResidentUserIds: listUnitResidentUserIdsMock,
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
          // A rule IS cited, so the 422 can only come from the missing reason.
          ruleReference: 'Declaration Art. VII §3',
        }),
      ).rejects.toMatchObject({
        statusCode: 422,
        message: expect.stringMatching(/written reasons/),
      });

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
          ruleReference: 'Declaration Art. VII §3',
        }),
      ).rejects.toMatchObject({
        statusCode: 422,
        message: expect.stringMatching(/written reasons/),
      });

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
          ruleReference: 'Declaration Art. VII §3',
        }),
      ).resolves.toMatchObject({ status: 'denied' });

      expect(update).toHaveBeenCalledWith(
        tables.arcSubmissions,
        expect.objectContaining({ status: 'denied' }),
        { eq: [tables.arcSubmissions.id, 7] },
      );
    });

    it('rejects a denial that gives a reason but cites no rule', async () => {
      // The contract refuses this at the route; this is the same refusal for
      // any caller that reaches the service another way.
      const update = mockSubmission(createArcSubmissionRow({ reviewNotes: null }));

      await expect(
        decideArcSubmissionForCommunity(42, 7, 'reviewer-1', {
          decision: 'denied',
          reviewNotes: 'Street elevation must not show unfinished hardwood.',
          ruleReference: null,
        }),
      ).rejects.toMatchObject({
        statusCode: 422,
        message: expect.stringMatching(
          /Cite the specific rule or covenant relied on to deny this application \(Fla\. Stat\. §720\.3035\)/,
        ),
      });

      expect(update).not.toHaveBeenCalled();
      expect(logAuditEventMock).not.toHaveBeenCalled();
      expect(sendNotificationMock).not.toHaveBeenCalled();
    });

    it('rejects a denial whose cited rule is only whitespace', async () => {
      const update = mockSubmission(createArcSubmissionRow({ reviewNotes: null }));

      await expect(
        decideArcSubmissionForCommunity(42, 7, 'reviewer-1', {
          decision: 'denied',
          reviewNotes: 'Street elevation must not show unfinished hardwood.',
          ruleReference: '  \t ',
        }),
      ).rejects.toMatchObject({ statusCode: 422, message: expect.stringMatching(/§720\.3035/) });

      expect(update).not.toHaveBeenCalled();
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

  // §718.303(3)(b) / §720.305(2)(b): notice goes to the cited unit's owner and
  // occupants — not the reporter, and never every owner in the community.
  it('sends the violation notice to each resident of the cited unit, not the reporter', async () => {
    const row = createViolationRow({ status: 'reported', reportedByUserId: 'manager-1' });
    createScopedClientMock.mockReturnValue({
      selectFrom: vi.fn().mockResolvedValue([row]),
      update: vi.fn().mockResolvedValue([{ ...row, status: 'noticed' }]),
      insert: vi.fn(),
    });
    listUnitResidentUserIdsMock.mockResolvedValue(['owner-9', 'tenant-9']);
    createNotificationsForEventMock.mockResolvedValue(undefined);

    await updateViolationForCommunity(42, 10, 'manager-1', { status: 'noticed' });

    expect(listUnitResidentUserIdsMock).toHaveBeenCalledWith(expect.anything(), 9);
    const emailed = sendNotificationMock.mock.calls.map((call) => call[2]);
    const inApp = createNotificationsForEventMock.mock.calls.map((call) => call[2]);
    for (const recipients of [emailed, inApp]) {
      expect(recipients).toEqual([
        { type: 'specific_user', userId: 'owner-9' },
        { type: 'specific_user', userId: 'tenant-9' },
      ]);
    }
  });

  it('sends no violation notice when the cited unit has no residents on record', async () => {
    const row = createViolationRow({ status: 'reported', reportedByUserId: null });
    createScopedClientMock.mockReturnValue({
      selectFrom: vi.fn().mockResolvedValue([row]),
      update: vi.fn().mockResolvedValue([{ ...row, status: 'noticed' }]),
      insert: vi.fn(),
    });
    listUnitResidentUserIdsMock.mockResolvedValue([]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await updateViolationForCommunity(42, 10, 'manager-1', { status: 'noticed' });

    expect(sendNotificationMock).not.toHaveBeenCalled();
    expect(createNotificationsForEventMock).not.toHaveBeenCalled();
    warn.mockRestore();
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

  // ── §718.303(3) / §720.305(2) ceilings (F-04) ────────────────────────────
  //
  // Enforced in the SERVICE rather than the contract because the aggregate
  // check needs the other fines already on this violation, which Zod cannot
  // see. The per-fine check lives here too so the two cannot drift apart.

  it('refuses a single fine above the per-violation cap', async () => {
    const selectFrom = vi.fn().mockResolvedValue([createViolationRow({ status: 'noticed' })]);
    createScopedClientMock.mockReturnValue({ selectFrom, insert: vi.fn(), update: vi.fn() });

    await expect(
      imposeViolationFineForCommunity(42, 10, 'actor-1', { amountCents: 15_000 }),
    ).rejects.toThrow(/may not exceed \$100\.00/);
  });

  it('applies the STATUTORY cap when no caps are passed', async () => {
    // The load-bearing direction: an un-passed cap must mean "capped at the
    // statute", never "uncapped". The latter is the hole this closes.
    const selectFrom = vi.fn().mockResolvedValue([createViolationRow({ status: 'noticed' })]);
    createScopedClientMock.mockReturnValue({ selectFrom, insert: vi.fn(), update: vi.fn() });

    await expect(
      imposeViolationFineForCommunity(42, 10, 'actor-1', { amountCents: 10_001 }),
    ).rejects.toThrow(/§718\.303\(3\)/);
  });

  it('honours a community override above the statutory floor', async () => {
    const selectFrom = vi
      .fn()
      // violation lookup, then the existing-fines scan
      .mockResolvedValueOnce([createViolationRow({ status: 'noticed' })])
      .mockResolvedValueOnce([]);
    const insert = vi
      .fn()
      .mockResolvedValueOnce([createViolationFineRow({ amountCents: 15_000 })])
      .mockResolvedValueOnce([{ id: 5 }]);
    createScopedClientMock.mockReturnValue({
      selectFrom,
      insert,
      update: vi.fn().mockResolvedValue([createViolationRow({ status: 'fined' })]),
    });
    postLedgerEntryMock.mockResolvedValue({ id: 77 });

    await expect(
      imposeViolationFineForCommunity(42, 10, 'actor-1', {
        amountCents: 15_000,
        caps: { perFineCents: 250_00, aggregateCents: 1_000_00 },
      }),
    ).resolves.toBeDefined();
    // A fine is charged to the unit, like an assessment — never to the reporter.
    expect(postLedgerEntryMock.mock.calls[0]?.[1]).toMatchObject({ unitId: 9 });
    expect(postLedgerEntryMock.mock.calls[0]?.[1]).not.toHaveProperty('userId');
  });

  it('refuses when the AGGREGATE would exceed the ceiling', async () => {
    // Counts money, not rows — counting fines would let ten $100 fines through.
    const selectFrom = vi
      .fn()
      .mockResolvedValueOnce([createViolationRow({ status: 'noticed' })])
      .mockResolvedValueOnce([
        { amountCents: 95_000, status: 'pending' },
        { amountCents: 4_000, status: 'paid' },
      ]);
    createScopedClientMock.mockReturnValue({ selectFrom, insert: vi.fn(), update: vi.fn() });

    await expect(
      imposeViolationFineForCommunity(42, 10, 'actor-1', { amountCents: 5_000 }),
    ).rejects.toThrow(/aggregate limit/);
  });

  it('EXCLUDES waived fines from the aggregate', async () => {
    // A waiver undoes the charge. Counting it would penalise an association for
    // showing leniency.
    const selectFrom = vi
      .fn()
      .mockResolvedValueOnce([createViolationRow({ status: 'noticed' })])
      .mockResolvedValueOnce([
        { amountCents: 99_000, status: 'waived' },
        { amountCents: 1_000, status: 'pending' },
      ]);
    const insert = vi
      .fn()
      .mockResolvedValueOnce([createViolationFineRow()])
      .mockResolvedValueOnce([{ id: 5 }]);
    createScopedClientMock.mockReturnValue({
      selectFrom,
      insert,
      update: vi.fn().mockResolvedValue([createViolationRow({ status: 'fined' })]),
    });
    postLedgerEntryMock.mockResolvedValue({ id: 77 });

    await expect(
      imposeViolationFineForCommunity(42, 10, 'actor-1', { amountCents: 2_500 }),
    ).resolves.toBeDefined();
  });

  it('persists the fining-committee snapshot', async () => {
    const selectFrom = vi
      .fn()
      .mockResolvedValueOnce([createViolationRow({ status: 'noticed' })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ userId: 'u-dana', role: 'resident', isUnitOwner: true, designation: null }]);
    const insert = vi
      .fn()
      .mockResolvedValueOnce([createViolationFineRow()])
      .mockResolvedValueOnce([{ id: 5 }]);
    createScopedClientMock.mockReturnValue({
      selectFrom,
      insert,
      update: vi.fn().mockResolvedValue([createViolationRow({ status: 'fined' })]),
    });
    postLedgerEntryMock.mockResolvedValue({ id: 77 });

    await imposeViolationFineForCommunity(42, 10, 'actor-1', {
      amountCents: 2_500,
      approvedByCommittee: true,
      committeeMembers: [{ name: 'Dana Reyes', userId: 'u-dana' }],
    });

    // A SNAPSHOT, not a join: committee membership turns over, and the question
    // in a dispute is who approved this fine at the time.
    expect(insert).toHaveBeenCalledWith(
      tables.violationFines,
      expect.objectContaining({
        approvedByCommittee: true,
        committeeMembers: [{ name: 'Dana Reyes', userId: 'u-dana' }],
        committeeApprovedAt: expect.any(Date),
      }),
    );
  });

  describe('fining committee eligibility (§718.303(3) / §720.305(2))', () => {
    function scopedWithRoles(roles: unknown[]) {
      const selectFrom = vi
        .fn()
        .mockResolvedValueOnce([createViolationRow({ status: 'noticed' })])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(roles);
      const insert = vi.fn();
      createScopedClientMock.mockReturnValue({ selectFrom, insert, update: vi.fn() });
      return { insert };
    }
    const fine = (committeeMembers: Array<{ name: string; userId?: string }>) =>
      imposeViolationFineForCommunity(42, 10, 'actor-1', { amountCents: 2_500, approvedByCommittee: true, committeeMembers });

    it.each([
      ['a board seat', { userId: 'u-1', role: 'resident', isUnitOwner: true, designation: 'board_member' }, 'holds a board seat'],
      ['a tenant', { userId: 'u-1', role: 'resident', isUnitOwner: false, designation: null }, 'is not a unit owner'],
      ['a manager', { userId: 'u-1', role: 'property_manager', isUnitOwner: false, designation: null }, 'is not a unit owner'],
    ])('refuses %s, and records nothing', async (_label, role, reason) => {
      const { insert } = scopedWithRoles([role]);
      await expect(fine([{ name: 'Pat', userId: 'u-1' }])).rejects.toThrow(`Pat ${reason}`);
      expect(insert).not.toHaveBeenCalled();
      expect(postLedgerEntryMock).not.toHaveBeenCalled();
    });

    it('refuses the person imposing the fine, a non-member, and a duplicate', async () => {
      scopedWithRoles([
        { userId: 'actor-1', role: 'resident', isUnitOwner: true, designation: null },
        { userId: 'u-2', role: 'resident', isUnitOwner: true, designation: null },
      ]);
      await expect(
        fine([
          { name: 'Me', userId: 'actor-1' },
          { name: 'Stranger', userId: 'u-x' },
          { name: 'Ann', userId: 'u-2' },
          { name: 'Ann again', userId: 'u-2' },
        ]),
      ).rejects.toThrow(
        /Me is the person imposing the fine; Stranger is not a member of this community; Ann again is listed more than once/,
      );
    });
  });
});
