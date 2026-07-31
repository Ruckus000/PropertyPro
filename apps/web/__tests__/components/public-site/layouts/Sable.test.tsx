import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sable } from '@/components/public-site/layouts/Sable';

vi.mock('@/components/public-site/blocks/registry', () => ({
  blockRendererRegistry: {
    hero: (props: { block: { content: { headline?: string } }; layout: string }) => (
      <div data-testid="hero-mock" data-layout={props.layout}>
        {props.block.content.headline ?? 'no-headline'}
      </div>
    ),
  },
  hasRenderer: (t: string) => t === 'hero',
}));

const community = {
  id: 1,
  slug: 'sable-apartments',
  name: 'Sable Apartments',
  logoUrl: null,
  communityType: 'apartment' as const,
  city: 'Tampa',
  state: 'FL',
  timezone: 'America/New_York',
};
const theme = {
  primaryColor: '#2f332f',
  secondaryColor: '#f7f2ea',
  accentColor: '#8c6f45',
  headingFont: 'Cormorant Garamond',
  bodyFont: 'Inter',
};

describe('<Sable>', () => {
  it('renders page header and footer chrome', () => {
    render(<Sable community={community} theme={theme} blocks={[]} />);
    expect(screen.getAllByText(/Sable Apartments/i).length).toBeGreaterThan(0);
  });

  it('renders the empty-state hero when no hero block is present', () => {
    render(<Sable community={community} theme={theme} blocks={[]} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sable Apartments');
  });

  it('dispatches ordered blocks to the registry with sable layout id', () => {
    const { getAllByTestId } = render(
      <Sable
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
    expect(heroes[0]).toHaveAttribute('data-layout', 'sable');
  });

  it('skips unknown block types without throwing', () => {
    render(
      <Sable
        community={community}
        theme={theme}
        blocks={[
          { id: 11, blockType: 'unknown', blockOrder: 1, content: {} },
          { id: 12, blockType: 'hero', blockOrder: 2, content: { headline: 'After skip' } },
        ]}
      />,
    );
    expect(screen.queryByText(/unknown/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('hero-mock')).toHaveTextContent('After skip');
  });
  it('headlines a non-home page with the page name (D18)', () => {
    const { container } = render(
      <Sable
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

  it('threads the page nav to the header', () => {
    const { container } = render(
      <Sable
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
      />,
    );
    const links = Array.from(
      container.querySelectorAll('nav[aria-label="Site pages"] a'),
    );
    expect(links.map((a) => a.textContent)).toEqual(['Home', 'About Us']);
  });
});
