import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { requirePlatformAdminMock, createAdminTypedClientMock } = vi.hoisted(() => ({
  requirePlatformAdminMock: vi.fn(),
  createAdminTypedClientMock: vi.fn(),
}));

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: requirePlatformAdminMock,
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: createAdminTypedClientMock,
}));

interface ClientConfig {
  presetRow?: { id: number; is_archived: boolean } | null;
  presetReadErr?: { code?: string; message: string } | null;
  communityCount?: number | null;
  layoutCount?: number | null;
  archiveErr?: { message: string } | null;
  deleteErr?: { message: string } | null;
}

// Per-table query mocks captured at module scope so tests can assert which
// branch ran (archive update vs hard delete) and with what payload.
const updateMock = vi.fn();
const deleteMock = vi.fn();
const communityFilterMock = vi.fn();

function buildClient(cfg: ClientConfig) {
  updateMock.mockReset();
  deleteMock.mockReset();
  communityFilterMock.mockReset();

  return {
    from: vi.fn((table: string) => {
      if (table === 'site_theme_presets') {
        return {
          // existence read: .select('id, is_archived').eq('slug', x).single()
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: cfg.presetRow ?? null,
                error: cfg.presetReadErr ?? null,
              }),
            })),
          })),
          // archive: .update({...}).eq('slug', x)
          update: updateMock.mockImplementation(() => ({
            eq: vi.fn().mockResolvedValue({ error: cfg.archiveErr ?? null }),
          })),
          // hard delete: .delete().eq('slug', x)
          delete: deleteMock.mockImplementation(() => ({
            eq: vi.fn().mockResolvedValue({ error: cfg.deleteErr ?? null }),
          })),
        };
      }
      if (table === 'communities') {
        // .select('id', { count, head }).filter(col, op, val).is('deleted_at', null)
        return {
          select: vi.fn(() => ({
            filter: communityFilterMock.mockImplementation(() => ({
              is: vi.fn().mockResolvedValue({ count: cfg.communityCount ?? 0, error: null }),
            })),
          })),
        };
      }
      if (table === 'site_layout_metadata') {
        // .select('slug', { count, head }).eq('default_preset_slug', x)
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ count: cfg.layoutCount ?? 0, error: null }),
          })),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
  };
}

function makeRequest(): Request {
  return new Request('http://localhost/api/admin/site-templates/theme-presets/bay-light', {
    method: 'DELETE',
  });
}

async function importHandler() {
  return import('../../src/app/api/admin/site-templates/theme-presets/[slug]/route');
}

async function callDelete(slug = 'bay-light') {
  const { DELETE } = await importHandler();
  return DELETE(
    makeRequest() as unknown as Parameters<typeof DELETE>[0],
    { params: Promise.resolve({ slug }) },
  );
}

describe('DELETE /api/admin/site-templates/theme-presets/[slug]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformAdminMock.mockResolvedValue({ id: 'admin-1', email: 'a@x.test' });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hard-deletes a fully-unreferenced preset', async () => {
    createAdminTypedClientMock.mockImplementation(() =>
      buildClient({ presetRow: { id: 1, is_archived: false }, communityCount: 0, layoutCount: 0 }),
    );
    const res = await callDelete();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ archived: false, deleted: true });
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('archives (not deletes) when a community references the preset', async () => {
    createAdminTypedClientMock.mockImplementation(() =>
      buildClient({ presetRow: { id: 1, is_archived: false }, communityCount: 3, layoutCount: 0 }),
    );
    const res = await callDelete();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      archived: true,
      deleted: false,
      communityCount: 3,
      layoutCount: 0,
    });
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0]).toMatchObject({ is_archived: true });
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('archives when a layout names the preset as its default (FK restrict)', async () => {
    createAdminTypedClientMock.mockImplementation(() =>
      buildClient({ presetRow: { id: 1, is_archived: false }, communityCount: 0, layoutCount: 1 }),
    );
    const res = await callDelete();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ archived: true, deleted: false, layoutCount: 1 });
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('is idempotent when an in-use preset is already archived (no update)', async () => {
    createAdminTypedClientMock.mockImplementation(() =>
      buildClient({ presetRow: { id: 1, is_archived: true }, communityCount: 2, layoutCount: 0 }),
    );
    const res = await callDelete();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ archived: true, communityCount: 2 });
    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('filters communities on the branding jsonb path for this slug', async () => {
    createAdminTypedClientMock.mockImplementation(() =>
      buildClient({ presetRow: { id: 1, is_archived: false }, communityCount: 0, layoutCount: 0 }),
    );
    await callDelete('linen-bronze');
    expect(communityFilterMock).toHaveBeenCalledWith('branding->>themePresetSlug', 'eq', 'linen-bronze');
  });

  it('404s when the preset does not exist', async () => {
    createAdminTypedClientMock.mockImplementation(() =>
      buildClient({ presetRow: null, presetReadErr: { code: 'PGRST116', message: 'No rows' } }),
    );
    const res = await callDelete('missing');
    expect(res.status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('throws when requirePlatformAdmin rejects', async () => {
    requirePlatformAdminMock.mockRejectedValueOnce(new Error('not-admin'));
    createAdminTypedClientMock.mockImplementation(() => buildClient({}));
    await expect(callDelete()).rejects.toThrow('not-admin');
  });
});
