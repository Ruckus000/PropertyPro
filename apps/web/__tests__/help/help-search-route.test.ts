/**
 * Route unit test — `GET /api/v1/help/search`.
 *
 * Added alongside Plan A1 drain #28 (Move 2 bundle). Asserts auth chain +
 * parallel article/FAQ search + envelope. Sentry `captureMessage` calls are
 * stubbed; we do not assert telemetry firing in this unit suite (covered by
 * a dedicated feature-gate test in the help folder).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  getAllArticlesMock,
  safelyFilterArticlesByFeaturesMock,
  searchArticlesMock,
  searchCommunityFaqsMock,
  getFeaturesForCommunityMock,
  captureMessageMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  getAllArticlesMock: vi.fn(),
  safelyFilterArticlesByFeaturesMock: vi.fn(),
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

vi.mock('@/lib/services/help-article-service', () => ({
  getAllArticles: getAllArticlesMock,
  safelyFilterArticlesByFeatures: safelyFilterArticlesByFeaturesMock,
  searchArticles: searchArticlesMock,
}));

vi.mock('@/lib/services/faq-service', () => ({
  searchCommunityFaqs: searchCommunityFaqsMock,
}));

vi.mock('@propertypro/shared', () => ({
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
  roles: ['resident'],
  readTimeMinutes: 5,
};

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
    getAllArticlesMock.mockReturnValue([ARTICLE]);
    getFeaturesForCommunityMock.mockReturnValue({});
    safelyFilterArticlesByFeaturesMock.mockReturnValue([ARTICLE]);
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
        roles: ['resident'],
        readTimeMinutes: 5,
      },
    ]);
    expect(json.data.faqs).toEqual([{ id: 1, question: 'Q', answer: 'A' }]);
    expect(searchCommunityFaqsMock).toHaveBeenCalledWith(42, 'compliance', 10);
  });

  it('fails open when getFeaturesForCommunity throws — still returns results', async () => {
    getFeaturesForCommunityMock.mockImplementationOnce(() => {
      throw new Error('feature-flag boom');
    });

    const res = await GET(
      buildReq('http://localhost/api/v1/help/search?q=compliance&communityId=42'),
    );

    expect(res.status).toBe(200);
    expect(captureMessageMock).toHaveBeenCalledWith(
      'help_feature_gate_failure',
      expect.objectContaining({ level: 'warning' }),
    );
    expect(safelyFilterArticlesByFeaturesMock).toHaveBeenCalledWith(
      [ARTICLE],
      null,
      expect.any(Object),
    );
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
