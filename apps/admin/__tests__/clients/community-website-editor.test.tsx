// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { CommunityWebsiteEditor } from '@/components/clients/CommunityWebsiteEditor';

/**
 * The domain-URL panel this file used to cover (`Website URL`, `Custom
 * domain` / `Default subdomain`, the invalid-domain warning) moved to
 * `WebsiteDomainCard` (task 17c) — see `website-domain-card.test.tsx` for
 * that coverage. `CommunityWebsiteEditor` no longer takes a `customDomain`
 * prop; it owns branding only, so this file now covers the branding form
 * itself instead of duplicating domain-panel assertions that no longer have
 * anything to assert against here.
 */

// React 19 requires this flag in tests that use act + createRoot.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function renderEditor(): Promise<string> {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
    ok: true,
    json: async () => ({ branding: {} }),
  } as Response));

  const container = document.createElement('div');
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <CommunityWebsiteEditor communityId={42} communitySlug="sunset-condos" />,
    );
  });

  await act(async () => {
    await Promise.resolve();
  });

  const html = container.innerHTML;
  await act(async () => {
    root.unmount();
  });
  return html;
}

describe('CommunityWebsiteEditor branding form', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the branding sections once loaded, with no leftover domain panel', async () => {
    const html = await renderEditor();

    expect(html).toContain('Theme Presets');
    expect(html).toContain('Brand Colors');
    expect(html).toContain('Typography');
    expect(html).toContain('Logo');
    expect(html).toContain('Save Branding');

    // Regression guard for the split: this component must not re-render the
    // domain panel `WebsiteDomainCard` now owns.
    expect(html).not.toContain('Website URL');
  });

  it('renders the community slug in the live preview mockup', async () => {
    const html = await renderEditor();
    expect(html).toContain('Sunset Condos');
  });
});
