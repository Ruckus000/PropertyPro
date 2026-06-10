import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Callout } from '@/components/help/mdx-components';

describe('Callout', () => {
  it('uses status tokens and an svg icon, never raw palette classes or emoji', () => {
    const out = renderToStaticMarkup(<Callout type="warning" title="Heads up">Body</Callout>);
    expect(out).toContain('bg-status-warning-subtle');
    expect(out).toContain('border-status-warning-border');
    expect(out).toContain('<svg');
    expect(out).not.toMatch(/bg-(blue|amber|emerald|purple)-50/);
    expect(out).not.toContain('⚠');
  });

  it('shows the variant label when no title is given (no color-only status)', () => {
    const out = renderToStaticMarkup(<Callout type="tip">Body</Callout>);
    expect(out).toContain('Tip');
  });
});
