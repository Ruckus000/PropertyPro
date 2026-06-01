import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GalleryBlock } from '@/components/public-site/blocks/GalleryBlock';
import type { BlockRendererProps } from '@/components/public-site/blocks/types';

const community = { id: 1, slug: 's', name: 'X', logoUrl: null, communityType: 'condo_718' as const, city: null, state: null, timezone: 'America/New_York' };
const theme = { primaryColor: '#000', secondaryColor: '#fff', accentColor: '#0f0', headingFont: 'Inter', bodyFont: 'Inter' };

function makeProps(content: unknown): BlockRendererProps {
  return { block: { id: 1, blockType: 'gallery', blockOrder: 6, content }, community, theme, layout: 'tidewater' };
}

const savedEnv = process.env.NEXT_PUBLIC_SUPABASE_URL;
beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
});
afterEach(() => {
  if (savedEnv === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = savedEnv;
});

describe('<GalleryBlock>', () => {
  const valid = {
    heading: 'Around the Community',
    images: [
      { imagePath: '1/content/pool.webp', altText: 'The pool deck', caption: 'Pool' },
      { imagePath: '1/content/lobby.webp', altText: 'The lobby' },
    ],
  };

  it('renders heading as h2 when present', () => {
    render(<GalleryBlock {...makeProps(valid)} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Around the Community');
  });

  it('renders an img per image with alt text', () => {
    render(<GalleryBlock {...makeProps(valid)} />);
    expect(screen.getByRole('img', { name: 'The pool deck' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'The lobby' })).toBeInTheDocument();
  });

  it('renders srcset with 1600w + 800w variants', () => {
    render(<GalleryBlock {...makeProps(valid)} />);
    const img = screen.getByRole('img', { name: 'The pool deck' });
    expect(img.getAttribute('srcset') ?? '').toMatch(/1600w/);
    expect(img.getAttribute('srcset') ?? '').toMatch(/800w/);
  });

  it('renders caption when provided', () => {
    render(<GalleryBlock {...makeProps(valid)} />);
    expect(screen.getByText('Pool')).toBeInTheDocument();
  });

  it('renders a decorative image with alt=""', () => {
    render(<GalleryBlock {...makeProps({ images: [{ imagePath: '1/content/divider.webp', decorative: true }] })} />);
    const img = document.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('alt')).toBe('');
  });

  it('uses loading=lazy on every img', () => {
    render(<GalleryBlock {...makeProps(valid)} />);
    const imgs = document.querySelectorAll('img');
    expect(imgs.length).toBe(2);
    imgs.forEach((img) => expect(img.getAttribute('loading')).toBe('lazy'));
  });

  it('renders without a heading (no h2)', () => {
    render(<GalleryBlock {...makeProps({ images: [{ imagePath: '1/content/a.webp', altText: 'A' }] })} />);
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'A' })).toBeInTheDocument();
  });

  it('emits console.warn and renders null on invalid content', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(<GalleryBlock {...makeProps({ images: [] })} />);
    expect(container.querySelector('img')).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('gallery block content'), expect.anything());
    warnSpy.mockRestore();
  });
});
