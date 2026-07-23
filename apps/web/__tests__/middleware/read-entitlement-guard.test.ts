import { describe, expect, it, vi, beforeEach } from 'vitest';

// setup.ts globally no-ops this guard for route tests; THIS file tests the real
// implementation, so restore it (its @propertypro/db deps are mocked below).
vi.mock('@/lib/middleware/read-entitlement-guard', async (importActual) =>
  importActual<typeof import('@/lib/middleware/read-entitlement-guard')>(),
);

const { limitMock } = vi.hoisted(() => ({ limitMock: vi.fn() }));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: limitMock }) }) }),
  }),
}));
vi.mock('@propertypro/db', () => ({
  communities: {
    id: 'communities.id',
    subscriptionStatus: 'communities.subscription_status',
    subscriptionCanceledAt: 'communities.subscription_canceled_at',
    freeAccessExpiresAt: 'communities.free_access_expires_at',
  },
}));
vi.mock('@propertypro/db/filters', () => ({ eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }) }));

import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { AppError } from '@/lib/api/errors/AppError';

const LAPSED_ROW = {
  subscriptionStatus: 'canceled',
  subscriptionCanceledAt: new Date(Date.now() - 30 * 864e5),
  freeAccessExpiresAt: null,
};
const ACTIVE_ROW = {
  subscriptionStatus: 'active',
  subscriptionCanceledAt: null,
  freeAccessExpiresAt: null,
};

function admin() {
  return { isAdmin: true, role: 'property_manager' as const };
}
function resident(isUnitOwner = false) {
  return { isAdmin: false, role: 'resident' as const, isUnitOwner };
}

describe('requireEntitledForAdminRead', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws SUBSCRIPTION_REQUIRED for an admin on a lapsed community', async () => {
    limitMock.mockResolvedValue([LAPSED_ROW]);
    await expect(requireEntitledForAdminRead(42, admin())).rejects.toMatchObject({
      statusCode: 403,
      code: 'SUBSCRIPTION_REQUIRED',
    });
    expect(limitMock).toHaveBeenCalledTimes(1);
  });

  it('allows an admin on an active community', async () => {
    limitMock.mockResolvedValue([ACTIVE_ROW]);
    await expect(requireEntitledForAdminRead(42, admin())).resolves.toBeUndefined();
  });

  it('never gates a resident, and never even hits the DB for one', async () => {
    await expect(requireEntitledForAdminRead(42, resident(false))).resolves.toBeUndefined();
    await expect(requireEntitledForAdminRead(42, resident(true))).resolves.toBeUndefined();
    expect(limitMock).not.toHaveBeenCalled();
  });

  it('allows an admin on a community still inside the paid grace window', async () => {
    limitMock.mockResolvedValue([
      {
        subscriptionStatus: 'canceled',
        subscriptionCanceledAt: new Date(Date.now() - 2 * 864e5),
        freeAccessExpiresAt: null,
      },
    ]);
    await expect(requireEntitledForAdminRead(42, admin())).resolves.toBeUndefined();
  });

  it('propagates AppError type for withErrorHandler to catch', async () => {
    limitMock.mockResolvedValue([LAPSED_ROW]);
    await expect(requireEntitledForAdminRead(42, admin())).rejects.toBeInstanceOf(AppError);
  });
});
