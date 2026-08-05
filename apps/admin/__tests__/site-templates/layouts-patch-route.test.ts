import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '@propertypro/shared/http';

const {
  requirePlatformAdminMock,
  createAdminTypedClientMock,
  fromMock,
  updateMock,
  eqMock,
  selectMock,
  singleMock,
} = vi.hoisted(() => {
  const singleMock = vi.fn();
  const selectMock = vi.fn(() => ({ single: singleMock }));
  const eqMock = vi.fn(() => ({ select: selectMock }));
  const updateMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ update: updateMock }));
  return {
    requirePlatformAdminMock: vi.fn(),
    createAdminTypedClientMock: vi.fn(() => ({ from: fromMock })),
    fromMock,
    updateMock,
    eqMock,
    selectMock,
    singleMock,
  };
});

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: requirePlatformAdminMock,
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: createAdminTypedClientMock,
}));

const VALID_ROW = {
  id: 1,
  slug: 'tidewater',
  display_name: 'Tidewater 2',
  tagline: 'new tagline',
  description: null,
  tier: 'professional' as const,
  is_archived: false,
  is_featured: true,
  default_preset_slug: 'bay-light',
  version: '1.0.0',
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-28T00:00:00Z',
};

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/site-templates/layouts/tidewater', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

async function importHandler() {
  return import('../../src/app/api/admin/site-templates/layouts/[slug]/route');
}

describe('PATCH /api/admin/site-templates/layouts/[slug]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformAdminMock.mockResolvedValue({ id: 'admin-1', email: 'a@x.test' });
    singleMock.mockResolvedValue({ data: VALID_ROW, error: null });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('updates supplied fields and returns the shaped layout row', async () => {
    const { PATCH } = await importHandler();
    const res = await PATCH(
      makeRequest({ displayName: 'Tidewater 2', tagline: 'new tagline', tier: 'professional' }) as unknown as Parameters<typeof PATCH>[0],
      { params: Promise.resolve({ slug: 'tidewater' }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.layout).toMatchObject({
      slug: 'tidewater',
      displayName: 'Tidewater 2',
      tagline: 'new tagline',
      tier: 'professional',
    });

    // Verify the update payload only contained the provided fields + updated_at
    const updateArg = updateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg.display_name).toBe('Tidewater 2');
    expect(updateArg.tagline).toBe('new tagline');
    expect(updateArg.tier).toBe('professional');
    expect(updateArg.is_featured).toBeUndefined();
    expect(updateArg.is_archived).toBeUndefined();
    expect(updateArg.updated_at).toBeTypeOf('string');

    // Eq filter on slug
    expect(eqMock).toHaveBeenCalledWith('slug', 'tidewater');
  });

  it('400s when body contains no editable fields', async () => {
    const { PATCH } = await importHandler();
    const res = await PATCH(
      makeRequest({}) as unknown as Parameters<typeof PATCH>[0],
      { params: Promise.resolve({ slug: 'tidewater' }) },
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.message).toMatch(/no editable fields/i);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('400s when body has an invalid tier enum', async () => {
    const { PATCH } = await importHandler();
    const res = await PATCH(
      makeRequest({ tier: 'enterprise' }) as unknown as Parameters<typeof PATCH>[0],
      { params: Promise.resolve({ slug: 'tidewater' }) },
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.message).toMatch(/invalid request body/i);
    expect(json.error.fields).toBeInstanceOf(Array);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('400s when body is not valid JSON', async () => {
    const { PATCH } = await importHandler();
    const badReq = new Request('http://localhost/api/admin/site-templates/layouts/tidewater', {
      method: 'PATCH',
      body: '{not-json',
      headers: { 'content-type': 'application/json' },
    });
    const res = await PATCH(
      badReq as unknown as Parameters<typeof PATCH>[0],
      { params: Promise.resolve({ slug: 'tidewater' }) },
    );
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('404s when supabase reports PGRST116 (no row matched the slug)', async () => {
    singleMock.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116', message: 'No rows' } });
    const { PATCH } = await importHandler();
    const res = await PATCH(
      makeRequest({ displayName: 'X' }) as unknown as Parameters<typeof PATCH>[0],
      { params: Promise.resolve({ slug: 'missing' }) },
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.message).toContain('Layout not found');
  });

  it('500s on generic supabase error', async () => {
    singleMock.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'boom' } });
    const { PATCH } = await importHandler();
    const res = await PATCH(
      makeRequest({ displayName: 'X' }) as unknown as Parameters<typeof PATCH>[0],
      { params: Promise.resolve({ slug: 'tidewater' }) },
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error.message).toBe('boom');
  });

  it('returns 403 when requirePlatformAdmin rejects (handler aborts before DB write)', async () => {
    requirePlatformAdminMock.mockRejectedValueOnce(new ForbiddenError('Platform admin access required'));
    const { PATCH } = await importHandler();
    await expect(
      PATCH(
        makeRequest({ displayName: 'X' }) as unknown as Parameters<typeof PATCH>[0],
        { params: Promise.resolve({ slug: 'tidewater' }) },
      ),
    ).resolves.toHaveProperty('status', 403);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('handles nullable fields explicitly set to null (tagline, description)', async () => {
    const { PATCH } = await importHandler();
    const res = await PATCH(
      makeRequest({ tagline: null, description: null }) as unknown as Parameters<typeof PATCH>[0],
      { params: Promise.resolve({ slug: 'tidewater' }) },
    );
    expect(res.status).toBe(200);
    const updateArg = updateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg.tagline).toBeNull();
    expect(updateArg.description).toBeNull();
  });
});
