import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  users: { email: 'users.email', fullName: 'users.fullName', id: 'users.id' },
  userRoles: { userId: 'userRoles.userId', communityId: 'userRoles.communityId', role: 'userRoles.role' },
}));

vi.mock('@propertypro/email', () => ({
  PaymentFailedEmail: vi.fn(),
  SubscriptionCanceledEmail: vi.fn(),
  SubscriptionExpiryWarningEmail: vi.fn(),
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('react', () => ({
  createElement: vi.fn((comp, props) => ({ comp, props })),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are in place)
// ---------------------------------------------------------------------------

import { createUnscopedClient } from '@propertypro/db/unsafe';
import { createElement } from 'react';
import {
  PaymentFailedEmail,
  SubscriptionExpiryWarningEmail,
  SubscriptionCanceledEmail,
  sendEmail,
} from '@propertypro/email';
import {
  processPaymentReminders,
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

    expect(summary).toEqual({ communitiesScanned: 0, emailsSent: 0, errors: 0 });
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

  it('sends expiry warning email and clears nextReminderAt when subscriptionCanceledAt is set', async () => {
    const subscriptionCanceledAt = daysAgo(23);
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

    // Subject should reference "Final warning" / expiry
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining('Final warning') }),
    );

    // nextReminderAt should be cleared
    expect(mockDbSet).toHaveBeenCalledWith(
      expect.objectContaining({ nextReminderAt: null }),
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

  it('sends SubscriptionExpiryWarningEmail (not PaymentFailedEmail) when BOTH paymentFailedAt AND subscriptionCanceledAt are set', async () => {
    // subscriptionCanceledAt is checked first in processCommunityReminder — it takes priority.
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

    // SubscriptionExpiryWarningEmail must be used
    const createElementMock = createElement as ReturnType<typeof vi.fn>;
    expect(createElementMock).toHaveBeenCalledWith(SubscriptionExpiryWarningEmail, expect.any(Object));

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
// Tests: sendSubscriptionCanceledEmail
// ---------------------------------------------------------------------------

describe('sendSubscriptionCanceledEmail', () => {
  beforeEach(() => {
    resetDbMocks();
    (sendEmail as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(undefined);
    (createUnscopedClient as ReturnType<typeof vi.fn>).mockReset();
  });

  it('sends an email to each recipient with a subject including "30-day grace period"', async () => {
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

    // Every call must have a subject containing "30-day grace period"
    for (const call of (sendEmail as ReturnType<typeof vi.fn>).mock.calls) {
      const arg = call[0] as { subject: string };
      expect(arg.subject).toMatch(/30-day grace period/i);
    }

    // createElement should have been called with SubscriptionCanceledEmail
    const createElementMock = createElement as ReturnType<typeof vi.fn>;
    const canceledCall = createElementMock.mock.calls.find(
      ([comp]) => comp === SubscriptionCanceledEmail,
    );
    expect(canceledCall).toBeDefined();
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
