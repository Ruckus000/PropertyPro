import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { requirePlatformAdminMock, createAdminTypedClientMock, orderMock } =
  vi.hoisted(() => ({
    requirePlatformAdminMock: vi.fn(),
    createAdminTypedClientMock: vi.fn(),
    orderMock: vi.fn(),
  }));

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: requirePlatformAdminMock,
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: createAdminTypedClientMock,
}));

function buildClient(rows: unknown[] | { error: { message: string } }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.order = orderMock.mockImplementation(() => {
    if (orderMock.mock.calls.length >= 2) {
      if ('error' in (rows as object)) {
        return Promise.resolve({
          data: null,
          error: (rows as { error: { message: string } }).error,
        });
      }
      return Promise.resolve({ data: rows, error: null });
    }
    return chain;
  });
  return { from: vi.fn(() => chain) };
}

describe('GET /api/admin/site-templates/layouts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformAdminMock.mockResolvedValue({ id: 'admin-1', email: 'a@x.test' });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the list of layouts shaped for the client', async () => {
    createAdminTypedClientMock.mockReturnValue(
      buildClient([
        {
          id: 1,
          slug: 'tidewater',
          display_name: 'Tidewater',
          tagline: 'tag',
          description: 'desc',
          tier: 'essentials',
          is_archived: false,
          is_featured: true,
          default_preset_slug: 'bay-light',
          version: '1.0.0',
          created_at: '2026-05-01T00:00:00Z',
          updated_at: '2026-05-01T00:00:00Z',
        },
      ]),
    );

    const { GET } = await import(
      '../../src/app/api/admin/site-templates/layouts/route'
    );
    const res = await GET(
      new Request('http://localhost/api/admin/site-templates/layouts') as unknown as Parameters<typeof GET>[0],
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      layouts: [
        {
          id: 1,
          slug: 'tidewater',
          displayName: 'Tidewater',
          tagline: 'tag',
          description: 'desc',
          tier: 'essentials',
          isArchived: false,
          isFeatured: true,
          defaultPresetSlug: 'bay-light',
          version: '1.0.0',
          createdAt: '2026-05-01T00:00:00Z',
          updatedAt: '2026-05-01T00:00:00Z',
        },
      ],
    });
  });

  it('returns an empty list when no rows exist', async () => {
    createAdminTypedClientMock.mockReturnValue(buildClient([]));
    const { GET } = await import(
      '../../src/app/api/admin/site-templates/layouts/route'
    );
    const res = await GET(
      new Request('http://localhost/api/admin/site-templates/layouts') as unknown as Parameters<typeof GET>[0],
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ layouts: [] });
  });

  it('returns 500 with the supabase error message when the read fails', async () => {
    createAdminTypedClientMock.mockReturnValue(buildClient({ error: { message: 'boom' } }));
    const { GET } = await import(
      '../../src/app/api/admin/site-templates/layouts/route'
    );
    const res = await GET(
      new Request('http://localhost/api/admin/site-templates/layouts') as unknown as Parameters<typeof GET>[0],
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error.message).toBe('boom');
  });

  it('throws when requirePlatformAdmin rejects (handler aborts before DB read)', async () => {
    requirePlatformAdminMock.mockRejectedValueOnce(new Error('not-admin'));
    createAdminTypedClientMock.mockReturnValue(buildClient([]));
    const { GET } = await import(
      '../../src/app/api/admin/site-templates/layouts/route'
    );
    await expect(
      GET(
        new Request('http://localhost/api/admin/site-templates/layouts') as unknown as Parameters<typeof GET>[0],
      ),
    ).rejects.toThrow('not-admin');
    expect(createAdminTypedClientMock).not.toHaveBeenCalled();
  });
});
