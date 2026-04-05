import { describe, it, expect, vi, beforeEach } from 'vitest';

// All vi.mock factories must be hoisting-safe (no references to outer variables)
vi.mock('@/lib/services/notification-service', () => ({
  createNotificationsForEvent: vi.fn().mockResolvedValue({ created: 1, skipped: 0 }),
}));

// Stub DB schema symbols (prevents drizzle initialization)
vi.mock('@propertypro/db', () => ({
  communities: {},
  userRoles: {},
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
  inArray: vi.fn(),
}));

// Stub DB client — select returns 2 communities, selectDistinct returns 2 admins
vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => ({
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([{ id: 1 }, { id: 2 }]),
      }),
    }),
    selectDistinct: () => ({
      from: () => ({
        where: () =>
          Promise.resolve([
            { userId: 'u1', communityId: 1 },
            { userId: 'u2', communityId: 2 },
          ]),
      }),
    }),
  }),
}));

import { notifyDowngrade } from '@/lib/billing/downgrade-notifications';
import { createNotificationsForEvent } from '@/lib/services/notification-service';

describe('notifyDowngrade', () => {
  beforeEach(() => {
    vi.mocked(createNotificationsForEvent).mockClear();
    vi.mocked(createNotificationsForEvent).mockResolvedValue({ created: 1, skipped: 0 });
  });

  it('notifies every admin with correct title and body', async () => {
    await notifyDowngrade({
      billingGroupId: 1,
      previousTier: 'tier_15',
      newTier: 'tier_10',
      canceledCommunityName: 'Sunset Condos',
    });

    expect(createNotificationsForEvent).toHaveBeenCalledTimes(2);

    const firstCall = vi.mocked(createNotificationsForEvent).mock.calls[0];
    expect(firstCall[0]).toBe(1); // communityId
    expect(firstCall[1]).toMatchObject({
      category: 'system',
      title: 'Portfolio discount changed',
      body: expect.stringContaining('from 15% to 10%'),
    });
    expect(firstCall[2]).toMatchObject({ type: 'specific_user', userId: 'u1' });
  });

  it('includes the canceled community name in the message body', async () => {
    await notifyDowngrade({
      billingGroupId: 1,
      previousTier: 'tier_15',
      newTier: 'tier_10',
      canceledCommunityName: 'Sunset Condos',
    });

    const body: string = vi.mocked(createNotificationsForEvent).mock.calls[0][1].body ?? '';
    expect(body).toContain('Sunset Condos');
  });
});
