import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
  headersMock,
  notFoundMock,
  findCommunityBySlugUnscopedMock,
  getCommunityPublicInfoMock,
  getTransparencyPageDataMock,
} = vi.hoisted(() => ({
  headersMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  findCommunityBySlugUnscopedMock: vi.fn(),
  getCommunityPublicInfoMock: vi.fn(),
  getTransparencyPageDataMock: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: headersMock }));
vi.mock('next/navigation', () => ({ notFound: notFoundMock }));
vi.mock('@propertypro/db/unsafe', () => ({
  findCommunityBySlugUnscoped: findCommunityBySlugUnscopedMock,
}));
vi.mock('@/lib/api/branding', () => ({
  getCommunityPublicInfo: getCommunityPublicInfoMock,
}));
// Real module: exercises the real resolveLifecycleState + getFeaturesForCommunity.
vi.mock('@propertypro/shared', async (orig) => ({ ...(await orig<any>()) }));
vi.mock('@/components/transparency/transparency-page', () => ({
  TransparencyPage: () => null,
}));
vi.mock('@/components/transparency/transparency-disabled-empty-state', () => ({
  TransparencyDisabledEmptyState: () => null,
}));
vi.mock('@/lib/services/transparency-service', () => ({
  getTransparencyPageData: getTransparencyPageDataMock,
}));
vi.mock('@/lib/utils/timezone', () => ({
  resolveTimezone: () => 'America/New_York',
}));

import Page from '@/app/public-transparency/page';

function communityRow(overrides: Record<string, unknown>) {
  return {
    id: 42,
    slug: 'x',
    name: 'X',
    communityType: 'condo_718',
    transparencyEnabled: true,
    timezone: 'America/New_York',
    addressLine1: null,
    addressLine2: null,
    city: null,
    state: null,
    zipCode: null,
    subscriptionStatus: null,
    subscriptionCanceledAt: null,
    freeAccessExpiresAt: null,
    ...overrides,
  };
}

describe('public transparency — lapsed gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Map([['x-community-id', '42']]));
    getCommunityPublicInfoMock.mockResolvedValue({
      id: 42,
      slug: 'x',
      name: 'X',
      communityType: 'condo_718',
    });
    getTransparencyPageDataMock.mockResolvedValue({});
  });

  it('renders (no notFound) for a community in the paid grace window', async () => {
    findCommunityBySlugUnscopedMock.mockResolvedValue(
      communityRow({
        subscriptionStatus: 'canceled',
        subscriptionCanceledAt: new Date(Date.now() - 2 * 864e5), // grace
      }),
    );
    await Page();
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('notFound()s for a lapsed community (grace expired)', async () => {
    findCommunityBySlugUnscopedMock.mockResolvedValue(
      communityRow({
        subscriptionStatus: 'canceled',
        subscriptionCanceledAt: new Date(Date.now() - 30 * 864e5), // lapsed
      }),
    );
    await expect(Page()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('renders for an active community', async () => {
    findCommunityBySlugUnscopedMock.mockResolvedValue(
      communityRow({ subscriptionStatus: 'active' }),
    );
    await Page();
    expect(notFoundMock).not.toHaveBeenCalled();
  });
});
