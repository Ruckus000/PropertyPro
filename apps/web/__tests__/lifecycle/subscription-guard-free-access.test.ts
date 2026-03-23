import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockDbSelect, mockDbFrom, mockDbWhere, mockDbLimit } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbFrom: vi.fn(),
  mockDbWhere: vi.fn(),
  mockDbLimit: vi.fn(),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(() => ({ select: mockDbSelect })),
}));

vi.mock('@propertypro/db', () => ({
  communities: {
    id: 'communities.id',
    subscriptionStatus: 'communities.subscriptionStatus',
    freeAccessExpiresAt: 'communities.freeAccessExpiresAt',
  },
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
}));

// ---------------------------------------------------------------------------
// Import AFTER mocks
// ---------------------------------------------------------------------------

import { requireActiveSubscriptionForMutation } from '../../src/lib/middleware/subscription-guard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupMock(row: {
  subscriptionStatus: string | null;
  freeAccessExpiresAt: Date | null;
}) {
  mockDbLimit.mockResolvedValue([row]);
  mockDbWhere.mockReturnValue({ limit: mockDbLimit });
  mockDbFrom.mockReturnValue({ where: mockDbWhere });
  mockDbSelect.mockReturnValue({ from: mockDbFrom });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('subscription guard — free access override', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows mutation when subscription is canceled but free access is active', async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    setupMock({ subscriptionStatus: 'canceled', freeAccessExpiresAt: futureDate });
    await expect(requireActiveSubscriptionForMutation(1)).resolves.toBeUndefined();
  });

  it('blocks mutation when subscription is canceled and free access has expired', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    setupMock({ subscriptionStatus: 'canceled', freeAccessExpiresAt: pastDate });
    await expect(requireActiveSubscriptionForMutation(1)).rejects.toThrow('no longer active');
  });

  it('allows mutation when subscription is null and no free access', async () => {
    setupMock({ subscriptionStatus: null, freeAccessExpiresAt: null });
    await expect(requireActiveSubscriptionForMutation(1)).resolves.toBeUndefined();
  });

  it('allows mutation when subscription is active regardless of free access', async () => {
    setupMock({ subscriptionStatus: 'active', freeAccessExpiresAt: null });
    await expect(requireActiveSubscriptionForMutation(1)).resolves.toBeUndefined();
  });

  it('allows mutation when subscription is expired but free access is still active', async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    setupMock({ subscriptionStatus: 'expired', freeAccessExpiresAt: futureDate });
    await expect(requireActiveSubscriptionForMutation(1)).resolves.toBeUndefined();
  });

  it('blocks mutation when subscription is unpaid and no free access', async () => {
    setupMock({ subscriptionStatus: 'unpaid', freeAccessExpiresAt: null });
    await expect(requireActiveSubscriptionForMutation(1)).rejects.toThrow('no longer active');
  });

  it('allows mutation when subscription is trialing', async () => {
    setupMock({ subscriptionStatus: 'trialing', freeAccessExpiresAt: null });
    await expect(requireActiveSubscriptionForMutation(1)).resolves.toBeUndefined();
  });
});
