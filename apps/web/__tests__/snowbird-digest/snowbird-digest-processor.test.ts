/**
 * processSnowbirdDigests send loop (audit W-04).
 *
 * The processor had no tests. Sends were serial with no per-recipient catch,
 * and `sendEmail` throws on a provider error, so one bad send ended the tick;
 * the 9 AM tick then fails the 8 AM gate, and every owner after the failure
 * lost the week's digest. There was also no idempotency key, so a retried
 * tick could send twice.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendEmailMock, scoped } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
  scoped: {
    query: vi.fn(),
    selectFrom: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: () => scoped,
  communities: { id: 'id', timezone: 'timezone', name: 'name', snowbirdDigestEnabled: 's', deletedAt: 'd' },
  snowbirdDigestSubscriptions: { __table: 'subs', id: 'subs.id' },
  userRoles: { __table: 'user_roles' },
  users: { id: 'users.id', email: 'users.email', fullName: 'users.full_name' },
}));
vi.mock('@propertypro/db/filters', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(),
}));
vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => ({
    select: () => ({
      from: () => ({
        where: async () => [{ id: 7, timezone: 'America/New_York', name: 'Bayview' }],
      }),
    }),
  }),
}));
vi.mock('@propertypro/email', () => ({
  SnowbirdDigestEmail: () => null,
  sendEmail: sendEmailMock,
}));
vi.mock('@/lib/services/snowbird-digest-service', () => ({
  compileSnowbirdDigest: vi.fn(async () => ({ boardDecisions: [{}], newDocuments: [], upcoming: [] })),
  isDigestEmpty: () => false,
}));
vi.mock('@/lib/services/snowbird-digest-token', () => ({
  signSnowbirdUnsubscribeToken: () => 'tok',
}));

import { processSnowbirdDigests } from '@/lib/services/snowbird-digest-processor';
import { collectFailureSignals } from '@/lib/cron/with-cron-job';

// Monday 2026-07-20, 08:00 in New York (EDT, UTC-4): the weekly send tick.
const MONDAY_8AM_EASTERN = new Date('2026-07-20T12:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  scoped.query.mockImplementation(async (table: { __table?: string }) =>
    table.__table === 'user_roles'
      ? [
          { userId: 'u-1', role: 'resident', isUnitOwner: true },
          { userId: 'u-2', role: 'resident', isUnitOwner: true },
          { userId: 'u-3', role: 'resident', isUnitOwner: true },
        ]
      : [],
  );
  scoped.selectFrom.mockResolvedValue([
    { id: 'u-1', email: 'one@example.com', fullName: 'One' },
    { id: 'u-2', email: 'two@example.com', fullName: 'Two' },
    { id: 'u-3', email: 'three@example.com', fullName: 'Three' },
  ]);
  sendEmailMock.mockResolvedValue({ id: 'em_1' });
});

describe('processSnowbirdDigests', () => {
  it('keeps sending after one recipient fails, and counts the failure', async () => {
    sendEmailMock.mockImplementation(async ({ to }: { to: string }) => {
      if (to === 'one@example.com') throw new Error('Resend 429');
      return { id: 'em' };
    });

    const result = await processSnowbirdDigests(MONDAY_8AM_EASTERN);

    expect(sendEmailMock).toHaveBeenCalledTimes(3);
    // `failed` is a withCronJob FAILURE_KEY, so the run is reported, not green.
    expect(result).toMatchObject({ emailsSent: 2, failed: 1 });
    // The route returns `{ data: result }`; the cron monitor must see the failure.
    expect(collectFailureSignals({ data: result })).toEqual([{ key: 'failed', count: 1 }]);
    // The failed recipient's watermark is not advanced: next week's window
    // still covers this one.
    expect(scoped.insert).toHaveBeenCalledTimes(2);
    expect(scoped.insert.mock.calls.map((c) => (c[1] as { userId: string }).userId)).toEqual([
      'u-2',
      'u-3',
    ]);
  });

  it('counts failed sends against the per-tick budget', async () => {
    sendEmailMock.mockRejectedValue(new Error('Resend down'));

    const result = await processSnowbirdDigests(MONDAY_8AM_EASTERN, { emailsPerTick: 2 });

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ emailsSent: 0, failed: 2 });
  });

  it('keys each send by community, recipient and community-local date', async () => {
    await processSnowbirdDigests(MONDAY_8AM_EASTERN);

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'snowbird/7/u-1/2026-07-20' }),
    );
  });
});
