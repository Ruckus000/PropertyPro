import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TextBlock } from '@/components/public-site/blocks/TextBlock';
import type { BlockRendererProps } from '@/components/public-site/blocks/types';

const community = { id: 1, slug: 's', name: 'X', logoUrl: null, communityType: 'condo_718' as const, city: null, state: null, timezone: 'America/New_York' };
const theme = { primaryColor: '#000', secondaryColor: '#fff', accentColor: '#0f0', headingFont: 'Inter', bodyFont: 'Inter' };

function makeProps(content: unknown): BlockRendererProps {
  return { block: { id: 1, blockType: 'text', blockOrder: 2, content }, community, theme, layout: 'tidewater' };
}

describe('<TextBlock>', () => {
  it('renders heading as h2 when present', () => {
    render(<TextBlock {...makeProps({ heading: 'About Us', body: 'We are a community.' })} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('About Us');
  });

  it('renders body without heading', () => {
    render(<TextBlock {...makeProps({ body: 'Just the body.' })} />);
    expect(screen.getByText('Just the body.')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('escapes HTML in body (no script execution)', () => {
    render(<TextBlock {...makeProps({ body: '<script>alert(1)</script>plain' })} />);
    expect(document.querySelector('script')).toBeNull();
    // The literal text should appear (React escapes it)
    expect(screen.getByText(/<script>alert\(1\)<\/script>plain/)).toBeInTheDocument();
  });

  it('emits console.warn and renders null on invalid content', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(<TextBlock {...makeProps({ body: '' })} />);
    expect(container.querySelector('p')).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('text block content'), expect.anything());
    warnSpy.mockRestore();
  });

  it('preserves paragraph breaks on double newlines', () => {
    render(<TextBlock {...makeProps({ body: 'Line one.\n\nLine two.' })} />);
    const paragraphs = document.querySelectorAll('p');
    expect(paragraphs.length).toBe(2);
  });
});
