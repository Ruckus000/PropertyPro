import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { HelpArticleBody } from '@/components/help/help-article-body';
import type { HelpArticleMetadata } from '@/lib/services/help-article-service';

vi.mock('@/components/help/article-view-tracker', () => ({ ArticleViewTracker: () => null }));
vi.mock('@/components/help/article-feedback', () => ({ ArticleFeedback: () => null }));

const metadata: HelpArticleMetadata = {
  title: 'Reviewing the compliance dashboard',
  description: 'd',
  category: 'compliance',
  slug: 'reviewing-the-compliance-dashboard',
  roles: ['property_manager'],
  keywords: [],
  tags: [],
  relatedArticles: [],
  featured: false,
  filePath: 'x.mdx',
  statutes: ['§718.111(12)(g)'],
  updatedAt: '2026-05-01',
  readTimeMinutes: 4,
  contentHash: 'h',
  heroMedia: { src: '/help/compliance/r/hero.webp', alt: 'Hero', width: 1440, height: 900 },
};

function renderBody(html: string, overrides: Partial<Parameters<typeof HelpArticleBody>[0]> = {}) {
  const onOpenArticle = vi.fn();
  const onLightboxOpenChange = vi.fn();
  const utils = render(
    <HelpArticleBody
      html={html}
      metadata={metadata}
      related={[]}
      communityId={1}
      onOpenArticle={onOpenArticle}
      onLightboxOpenChange={onLightboxOpenChange}
      {...overrides}
    />,
  );
  return { ...utils, onOpenArticle, onLightboxOpenChange };
}

beforeEach(() => {
  window.matchMedia ??= vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
});

describe('HelpArticleBody', () => {
  it('renders title, chips, hero media, and flat content (no inner card)', () => {
    const { container } = renderBody('<p>body text</p>');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Reviewing the compliance dashboard');
    expect(screen.getByText('4 min read')).toBeInTheDocument();
    expect(container.querySelector('[data-media-frame]')).not.toBeNull();
    // "Flat content" means the ARTICLE BODY is not boxed. The injected legal
    // disclaimer (F-05) is deliberately a card and sits outside the body, so
    // this scopes to the content container rather than the whole subtree — the
    // old blanket query would now fail for a reason unrelated to its intent.
    const body = container.querySelector('[data-help-article-content]');
    expect(body).not.toBeNull();
    expect(body?.querySelector('.rounded-2xl')).toBeNull();
  });

  it('statute chips open in a new tab', () => {
    renderBody('<p>x</p>');
    const link = screen.getByRole('link', { name: /§718\.111/ });
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('opens the lightbox when a zoomable image in injected HTML is clicked', async () => {
    const { container, onLightboxOpenChange } = renderBody(
      '<img src="/help/c/s/shot.webp" alt="Shot" data-zoomable data-media-kind="image">',
    );
    // The injected HTML img is the last [data-zoomable]; the first is the hero MediaFrame.
    const zoomables = container.querySelectorAll('[data-zoomable]');
    const injectedImg = zoomables[zoomables.length - 1] as HTMLElement;
    await act(async () => {
      fireEvent.click(injectedImg);
    });
    expect(onLightboxOpenChange).toHaveBeenLastCalledWith(true);
  });

  it('intercepts same-document anchors: scrolls within content, never mutates the hash', () => {
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    const { container } = renderBody('<a href="#section-2">jump</a><h2 id="section-2">Two</h2>');
    fireEvent.click(container.querySelector('a[href="#section-2"]')!);
    expect(scrollSpy).toHaveBeenCalled();
    expect(window.location.hash).toBe('');
  });

  it('related guides push in-modal instead of navigating', () => {
    const { onOpenArticle } = renderBody('<p>x</p>', {
      related: [{ ...metadata, slug: 'other', title: 'Other guide', heroMedia: undefined }],
    });
    fireEvent.click(screen.getByRole('button', { name: /Other guide/ }));
    expect(onOpenArticle).toHaveBeenCalledWith('compliance', 'other');
  });
});
