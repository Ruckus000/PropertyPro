/**
 * Unit tests for GET /api/v1/help/article.
 *
 * Scope:
 * - Happy path returns serialized MDX + toc + metadata + related
 * - Invalid params → 400 (ContractValidationError thrown by runRoute; caught
 *   by withErrorHandler)
 * - Missing article → 404
 * - Role-gated article → 404 (NOT 403; we don't leak existence)
 * - Feature-gated article → 404
 *
 * Mocks the service boundary (getArticle, isArticleVisibleToRole,
 * filterArticlesByFeatures) and the next-mdx-remote/serialize call.
 *
 * withErrorHandler is NOT mocked — we use the real implementation so that
 * NotFoundError (thrown in the handler) and ContractValidationError (thrown
 * by runRoute) are translated to the correct HTTP status codes. This matches
 * the me-communities-route.test.ts pattern (Plan A1 drain #1).
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Sentry mock — must be hoisted so withErrorHandler (which imports @sentry/nextjs)
// doesn't attempt a real Sentry network call in tests.
// ---------------------------------------------------------------------------
vi.mock('@sentry/nextjs', () => ({
  withScope: vi.fn((cb: (scope: unknown) => void) =>
    cb({ setTag: vi.fn(), setUser: vi.fn() }),
  ),
  captureException: vi.fn(),
}));

const {
  getArticleMock,
  isArticleVisibleToRoleMock,
  filterArticlesByFeaturesMock,
  getAllArticlesMock,
  serializeMock,
  extractTableOfContentsMock,
  unstableCacheMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  getFeaturesForCommunityMock,
} = vi.hoisted(() => ({
  getArticleMock: vi.fn(),
  isArticleVisibleToRoleMock: vi.fn(),
  filterArticlesByFeaturesMock: vi.fn(),
  getAllArticlesMock: vi.fn(),
  serializeMock: vi.fn(),
  extractTableOfContentsMock: vi.fn(),
  unstableCacheMock: vi.fn((fn: () => unknown) => fn),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  getFeaturesForCommunityMock: vi.fn(),
}));

vi.mock('@/lib/services/help-article-service', () => ({
  getArticle: getArticleMock,
  isArticleVisibleToRole: isArticleVisibleToRoleMock,
  filterArticlesByFeatures: filterArticlesByFeaturesMock,
  getAllArticles: getAllArticlesMock,
}));

vi.mock('next-mdx-remote/serialize', () => ({
  serialize: serializeMock,
}));

vi.mock('@/lib/help/toc', () => ({
  extractTableOfContents: extractTableOfContentsMock,
}));

vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => unknown) => () => unstableCacheMock(fn),
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

vi.mock('@propertypro/shared', () => ({
  getFeaturesForCommunity: getFeaturesForCommunityMock,
}));

import { GET } from '../../src/app/api/v1/help/article/route';

function makeRequest(url: string) {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

const sampleArticle = {
  metadata: {
    title: 'Fixing compliance gaps',
    description: 'How to resolve flagged compliance gaps.',
    category: 'compliance',
    slug: 'fixing-compliance-gaps',
    roles: ['board_member'],
    keywords: [],
    tags: [],
    relatedArticles: [],
    featured: false,
    excerpt: '',
    filePath: '/tmp/article.mdx',
    contextPaths: ['/compliance'],
    statutes: [],
    featureGates: [],
    updatedAt: '2026-05-01',
    readTimeMinutes: 3,
    contentHash: 'abc123',
  },
  rawContent: '## Heading\n\nBody text.',
};

const serializedResult = { compiledSource: 'compiled', frontmatter: {}, scope: {} };

describe('GET /api/v1/help/article', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'board_member',
      presetKey: null,
      communityType: 'condo_718',
    });
    resolveEffectiveCommunityIdMock.mockReturnValue(1);
    getFeaturesForCommunityMock.mockReturnValue({ compliance: true });
    isArticleVisibleToRoleMock.mockReturnValue(true);
    filterArticlesByFeaturesMock.mockReturnValue([sampleArticle.metadata]);
    getAllArticlesMock.mockReturnValue([]);
    serializeMock.mockResolvedValue(serializedResult);
    extractTableOfContentsMock.mockReturnValue([
      { depth: 2, label: 'Heading', anchor: 'heading' },
    ]);
    unstableCacheMock.mockImplementation((fn: () => unknown) => fn());
    getArticleMock.mockReturnValue(sampleArticle);
  });

  it('returns serialized MDX + toc + metadata on happy path', async () => {
    const res = await GET(
      makeRequest('/api/v1/help/article?category=compliance&slug=fixing-compliance-gaps&communityId=1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.source).toEqual(serializedResult);
    expect(body.data.toc).toEqual([{ depth: 2, label: 'Heading', anchor: 'heading' }]);
    expect(body.data.metadata.slug).toBe('fixing-compliance-gaps');
    expect(body.data.related).toEqual([]);
  });

  it('returns 400 on invalid params (empty category/slug)', async () => {
    // runRoute validates the contract query schema and throws ContractValidationError;
    // withErrorHandler catches it and returns a 400 response.
    const res = await GET(
      makeRequest('/api/v1/help/article?category=&slug=&communityId=1'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when article does not exist', async () => {
    getArticleMock.mockReturnValue(null);
    const res = await GET(
      makeRequest('/api/v1/help/article?category=compliance&slug=missing&communityId=1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 (not 403) when article is role-gated', async () => {
    isArticleVisibleToRoleMock.mockReturnValue(false);
    const res = await GET(
      makeRequest('/api/v1/help/article?category=compliance&slug=fixing-compliance-gaps&communityId=1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when article is feature-gated and feature is off', async () => {
    filterArticlesByFeaturesMock.mockReturnValue([]);
    const res = await GET(
      makeRequest('/api/v1/help/article?category=compliance&slug=fixing-compliance-gaps&communityId=1'),
    );
    expect(res.status).toBe(404);
  });

  it('excludes feature-gated related articles from the related field', async () => {
    const gatedRelatedMeta = {
      ...sampleArticle.metadata,
      slug: 'gated-related-slug',
      featureGates: ['evoting'],
    };
    // The requested article includes the gated slug in its relatedArticles list
    getArticleMock.mockReturnValue({
      ...sampleArticle,
      metadata: { ...sampleArticle.metadata, relatedArticles: ['gated-related-slug'] },
    });
    // getAllArticles returns the gated related article so the route can find it by slug
    getAllArticlesMock.mockReturnValue([gatedRelatedMeta]);
    // filterArticlesByFeatures passes the requested article but blocks the gated related
    filterArticlesByFeaturesMock.mockImplementation(
      (articles: { slug: string }[]) =>
        articles.filter((a) => a.slug !== 'gated-related-slug'),
    );

    const res = await GET(
      makeRequest('/api/v1/help/article?category=compliance&slug=fixing-compliance-gaps&communityId=1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.related).toEqual([]);
  });
});
