// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * What the Starter Packs page tells an operator a pack is for.
 *
 * New community sites no longer get a starter pack: they start with their
 * suggested look (a condo gets Bayfront, an HOA Palm Grove, an apartment Plain
 * & Simple). A pack is now used by "Reset to starter" and by the seeded demo
 * communities, and the page's own copy has to say so rather than claim packs
 * are applied to new community sites.
 */
const requireAdminPageSessionMock = vi.fn(async () => ({
  id: 'admin-1',
  email: 'admin@getpropertypro.com',
  role: 'super_admin' as const,
}));

const PACK_ROW = {
  id: 1,
  slug: 'florida-condo-v1',
  display_name: 'Florida condo starter',
  community_type: 'condo_718',
  description: null,
  blocks: [],
  version: 1,
  is_archived: false,
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
};

vi.mock('@/lib/request/admin-page-context', () => ({
  requireAdminPageSession: requireAdminPageSessionMock,
}));
// The page's own read: from('site_starter_packs').select().order().order().
vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: () => ({
    from: () => ({
      select: () => ({
        order: () => ({
          order: async () => ({ data: [PACK_ROW], error: null }),
        }),
      }),
    }),
  }),
}));

async function renderPage(): Promise<string> {
  const { default: StarterPacksPage } = await import('@/app/(console)/site-templates/starter-packs/page');
  return renderToStaticMarkup(await StarterPacksPage());
}

describe('/site-templates/starter-packs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('says packs are used by Reset to starter and the seeded demo communities, not applied to new community sites', async () => {
    const html = await renderPage();

    expect(html).toContain('New community sites start with a look, not a pack');
    expect(html).toContain('Reset to starter');
    expect(html).toContain('seeded demo communities');
    // The retired claims.
    expect(html).not.toContain('applied to new community sites');
    expect(html).not.toContain('new-community seeding');
  });

  it('still lists the packs, so the copy above is not the only thing that rendered', async () => {
    const html = await renderPage();

    expect(html).toContain('Starter Packs');
    expect(html).toContain('Florida condo starter');
  });

  it('re-asserts the platform-admin session before reading', async () => {
    await renderPage();
    expect(requireAdminPageSessionMock).toHaveBeenCalledTimes(1);
  });
});
