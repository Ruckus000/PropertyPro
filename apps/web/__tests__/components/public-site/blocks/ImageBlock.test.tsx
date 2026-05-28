import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ImageBlock } from '@/components/public-site/blocks/ImageBlock';
import type { BlockRendererProps } from '@/components/public-site/blocks/types';

const community = { id: 1, slug: 's', name: 'X', logoUrl: null, communityType: 'condo_718' as const, city: null, state: null, timezone: 'America/New_York' };
const theme = { primaryColor: '#000', secondaryColor: '#fff', accentColor: '#0f0', headingFont: 'Inter', bodyFont: 'Inter' };

function makeProps(content: unknown): BlockRendererProps {
  return { block: { id: 1, blockType: 'image', blockOrder: 3, content }, community, theme, layout: 'tidewater' };
}

const savedEnv = process.env.NEXT_PUBLIC_SUPABASE_URL;
beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
});
afterEach(() => {
  if (savedEnv === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = savedEnv;
});

describe('<ImageBlock>', () => {
  it('renders figure with img + alt text', () => {
    render(<ImageBlock {...makeProps({ imagePath: '1/content/pool.webp', altText: 'The pool deck' })} />);
    const img = screen.getByRole('img', { name: 'The pool deck' });
    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe('IMG');
    expect(img.closest('figure')).not.toBeNull();
  });

  it('renders srcset with 1600w + 800w', () => {
    render(<ImageBlock {...makeProps({ imagePath: '1/content/pool.webp', altText: 'pool' })} />);
    const img = screen.getByRole('img', { name: 'pool' });
    expect(img.getAttribute('srcset') ?? '').toMatch(/1600w/);
    expect(img.getAttribute('srcset') ?? '').toMatch(/800w/);
  });

  it('renders caption when provided', () => {
    render(<ImageBlock {...makeProps({ imagePath: '1/content/pool.webp', altText: 'pool', caption: 'Renovated 2024.' })} />);
    expect(screen.getByText('Renovated 2024.')).toBeInTheDocument();
  });

  it('renders decorative image with alt=""', () => {
    render(<ImageBlock {...makeProps({ imagePath: '1/content/divider.webp', decorative: true })} />);
    const img = document.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('alt')).toBe('');
  });

  it('emits console.warn and renders null on invalid content', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(<ImageBlock {...makeProps({ imagePath: '1/content/x.webp' })} />);  // missing altText, not decorative
    expect(container.querySelector('img')).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('image block content'), expect.anything());
    warnSpy.mockRestore();
  });

  it('uses loading=lazy on the img', () => {
    render(<ImageBlock {...makeProps({ imagePath: '1/content/pool.webp', altText: 'pool' })} />);
    expect(screen.getByRole('img', { name: 'pool' }).getAttribute('loading')).toBe('lazy');
  });
});
