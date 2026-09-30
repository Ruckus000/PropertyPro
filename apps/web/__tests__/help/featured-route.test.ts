/**
 * Unit tests for GET /api/v1/help/featured.
 *
 * Mocks the service boundary (getFeaturedForReader) with a fake over an
 * in-memory list of featured articles that applies the REAL
 * isArticleVisibleToReader, so the reader the route resolves from the
 * membership (lib/help/reader.ts) decides what is returned. Only the
 * community feature lookup in @propertypro/shared is stubbed.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Sentry mock — required because we use the real withErrorHandler below
// (so UnauthorizedError translates to a 401 response). withErrorHandler
// imports @sentry/nextjs; mock it to avoid a real network call.
vi.mock('@sentry/nextjs', () => ({
  withScope: vi.fn((cb: (scope: unknown) => void) =>
    cb({ setTag: vi.fn(), setUser: vi.fn() }),
  ),
  captureException: vi.fn(),
}));

type FeaturedArticle = Record<string, unknown> & { slug: string; featured: boolean };

const {
  featuredCorpus,
  getFeaturedForReaderMock,
  getFeaturesForCommunityMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
} = vi.hoisted(() => ({
  featuredCorpus: [] as FeaturedArticle[],
  getFeaturedForReaderMock: vi.fn(),
  getFeaturesForCommunityMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
}));

vi.mock('@/lib/services/help-article-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/help-article-service')>();
  type Reader = Parameters<typeof actual.isArticleVisibleToReader>[1];
  type Meta = Parameters<typeof actual.isArticleVisibleToReader>[0];
  getFeaturedForReaderMock.mockImplementation((reader: Reader, limit = 6) =>
    featuredCorpus
      .filter((a) => a.featured && actual.isArticleVisibleToReader(a as unknown as Meta, reader))
      .slice(0, limit),
  );
  return { getFeaturedForReader: getFeaturedForReaderMock };
});

// Real module (it is side-effect free), with only the feature lookup stubbed:
// the help reader resolver reads hasBoardDesignation from here.
vi.mock('@propertypro/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@propertypro/shared')>()),
  getFeaturesForCommunity: getFeaturesForCommunityMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));

// NOTE: withErrorHandler is NOT mocked — using the real implementation
// lets thrown errors (UnauthorizedError, NotFoundError, etc.) translate
// to the correct HTTP status codes.

import { GET } from '../../src/app/api/v1/help/featured/route';

function article(overrides: Partial<FeaturedArticle> & { slug: string }): FeaturedArticle {
  return {
    title: 'Welcome',
    category: 'getting-started',
    description: 'Get started',
    section: 'resident',
    communityTypes: ['condo_718', 'hoa_720', 'apartment'],
    boardOnly: false,
    featureGates: [],
    keywords: [],
    relatedArticles: [],
    featured: true,
    ...overrides,
  };
}

function makeRequest() {
  return new NextRequest(new URL('/api/v1/help/featured?communityId=1', 'http://localhost:3000'));
}

describe('GET /api/v1/help/featured', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    featuredCorpus.splice(0, featuredCorpus.length);
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue({
      // v3 shape: what requireCommunityMembership actually returns for an owner.
      role: 'resident',
      isUnitOwner: true,
      presetKey: null,
      communityType: 'condo_718',
    });
    resolveEffectiveCommunityIdMock.mockReturnValue(1);
    getFeaturesForCommunityMock.mockReturnValue({});
  });

  it("returns the featured list for the reader's section", async () => {
    featuredCorpus.push(
      article({ slug: 'getting-around' }),
      article({ slug: 'manager-welcome', section: 'manager' }),
    );
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([
      {
        title: 'Welcome',
        description: 'Get started',
        category: 'getting-started',
        slug: 'getting-around',
      },
    ]);
    // A resident owner reads the resident section of their own community type;
    // the in-app panel asks for four.
    expect(getFeaturedForReaderMock).toHaveBeenCalledWith(
      expect.objectContaining({ section: 'resident', communityType: 'condo_718' }),
      4,
    );
  });

  it('returns an empty array when no featured articles match the reader', async () => {
    featuredCorpus.push(article({ slug: 'manager-welcome', section: 'manager' }));
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it('returns 401 when the session is not authenticated', async () => {
    const { UnauthorizedError } = await import('@/lib/api/errors/UnauthorizedError');
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('excludes feature-gated articles from the featured list', async () => {
    featuredCorpus.push(
      article({ title: 'E-Vote', category: 'voting', slug: 'e-vote', featureGates: ['hasVoting'] }),
    );
    // The community's features have the gate off.
    getFeaturesForCommunityMock.mockReturnValue({ hasVoting: false });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(getFeaturesForCommunityMock).toHaveBeenCalledWith('condo_718');
    expect(getFeaturedForReaderMock).toHaveBeenCalledWith(
      expect.objectContaining({ features: { hasVoting: false } }),
      4,
    );
  });
});
