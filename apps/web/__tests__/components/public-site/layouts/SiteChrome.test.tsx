/**
 * The shared page chrome — what tells the three layouts apart, now rendered by
 * the public layouts AND the editor canvas.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SiteChrome } from '@/components/public-site/layouts/SiteChrome';

const community = {
  id: 1,
  slug: 'sunset-condos',
  name: 'Sunset Condos',
  shortName: null,
  logoUrl: null,
  communityType: 'condo_718' as const,
  city: 'Miami',
  state: 'FL',
  unitCount: null,
  timezone: 'America/New_York',
};
const theme = {
  primaryColor: '#0e3338',
  secondaryColor: '#f6f1e6',
  accentColor: '#c66f49',
  headingFont: 'Fraunces',
  bodyFont: 'Manrope',
};

const HOME = { id: 1, name: 'Home', slug: '', isHome: true };
const ABOUT = { id: 7, name: 'About Us', slug: 'about', isHome: false };

function root(container: HTMLElement) {
  return container.querySelector('[data-layout]') as HTMLElement;
}

describe('<SiteChrome>', () => {
  it('renders the header, the blocks and the footer for every layout', () => {
    for (const layout of ['tidewater', 'boulevard', 'sable'] as const) {
      const { container, unmount } = render(
        <SiteChrome layout={layout} community={community} theme={theme}>
          <section data-testid="block">block</section>
        </SiteChrome>,
      );
      expect(root(container)).toHaveAttribute('data-layout', layout);
      expect(container.querySelector('header')).not.toBeNull();
      expect(screen.getByTestId('block')).toBeInTheDocument();
      expect(container.querySelector('footer')).not.toBeNull();
      unmount();
    }
  });

  it('is visibly a different layout per template — the thing the Design panel switches', () => {
    const tide = render(
      <SiteChrome layout="tidewater" community={community} theme={theme}>
        <section data-testid="block" />
      </SiteChrome>,
    );
    expect(root(tide.container).className).toContain('flex-col');
    expect(screen.getByTestId('block').parentElement?.tagName).toBe('MAIN');
    tide.unmount();

    const boulevard = render(
      <SiteChrome layout="boulevard" community={community} theme={theme}>
        <section data-testid="block" />
      </SiteChrome>,
    );
    expect(root(boulevard.container).className).toContain('bg-secondary');
    expect(screen.getByTestId('block').parentElement?.className).toContain('divide-y');
    boulevard.unmount();

    const sable = render(
      <SiteChrome layout="sable" community={community} theme={theme}>
        <section data-testid="block" />
      </SiteChrome>,
    );
    expect(root(sable.container).className).toContain('bg-surface-card');
    expect(screen.getByTestId('block').parentElement?.className).toContain('max-w-6xl');
  });

  it('renders the empty-state hero only when given a heading', () => {
    const { rerender } = render(
      <SiteChrome layout="tidewater" community={community} theme={theme} emptyHeroHeading="Amenities">
        <span />
      </SiteChrome>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Amenities');

    rerender(
      <SiteChrome layout="tidewater" community={community} theme={theme} emptyHeroHeading={null}>
        <span />
      </SiteChrome>,
    );
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('renders the page nav from the nav prop, suppressed below two pages as the header does', () => {
    const { container, rerender } = render(
      <SiteChrome
        layout="tidewater"
        community={community}
        theme={theme}
        nav={{ items: [HOME, ABOUT], currentSlug: 'about' }}
      >
        <span />
      </SiteChrome>,
    );
    const nav = container.querySelector('nav[aria-label="Site pages"]');
    expect(nav).not.toBeNull();
    expect(screen.getByRole('link', { name: 'About Us' })).toHaveAttribute('aria-current', 'page');

    rerender(
      <SiteChrome layout="tidewater" community={community} theme={theme} nav={{ items: [HOME], currentSlug: '' }}>
        <span />
      </SiteChrome>,
    );
    expect(container.querySelector('nav[aria-label="Site pages"]')).toBeNull();
  });

  it('fills the viewport on the public page and not inside an editor frame', () => {
    const page = render(
      <SiteChrome layout="sable" community={community} theme={theme}>
        <span />
      </SiteChrome>,
    );
    expect(root(page.container).className).toContain('min-h-screen');
    page.unmount();

    const framed = render(
      <SiteChrome layout="sable" community={community} theme={theme} fullHeight={false}>
        <span />
      </SiteChrome>,
    );
    expect(root(framed.container).className).not.toContain('min-h-screen');
  });

  it('is the page main landmark on the public page, and a plain region inside an editor frame', () => {
    const page = render(
      <SiteChrome layout="tidewater" community={community} theme={theme}>
        <span data-testid="block" />
      </SiteChrome>,
    );
    expect(page.container.querySelector('main#main-content')).not.toBeNull();
    page.unmount();

    // The editor already owns `<main id="main-content">`; a second, nested one
    // with the same id breaks skip links and landmark navigation.
    const framed = render(
      <SiteChrome layout="tidewater" community={community} theme={theme} fullHeight={false} landmark={false}>
        <span data-testid="block" />
      </SiteChrome>,
    );
    expect(framed.container.querySelector('main')).toBeNull();
    expect(framed.container.querySelector('#main-content')).toBeNull();
    expect(screen.getByTestId('block')).toBeInTheDocument();
  });

  it('places a header adornment over the header', () => {
    const { container } = render(
      <SiteChrome
        layout="tidewater"
        community={community}
        theme={theme}
        headerAdornment={<button type="button" data-testid="adorn">edit</button>}
      >
        <span />
      </SiteChrome>,
    );
    const adorn = screen.getByTestId('adorn');
    expect(adorn.parentElement?.querySelector('header')).not.toBeNull();
    expect(adorn.parentElement?.className).toContain('relative');
    expect(container.querySelector('footer')).not.toBeNull();
  });

  it('passes the footer fields through', () => {
    render(
      <SiteChrome
        layout="boulevard"
        community={community}
        theme={theme}
        footer={{ associationName: 'Sunset Condominium Association, Inc.', note: 'Office hours 9–5', showStatutoryLine: false }}
      >
        <span />
      </SiteChrome>,
    );
    expect(screen.getByText(/Sunset Condominium Association, Inc\./)).toBeInTheDocument();
    expect(screen.getByText('Office hours 9–5')).toBeInTheDocument();
  });
});
