import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FaqBlock } from '@/components/public-site/blocks/FaqBlock';
import type { BlockRendererProps } from '@/components/public-site/blocks/types';

const community = { id: 1, slug: 's', name: 'X', logoUrl: null, communityType: 'condo_718' as const, city: null, state: null, timezone: 'America/New_York' };
const theme = { primaryColor: '#000', secondaryColor: '#fff', accentColor: '#0f0', headingFont: 'Inter', bodyFont: 'Inter' };

function makeProps(content: unknown): BlockRendererProps {
  return { block: { id: 1, blockType: 'faq', blockOrder: 4, content }, community, theme, layout: 'tidewater' };
}

describe('<FaqBlock>', () => {
  const valid = {
    heading: 'Common Questions',
    items: [
      { question: 'When are board meetings?', answer: 'Quarterly, posted 14 days in advance.' },
      { question: 'How do I pay dues?', answer: 'Log in to the resident portal.' },
    ],
  };

  it('renders heading as h2 when present', () => {
    render(<FaqBlock {...makeProps(valid)} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Common Questions');
  });

  it('renders every question and answer', () => {
    render(<FaqBlock {...makeProps(valid)} />);
    expect(screen.getByText('When are board meetings?')).toBeInTheDocument();
    expect(screen.getByText('Quarterly, posted 14 days in advance.')).toBeInTheDocument();
    expect(screen.getByText('How do I pay dues?')).toBeInTheDocument();
    expect(screen.getByText('Log in to the resident portal.')).toBeInTheDocument();
  });

  it('renders each item as a collapsible <details>/<summary>', () => {
    render(<FaqBlock {...makeProps(valid)} />);
    const details = document.querySelectorAll('details');
    expect(details.length).toBe(2);
    const summaries = document.querySelectorAll('summary');
    expect(summaries[0]?.textContent).toContain('When are board meetings?');
  });

  it('renders without a heading (no h2)', () => {
    render(<FaqBlock {...makeProps({ items: [{ question: 'Q?', answer: 'A.' }] })} />);
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
    expect(screen.getByText('Q?')).toBeInTheDocument();
  });

  it('splits a multi-paragraph answer on double newlines', () => {
    render(<FaqBlock {...makeProps({ items: [{ question: 'Q?', answer: 'Para one.\n\nPara two.' }] })} />);
    const paragraphs = document.querySelectorAll('details p');
    expect(paragraphs.length).toBe(2);
  });

  it('escapes HTML in answers (no script execution)', () => {
    render(<FaqBlock {...makeProps({ items: [{ question: 'Q?', answer: '<script>alert(1)</script>safe' }] })} />);
    expect(document.querySelector('details script')).toBeNull();
    expect(screen.getByText(/<script>alert\(1\)<\/script>safe/)).toBeInTheDocument();
  });

  it('emits console.warn and renders null on invalid content', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(<FaqBlock {...makeProps({ items: [] })} />);
    expect(container.querySelector('details')).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('faq block content'), expect.anything());
    warnSpy.mockRestore();
  });
});
