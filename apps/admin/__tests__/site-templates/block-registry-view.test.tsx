// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { BlockRegistryView } from '@/components/site-templates/BlockRegistryView';
import type { BlockRegistryEntry } from '@/lib/site-templates/block-registry';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function renderView(entries: BlockRegistryEntry[]): Promise<string> {
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => {
    root.render(<BlockRegistryView entries={entries} />);
  });
  const html = container.innerHTML;
  await act(async () => {
    root.unmount();
  });
  return html;
}

const HERO: BlockRegistryEntry = {
  type: 'hero',
  label: 'Hero',
  tier: 'essentials',
  rendererPath: 'apps/web/src/components/public-site/blocks/HeroBlock.tsx',
  docHref: 'docs/design-system/patterns/hero-block.md',
  summary: 'Welcome panel.',
  fields: [
    { name: 'headline', type: 'string', optional: false, nullable: false },
    { name: 'heroImagePath', type: 'string', optional: true, nullable: false },
  ],
};

describe('<BlockRegistryView>', () => {
  it('renders a card per entry with label, type, tier, summary, and renderer path', async () => {
    const html = await renderView([HERO]);
    expect(html).toContain('Hero');
    expect(html).toContain('hero');
    expect(html).toContain('essentials');
    expect(html).toContain('Welcome panel.');
    expect(html).toContain('apps/web/src/components/public-site/blocks/HeroBlock.tsx');
  });

  it('renders each field, marking required vs optional', async () => {
    const html = await renderView([HERO]);
    expect(html).toContain('headline');
    expect(html).toContain('heroImagePath');
    // optional field shows the `?` suffix; required field shows the `*` marker
    expect(html).toContain('aria-label="required"');
    expect(html).toContain('string?');
  });

  it('links to the documentation file', async () => {
    const html = await renderView([HERO]);
    expect(html).toContain('docs/design-system/patterns/hero-block.md');
  });

  it('renders nothing-but-empty gracefully for a fieldless entry', async () => {
    const html = await renderView([{ ...HERO, fields: [] }]);
    expect(html).toContain('No fields.');
  });
});
