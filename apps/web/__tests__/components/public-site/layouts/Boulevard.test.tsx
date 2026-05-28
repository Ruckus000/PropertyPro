import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Boulevard } from '@/components/public-site/layouts/Boulevard';

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
  slug: 'sunset-hoa',
  name: 'Sunset HOA',
  logoUrl: null,
  communityType: 'hoa_720' as const,
  city: 'Orlando',
  state: 'FL',
  timezone: 'America/New_York',
};
const theme = {
  primaryColor: '#345',
  secondaryColor: '#f8f5ef',
  accentColor: '#b68138',
  headingFont: 'Newsreader',
  bodyFont: 'Inter',
};

describe('<Boulevard>', () => {
  it('renders page header and footer chrome', () => {
    render(<Boulevard community={community} theme={theme} blocks={[]} />);
    expect(screen.getAllByText(/Sunset HOA/i).length).toBeGreaterThan(0);
  });

  it('renders the empty-state hero when no hero block is present', () => {
    render(<Boulevard community={community} theme={theme} blocks={[]} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sunset HOA');
  });

  it('dispatches ordered blocks to the registry with boulevard layout id', () => {
    const { getAllByTestId } = render(
      <Boulevard
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
    expect(heroes[0]).toHaveAttribute('data-layout', 'boulevard');
  });

  it('skips unknown block types without throwing', () => {
    render(
      <Boulevard
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
});
