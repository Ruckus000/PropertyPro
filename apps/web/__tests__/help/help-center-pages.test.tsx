/**
 * The Help Center pages render for each readership against the real corpus:
 * the right section, topics, type bar and article chrome. The session is
 * mocked (requireHelpPageContext); everything else — content, visibility,
 * MDX — is real.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFeaturesForCommunity, type CommunityType } from '@propertypro/shared';

const { membership } = vi.hoisted(() => ({
  membership: {
    current: {} as Record<string, unknown>,
  },
}));

vi.mock('@/lib/help/page-context', () => ({
  requireHelpPageContext: vi.fn(async () => ({
    userId: 'u1',
    communityId: 2,
    membership: membership.current,
    features: getFeaturesForCommunity(membership.current.communityType as CommunityType),
  })),
}));
vi.mock('@/lib/services/faq-service', () => ({
  ensureFaqsExist: vi.fn(async () => {}),
  searchCommunityFaqs: vi.fn(async () => ({ hits: [], totalRowCount: 0 })),
}));
// Client components that need a query client; not what these tests cover.
vi.mock('@/components/help/article-feedback', () => ({ ArticleFeedback: () => null }));
vi.mock('@/components/help/article-view-tracker', () => ({ ArticleViewTracker: () => null }));

const { default: HelpHomePage } = await import('@/app/(help)/help/page');
const { default: HelpTopicPage } = await import('@/app/(help)/help/[category]/page');
const { default: HelpArticlePage } = await import('@/app/(help)/help/[category]/[slug]/page');
const { default: HelpSearchPage } = await import('@/app/(help)/help/search/page');

const MANAGER = {
  communityName: 'Sunset Condos',
  role: 'property_manager',
  communityType: 'condo_718',
  isUnitOwner: false,
  designation: null,
  isAdmin: true,
};
const OWNER = { ...MANAGER, role: 'resident', isUnitOwner: true, isAdmin: false };
const BOARD_OWNER = { ...OWNER, designation: 'board_member' };

const params = <T extends Record<string, string>>(value: T) => Promise.resolve(value);
const render = async (element: Promise<React.ReactElement>) => renderToStaticMarkup(await element);

describe('Help Center pages', () => {
  beforeEach(() => {
    membership.current = MANAGER;
  });

  it('home: manager hero, most-used guides, topics and the type bar', async () => {
    const html = await render(HelpHomePage({ searchParams: params({ communityId: '2' }) }));
    expect(html).toContain('How can we help you run Sunset Condos?');
    expect(html).toContain('Most-used guides');
    expect(html).toContain('Help for property managers');
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('Showing help for condominiums.');
    expect(html).toContain('Manage your community’s FAQs');
  });

  it('home: residents get no type bar and no FAQ management link', async () => {
    membership.current = OWNER;
    const html = await render(HelpHomePage({ searchParams: params({ communityId: '2' }) }));
    expect(html).toContain('How can we help?');
    expect(html).toContain('Help for residents');
    expect(html).not.toContain('role="radiogroup"');
    expect(html).not.toContain('Manage your community’s FAQs');
  });

  it('a board-designated owner reads resident help, plus the board-only guides', async () => {
    membership.current = BOARD_OWNER;
    const html = await render(HelpHomePage({ searchParams: params({ communityId: '2' }) }));
    expect(html).toContain('Help for residents');
    expect(html).not.toContain('role="radiogroup"');

    const election = await render(
      HelpArticlePage({
        params: params({ category: 'board', slug: 'run-election' }),
        searchParams: params({ communityId: '2' }),
      }),
    );
    expect(election).toContain('Run a board election');

    membership.current = OWNER;
    await expect(
      HelpArticlePage({
        params: params({ category: 'board', slug: 'run-election' }),
        searchParams: params({ communityId: '2' }),
      }),
    ).rejects.toMatchObject({ digest: expect.stringContaining('NEXT_HTTP_ERROR_FALLBACK;404') });
  });

  it('home: a manager previewing apartments sees the preview bar and apartment topics', async () => {
    const html = await render(HelpHomePage({ searchParams: params({ communityId: '2', type: 'apartment' }) }));
    expect(html).toContain('Previewing help for apartment communities. Your community is a condominium.');
    expect(html).toContain('>Leases<');
    expect(html).toContain('type=apartment');
  });

  it('topic: lists the section’s guides with step counts', async () => {
    const html = await render(
      HelpTopicPage({ params: params({ category: 'documents' }), searchParams: params({ communityId: '2' }) }),
    );
    expect(html).toContain('<h1');
    expect(html).toMatch(/\d+ guides? for property managers/);
    expect(html).toContain('/help/documents/upload-document?communityId=2');
    expect(html).toContain('aria-current="page"');
  });

  it('article: the reader’s own version, with topic navigation and the legal notice', async () => {
    membership.current = OWNER;
    const html = await render(
      HelpArticlePage({
        params: params({ category: 'documents', slug: 'find-documents' }),
        searchParams: params({ communityId: '2' }),
      }),
    );
    expect(html).toContain('Help for residents');
    expect(html).toContain('<ol role="list"');
    expect(html).toContain('aria-label="Legal notice"');
  });

  it('article: an old URL redirects to the reader’s replacement', async () => {
    await expect(
      HelpArticlePage({
        params: params({ category: 'documents', slug: 'uploading-documents' }),
        searchParams: params({ communityId: '2' }),
      }),
    ).rejects.toMatchObject({ digest: expect.stringContaining('/help/documents/upload-document?communityId=2') });
  });

  it('article: another section’s article is not found', async () => {
    membership.current = OWNER;
    await expect(
      HelpArticlePage({
        params: params({ category: 'documents', slug: 'upload-document' }),
        searchParams: params({ communityId: '2' }),
      }),
    ).rejects.toMatchObject({ digest: expect.stringContaining('NEXT_HTTP_ERROR_FALLBACK;404') });
  });

  it('search: results for the reader, and a way out when nothing matches', async () => {
    const hits = await render(HelpSearchPage({ searchParams: params({ communityId: '2', q: 'upload' }) }));
    expect(hits).toMatch(/\d+ results? for “upload”/);
    const none = await render(HelpSearchPage({ searchParams: params({ communityId: '2', q: 'zzzzqx' }) }));
    expect(none).toContain('No guides match “zzzzqx”');
    expect(none).toContain('Contact support');
  });
});
