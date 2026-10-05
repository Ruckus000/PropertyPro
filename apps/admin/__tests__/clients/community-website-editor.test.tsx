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

async function renderEditor(branding: Record<string, unknown> = {}): Promise<string> {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
    ok: true,
    json: async () => ({ branding }),
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

  describe('the stored logo', () => {
    const STORED = { logoPath: '42/site/abc.png', primaryColor: '#111111' };
    const URL_FROM_GET = 'https://proj.supabase.co/storage/v1/object/public/community-assets/42/site/abc.png';

    async function mountWithLogo() {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
        if (init?.method === 'PATCH') {
          return { ok: true, json: async () => ({ branding: STORED }) } as Response;
        }
        return { ok: true, json: async () => ({ branding: STORED, logoUrl: URL_FROM_GET }) } as Response;
      });
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      await act(async () => {
        root.render(<CommunityWebsiteEditor communityId={42} communitySlug="sunset-condos" />);
      });
      await act(async () => {
        await Promise.resolve();
      });
      const click = async (el: Element | null | undefined) => {
        await act(async () => {
          (el as HTMLElement).click();
        });
      };
      const button = (text: string) =>
        [...container.querySelectorAll('button')].find((b) => b.textContent?.trim().endsWith(text));
      const cleanup = async () => {
        await act(async () => root.unmount());
        container.remove();
      };
      return { container, fetchMock, click, button, cleanup };
    }

    it('shows it on load, from the URL the GET returns', async () => {
      const { container, cleanup } = await mountWithLogo();
      expect(container.querySelector('img[alt="Logo"]')?.getAttribute('src')).toBe(URL_FROM_GET);
      await cleanup();
    });

    it('Reset brings back a removed logo, and the next Save does not delete it', async () => {
      const { container, fetchMock, click, button, cleanup } = await mountWithLogo();

      await click(button('Remove'));
      expect(container.querySelector('img[alt="Logo"]')).toBeNull();
      await click(button('Reset'));
      expect(container.querySelector('img[alt="Logo"]')?.getAttribute('src')).toBe(URL_FROM_GET);

      await click(button('Save Branding'));
      const patches = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH');
      // Nothing changed, so nothing is sent; above all, never `logoPath: ''`.
      for (const [, init] of patches) {
        expect(JSON.parse(String(init?.body))).not.toHaveProperty('logoPath');
      }
      await cleanup();
    });
  });

  describe("the manager's unpublished design changes", () => {
    it('lists them, since saving replaces the matching ones', async () => {
      const html = await renderEditor({
        primaryColor: '#111111',
        fontBody: 'Inter',
        draftLook: { primaryColor: '#222222', layoutId: 'sable', fontBody: 'Inter' },
      });

      expect(html).toContain("The community's manager has unpublished design changes");
      // fontBody is drafted at its live value: nothing to publish, not listed.
      expect(html).toContain('Unpublished: layout, primary color.');
      expect(html).not.toContain('body font');
    });

    it('shows nothing when there is no draft', async () => {
      const html = await renderEditor({ primaryColor: '#111111' });
      expect(html).not.toContain('unpublished design changes');
    });

    it('shows nothing when every drafted value already matches live', async () => {
      const html = await renderEditor({
        primaryColor: '#111111',
        draftLook: { primaryColor: '#111111' },
      });
      expect(html).not.toContain('unpublished design changes');
    });
  });
});
