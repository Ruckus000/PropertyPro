// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { DocumentationHubs, DOC_HUBS } from '@/components/site-templates/DocumentationHubs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function render(): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => {
    root.render(<DocumentationHubs />);
  });
  return container;
}

describe('<DocumentationHubs>', () => {
  it('renders a card per hub with title, description, and an external link', async () => {
    const container = await render();
    const cards = container.querySelectorAll('[data-testid="doc-hub-card"]');
    expect(cards).toHaveLength(DOC_HUBS.length);
    expect(DOC_HUBS.length).toBe(3);

    for (const hub of DOC_HUBS) {
      const link = Array.from(cards).find((c) => c.getAttribute('href') === hub.href);
      expect(link, `card for ${hub.title}`).toBeDefined();
      expect(link!.getAttribute('target')).toBe('_blank');
      expect(link!.getAttribute('rel')).toContain('noopener');
      expect(container.innerHTML).toContain(hub.title);
    }
  });

  it('links each hub to a GitHub path under the repo', async () => {
    const container = await render();
    for (const hub of DOC_HUBS) {
      expect(hub.href).toMatch(/^https:\/\/github\.com\/Ruckus000\/PropertyPro\/tree\/main\//);
    }
    // sanity: the design system + help-center paths are present
    expect(container.innerHTML).toContain('docs/design-system/');
    expect(container.innerHTML).toContain('apps/web/src/content/help/pm/');
  });
});
