import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PAID_GRACE_DAYS, paidGraceEndsAt } from '@propertypro/shared';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------

const { mockDbUpdate, mockDbSet, mockDbWhere, mockDbSelect, mockDbFrom, mockDbInnerJoin } =
  vi.hoisted(() => ({
    mockDbUpdate: vi.fn(),
    mockDbSet: vi.fn(),
    mockDbWhere: vi.fn(),
    mockDbSelect: vi.fn(),
    mockDbFrom: vi.fn(),
    mockDbInnerJoin: vi.fn(),
  }));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(),
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
  inArray: (col: unknown, vals: unknown) => ({ inArray: [col, vals] }),
  isNull: (col: unknown) => ({ isNull: col }),
  lte: (col: unknown, val: unknown) => ({ lte: [col, val] }),
}));

vi.mock('@propertypro/db', () => ({
  communities: { id: 'communities.id', nextReminderAt: 'communities.nextReminderAt', deletedAt: 'communities.deletedAt' },
  users: {
    email: 'users.email',
    fullName: 'users.fullName',
    id: 'users.id',
    deletedAt: 'users.deletedAt',
  },
  userRoles: { userId: 'userRoles.userId', communityId: 'userRoles.communityId', role: 'userRoles.role' },
}));

vi.mock('@propertypro/email', () => ({
  AuthenticateCardEmail: vi.fn(),
  PaymentFailedEmail: vi.fn(),
  SubscriptionCanceledEmail: vi.fn(),
  SubscriptionExpiryWarningEmail: vi.fn(),
  SubscriptionLapsedEmail: vi.fn(),
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('react', () => ({
  createElement: vi.fn((comp, props) => ({ comp, props })),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are in place)
// ---------------------------------------------------------------------------

// AUTHZ: Integration test fixture setup — bypass needed to seed/inspect rows across test communities.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { createElement } from 'react';
import {
  AuthenticateCardEmail,
  PaymentFailedEmail,
  SubscriptionExpiryWarningEmail,
  SubscriptionLapsedEmail,
  SubscriptionCanceledEmail,
  sendEmail,
} from '@propertypro/email';
import {
  processPaymentReminders,
  sendPaymentActionRequiredEmail,
  sendSubscriptionCanceledEmail,
} from '../../src/lib/services/payment-alert-scheduler';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * MS_PER_DAY);
}

/** Reset all hoisted DB mock fns to a clean state. */
function resetDbMocks() {
  mockDbWhere.mockReset();
  mockDbSet.mockReset();
  mockDbUpdate.mockReset();
  mockDbFrom.mockReset();
  mockDbInnerJoin.mockReset();
  mockDbSelect.mockReset();
}

/**
 * Build a minimal mock DB client.
 *
 * The .select() chain is used for both:
 *   1. The main query in processPaymentReminders (returns dueCommunities)
 *   2. lookupAdminRecipients (returns adminRecipients, one call per community)
 *
 * The .update().set().where() chain is used to persist nextReminderAt changes.
 */
function buildMockDb(dueCommunities: object[] = [], adminRecipients: object[] = []) {
  resetDbMocks();

  // update chain — resolves successfully by default
  mockDbWhere.mockResolvedValue(undefined);
  mockDbSet.mockReturnValue({ where: mockDbWhere });
  mockDbUpdate.mockReturnValue({ set: mockDbSet });

  // select chain:
  // First .where() call returns the due communities.
  // All subsequent .where() calls return adminRecipients (one per community).
  mockDbWhere
    .mockResolvedValueOnce(dueCommunities)
    .mockResolvedValue(adminRecipients);

  mockDbInnerJoin.mockReturnValue({ where: mockDbWhere });
  mockDbFrom.mockReturnValue({ where: mockDbWhere, innerJoin: mockDbInnerJoin });
  mockDbSelect.mockReturnValue({ from: mockDbFrom });

  return {
    select: mockDbSelect,
    update: mockDbUpdate,
  };
}

// ---------------------------------------------------------------------------
// Tests: processPaymentReminders
// ---------------------------------------------------------------------------

describe('processPaymentReminders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (sendEmail as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it('returns zero counts when no communities are due', async () => {
    const db = buildMockDb([]);
    (createUnscopedClient as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const summary = await processPaymentReminders(new Date());

    expect(summary).toEqual({ communitiesScanned: 0, emailsSent: 0, emailsFailed: 0, errors: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('sends PaymentFailedEmail with "Reminder" subject for payment failed 3 days ago and advances to Day 7', async () => {
    const paymentFailedAt = daysAgo(3);
    const community = {
      id: 1,
      name: 'Palm Gardens',
      communityType: 'apartment',
      paymentFailedAt,
      subscriptionCanceledAt: null,
    };
    const recipients = [{ email: 'manager@example.com', fullName: 'Alice Manager' }];

    const db = buildMockDb([community], recipients);
    (createUnscopedClient as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const now = new Date();
    const summary = await processPaymentReminders(now);

    expect(summary.communitiesScanned).toBe(1);
    expect(summary.emailsSent).toBe(1);
    expect(summary.errors).toBe(0);

    // Subject should contain "Reminder" (not "Urgent") for < 7 days
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining('Reminder') }),
    );
    expect(sendEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining('Urgent') }),
    );

    // nextReminderAt should be set to paymentFailedAt + 7 days
    const expectedNextReminder = new Date(paymentFailedAt.getTime() + 7 * MS_PER_DAY);
    expect(mockDbSet).toHaveBeenCalledWith(
      expect.objectContaining({ nextReminderAt: expectedNextReminder }),
    );
  });

  it('sends PaymentFailedEmail with "Urgent" subject for payment failed 8 days ago and clears nextReminderAt', async () => {
    const paymentFailedAt = daysAgo(8);
    const community = {
      id: 2,
      name: 'Sunset Villas',
      communityType: 'apartment',
      paymentFailedAt,
      subscriptionCanceledAt: null,
    };
    const recipients = [{ email: 'admin@example.com', fullName: 'Bob Admin' }];

    const db = buildMockDb([community], recipients);
    (createUnscopedClient as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const summary = await processPaymentReminders(new Date());

    expect(summary.communitiesScanned).toBe(1);
    expect(summary.emailsSent).toBe(1);
    expect(summary.errors).toBe(0);

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining('Urgent') }),
    );

    // nextReminderAt should be cleared (null) after Day 7+
    expect(mockDbSet).toHaveBeenCalledWith(
      expect.objectContaining({ nextReminderAt: null }),
    );
  });

  it('sends a two-day lock warning on grace Day 5 and arms the lapse notice', async () => {
    const subscriptionCanceledAt = daysAgo(5);
    const community = {
      id: 3,
      name: 'Ocean Breeze HOA',
      communityType: 'hoa_720',
      paymentFailedAt: daysAgo(30),
      subscriptionCanceledAt,
    };
    const recipients = [{ email: 'president@example.com', fullName: 'Carol President' }];

    const db = buildMockDb([community], recipients);
    (createUnscopedClient as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const summary = await processPaymentReminders(new Date());

    expect(summary.communitiesScanned).toBe(1);
    expect(summary.emailsSent).toBe(1);
    expect(summary.errors).toBe(0);

    // sendEmail should be called and its react element should use SubscriptionExpiryWarningEmail
    expect(sendEmail).toHaveBeenCalledTimes(1);

    // Verify createElement was called with SubscriptionExpiryWarningEmail (not PaymentFailedEmail)
    const createElementMock = createElement as ReturnType<typeof vi.fn>;
    const expiryCall = createElementMock.mock.calls.find(
      ([comp]) => comp === SubscriptionExpiryWarningEmail,
    );
    expect(expiryCall).toBeDefined();

    const paymentFailedCall = createElementMock.mock.calls.find(
      ([comp]) => comp === PaymentFailedEmail,
    );
    expect(paymentFailedCall).toBeUndefined();

    // The final warning is sent two days before the 7-day grace period ends.
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Final warning: Ocean Breeze HOA access locked in 2 days' }),
    );
    expect(expiryCall?.[1]).toEqual(
      expect.objectContaining({ expiryDate: expect.any(String) }),
    );

    // Chains to the lapse notice at the exact grace boundary rather than
    // clearing, so a community that never resubscribes still hears from us
    // when access actually changes.
    expect(mockDbSet).toHaveBeenCalledWith(
      expect.objectContaining({
        nextReminderAt: paidGraceEndsAt(subscriptionCanceledAt),
      }),
    );
  });

  it('clears nextReminderAt without sending email for stale community (no paymentFailedAt, no canceledAt)', async () => {
    const community = {
      id: 4,
      name: 'Stale Community',
      communityType: 'condo_718',
      paymentFailedAt: null,
      subscriptionCanceledAt: null,
    };
    const recipients = [{ email: 'board@example.com', fullName: 'Dave Board' }];

    const db = buildMockDb([community], recipients);
    (createUnscopedClient as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const summary = await processPaymentReminders(new Date());

    expect(summary.communitiesScanned).toBe(1);
    expect(summary.errors).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();

    // nextReminderAt cleared
    expect(mockDbSet).toHaveBeenCalledWith(
      expect.objectContaining({ nextReminderAt: null }),
    );
  });

  it('records errors count when a community throws, and still processes the successful one', async () => {
    resetDbMocks();

    const goodCommunity = {
      id: 5,
      name: 'Good Community',
      communityType: 'apartment',
      paymentFailedAt: daysAgo(3),
      subscriptionCanceledAt: null,
    };
    const badCommunity = {
      id: 6,
      name: 'Bad Community',
      communityType: 'apartment',
      paymentFailedAt: daysAgo(3),
      subscriptionCanceledAt: null,
    };

    const recipients = [{ email: 'mgr@example.com', fullName: 'Eve Manager' }];

    (sendEmail as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    // main query → both communities
    // lookupAdminRecipients for good → recipients
    // lookupAdminRecipients for bad → recipients
    // update for good → ok
    // update for bad → throws
    mockDbWhere
      .mockResolvedValueOnce([goodCommunity, badCommunity]) // main select
      .mockResolvedValueOnce(recipients)                    // admin lookup for goodCommunity
      .mockResolvedValueOnce(recipients)                    // admin lookup for badCommunity
      .mockResolvedValueOnce(undefined)                     // update for goodCommunity
      .mockRejectedValueOnce(new Error('DB write failure')); // update for badCommunity

    mockDbSet.mockReturnValue({ where: mockDbWhere });
    mockDbUpdate.mockReturnValue({ set: mockDbSet });
    mockDbInnerJoin.mockReturnValue({ where: mockDbWhere });
    mockDbFrom.mockReturnValue({ where: mockDbWhere, innerJoin: mockDbInnerJoin });
    mockDbSelect.mockReturnValue({ from: mockDbFrom });

    const db = { select: mockDbSelect, update: mockDbUpdate };
    (createUnscopedClient as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const summary = await processPaymentReminders(new Date());

    expect(summary.communitiesScanned).toBe(2);
    expect(summary.emailsSent).toBe(1);
    expect(summary.errors).toBe(1);
  });

  it('sends the cancellation track (not PaymentFailedEmail) when BOTH paymentFailedAt AND subscriptionCanceledAt are set', async () => {
    // subscriptionCanceledAt is checked first in processCommunityReminder — it takes priority.
    //
    // daysAgo(23) is well past PAID_GRACE_DAYS (7), so this community is LAPSED
    // and takes the lapse branch, not the warning branch. That distinction was
    // invisible while both branches rendered SubscriptionExpiryWarningEmail:
    // this assertion passed for the wrong reason, and a community canceled 23
    // days ago was being emailed "access will be locked in 2 days, on <a date
    // three weeks past>".
    const community = {
      id: 7,
      name: 'Dual-Flag Community',
      communityType: 'condo_718',
      paymentFailedAt: daysAgo(30),
      subscriptionCanceledAt: daysAgo(23),
    };
    const recipients = [{ email: 'board@example.com', fullName: 'Helen Board' }];

    const db = buildMockDb([community], recipients);
    (createUnscopedClient as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const summary = await processPaymentReminders(new Date());

    expect(summary.communitiesScanned).toBe(1);
    expect(summary.emailsSent).toBe(1);
    expect(summary.errors).toBe(0);

    // The LAPSED template, because grace expired 16 days ago — not the
    // future-tense warning, which would name a deadline already gone.
    const createElementMock = createElement as ReturnType<typeof vi.fn>;
    expect(createElementMock).toHaveBeenCalledWith(SubscriptionLapsedEmail, expect.any(Object));
    expect(createElementMock).not.toHaveBeenCalledWith(
      SubscriptionExpiryWarningEmail,
      expect.any(Object),
    );

    // PaymentFailedEmail must NOT be used
    const paymentFailedCalls = createElementMock.mock.calls.filter(
      ([comp]: unknown[]) => comp === PaymentFailedEmail,
    );
    expect(paymentFailedCalls).toHaveLength(0);
  });

  it('counts error when DB update throws during processing — other community still succeeds', async () => {
    // NOTE: sendToAll uses Promise.allSettled, so sendEmail throwing is silently swallowed
    // and does NOT increment summary.errors. To actually trip the error counter, the DB
    // update must throw (which propagates out of processCommunityReminder).
    resetDbMocks();

    const goodCommunity = {
      id: 8,
      name: 'Good Payer',
      communityType: 'condo_718',
      paymentFailedAt: daysAgo(3),
      subscriptionCanceledAt: null,
    };
    const failCommunity = {
      id: 9,
      name: 'DB Failure',
      communityType: 'condo_718',
      paymentFailedAt: daysAgo(3),
      subscriptionCanceledAt: null,
    };

    const recipients = [{ email: 'board@example.com', fullName: 'Ivan Board' }];

    mockDbWhere
      .mockResolvedValueOnce([goodCommunity, failCommunity]) // main select
      .mockResolvedValueOnce(recipients)                     // admin lookup for good
      .mockResolvedValueOnce(recipients)                     // admin lookup for fail
      .mockResolvedValueOnce(undefined)                      // update for good — succeeds
      .mockRejectedValueOnce(new Error('DB write failure')); // update for fail — throws

    mockDbSet.mockReturnValue({ where: mockDbWhere });
    mockDbUpdate.mockReturnValue({ set: mockDbSet });
    mockDbInnerJoin.mockReturnValue({ where: mockDbWhere });
    mockDbFrom.mockReturnValue({ where: mockDbWhere, innerJoin: mockDbInnerJoin });
    mockDbSelect.mockReturnValue({ from: mockDbFrom });

    const db = { select: mockDbSelect, update: mockDbUpdate };
    (createUnscopedClient as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const summary = await processPaymentReminders(new Date());

    expect(summary.communitiesScanned).toBe(2);
    expect(summary.emailsSent).toBe(1);
    expect(summary.errors).toBe(1);
  });

  it('processes community when nextReminderAt is at or before now (boundary inclusive)', async () => {
    // The DB where clause uses lte(nextReminderAt, now). This test verifies that
    // when the mock returns a community (simulating nextReminderAt <= now), it is processed.
    const community = {
      id: 10,
      name: 'Boundary Community',
      communityType: 'condo_718',
      paymentFailedAt: daysAgo(3),
      subscriptionCanceledAt: null,
    };
    const recipients = [{ email: 'exact@example.com', fullName: 'Exact User' }];

    const db = buildMockDb([community], recipients);
    (createUnscopedClient as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const summary = await processPaymentReminders(new Date());
    expect(summary.communitiesScanned).toBe(1);
    expect(summary.emailsSent).toBe(1);
  });

  it('does not process any community when DB returns empty (nextReminderAt > now)', async () => {
    // Simulates the DB correctly filtering out future-dated nextReminderAt values.
    const db = buildMockDb([], []);
    (createUnscopedClient as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const summary = await processPaymentReminders(new Date());
    expect(summary.communitiesScanned).toBe(0);
    expect(summary.emailsSent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: A5 — advance/clear schedule only on confirmed send
// ---------------------------------------------------------------------------

describe('processPaymentReminders — send-failure retry (A5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (sendEmail as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it('preserves nextReminderAt when the final lock-warning send fails (retry next run)', async () => {
    const community = {
      id: 20,
      name: 'Retry HOA',
      communityType: 'hoa_720',
      paymentFailedAt: daysAgo(30),
      subscriptionCanceledAt: daysAgo(5),
    };
    const recipients = [{ email: 'p@hoa.com', fullName: 'P' }];
    const db = buildMockDb([community], recipients);
    (createUnscopedClient as ReturnType<typeof vi.fn>).mockReturnValue(db);
    (sendEmail as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('resend down'));

    const summary = await processPaymentReminders(new Date());

    expect(summary.emailsSent).toBe(0);
    expect(summary.emailsFailed).toBe(1);
    // Schedule must NOT be cleared — the warning would otherwise be lost forever.
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('does not advance the reminder schedule when the Day-3 send fails', async () => {
    const community = {
      id: 21,
      name: 'Retry Villas',
      communityType: 'apartment',
      paymentFailedAt: daysAgo(3),
      subscriptionCanceledAt: null,
    };
    const recipients = [{ email: 'a@v.com', fullName: 'A' }];
    const db = buildMockDb([community], recipients);
    (createUnscopedClient as ReturnType<typeof vi.fn>).mockReturnValue(db);
    (sendEmail as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('resend down'));

    const summary = await processPaymentReminders(new Date());

    expect(summary.emailsSent).toBe(0);
    expect(summary.emailsFailed).toBe(1);
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('counts sent and failed separately on partial failure and still advances the schedule', async () => {
    const community = {
      id: 22,
      name: 'Partial',
      communityType: 'apartment',
      paymentFailedAt: daysAgo(3),
      subscriptionCanceledAt: null,
    };
    const recipients = [
      { email: 'ok@x.com', fullName: 'OK' },
      { email: 'bad@x.com', fullName: 'Bad' },
    ];
    const db = buildMockDb([community], recipients);
    (createUnscopedClient as ReturnType<typeof vi.fn>).mockReturnValue(db);
    (sendEmail as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('one bounced'));

    const summary = await processPaymentReminders(new Date());

    expect(summary.emailsSent).toBe(1);
    expect(summary.emailsFailed).toBe(1);
    // At least one delivered → schedule advances to Day 7.
    expect(mockDbSet).toHaveBeenCalledWith(
      expect.objectContaining({ nextReminderAt: expect.anything() }),
    );
  });

  it('advances a recipient-less in-grace community to the lapse notice', async () => {
    const subscriptionCanceledAt = daysAgo(5);
    const community = {
      id: 23,
      name: 'No Admins HOA',
      communityType: 'hoa_720',
      paymentFailedAt: daysAgo(30),
      subscriptionCanceledAt,
    };
    const db = buildMockDb([community], []); // no recipients
    (createUnscopedClient as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const summary = await processPaymentReminders(new Date());

    expect(sendEmail).not.toHaveBeenCalled();
    expect(summary.emailsSent).toBe(0);
    // Nothing to retry, but the schedule still advances rather than clearing —
    // it terminates one step later, at the lapse notice (asserted below).
    expect(mockDbSet).toHaveBeenCalledWith(
      expect.objectContaining({ nextReminderAt: paidGraceEndsAt(subscriptionCanceledAt) }),
    );
  });

  it('clears the schedule terminally once grace has expired with no recipients', async () => {
    // The anti-infinite-scan guarantee: the chain must end somewhere.
    const community = {
      id: 24,
      name: 'No Admins HOA',
      communityType: 'hoa_720',
      paymentFailedAt: daysAgo(30),
      subscriptionCanceledAt: daysAgo(PAID_GRACE_DAYS + 1),
    };
    const db = buildMockDb([community], []); // no recipients
    (createUnscopedClient as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const summary = await processPaymentReminders(new Date());

    expect(summary.emailsSent).toBe(0);
    expect(mockDbSet).toHaveBeenCalledWith(expect.objectContaining({ nextReminderAt: null }));
  });

  it('sends the lapse notice, not the warning, once grace has expired', async () => {
    const community = {
      id: 25,
      name: 'Lapsed Towers',
      communityType: 'condo_718',
      paymentFailedAt: null,
      subscriptionCanceledAt: daysAgo(PAID_GRACE_DAYS + 2),
    };
    const recipients = [{ email: 'pm@example.com', fullName: 'Pat Manager' }];
    const db = buildMockDb([community], recipients);
    (createUnscopedClient as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const summary = await processPaymentReminders(new Date());

    expect(summary.emailsSent).toBe(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Lapsed Towers: admin access paused' }),
    );
    // Terminal — no further reminders for a lapsed community.
    expect(mockDbSet).toHaveBeenCalledWith(expect.objectContaining({ nextReminderAt: null }));
  });
});

// ---------------------------------------------------------------------------
// Tests: sendSubscriptionCanceledEmail
// ---------------------------------------------------------------------------

describe('sendSubscriptionCanceledEmail', () => {
  beforeEach(() => {
    resetDbMocks();
    (sendEmail as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(undefined);
    (createUnscopedClient as ReturnType<typeof vi.fn>).mockReset();
  });

  it('sends an email to each recipient with a subject including "7-day grace period"', async () => {
    const recipients = [
      { email: 'president@hoa.com', fullName: 'Frank President' },
      { email: 'cam@hoa.com', fullName: 'Grace CAM' },
    ];

    // lookupAdminRecipients uses: .select().from().innerJoin().where()
    mockDbWhere.mockResolvedValue(recipients);
    mockDbInnerJoin.mockReturnValue({ where: mockDbWhere });
    mockDbFrom.mockReturnValue({ where: mockDbWhere, innerJoin: mockDbInnerJoin });
    mockDbSelect.mockReturnValue({ from: mockDbFrom });

    const db = { select: mockDbSelect };
    (createUnscopedClient as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const canceledAt = new Date('2026-02-01T00:00:00Z');
    await sendSubscriptionCanceledEmail(10, {
      communityName: 'Coral Pines HOA',
      communityType: 'hoa_720',
      canceledAt,
    });

    // One sendEmail call per recipient
    expect(sendEmail).toHaveBeenCalledTimes(recipients.length);

    // Every call must have a subject containing "7-day grace period"
    for (const call of (sendEmail as ReturnType<typeof vi.fn>).mock.calls) {
      const arg = call[0] as { subject: string };
      expect(arg.subject).toMatch(/7-day grace period/i);
    }

    // createElement should have been called with SubscriptionCanceledEmail
    const createElementMock = createElement as ReturnType<typeof vi.fn>;
    const canceledCall = createElementMock.mock.calls.find(
      ([comp]) => comp === SubscriptionCanceledEmail,
    );
    expect(canceledCall).toBeDefined();
    expect(canceledCall?.[1]).toEqual(
      expect.objectContaining({ gracePeriodEndDate: 'February 8, 2026' }),
    );
  });

  it('sends no emails when there are no admin recipients', async () => {
    mockDbWhere.mockResolvedValue([]);
    mockDbInnerJoin.mockReturnValue({ where: mockDbWhere });
    mockDbFrom.mockReturnValue({ where: mockDbWhere, innerJoin: mockDbInnerJoin });
    mockDbSelect.mockReturnValue({ from: mockDbFrom });

    const db = { select: mockDbSelect };
    (createUnscopedClient as ReturnType<typeof vi.fn>).mockReturnValue(db);

    await sendSubscriptionCanceledEmail(11, {
      communityName: 'Empty Community',
      communityType: 'condo_718',
      canceledAt: new Date(),
    });

    expect(sendEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: sendPaymentActionRequiredEmail (SCA — #772)
// ---------------------------------------------------------------------------

describe('sendPaymentActionRequiredEmail', () => {
  const AUTHENTICATE_URL = 'https://invoice.stripe.com/i/acct_123/live_abc123';

  function mockDbReturning(communityTypeRows: object[], recipients: object[]) {
    resetDbMocks();
    // First .where() resolves the community-type lookup, the next the recipients.
    const limit = vi.fn().mockResolvedValue(communityTypeRows);
    mockDbWhere.mockReturnValueOnce({ limit }).mockResolvedValue(recipients);
    mockDbInnerJoin.mockReturnValue({ where: mockDbWhere });
    mockDbFrom.mockReturnValue({ where: mockDbWhere, innerJoin: mockDbInnerJoin });
    mockDbSelect.mockReturnValue({ from: mockDbFrom });
    return { select: mockDbSelect };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    (sendEmail as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it('sends AuthenticateCardEmail — NOT PaymentFailedEmail — with the invoice URL', async () => {
    // The #772 regression in one assertion. This event used to send
    // PaymentFailedEmail, telling a board its payment had failed and to replace
    // a card that was working, for a charge that had not failed.
    const db = mockDbReturning(
      [{ communityType: 'condo_718' }],
      [{ email: 'board@example.com', fullName: 'Alice Board' }],
    );
    (createUnscopedClient as ReturnType<typeof vi.fn>).mockReturnValue(db);

    await sendPaymentActionRequiredEmail(42, {
      amountDue: '$249.00',
      communityName: 'Palm Gardens',
      authenticateUrl: AUTHENTICATE_URL,
    });

    const createElementMock = createElement as ReturnType<typeof vi.fn>;
    expect(createElementMock.mock.calls.find(([c]) => c === PaymentFailedEmail)).toBeUndefined();

    const call = createElementMock.mock.calls.find(([c]) => c === AuthenticateCardEmail);
    expect(call?.[1]).toEqual(
      expect.objectContaining({
        amountDue: '$249.00',
        authenticateUrl: AUTHENTICATE_URL,
        recipientName: 'Alice Board',
      }),
    );
  });

  it('uses a subject that does not claim the payment failed', async () => {
    const db = mockDbReturning(
      [{ communityType: 'condo_718' }],
      [{ email: 'board@example.com', fullName: 'Alice Board' }],
    );
    (createUnscopedClient as ReturnType<typeof vi.fn>).mockReturnValue(db);

    await sendPaymentActionRequiredEmail(42, {
      amountDue: '$249.00',
      communityName: 'Palm Gardens',
      authenticateUrl: AUTHENTICATE_URL,
    });

    const subject = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.subject as string;
    expect(subject).toBe('Confirm your payment of $249.00 for Palm Gardens');
    expect(subject).not.toMatch(/fail/i);
  });

  it('falls back to the billing portal when Stripe supplied no invoice URL', async () => {
    // Better a slightly less direct link than no email: the message is still
    // correct, and a payment started from the portal is on-session, so the
    // bank's check can be completed there.
    const db = mockDbReturning(
      [{ communityType: 'condo_718' }],
      [{ email: 'board@example.com', fullName: 'Alice Board' }],
    );
    (createUnscopedClient as ReturnType<typeof vi.fn>).mockReturnValue(db);

    await sendPaymentActionRequiredEmail(42, {
      amountDue: '$249.00',
      communityName: 'Palm Gardens',
      authenticateUrl: null,
    });

    const call = (createElement as ReturnType<typeof vi.fn>).mock.calls.find(
      ([c]) => c === AuthenticateCardEmail,
    );
    expect(call?.[1]?.authenticateUrl).toBe(call?.[1]?.billingPortalUrl);
    expect(call?.[1]?.authenticateUrl).toContain('/billing/portal?communityId=42');
  });

  it('sends one email per admin recipient', async () => {
    const db = mockDbReturning(
      [{ communityType: 'apartment' }],
      [
        { email: 'a@example.com', fullName: 'Alice' },
        { email: 'b@example.com', fullName: 'Bob' },
      ],
    );
    (createUnscopedClient as ReturnType<typeof vi.fn>).mockReturnValue(db);

    await sendPaymentActionRequiredEmail(42, {
      amountDue: '$10.00',
      communityName: 'Sunset Ridge',
      authenticateUrl: AUTHENTICATE_URL,
    });

    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it('sends nothing when the community has no admin recipients', async () => {
    const db = mockDbReturning([{ communityType: 'condo_718' }], []);
    (createUnscopedClient as ReturnType<typeof vi.fn>).mockReturnValue(db);

    await sendPaymentActionRequiredEmail(42, {
      amountDue: '$10.00',
      communityName: 'Empty',
      authenticateUrl: AUTHENTICATE_URL,
    });

    expect(sendEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: lookupAdminRecipients excludes soft-deleted users
// ---------------------------------------------------------------------------

describe('admin recipient lookup — soft-deleted users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (sendEmail as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it('filters on users.deletedAt IS NULL', async () => {
    // `executeUserSoftDelete` stamps `users.deleted_at` and bans the auth
    // identity but leaves `user_roles` in place, so without this predicate
    // every billing alert keeps reaching people who cannot log in. That became
    // a real capability leak with the SCA email, whose CTA is a bearer link
    // needing no session.
    //
    // Asserted on the emitted WHERE clause rather than on a filtered result
    // set: the DB is mocked, so a result-based assertion would only be testing
    // the mock's own return value and would pass with the predicate deleted.
    resetDbMocks();
    const limit = vi.fn().mockResolvedValue([{ communityType: 'condo_718' }]);
    mockDbWhere.mockReturnValueOnce({ limit }).mockResolvedValue([]);
    mockDbInnerJoin.mockReturnValue({ where: mockDbWhere });
    mockDbFrom.mockReturnValue({ where: mockDbWhere, innerJoin: mockDbInnerJoin });
    mockDbSelect.mockReturnValue({ from: mockDbFrom });
    (createUnscopedClient as ReturnType<typeof vi.fn>).mockReturnValue({ select: mockDbSelect });

    await sendPaymentActionRequiredEmail(42, {
      amountDue: '$1.00',
      communityName: 'Palm Gardens',
      authenticateUrl: 'https://invoice.stripe.com/i/acct_1/live_abc',
    });

    // The recipient query is the second .where() — the first resolves communityType.
    const recipientWhere = JSON.stringify(mockDbWhere.mock.calls[1]);
    expect(recipientWhere).toContain('users.deletedAt');
    expect(recipientWhere).toContain('isNull');
    // Still scoped to the one community, and to admin-tier roles only.
    expect(recipientWhere).toContain('userRoles.communityId');
    expect(recipientWhere).toContain('userRoles.role');
  });
});
