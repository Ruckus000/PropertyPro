import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '@propertypro/shared/http';

const { requirePlatformAdminMock, createAdminTypedClientMock, orderMock } =
  vi.hoisted(() => {
    const orderMock = vi.fn();
    return {
      requirePlatformAdminMock: vi.fn(),
      createAdminTypedClientMock: vi.fn(),
      orderMock,
    };
  });

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
    // Second `.order()` returns the awaited result.
    if (orderMock.mock.calls.length >= 2) {
      if ('error' in (rows as object)) {
        return Promise.resolve({ data: null, error: (rows as { error: { message: string } }).error });
      }
      return Promise.resolve({ data: rows, error: null });
    }
    return chain;
  });
  return {
    from: vi.fn(() => chain),
  };
}

describe('GET /api/admin/site-templates/theme-presets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformAdminMock.mockResolvedValue({ id: 'admin-1', email: 'a@x.test' });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the list of theme presets shaped for the client', async () => {
    createAdminTypedClientMock.mockReturnValue(
      buildClient([
        {
          id: 1,
          slug: 'bay-light',
          display_name: 'Bay Light',
          description: 'desc',
          tokens: { primaryColor: '#000' },
          tier: 'essentials',
          is_archived: false,
          is_featured: true,
          version: 1,
          created_at: '2026-05-01T00:00:00Z',
          updated_at: '2026-05-01T00:00:00Z',
        },
      ]),
    );

    const { GET } = await import(
      '../../src/app/api/admin/site-templates/theme-presets/route'
    );
    const res = await GET(new Request('http://localhost/api/admin/site-templates/theme-presets') as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      presets: [
        {
          id: 1,
          slug: 'bay-light',
          displayName: 'Bay Light',
          description: 'desc',
          tokens: { primaryColor: '#000' },
          tier: 'essentials',
          isArchived: false,
          isFeatured: true,
          version: 1,
          createdAt: '2026-05-01T00:00:00Z',
          updatedAt: '2026-05-01T00:00:00Z',
        },
      ],
    });
  });

  it('returns an empty list when no rows exist', async () => {
    createAdminTypedClientMock.mockReturnValue(buildClient([]));
    const { GET } = await import(
      '../../src/app/api/admin/site-templates/theme-presets/route'
    );
    const res = await GET(new Request('http://localhost/api/admin/site-templates/theme-presets') as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ presets: [] });
  });

  it('returns 500 with the supabase error message when the read fails', async () => {
    createAdminTypedClientMock.mockReturnValue(buildClient({ error: { message: 'boom' } }));
    const { GET } = await import(
      '../../src/app/api/admin/site-templates/theme-presets/route'
    );
    const res = await GET(new Request('http://localhost/api/admin/site-templates/theme-presets') as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error.message).toBe('boom');
  });

  it('returns 403 when requirePlatformAdmin rejects (handler aborts before DB read)', async () => {
    requirePlatformAdminMock.mockRejectedValueOnce(new ForbiddenError('Platform admin access required'));
    createAdminTypedClientMock.mockReturnValue(buildClient([]));
    const { GET } = await import(
      '../../src/app/api/admin/site-templates/theme-presets/route'
    );
    await expect(
      GET(new Request('http://localhost/api/admin/site-templates/theme-presets') as unknown as Parameters<typeof GET>[0]),
    ).resolves.toHaveProperty('status', 403);
    expect(createAdminTypedClientMock).not.toHaveBeenCalled();
  });
});
