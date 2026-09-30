/**
 * Route unit test — `GET /api/v1/help/search`.
 *
 * Added alongside Plan A1 drain #28 (Move 2 bundle). Asserts auth chain +
 * parallel article/FAQ search + envelope, and fail-open on feature-gate
 * evaluation errors (reported via getArticlesForReader's `onFeatureError`).
 *
 * Mocks the service boundary: getArticlesForReader is a fake over an
 * in-memory corpus that applies the REAL isArticleVisibleToReader (so the
 * reader resolved from the membership, and the fail-open path, are real);
 * searchArticles is a plain stub. Sentry `captureMessage` is stubbed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  corpus,
  getArticlesForReaderMock,
  searchArticlesMock,
  searchCommunityFaqsMock,
  getFeaturesForCommunityMock,
  captureMessageMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  corpus: [] as Array<Record<string, unknown>>,
  getArticlesForReaderMock: vi.fn(),
  searchArticlesMock: vi.fn(),
  searchCommunityFaqsMock: vi.fn(),
  getFeaturesForCommunityMock: vi.fn(),
  captureMessageMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/services/help-article-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/help-article-service')>();
  type Reader = Parameters<typeof actual.isArticleVisibleToReader>[1];
  type Meta = Parameters<typeof actual.isArticleVisibleToReader>[0];
  getArticlesForReaderMock.mockImplementation(
    (reader: Reader, options?: { onFeatureError?: (error: unknown) => void }) =>
      corpus.filter((a) =>
        actual.isArticleVisibleToReader(a as unknown as Meta, reader, {
          onFeatureError: options?.onFeatureError,
        }),
      ),
  );
  return {
    getArticlesForReader: getArticlesForReaderMock,
    searchArticles: searchArticlesMock,
  };
});

vi.mock('@/lib/services/faq-service', () => ({
  searchCommunityFaqs: searchCommunityFaqsMock,
}));

// Real module (it is side-effect free), with only the feature lookup stubbed:
// the help reader/viewer resolvers read hasBoardDesignation from here.
vi.mock('@propertypro/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@propertypro/shared')>()),
  getFeaturesForCommunity: getFeaturesForCommunityMock,
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: captureMessageMock,
}));

import { GET } from '../../src/app/api/v1/help/search/route';

const MEMBERSHIP = {
  userId: 'user-1',
  communityId: 42,
  role: 'resident' as const,
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Unit Owner',
  communityType: 'condo_718' as const,
};

const ARTICLE = {
  title: 'Compliance basics',
  description: 'Intro',
  category: 'Compliance',
  slug: 'compliance-basics',
  section: 'resident',
  communityTypes: ['condo_718', 'hoa_720', 'apartment'],
  boardOnly: false,
  featureGates: [] as string[],
  readTimeMinutes: 5,
};

// Never visible to a resident owner without a seat: a board-only article, and
// the manager section's version of the same slug.
const BOARD_ARTICLE = { ...ARTICLE, slug: 'run-election', boardOnly: true };
const MANAGER_ARTICLE = { ...ARTICLE, section: 'manager' };

interface SearchEnvelopeJson {
  data: { articles: Array<Record<string, unknown>>; faqs: Array<Record<string, unknown>> };
}

interface ErrorJson {
  error: { code: string; message: string };
}

type NextRequestInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;

function buildReq(url: string, init?: NextRequestInit): NextRequest {
  return new NextRequest(url, init);
}

describe('GET /api/v1/help/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    corpus.splice(0, corpus.length, ARTICLE, BOARD_ARTICLE, MANAGER_ARTICLE);
    getFeaturesForCommunityMock.mockReturnValue({});
    searchArticlesMock.mockReturnValue([ARTICLE]);
    searchCommunityFaqsMock.mockResolvedValue({
      hits: [{ id: 1, question: 'Q', answer: 'A' }],
      totalRowCount: 1,
    });
  });

  it('returns parallel article + faq results — happy path', async () => {
    const res = await GET(
      buildReq('http://localhost/api/v1/help/search?q=compliance&communityId=42'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as SearchEnvelopeJson;
    expect(json.data.articles).toEqual([
      {
        title: 'Compliance basics',
        description: 'Intro',
        category: 'Compliance',
        slug: 'compliance-basics',
        section: 'resident',
        readTimeMinutes: 5,
      },
    ]);
    expect(json.data.faqs).toEqual([{ id: 1, question: 'Q', answer: 'A' }]);
    // Route-authz census F4: both sources are filtered for the viewer. Articles
    // by the reader (a resident owner reads the 'resident' section), FAQs by
    // audience tokens (a resident owner resolves to 'owner'). Revert-check: search
    // the whole corpus, or drop the viewer from the FAQ call, and this goes red.
    expect(getArticlesForReaderMock).toHaveBeenCalledWith(
      expect.objectContaining({ section: 'resident', communityType: 'condo_718' }),
      expect.objectContaining({ onFeatureError: expect.any(Function) }),
    );
    expect(searchArticlesMock).toHaveBeenCalledWith([ARTICLE], 'compliance');
    expect(searchCommunityFaqsMock).toHaveBeenCalledWith(42, 'compliance', ['owner'], 10);
  });

  it('fails open when feature evaluation throws — still returns results', async () => {
    const GATED = { ...ARTICLE, slug: 'e-voting', featureGates: ['hasVoting'] };
    corpus.splice(0, corpus.length, ARTICLE, GATED);
    // A malformed feature record: reading any gate throws.
    getFeaturesForCommunityMock.mockReturnValueOnce(
      new Proxy(
        {},
        {
          get() {
            throw new Error('feature-flag boom');
          },
        },
      ),
    );

    const res = await GET(
      buildReq('http://localhost/api/v1/help/search?q=compliance&communityId=42'),
    );

    expect(res.status).toBe(200);
    expect(captureMessageMock).toHaveBeenCalledWith(
      'help_feature_gate_failure',
      expect.objectContaining({ level: 'warning' }),
    );
    // The gated article is kept (fail open), not dropped.
    expect(searchArticlesMock).toHaveBeenCalledWith([ARTICLE, GATED], 'compliance');
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(
      buildReq('http://localhost/api/v1/help/search?q=compliance&communityId=42'),
    );

    expect(res.status).toBe(401);
    expect(searchCommunityFaqsMock).not.toHaveBeenCalled();
  });

  it('returns 403 when requireCommunityMembership throws', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError('Not a member'));

    const res = await GET(
      buildReq('http://localhost/api/v1/help/search?q=compliance&communityId=42'),
    );

    expect(res.status).toBe(403);
    expect(searchCommunityFaqsMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when q is missing', async () => {
    const res = await GET(buildReq('http://localhost/api/v1/help/search?communityId=42'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorJson;
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR when q is shorter than 2 chars', async () => {
    const res = await GET(
      buildReq('http://localhost/api/v1/help/search?q=a&communityId=42'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorJson;
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR when communityId is non-numeric', async () => {
    const res = await GET(
      buildReq('http://localhost/api/v1/help/search?q=compliance&communityId=abc'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorJson;
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when x-community-id header disagrees with query communityId', async () => {
    const res = await GET(
      buildReq('http://localhost/api/v1/help/search?q=compliance&communityId=42', {
        headers: { 'x-community-id': '99' },
      }),
    );

    expect(res.status).toBe(404);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(searchArticlesMock).not.toHaveBeenCalled();
    expect(searchCommunityFaqsMock).not.toHaveBeenCalled();
  });
});
