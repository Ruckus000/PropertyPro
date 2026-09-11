// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * The layout-metadata EDITING view must be reachable from a route, not only
 * from a test file.
 *
 * Wave 2 switched `/site-templates` to `<LayoutsTable variant="cards">`, which
 * had been the sole render site of the `table` variant — so the inline edit
 * form, `saveLayoutMetadata` and the live PATCH handler became reachable from
 * nothing but `layouts-table.test.tsx`. These cases pin the restored route and
 * the hub link that leads to it, so the same silent orphaning cannot happen
 * again without one of them going red.
 */
const requireAdminPageSessionMock = vi.fn(async () => ({
  id: 'admin-1',
  email: 'admin@getpropertypro.com',
  role: 'super_admin' as const,
}));
const loadLayoutsMock = vi.fn();

vi.mock('@/lib/request/admin-page-context', () => ({
  requireAdminPageSession: requireAdminPageSessionMock,
}));
vi.mock('@/lib/server/site-layouts', () => ({
  loadLayouts: loadLayoutsMock,
}));

const LAYOUT = {
  id: 1,
  slug: 'tidewater',
  displayName: 'Tidewater',
  tagline: 'Coastal editorial',
  description: 'Golden-hour palette.',
  tier: 'essentials' as const,
  isArchived: false,
  isFeatured: true,
  defaultPresetSlug: 'bay-light',
  version: '1.0.0',
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
};

describe('/site-templates/layouts (the editing view)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadLayoutsMock.mockResolvedValue([LAYOUT]);
  });

  it('renders the table variant: an Actions column and a per-row Edit control', async () => {
    const { default: LayoutsPage } = await import('@/app/(console)/site-templates/layouts/page');
    const html = renderToStaticMarkup(await LayoutsPage());

    expect(html).toContain('Actions');
    expect(html).toContain('data-testid="layout-edit-tidewater"');
    // Anti-vacuity: the cards variant renders neither of the two above, and
    // would still contain the display name — so assert the name too, which
    // proves the row rendered at all rather than the page rendering empty.
    expect(html).toContain('Tidewater');
  });

  it('re-asserts the platform-admin session before reading', async () => {
    const { default: LayoutsPage } = await import('@/app/(console)/site-templates/layouts/page');
    await LayoutsPage();
    expect(requireAdminPageSessionMock).toHaveBeenCalledTimes(1);
  });
});

describe('/site-templates hub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadLayoutsMock.mockResolvedValue([LAYOUT]);
  });

  it('links to the editing view, alongside its four sibling sub-pages', async () => {
    const { default: HubPage } = await import('@/app/(console)/site-templates/page');
    const html = renderToStaticMarkup(await HubPage());

    expect(html).toContain('href="/site-templates/layouts"');
    expect(html).toContain('Layout Metadata');
    for (const sibling of ['block-registry', 'documentation', 'theme-presets', 'starter-packs']) {
      expect(html).toContain(`href="/site-templates/${sibling}"`);
    }
  });

  it('still renders the read-only cards, with no edit affordance', async () => {
    const { default: HubPage } = await import('@/app/(console)/site-templates/page');
    const html = renderToStaticMarkup(await HubPage());

    expect(html).toContain('data-testid="layout-card-tidewater"');
    expect(html).not.toContain('data-testid="layout-edit-tidewater"');
  });
});
