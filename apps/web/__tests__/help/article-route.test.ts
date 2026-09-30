/**
 * Unit tests for GET /api/v1/help/article.
 *
 * Scope:
 * - Happy path returns server-rendered help HTML + toc + metadata + related
 * - Invalid params → 400 (ContractValidationError thrown by runRoute; caught
 *   by withErrorHandler)
 * - Missing article → 404
 * - Article outside the reader's section → 404 (NOT 403; we don't leak existence)
 * - Feature-gated article → 404
 * - Old (pre-section) slug → the reader's replacement article
 *
 * Mocks the service boundary (getArticleForReader, findArticleForReader) with
 * fakes over an in-memory corpus that delegate visibility to the REAL
 * isArticleVisibleToReader, so section / community-type / feature-gate rules
 * are exercised as the reader resolved by lib/help/reader.ts sees them. The
 * real lib/help/render-article.ts runs with next-mdx-remote/rsc compileMDX,
 * the static React render step and unstable_cache stubbed; the real
 * sanitizeHelpHtml runs on the rendered markup.
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

type CorpusArticle = {
  metadata: Record<string, unknown> & { slug: string; category: string; section: string };
  rawContent: string;
};

const {
  corpus,
  getArticleForReaderMock,
  findArticleForReaderMock,
  compileMDXMock,
  extractTableOfContentsMock,
  unstableCacheMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  getFeaturesForCommunityMock,
  renderToStaticMarkupMock,
} = vi.hoisted(() => ({
  // The in-memory help corpus the service fakes read from (reset per test).
  corpus: [] as CorpusArticle[],
  getArticleForReaderMock: vi.fn(),
  findArticleForReaderMock: vi.fn(),
  compileMDXMock: vi.fn(),
  extractTableOfContentsMock: vi.fn(),
  // Return type declared, not inferred: the suite's `beforeEach` swaps in an
  // implementation that INVOKES `fn` instead of handing it back, so the seed's
  // `() => unknown` must not be pinned onto the mock.
  unstableCacheMock: vi.fn((fn: () => unknown): unknown => fn),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  getFeaturesForCommunityMock: vi.fn(),
  renderToStaticMarkupMock: vi.fn(
    () =>
      '<h2 id="heading" onclick="alert(1)">Heading</h2><script>alert(1)</script><p>Body text.</p>',
  ),
}));

// Service boundary: the lookups are faked over `corpus`, but visibility is the
// REAL isArticleVisibleToReader (section, community type, drafts, feature gates).
vi.mock('@/lib/services/help-article-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/help-article-service')>();
  type Reader = Parameters<typeof actual.isArticleVisibleToReader>[1];
  type Meta = Parameters<typeof actual.isArticleVisibleToReader>[0];
  const visible = (article: CorpusArticle, reader: Reader) =>
    actual.isArticleVisibleToReader(article.metadata as unknown as Meta, reader);
  getArticleForReaderMock.mockImplementation(
    (category: string, slug: string, reader: Reader) =>
      corpus.find(
        (a) =>
          a.metadata.category === category &&
          a.metadata.slug === slug &&
          a.metadata.section === reader.section &&
          visible(a, reader),
      ) ?? null,
  );
  findArticleForReaderMock.mockImplementation(
    (slug: string, reader: Reader) =>
      corpus.find(
        (a) => a.metadata.slug === slug && a.metadata.section === reader.section && visible(a, reader),
      )?.metadata ?? null,
  );
  return {
    isArticleVisibleToReader: actual.isArticleVisibleToReader,
    getArticleForReader: getArticleForReaderMock,
    findArticleForReader: findArticleForReaderMock,
  };
});

vi.mock('next-mdx-remote/rsc', () => ({
  compileMDX: compileMDXMock,
}));

vi.mock('react-dom/server', () => ({
  renderToStaticMarkup: renderToStaticMarkupMock,
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

// Real module (it is side-effect free), with only the feature lookup stubbed:
// the help reader resolver reads hasBoardDesignation from here.
vi.mock('@propertypro/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@propertypro/shared')>()),
  getFeaturesForCommunity: getFeaturesForCommunityMock,
}));

import { GET } from '../../src/app/api/v1/help/article/route';

function makeRequest(url: string) {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

function makeMetadata(overrides: Record<string, unknown> & { slug: string }) {
  return {
    title: 'Fixing compliance gaps',
    description: 'How to resolve flagged compliance gaps.',
    category: 'compliance',
    section: 'board',
    communityTypes: ['condo_718', 'hoa_720', 'apartment'],
    draft: false,
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
    stepCount: 0,
    contentHash: 'abc123',
    ...overrides,
  };
}

const sampleArticle: CorpusArticle = {
  metadata: makeMetadata({ slug: 'fix-compliance-gaps' }),
  rawContent: '## Heading\n\nBody text.',
};

const ARTICLE_URL =
  '/api/v1/help/article?category=compliance&slug=fix-compliance-gaps&communityId=1';

const compiledResult = { content: 'mdx-content-element', frontmatter: {} };

describe('GET /api/v1/help/article', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    corpus.splice(0, corpus.length, sampleArticle);
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    // A board-designated owner: reads the 'board' section.
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'resident',
      isUnitOwner: true,
      designation: 'board_member',
      presetKey: null,
      communityType: 'condo_718',
    });
    resolveEffectiveCommunityIdMock.mockReturnValue(1);
    getFeaturesForCommunityMock.mockReturnValue({ hasCompliance: true });
    compileMDXMock.mockResolvedValue(compiledResult);
    extractTableOfContentsMock.mockReturnValue([
      { depth: 2, label: 'Heading', anchor: 'heading' },
    ]);
    unstableCacheMock.mockImplementation((fn: () => unknown) => fn());
  });

  it('returns sanitized server-rendered HTML + toc + metadata on happy path', async () => {
    const res = await GET(makeRequest(ARTICLE_URL));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.html).toContain('<h2 id="heading">Heading</h2>');
    expect(body.data.html).toContain('<p>Body text.</p>');
    expect(body.data.html).not.toContain('onclick');
    expect(body.data.html).not.toContain('<script');
    expect(body.data.toc).toEqual([{ depth: 2, label: 'Heading', anchor: 'heading' }]);
    expect(body.data.metadata.slug).toBe('fix-compliance-gaps');
    expect(body.data.metadata.section).toBe('board');
    expect(body.data.related).toEqual([]);
    expect(body.data.upNext).toBeNull();
    expect(compileMDXMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: sampleArticle.rawContent,
        options: { parseFrontmatter: true },
      }),
    );
    // Looked up for the reader the membership resolves to.
    expect(getArticleForReaderMock).toHaveBeenCalledWith(
      'compliance',
      'fix-compliance-gaps',
      expect.objectContaining({ section: 'board', communityType: 'condo_718' }),
    );
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
    const res = await GET(
      makeRequest('/api/v1/help/article?category=compliance&slug=missing&communityId=1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 401 when the session is not authenticated', async () => {
    const { UnauthorizedError } = await import('@/lib/api/errors/UnauthorizedError');
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());
    const res = await GET(makeRequest(ARTICLE_URL));
    expect(res.status).toBe(401);
  });

  it("returns 404 (not 403) when the article is outside the reader's section", async () => {
    // Only a manager-section version exists; the board reader must not learn of it.
    corpus.splice(0, corpus.length, {
      ...sampleArticle,
      metadata: { ...sampleArticle.metadata, section: 'manager' },
    });
    const res = await GET(makeRequest(ARTICLE_URL));
    expect(res.status).toBe(404);
    expect(compileMDXMock).not.toHaveBeenCalled();
  });

  it('returns 404 when article is feature-gated and feature is off', async () => {
    corpus.splice(0, corpus.length, {
      ...sampleArticle,
      metadata: { ...sampleArticle.metadata, featureGates: ['hasCompliance'] },
    });
    getFeaturesForCommunityMock.mockReturnValue({ hasCompliance: false });
    const res = await GET(makeRequest(ARTICLE_URL));
    expect(res.status).toBe(404);
  });

  it('excludes feature-gated related articles from the related field', async () => {
    const gatedRelated: CorpusArticle = {
      metadata: makeMetadata({ slug: 'gated-related-slug', featureGates: ['hasVoting'] }),
      rawContent: '',
    };
    const openRelated: CorpusArticle = {
      metadata: makeMetadata({ slug: 'open-related-slug', title: 'Compliance score' }),
      rawContent: '',
    };
    // The requested article lists both; the gated one's feature is off here.
    corpus.splice(
      0,
      corpus.length,
      {
        ...sampleArticle,
        metadata: {
          ...sampleArticle.metadata,
          relatedArticles: ['gated-related-slug', 'open-related-slug'],
        },
      },
      gatedRelated,
      openRelated,
    );
    getFeaturesForCommunityMock.mockReturnValue({ hasCompliance: true, hasVoting: false });

    const res = await GET(makeRequest(ARTICLE_URL));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.related.map((a: { slug: string }) => a.slug)).toEqual(['open-related-slug']);
  });

  it("resolves an old slug to the reader's replacement article", async () => {
    // Pre-section URL /help/documents/uploading-documents: a board reader gets
    // the default replacement ('find-documents'), not the manager's upload guide.
    corpus.splice(
      0,
      corpus.length,
      {
        metadata: makeMetadata({
          slug: 'find-documents',
          title: 'Find documents',
          category: 'documents',
          section: 'board',
        }),
        rawContent: '## Heading\n\nBody text.',
      },
      {
        metadata: makeMetadata({
          slug: 'upload-document',
          title: 'Upload a document',
          category: 'documents',
          section: 'manager',
        }),
        rawContent: '## Heading\n\nBody text.',
      },
    );

    const res = await GET(
      makeRequest(
        '/api/v1/help/article?category=documents&slug=uploading-documents&communityId=1',
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.metadata.slug).toBe('find-documents');
    expect(body.data.metadata.section).toBe('board');
    expect(body.data.metadata.category).toBe('documents');
  });
});
