import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createUnscopedClientMock,
  eqMock,
  communitiesTable,
  dbSelectMock,
  dbFromMock,
  dbWhereMock,
  dbLimitMock,
} = vi.hoisted(() => {
  const dbLimitMock = vi.fn();
  const dbWhereMock = vi.fn(() => ({ limit: dbLimitMock }));
  const dbFromMock = vi.fn(() => ({ where: dbWhereMock }));
  const dbSelectMock = vi.fn(() => ({ from: dbFromMock }));

  return {
    createUnscopedClientMock: vi.fn(() => ({ select: dbSelectMock })),
    eqMock: vi.fn(),
    communitiesTable: {
      id: 'id',
      subscriptionStatus: 'subscriptionStatus',
      freeAccessExpiresAt: 'freeAccessExpiresAt',
      subscriptionCanceledAt: 'subscriptionCanceledAt',
    },
    dbSelectMock,
    dbFromMock,
    dbWhereMock,
    dbLimitMock,
  };
});

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));
vi.mock('@propertypro/db', () => ({ communities: communitiesTable }));
vi.mock('@propertypro/db/filters', () => ({ eq: eqMock }));

import { PAID_GRACE_DAYS } from '@propertypro/shared';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';

const MS_PER_DAY = 86_400_000;

function setCommunity(
  row: {
    subscriptionStatus: string | null;
    freeAccessExpiresAt: Date | null;
    subscriptionCanceledAt: Date | null;
  },
) {
  dbLimitMock.mockResolvedValue([row]);
}

describe('requireActiveSubscriptionForMutation — grace window', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createUnscopedClientMock.mockReturnValue({ select: dbSelectMock });
    dbSelectMock.mockReturnValue({ from: dbFromMock });
    dbFromMock.mockReturnValue({ where: dbWhereMock });
    dbWhereMock.mockReturnValue({ limit: dbLimitMock });
  });

  it('allows mutations when canceled within the seven-day grace window', async () => {
    setCommunity({
      subscriptionStatus: 'canceled',
      freeAccessExpiresAt: null,
      subscriptionCanceledAt: new Date(Date.now() - 2 * MS_PER_DAY),
    });

    await expect(requireActiveSubscriptionForMutation(1)).resolves.toBeUndefined();
  });

  it('blocks mutations exactly at the exclusive grace boundary', async () => {
    setCommunity({
      subscriptionStatus: 'canceled',
      freeAccessExpiresAt: null,
      subscriptionCanceledAt: new Date(Date.now() - PAID_GRACE_DAYS * MS_PER_DAY),
    });

    await expect(requireActiveSubscriptionForMutation(1)).rejects.toMatchObject({
      statusCode: 403,
      code: 'SUBSCRIPTION_REQUIRED',
    });
  });

  it('blocks mutations when cancellation grace has expired', async () => {
    setCommunity({
      subscriptionStatus: 'canceled',
      freeAccessExpiresAt: null,
      subscriptionCanceledAt: new Date(
        Date.now() - (PAID_GRACE_DAYS + 1) * MS_PER_DAY,
      ),
    });

    await expect(requireActiveSubscriptionForMutation(1)).rejects.toMatchObject({
      statusCode: 403,
      code: 'SUBSCRIPTION_REQUIRED',
    });
  });

  it('blocks immediately for unpaid communities', async () => {
    setCommunity({
      subscriptionStatus: 'unpaid',
      freeAccessExpiresAt: null,
      subscriptionCanceledAt: null,
    });

    await expect(requireActiveSubscriptionForMutation(1)).rejects.toMatchObject({
      code: 'SUBSCRIPTION_REQUIRED',
    });
  });

  it('blocks immediately when canceledAt is null', async () => {
    setCommunity({
      subscriptionStatus: 'canceled',
      freeAccessExpiresAt: null,
      subscriptionCanceledAt: null,
    });

    await expect(requireActiveSubscriptionForMutation(1)).rejects.toMatchObject({
      code: 'SUBSCRIPTION_REQUIRED',
    });
  });

  it('allows free access after cancellation grace expires', async () => {
    setCommunity({
      subscriptionStatus: 'canceled',
      freeAccessExpiresAt: new Date(Date.now() + 10 * MS_PER_DAY),
      subscriptionCanceledAt: new Date(Date.now() - 30 * MS_PER_DAY),
    });

    await expect(requireActiveSubscriptionForMutation(1)).resolves.toBeUndefined();
  });

  it.each(['active', 'trialing', 'past_due'])(
    'allows %s status',
    async (subscriptionStatus) => {
      setCommunity({
        subscriptionStatus,
        freeAccessExpiresAt: null,
        subscriptionCanceledAt: null,
      });

      await expect(requireActiveSubscriptionForMutation(1)).resolves.toBeUndefined();
    },
  );

  it('allows a null status for unprovisioned communities', async () => {
    setCommunity({
      subscriptionStatus: null,
      freeAccessExpiresAt: null,
      subscriptionCanceledAt: null,
    });

    await expect(requireActiveSubscriptionForMutation(1)).resolves.toBeUndefined();
  });
});
