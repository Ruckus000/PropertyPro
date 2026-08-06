import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '@propertypro/shared/http';
import { PLATFORM_LIST_LIMIT } from '@/lib/api/list-limits';

const { requirePlatformAdminMock, createAdminTypedClientMock, orderMock, limitMock } =
  vi.hoisted(() => ({
    requirePlatformAdminMock: vi.fn(),
    createAdminTypedClientMock: vi.fn(),
    orderMock: vi.fn(),
    limitMock: vi.fn(),
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
  // `.order()` is now followed by `.limit()`, which is what terminates the
  // chain — the list query is capped (see lib/api/list-limits.ts).
  chain.order = orderMock.mockImplementation(() => chain);
  chain.limit = limitMock.mockImplementation(() => {
    if ('error' in (rows as object)) {
      return Promise.resolve({
        data: null,
        error: (rows as { error: { message: string } }).error,
      });
    }
    return Promise.resolve({ data: rows, error: null });
  });
  return { from: vi.fn(() => chain) };
}

describe('GET /api/admin/site-templates/layouts', () => {
  // Teaching the mock about .limit() without asserting it would hide whether
  // the cap is really applied — the mock would pass either way.
  it('caps the query rather than selecting the whole table', async () => {
    createAdminTypedClientMock.mockReturnValue(buildClient([]));
    const { GET } = await import('../../src/app/api/admin/site-templates/layouts/route');
    await GET(new Request('http://localhost/api/admin/site-templates/layouts') as never);
    expect(limitMock).toHaveBeenCalledWith(PLATFORM_LIST_LIMIT);
  });

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

  it('returns an opaque 500 when the read fails, without the supabase message', async () => {
    createAdminTypedClientMock.mockReturnValue(buildClient({ error: { message: 'boom' } }));
    const { GET } = await import(
      '../../src/app/api/admin/site-templates/layouts/route'
    );
    const res = await GET(
      new Request('http://localhost/api/admin/site-templates/layouts') as unknown as Parameters<typeof GET>[0],
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    // The raw PostgREST message must NOT reach the client — it names tables,
    // columns and constraints. It goes to the server log and Sentry instead.
    expect(json.error.message).toBe('An unexpected error occurred');
    expect(JSON.stringify(json)).not.toContain('boom');
  });

  it('returns 403 when requirePlatformAdmin rejects (handler aborts before DB read)', async () => {
    requirePlatformAdminMock.mockRejectedValueOnce(new ForbiddenError('Platform admin access required'));
    createAdminTypedClientMock.mockReturnValue(buildClient([]));
    const { GET } = await import(
      '../../src/app/api/admin/site-templates/layouts/route'
    );
    await expect(
      GET(
        new Request('http://localhost/api/admin/site-templates/layouts') as unknown as Parameters<typeof GET>[0],
      ),
    ).resolves.toHaveProperty('status', 403);
    expect(createAdminTypedClientMock).not.toHaveBeenCalled();
  });
});
