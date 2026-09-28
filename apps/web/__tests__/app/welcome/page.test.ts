/**
 * Welcome page: already-welcomed redirect tests.
 *
 * Reaching /welcome a second time (after the onboarding checklist has been
 * populated) must redirect to the tenant-scoped dashboard. Without the
 * communityId query param, /dashboard bounces users to /select-community
 * or /dashboard/overview, so the scoped redirect is required to keep
 * returning users inside their current community context.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requirePageAuthenticatedUserMock,
  requirePageCommunityMembershipMock,
  resolveCommunityContextMock,
  hasChecklistItemsMock,
  redirectMock,
  welcomeScreenMock,
  selectFromMock,
} = vi.hoisted(() => ({
  requirePageAuthenticatedUserMock: vi.fn(),
  requirePageCommunityMembershipMock: vi.fn(),
  resolveCommunityContextMock: vi.fn(),
  hasChecklistItemsMock: vi.fn(),
  redirectMock: vi.fn(),
  welcomeScreenMock: vi.fn(() => null),
  selectFromMock: vi.fn(async (_table?: unknown, ..._rest: unknown[]): Promise<unknown[]> => []),
}));

class RedirectError extends Error {
  constructor(url: string) { super(`NEXT_REDIRECT:${url}`); }
}

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => {
    redirectMock(...args);
    throw new RedirectError(String(args[0]));
  },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({
    get: (_key: string) => null,
  })),
}));

vi.mock('@/lib/request/page-auth-context', () => ({
  requirePageAuthenticatedUser: requirePageAuthenticatedUserMock,
}));

vi.mock('@/lib/request/page-community-context', () => ({
  requirePageCommunityMembership: requirePageCommunityMembershipMock,
}));

vi.mock('@/lib/tenant/resolve-community-context', () => ({
  resolveCommunityContext: resolveCommunityContextMock,
}));

vi.mock('@/lib/tenant/community-resolution', () => ({
  toUrlSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('@/lib/services/onboarding-checklist-service', () => ({
  hasChecklistItems: hasChecklistItemsMock,
  getItemKeysForRole: vi.fn(() => []),
  CHECKLIST_DISPLAY: {},
}));

vi.mock('@propertypro/db', () => ({
  announcements: {},
  complianceChecklistItems: { documentId: {}, isApplicable: {}, deletedAt: {} },
  units: { ownerUserId: {}, unitNumber: {}, building: {}, floor: {} },
  createScopedClient: vi.fn(() => ({
    query: vi.fn(async () => []),
    selectFrom: selectFromMock,
  })),
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: vi.fn(),
  isNull: vi.fn(),
}));

vi.mock('@/lib/api/branding', () => ({
  getBrandingForCommunity: vi.fn(async () => null),
}));

vi.mock('@/lib/announcements/read-visibility', () => ({
  filterVisibleAnnouncements: vi.fn(async () => ({ rows: [] })),
  getAnnouncementCommunityContext: vi.fn(() => ({})),
}));

vi.mock('@/components/onboarding/welcome-screen', () => ({
  WelcomeScreen: welcomeScreenMock,
}));

import { complianceChecklistItems } from '@propertypro/db';
import WelcomePage from '../../../src/app/(authenticated)/welcome/page';

describe('WelcomePage redirect behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveCommunityContextMock.mockReturnValue({ communityId: 42 });
    requirePageAuthenticatedUserMock.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      phone: null,
      fullName: 'Test User',
      user_metadata: { full_name: 'Test User' },
    });
    requirePageCommunityMembershipMock.mockResolvedValue({
      userId: 'user-1',
      communityId: 42,
      role: 'resident',
      isAdmin: false,
      isUnitOwner: true,
      displayTitle: 'Owner',
      communityType: 'condo_718',
      communityName: 'Sunset Condos',
      city: 'Miami',
      state: 'FL',
      designation: null,
    });
  });

  it('redirects already-welcomed users to the dashboard with communityId', async () => {
    hasChecklistItemsMock.mockResolvedValue(true);

    await expect(
      WelcomePage({ searchParams: Promise.resolve({ communityId: '42' }) }),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(redirectMock).toHaveBeenCalledWith('/dashboard?communityId=42');
  });
});

describe('WelcomePage role/designation prop passing', () => {
  const baseManagerMembership = {
    userId: 'user-1',
    communityId: 42,
    role: 'property_manager',
    isAdmin: true,
    isUnitOwner: false,
    displayTitle: 'Manager',
    communityType: 'condo_718',
    communityName: 'Sunset Condos',
    city: 'Miami',
    state: 'FL',
    presetKey: undefined as string | undefined,
    designation: null as string | null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resolveCommunityContextMock.mockReturnValue({ communityId: 42 });
    requirePageAuthenticatedUserMock.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      phone: null,
      fullName: 'Test User',
      user_metadata: { full_name: 'Test User' },
    });
    hasChecklistItemsMock.mockResolvedValue(false);
  });

  async function renderWithMembership(
    overrides: Partial<typeof baseManagerMembership>,
  ): Promise<{ role: string; designation: string | null; isUnitOwner: boolean }> {
    requirePageCommunityMembershipMock.mockResolvedValue({
      ...baseManagerMembership,
      ...overrides,
    });
    const element = (await WelcomePage({
      searchParams: Promise.resolve({ communityId: '42' }),
    })) as unknown as {
      type: unknown;
      props: { role: string; designation: string | null; isUnitOwner: boolean };
    };
    expect(element.type).toBe(welcomeScreenMock);
    return {
      role: element.props.role,
      designation: element.props.designation,
      isUnitOwner: element.props.isUnitOwner,
    };
  }

  it('passes the v3 role and designation straight through (board_president)', async () => {
    const props = await renderWithMembership({
      role: 'manager',
      designation: 'board_president',
    });
    expect(props.role).toBe('manager');
    expect(props.designation).toBe('board_president');
  });

  it('passes the board_member designation straight through', async () => {
    const props = await renderWithMembership({
      role: 'manager',
      designation: 'board_member',
    });
    expect(props.role).toBe('manager');
    expect(props.designation).toBe('board_member');
  });

  it('passes a property_manager with no designation through unchanged', async () => {
    const props = await renderWithMembership({
      role: 'property_manager',
      designation: null,
    });
    expect(props.role).toBe('property_manager');
    expect(props.designation).toBeNull();
  });

  it('passes resident role + isUnitOwner through unchanged', async () => {
    const props = await renderWithMembership({
      role: 'resident',
      designation: null,
      isUnitOwner: true,
    });
    expect(props.role).toBe('resident');
    expect(props.designation).toBeNull();
    expect(props.isUnitOwner).toBe(true);
  });
});

/**
 * The compliance score is gated like GET /api/v1/compliance
 * (`compliance: read`): tenants — and every apartment member — must not get it
 * in their payload, even though TenantCards never renders it.
 */
