// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { CommunityWebsiteEditor } from '@/components/clients/CommunityWebsiteEditor';

// React 19 requires this flag in tests that use act + createRoot.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function renderEditor(customDomain: string | null): Promise<string> {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
    ok: true,
    json: async () => ({ branding: {} }),
  } as Response));

  const container = document.createElement('div');
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <CommunityWebsiteEditor
        communityId={42}
        communitySlug="sunset-condos"
        customDomain={customDomain}
      />,
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

describe('CommunityWebsiteEditor website URL panel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows custom domain label for valid custom domain', async () => {
    const html = await renderEditor('portal.sunsetcondo.org');

    expect(html).toContain('Website URL');
    expect(html).toContain('portal.sunsetcondo.org');
    expect(html).toContain('Custom domain');
    expect(html).not.toContain('Saved custom domain is invalid');
  });

  it('falls back to default subdomain and shows invalid-domain warning', async () => {
    const html = await renderEditor('javascript:alert(1)');

    expect(html).toContain('sunset-condos.getpropertypro.com');
    expect(html).toContain('Default subdomain');
    expect(html).toContain('Saved custom domain is invalid and is ignored for display.');
  });
});
