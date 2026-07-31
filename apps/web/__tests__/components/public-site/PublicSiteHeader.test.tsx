import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PublicSiteHeader } from '@/components/public-site/PublicSiteHeader';

const theme = {
  primaryColor: '#0e3338',
  secondaryColor: '#f6f1e6',
  accentColor: '#c66f49',
  fontHeading: 'Fraunces',
  fontBody: 'Manrope',
  logoUrl: null,
  communityName: 'Sunset Condos',
  communityType: 'condo_718' as const,
};

const HOME = { id: 1, name: 'Home', slug: '', isHome: true };
const ABOUT = { id: 7, name: 'About Us', slug: 'about', isHome: false };
const AMENITIES = { id: 9, name: 'Amenities', slug: 'amenities', isHome: false };

function pageNav(container: HTMLElement) {
  return container.querySelector('nav[aria-label="Site pages"]');
}

describe('<PublicSiteHeader> page nav [11b-2]', () => {
  it('renders no page nav when no nav prop is supplied', () => {
    const { container } = render(<PublicSiteHeader theme={theme} />);
    expect(pageNav(container)).toBeNull();
    // The resident-login nav is untouched.
    expect(screen.getByRole('link', { name: 'Resident Login' })).toBeInTheDocument();
  });

  it('suppresses the nav below two pages (D10)', () => {
    // Every community today has exactly one page; a one-item nav would visibly
    // change every live site for no benefit.
    const { container } = render(
      <PublicSiteHeader theme={theme} nav={{ items: [HOME], currentSlug: '' }} />,
    );
    expect(pageNav(container)).toBeNull();
  });

  it('renders one link per page at two or more pages', () => {
    const { container } = render(
      <PublicSiteHeader
        theme={theme}
        nav={{ items: [HOME, ABOUT, AMENITIES], currentSlug: 'about' }}
      />,
    );
    const links = Array.from(pageNav(container)?.querySelectorAll('a') ?? []);
    expect(links.map((a) => a.textContent)).toEqual(['Home', 'About Us', 'Amenities']);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/about', '/amenities']);
  });

  it('marks exactly one item aria-current="page"', () => {
    const { container } = render(
      <PublicSiteHeader
        theme={theme}
        nav={{ items: [HOME, ABOUT, AMENITIES], currentSlug: 'about' }}
      />,
    );
    const current = Array.from(pageNav(container)?.querySelectorAll('a') ?? []).filter(
      (a) => a.getAttribute('aria-current') === 'page',
    );
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toBe('About Us');
  });

  it('labels home by its own name and marks it current at the site root', () => {
    const { container } = render(
      <PublicSiteHeader
        theme={theme}
        nav={{ items: [{ ...HOME, name: 'Welcome' }, ABOUT], currentSlug: '' }}
      />,
    );
    const current = Array.from(pageNav(container)?.querySelectorAll('a') ?? []).filter(
      (a) => a.getAttribute('aria-current') === 'page',
    );
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toBe('Welcome');
  });

  it('marks nothing current when the URL matches no nav page', () => {
    // A published page with in_nav = false is reachable but not listed; the nav
    // must not then mark an arbitrary sibling as the current page.
    const { container } = render(
      <PublicSiteHeader
        theme={theme}
        nav={{ items: [HOME, ABOUT], currentSlug: 'hidden' }}
      />,
    );
    const current = Array.from(pageNav(container)?.querySelectorAll('a') ?? []).filter(
      (a) => a.getAttribute('aria-current') === 'page',
    );
    expect(current).toHaveLength(0);
  });

  it('scrolls horizontally rather than collapsing into a client-side menu (D11)', () => {
    const { container } = render(
      <PublicSiteHeader
        theme={theme}
        nav={{ items: [HOME, ABOUT, AMENITIES], currentSlug: '' }}
      />,
    );
    const list = pageNav(container)?.querySelector('ul');
    expect(list?.className).toContain('overflow-x-auto');
    // No disclosure control — the public site has no client bundle.
    expect(pageNav(container)?.querySelector('button')).toBeNull();
  });
});
