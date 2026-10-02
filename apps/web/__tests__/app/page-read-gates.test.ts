/**
 * Server pages that read tables directly must apply the same read gate as the
 * API behind the same data (2026-09-28 page census, roadmap 2.3 prep).
 *
 * - /emergency listed every broadcast to any member; the list API refuses
 *   tenants (`emergency_broadcasts: read = false`).
 * - /settings/billing sent `stripeCustomerId` and `paymentFailedAt` to every
 *   member's RSC payload; only the management tier may see billing state.
 *
 * The permission check is the REAL `@/lib/db/access-control` (it is pure), so
 * these tests pin the matrix semantics, not a mock of them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { membershipMock, queryMock, selectFromMock, billingClientMock } = vi.hoisted(() => ({
  membershipMock: vi.fn(),
  queryMock: vi.fn(),
  selectFromMock: vi.fn(),
  billingClientMock: vi.fn(() => null),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({ get: () => null })),
}));
vi.mock('@/lib/tenant/resolve-community-context', () => ({
  resolveCommunityContext: vi.fn(() => ({ communityId: 42 })),
  resolvePageCommunityContext: vi.fn(() => ({ communityId: 42 })),
}));
vi.mock('@/lib/tenant/community-resolution', () => ({
  toUrlSearchParams: vi.fn(() => new URLSearchParams()),
}));
vi.mock('@/lib/request/page-auth-context', () => ({
  requirePageAuthenticatedUserId: vi.fn(async () => 'user-1'),
}));
vi.mock('@/lib/request/page-community-context', () => ({
  requirePageCommunityMembership: membershipMock,
}));
vi.mock('@propertypro/db', () => ({
  emergencyBroadcasts: {},
  communities: { id: {} },
  createScopedClient: vi.fn(() => ({ query: queryMock, selectFrom: selectFromMock })),
}));
vi.mock('@propertypro/db/filters', () => ({ eq: vi.fn() }));
vi.mock('@/lib/services/stripe-service', () => ({
  getActiveSubscriptionInterval: vi.fn(async () => 'month'),
}));
vi.mock('@/components/emergency/BroadcastHistoryTable', () => ({ BroadcastHistoryTable: () => null }));
vi.mock('@/components/shared/page-header', () => ({ PageHeader: () => null }));
vi.mock('@/components/settings/billing-page-client', () => ({ BillingPageClient: billingClientMock }));

import EmergencyPage from '../../src/app/(authenticated)/emergency/page';
import BillingPage from '../../src/app/(authenticated)/settings/billing/page';

const base = {
  userId: 'user-1',
  communityId: 42,
  communityName: 'Sunset Ridge',
  communityType: 'apartment',
  designation: null,
};
const TENANT = { ...base, role: 'resident', isUnitOwner: false, isAdmin: false };
const CONDO_OWNER = { ...base, communityType: 'condo_718', role: 'resident', isUnitOwner: true, isAdmin: false };
const MANAGER = { ...base, role: 'property_manager', isUnitOwner: false, isAdmin: true };

const props = { searchParams: Promise.resolve({ communityId: '42' }) };

beforeEach(() => {
  vi.clearAllMocks();
  queryMock.mockResolvedValue([
    { id: 1, title: 'Water shutoff', severity: 'urgent', recipientCount: 3, sentCount: 3,
      deliveredCount: 3, failedCount: 0, initiatedAt: new Date('2026-09-01T00:00:00Z') },
  ]);
  selectFromMock.mockResolvedValue([
    { subscriptionPlan: 'operations_plus', subscriptionStatus: 'past_due',
      stripeCustomerId: 'cus_SECRET', stripeSubscriptionId: null,
      paymentFailedAt: '2026-09-20T00:00:00Z' },
  ]);
});

describe('/emergency', () => {
  it('refuses a tenant BEFORE reading any broadcast', async () => {
    membershipMock.mockResolvedValue(TENANT);
    await expect(EmergencyPage(props)).rejects.toThrow(/emergency_broadcasts/);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('still lists broadcasts for an owner and a manager (controls)', async () => {
    for (const m of [CONDO_OWNER, MANAGER]) {
      membershipMock.mockResolvedValue(m);
      await EmergencyPage(props);
    }
    expect(queryMock).toHaveBeenCalledTimes(2);
  });
});

describe('/settings/billing', () => {
  it('keeps Stripe internals out of a resident payload, but still shows the plan', async () => {
    membershipMock.mockResolvedValue(TENANT);
    const element = (await BillingPage(props)) as { props: Record<string, unknown> };
    expect(element.props.stripeCustomerId).toBeNull();
    expect(element.props.paymentFailedAt).toBeNull();
    expect(element.props.subscriptionPlan).toBe('operations_plus');
    expect(element.props.canView).toBe(false);
  });

  it('gives a manager the full billing state (control)', async () => {
    membershipMock.mockResolvedValue(MANAGER);
    const element = (await BillingPage(props)) as { props: Record<string, unknown> };
    expect(element.props.stripeCustomerId).toBe('cus_SECRET');
    expect(element.props.paymentFailedAt).toBe('2026-09-20T00:00:00.000Z');
    expect(element.props.canView).toBe(true);
  });
});