describe('WelcomePage compliance snapshot gate', () => {
  const CHECKLIST = [
    { documentId: 1, isApplicable: true },
    { documentId: null, isApplicable: true },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    resolveCommunityContextMock.mockReturnValue({ communityId: 42 });
    requirePageAuthenticatedUserMock.mockResolvedValue({ id: 'user-1', fullName: 'Test User' });
    hasChecklistItemsMock.mockResolvedValue(false);
    selectFromMock.mockImplementation(async (table: unknown) =>
      table === complianceChecklistItems ? CHECKLIST : [],
    );
  });

  async function complianceFor(membership: Record<string, unknown>) {
    requirePageCommunityMembershipMock.mockResolvedValue({
      userId: 'user-1',
      communityId: 42,
      communityName: 'Sunset Condos',
      city: 'Miami',
      state: 'FL',
      designation: null,
      ...membership,
    });
    const element = (await WelcomePage({
      searchParams: Promise.resolve({ communityId: '42' }),
    })) as unknown as { props: { compliance: unknown } };
    return element.props.compliance;
  }

  const readCompliance = () =>
    selectFromMock.mock.calls.some(([table]) => table === complianceChecklistItems);

  it('never reads or sends the score for a tenant', async () => {
    const compliance = await complianceFor({
      role: 'resident', isUnitOwner: false, communityType: 'condo_718',
    });
    expect(compliance).toEqual({ score: 0, totalItems: 0, satisfiedItems: 0 });
    expect(readCompliance()).toBe(false);
  });

  it('still computes it for a condo owner (control)', async () => {
    const compliance = await complianceFor({
      role: 'resident', isUnitOwner: true, communityType: 'condo_718',
    });
    expect(compliance).toEqual({ score: 50, totalItems: 2, satisfiedItems: 1 });
    expect(readCompliance()).toBe(true);
  });
});
