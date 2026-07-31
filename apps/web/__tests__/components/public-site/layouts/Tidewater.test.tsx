import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tidewater } from '@/components/public-site/layouts/Tidewater';

// Mock the registry so we can isolate Tidewater from HeroBlock changes
vi.mock('@/components/public-site/blocks/registry', () => ({
  blockRendererRegistry: {
    hero: (props: { block: { content: { headline?: string } } }) => (
      <div data-testid="hero-mock">{props.block.content.headline ?? 'no-headline'}</div>
    ),
  },
  hasRenderer: (t: string) => t === 'hero',
}));

const community = {
  id: 1,
  slug: 'sunset-condos',
  name: 'Sunset Condos',
  logoUrl: null,
  communityType: 'condo_718' as const,
  city: 'Miami',
  state: 'FL',
  timezone: 'America/New_York',
};
const theme = {
  primaryColor: '#0e3338',
  secondaryColor: '#f6f1e6',
  accentColor: '#c66f49',
  headingFont: 'Fraunces',
  bodyFont: 'Manrope',
};

describe('<Tidewater>', () => {
  it('renders page header and footer chrome', () => {
    render(<Tidewater community={community} theme={theme} blocks={[]} />);
    expect(screen.getAllByText(/Sunset Condos/i).length).toBeGreaterThan(0);
  });

  it('renders the empty-state hero when no hero block is present', () => {
    render(<Tidewater community={community} theme={theme} blocks={[]} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sunset Condos');
  });

  it('dispatches blocks to the registry by blockType, in blockOrder', () => {
    render(
      <Tidewater
        community={community}
        theme={theme}
        blocks={[
          { id: 10, blockType: 'hero', blockOrder: 1, content: { headline: 'Welcome' } },
        ]}
      />,
    );
    expect(screen.getByTestId('hero-mock')).toHaveTextContent('Welcome');
  });

  it('skips unknown block types without throwing', () => {
    render(
      <Tidewater
        community={community}
        theme={theme}
        blocks={[
          { id: 11, blockType: 'unicorn', blockOrder: 1, content: {} },
          { id: 12, blockType: 'hero', blockOrder: 2, content: { headline: 'After skipped block' } },
        ]}
      />,
    );
    expect(screen.queryByText(/unicorn/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('hero-mock')).toHaveTextContent('After skipped block');
  });

  it('renders blocks in ascending blockOrder regardless of array input order', () => {
    const { getAllByTestId } = render(
      <Tidewater
        community={community}
        theme={theme}
        blocks={[
          { id: 1, blockType: 'hero', blockOrder: 2, content: { headline: 'Second' } },
          { id: 2, blockType: 'hero', blockOrder: 1, content: { headline: 'First' } },
        ]}
      />,
    );
    const heroes = getAllByTestId('hero-mock');
    expect(heroes.map((el) => el.textContent)).toEqual(['First', 'Second']);
  });

  it('does not render the empty-state hero when a hero block is supplied', () => {
    render(
      <Tidewater
        community={community}
        theme={theme}
        blocks={[
          { id: 10, blockType: 'hero', blockOrder: 1, content: { headline: 'PM-authored hero' } },
        ]}
      />,
    );
    // EmptyStateHero h1 must NOT appear; hero registry renderer takes over.
    expect(
      screen.queryByRole('heading', { level: 1, name: /Sunset Condos/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('hero-mock')).toBeInTheDocument();
  });

  it('headlines a non-home page with the page name, not the community name (D18)', () => {
    // A sub-page cannot own a hero block (block_order is community-wide until
    // 11c, so slot 1 belongs to home), which makes the empty-state hero its
    // only <h1>.
    const { container } = render(
      <Tidewater
        community={community}
        theme={theme}
        blocks={[]}
        page={{ name: 'About Us', isHome: false }}
      />,
    );
    const headings = container.querySelectorAll('h1');
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('About Us');
  });

  it('keeps the community name as the <h1> on the home page', () => {
    render(
      <Tidewater
        community={community}
        theme={theme}
        blocks={[]}
        page={{ name: 'Home', isHome: true }}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sunset Condos');
  });

  it('threads the page nav to the header', () => {
    const { container } = render(
      <Tidewater
        community={community}
        theme={theme}
        blocks={[]}
        nav={{
          items: [
            { id: 1, name: 'Home', slug: '', isHome: true },
            { id: 7, name: 'About Us', slug: 'about', isHome: false },
          ],
          currentSlug: 'about',
        }}
        page={{ name: 'About Us', isHome: false }}
      />,
    );
    const links = Array.from(
      container.querySelectorAll('nav[aria-label="Site pages"] a'),
    );
    expect(links.map((a) => a.textContent)).toEqual(['Home', 'About Us']);
  });

  it('falls back to the empty-state <h1> when a hero block fails schema validation', () => {
    // Hero row present but content fails heroBlockSchema (empty headline).
    // HeroBlock returns null on safeParse failure; if Tidewater suppressed
    // the empty-state hero based on blockType alone, the page would have
    // zero <h1>s (violates the heading-hierarchy invariant). hasHeroBlock
    // now gates on safeParse success so the empty-state hero takes over.
    render(
      <Tidewater
        community={community}
        theme={theme}
        blocks={[
          { id: 10, blockType: 'hero', blockOrder: 1, content: { headline: '' } },
        ]}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sunset Condos');
  });
});
