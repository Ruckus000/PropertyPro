import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AmenitiesBlock } from '@/components/public-site/blocks/AmenitiesBlock';
import type { BlockRendererProps } from '@/components/public-site/blocks/types';

const community = { id: 1, slug: 's', name: 'X', logoUrl: null, communityType: 'condo_718' as const, city: null, state: null, timezone: 'America/New_York' };
const theme = { primaryColor: '#000', secondaryColor: '#fff', accentColor: '#0f0', headingFont: 'Inter', bodyFont: 'Inter' };

function makeProps(content: unknown): BlockRendererProps {
  return { block: { id: 1, blockType: 'amenities', blockOrder: 5, content }, community, theme, layout: 'tidewater' };
}

describe('<AmenitiesBlock>', () => {
  const valid = {
    heading: 'Community Amenities',
    items: [
      { name: 'Heated Pool', description: 'Open 6am to 10pm.' },
      { name: 'Fitness Center' },
    ],
  };

  it('renders heading as h2 when present', () => {
    render(<AmenitiesBlock {...makeProps(valid)} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Community Amenities');
  });

  it('renders every amenity name', () => {
    render(<AmenitiesBlock {...makeProps(valid)} />);
    expect(screen.getByText('Heated Pool')).toBeInTheDocument();
    expect(screen.getByText('Fitness Center')).toBeInTheDocument();
  });

  it('renders descriptions when present', () => {
    render(<AmenitiesBlock {...makeProps(valid)} />);
    expect(screen.getByText('Open 6am to 10pm.')).toBeInTheDocument();
  });

  it('renders a name-only amenity without a description', () => {
    render(<AmenitiesBlock {...makeProps({ items: [{ name: 'Clubhouse' }] })} />);
    expect(screen.getByText('Clubhouse')).toBeInTheDocument();
  });

  it('renders amenities as a list', () => {
    render(<AmenitiesBlock {...makeProps(valid)} />);
    const items = document.querySelectorAll('li');
    expect(items.length).toBe(2);
  });

  it('renders without a heading (no h2)', () => {
    render(<AmenitiesBlock {...makeProps({ items: [{ name: 'Pool' }] })} />);
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
    expect(screen.getByText('Pool')).toBeInTheDocument();
  });

  it('emits console.warn and renders null on invalid content', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(<AmenitiesBlock {...makeProps({ items: [] })} />);
    expect(container.querySelector('li')).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('amenities block content'), expect.anything());
    warnSpy.mockRestore();
  });
});
