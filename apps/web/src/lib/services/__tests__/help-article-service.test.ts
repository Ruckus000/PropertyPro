import { describe, it, expect, vi, beforeEach } from 'vitest';

// We'll mock fs and gray-matter since the tests run in jsdom
vi.mock('node:fs', () => ({
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  statSync: vi.fn(),
}));

vi.mock('gray-matter', () => ({
  default: vi.fn(),
}));

describe('help-article-service', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('parseArticleFrontmatter', () => {
    it('parses valid frontmatter into ArticleMetadata', async () => {
      const { parseArticleFrontmatter } = await import('../help-article-service');
      const matter = (await import('gray-matter')).default as unknown as ReturnType<typeof vi.fn>;
      matter.mockReturnValue({
        data: {
          title: 'Test Article',
          description: 'A test article',
          category: 'getting-started',
          slug: 'test-article',
          roles: ['owner', 'tenant'],
          keywords: ['test', 'help'],
          relatedArticles: [],
          featured: false,
        },
        content: '# Hello world',
      });

      const result = parseArticleFrontmatter('/fake/path.mdx', 'test content');
      expect(result).toEqual({
        title: 'Test Article',
        description: 'A test article',
        category: 'getting-started',
        slug: 'test-article',
        roles: ['owner', 'tenant'],
        keywords: ['test', 'help'],
        tags: [],
        relatedArticles: [],
        featured: false,
        contextPaths: [],
        statutes: [],
        featureGates: [],
        updatedAt: undefined,
        readTimeMinutes: expect.any(Number),
        filePath: '/fake/path.mdx',
        contentHash: expect.any(String),
      });
    });

    it('defaults featured to false when not specified', async () => {
      const { parseArticleFrontmatter } = await import('../help-article-service');
      const matter = (await import('gray-matter')).default as unknown as ReturnType<typeof vi.fn>;
      matter.mockReturnValue({
        data: {
          title: 'Minimal',
          description: 'Minimal article',
          category: 'docs',
          slug: 'minimal',
          roles: [],
          keywords: [],
          relatedArticles: [],
        },
        content: 'Short content here.',
      });

      const result = parseArticleFrontmatter('/fake/minimal.mdx', 'test');
      expect(result.featured).toBe(false);
      expect(result.contextPaths).toEqual([]);
    });
  });

  describe('matchContextPath', () => {
    it('matches exact paths', async () => {
      const { matchContextPath } = await import('../help-article-service');
      expect(matchContextPath('/compliance', '/compliance')).toBe(true);
      expect(matchContextPath('/compliance', '/documents')).toBe(false);
    });

    it('matches wildcard paths', async () => {
      const { matchContextPath } = await import('../help-article-service');
      expect(matchContextPath('/communities/*/compliance', '/communities/123/compliance')).toBe(true);
      expect(matchContextPath('/communities/*/compliance', '/communities/456/compliance')).toBe(true);
      expect(matchContextPath('/communities/*/compliance', '/communities/123/documents')).toBe(false);
    });

    it('does not match partial segments', async () => {
      const { matchContextPath } = await import('../help-article-service');
      expect(matchContextPath('/compliance', '/compliance-extra')).toBe(false);
    });
  });

  describe('searchArticles', () => {
    it('matches articles by title keyword', async () => {
      const { searchArticles } = await import('../help-article-service');

      const articles = [
        { title: 'Compliance Scoring', description: 'How scoring works', keywords: ['score'], slug: 'scoring', category: 'compliance', roles: [], featured: false, contextPaths: [], relatedArticles: [], tags: [], readTimeMinutes: 3, filePath: '/a.mdx', contentHash: 'test' },
        { title: 'Upload Documents', description: 'How to upload', keywords: ['file'], slug: 'upload', category: 'documents', roles: [], featured: false, contextPaths: [], relatedArticles: [], tags: [], readTimeMinutes: 2, filePath: '/b.mdx', contentHash: 'test'},
      ];

      const results = searchArticles(articles, 'compliance');
      expect(results).toHaveLength(1);
      expect(results[0]!.slug).toBe('scoring');
    });

    it('matches articles by keyword array', async () => {
      const { searchArticles } = await import('../help-article-service');

      const articles = [
        { title: 'Upload Documents', description: 'How to upload', keywords: ['file', 'pdf', 'upload'], slug: 'upload', category: 'documents', roles: [], featured: false, contextPaths: [], relatedArticles: [], tags: [], readTimeMinutes: 2, filePath: '/b.mdx', contentHash: 'test'},
      ];

      const results = searchArticles(articles, 'pdf');
      expect(results).toHaveLength(1);
    });

    it('returns empty for no matches', async () => {
      const { searchArticles } = await import('../help-article-service');
      const results = searchArticles([], 'anything');
      expect(results).toEqual([]);
    });
  });
});
