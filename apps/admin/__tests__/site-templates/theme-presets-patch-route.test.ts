import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requirePlatformAdminMock,
  createAdminTypedClientMock,
  readSingleMock,
  updateSingleMock,
  updateMock,
  selectAfterUpdateMock,
} = vi.hoisted(() => ({
  requirePlatformAdminMock: vi.fn(),
  createAdminTypedClientMock: vi.fn(),
  readSingleMock: vi.fn(),
  updateSingleMock: vi.fn(),
  updateMock: vi.fn(),
  selectAfterUpdateMock: vi.fn(),
}));

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: requirePlatformAdminMock,
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: createAdminTypedClientMock,
}));

// Two distinct chain shapes:
//   - Read (for current version): from().select().eq().single() → readSingleMock
//   - Write: from().update().eq().select().single()             → updateSingleMock
//
// Both .from() calls return the same chain object; the second call to
// `.select()` after `.update()` returns the write-chain leaf.
function buildClient() {
  return {
    from: vi.fn(() => {
      const updateChain: Record<string, unknown> = {};
      updateChain.eq = vi.fn(() => ({
        select: selectAfterUpdateMock.mockImplementation(() => ({ single: updateSingleMock })),
      }));
      const selectReadChain: Record<string, unknown> = {};
      selectReadChain.eq = vi.fn(() => ({ single: readSingleMock }));
      return {
        update: updateMock.mockImplementation(() => updateChain),
        select: vi.fn(() => selectReadChain),
      };
    }),
  };
}

const VALID_ROW = {
  id: 1,
  slug: 'bay-light',
  display_name: 'Bay Light 2',
  description: 'desc',
  tokens: {
    primaryColor: '#000',
    secondaryColor: '#fff',
    accentColor: '#aaa',
    headingFont: 'Fraunces',
    bodyFont: 'Manrope',
  },
  tier: 'essentials' as const,
  is_archived: false,
  is_featured: true,
  version: 1,
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-28T00:00:00Z',
};

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/site-templates/theme-presets/bay-light', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

async function importHandler() {
  return import('../../src/app/api/admin/site-templates/theme-presets/[slug]/route');
}

describe('PATCH /api/admin/site-templates/theme-presets/[slug]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformAdminMock.mockResolvedValue({ id: 'admin-1', email: 'a@x.test' });
    createAdminTypedClientMock.mockImplementation(buildClient);
    updateSingleMock.mockResolvedValue({ data: VALID_ROW, error: null });
    readSingleMock.mockResolvedValue({ data: { version: 1 }, error: null });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('updates displayName + description and returns shaped row', async () => {
    const { PATCH } = await importHandler();
    const res = await PATCH(
      makeRequest({ displayName: 'Bay Light 2', description: 'desc' }) as unknown as Parameters<typeof PATCH>[0],
      { params: Promise.resolve({ slug: 'bay-light' }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.preset).toMatchObject({ slug: 'bay-light', displayName: 'Bay Light 2' });

    const updateArg = updateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg.display_name).toBe('Bay Light 2');
    expect(updateArg.description).toBe('desc');
    // version is NOT bumped when only metadata changes
    expect(updateArg.version).toBeUndefined();
    expect(updateArg.updated_at).toBeTypeOf('string');
  });

  it('bumps version when tokens are updated', async () => {
    readSingleMock.mockResolvedValueOnce({ data: { version: 4 }, error: null });
    updateSingleMock.mockResolvedValueOnce({ data: { ...VALID_ROW, version: 5 }, error: null });
    const { PATCH } = await importHandler();
    const res = await PATCH(
      makeRequest({
        tokens: {
          primaryColor: '#111',
          secondaryColor: '#222',
          accentColor: '#333',
          headingFont: 'Inter',
          bodyFont: 'Inter',
        },
      }) as unknown as Parameters<typeof PATCH>[0],
      { params: Promise.resolve({ slug: 'bay-light' }) },
    );
    expect(res.status).toBe(200);
    const updateArg = updateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg.version).toBe(5);
    expect(updateArg.tokens).toEqual({
      primaryColor: '#111',
      secondaryColor: '#222',
      accentColor: '#333',
      headingFont: 'Inter',
      bodyFont: 'Inter',
    });
  });

  it('400s when body has no editable fields', async () => {
    const { PATCH } = await importHandler();
    const res = await PATCH(
      makeRequest({}) as unknown as Parameters<typeof PATCH>[0],
      { params: Promise.resolve({ slug: 'bay-light' }) },
    );
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('400s when tier is invalid', async () => {
    const { PATCH } = await importHandler();
    const res = await PATCH(
      makeRequest({ tier: 'enterprise' }) as unknown as Parameters<typeof PATCH>[0],
      { params: Promise.resolve({ slug: 'bay-light' }) },
    );
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('404s when no row matches the slug (PGRST116 on the read step)', async () => {
    readSingleMock.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116', message: 'No rows' } });
    const { PATCH } = await importHandler();
    const res = await PATCH(
      makeRequest({ tokens: VALID_ROW.tokens }) as unknown as Parameters<typeof PATCH>[0],
      { params: Promise.resolve({ slug: 'missing' }) },
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.message).toContain('not found');
  });

  it('404s when no row matches the slug on the update step', async () => {
    updateSingleMock.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116', message: 'No rows' } });
    const { PATCH } = await importHandler();
    const res = await PATCH(
      makeRequest({ displayName: 'X' }) as unknown as Parameters<typeof PATCH>[0],
      { params: Promise.resolve({ slug: 'missing' }) },
    );
    expect(res.status).toBe(404);
  });

  it('throws when requirePlatformAdmin rejects', async () => {
    requirePlatformAdminMock.mockRejectedValueOnce(new Error('not-admin'));
    const { PATCH } = await importHandler();
    await expect(
      PATCH(
        makeRequest({ displayName: 'X' }) as unknown as Parameters<typeof PATCH>[0],
        { params: Promise.resolve({ slug: 'bay-light' }) },
      ),
    ).rejects.toThrow('not-admin');
    expect(updateMock).not.toHaveBeenCalled();
  });
});
