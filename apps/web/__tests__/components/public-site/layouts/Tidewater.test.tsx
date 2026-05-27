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
});
