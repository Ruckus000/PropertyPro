import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requirePlatformAdminMock,
  createAdminTypedClientMock,
  fromMock,
  insertMock,
  selectMock,
  singleMock,
  orderMock,
} = vi.hoisted(() => {
  const singleMock = vi.fn();
  const selectMock = vi.fn(() => ({ single: singleMock }));
  const insertMock = vi.fn(() => ({ select: selectMock }));
  // The same .from(...) handler must serve both GET (.select.order.order) and POST (.insert.select.single).
  const orderMock = vi.fn();
  const fromMock = vi.fn(() => {
    const fromChain: Record<string, unknown> = {};
    fromChain.insert = insertMock;
    const selectChain: Record<string, unknown> = {};
    selectChain.order = orderMock.mockImplementation(() => {
      if (orderMock.mock.calls.length >= 2) {
        return Promise.resolve({ data: [], error: null });
      }
      return selectChain;
    });
    fromChain.select = vi.fn(() => selectChain);
    return fromChain;
  });
  return {
    requirePlatformAdminMock: vi.fn(),
    createAdminTypedClientMock: vi.fn(() => ({ from: fromMock })),
    fromMock,
    insertMock,
    selectMock,
    singleMock,
    orderMock,
  };
});

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: requirePlatformAdminMock,
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: createAdminTypedClientMock,
}));

const VALID_TOKENS = {
  primaryColor: '#0e3338',
  secondaryColor: '#f6f1e6',
  accentColor: '#c66f49',
  headingFont: 'Fraunces',
  bodyFont: 'Manrope',
};

const VALID_BODY = {
  slug: 'new-preset',
  displayName: 'New Preset',
  description: 'desc',
  tokens: VALID_TOKENS,
  tier: 'essentials',
  isFeatured: false,
} as const;

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/site-templates/theme-presets', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

async function importHandler() {
  return import('../../src/app/api/admin/site-templates/theme-presets/route');
}

describe('POST /api/admin/site-templates/theme-presets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformAdminMock.mockResolvedValue({ id: 'admin-1', email: 'a@x.test' });
    singleMock.mockResolvedValue({
      data: {
        id: 99,
        slug: VALID_BODY.slug,
        display_name: VALID_BODY.displayName,
        description: VALID_BODY.description,
        tokens: VALID_BODY.tokens,
        tier: VALID_BODY.tier,
        is_archived: false,
        is_featured: VALID_BODY.isFeatured,
        version: 1,
        created_at: '2026-05-28T00:00:00Z',
        updated_at: '2026-05-28T00:00:00Z',
      },
      error: null,
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a preset and returns 201 with the shaped row', async () => {
    const { POST } = await importHandler();
    const res = await POST(
      makeRequest(VALID_BODY) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.preset).toMatchObject({
      slug: 'new-preset',
      displayName: 'New Preset',
      tokens: VALID_TOKENS,
      version: 1,
    });

    const insertArg = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(insertArg.slug).toBe('new-preset');
    expect(insertArg.display_name).toBe('New Preset');
    expect(insertArg.tokens).toEqual(VALID_TOKENS);
    expect(insertArg.is_archived).toBe(false);
    expect(insertArg.version).toBe(1);
  });

  it('defaults tier to essentials and isFeatured to false when omitted', async () => {
    const { POST } = await importHandler();
    const { tier: _t, isFeatured: _f, ...rest } = VALID_BODY;
    await POST(makeRequest(rest) as unknown as Parameters<typeof POST>[0]);
    const insertArg = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(insertArg.tier).toBe('essentials');
    expect(insertArg.is_featured).toBe(false);
  });

  it('409s when slug is already taken (unique_violation 23505)', async () => {
    singleMock.mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'dupe' } });
    const { POST } = await importHandler();
    const res = await POST(
      makeRequest(VALID_BODY) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.message).toContain('already exists');
  });

  it('400s on slug that contains uppercase / non-kebab characters', async () => {
    const { POST } = await importHandler();
    const res = await POST(
      makeRequest({ ...VALID_BODY, slug: 'BadSlug_Underscore' }) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('400s when tokens are missing a required field', async () => {
    const { POST } = await importHandler();
    const res = await POST(
      makeRequest({
        ...VALID_BODY,
        tokens: { primaryColor: '#000', secondaryColor: '#fff', accentColor: '#aaa', headingFont: 'Inter' },
      }) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.fields).toBeInstanceOf(Array);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('400s on malformed JSON body', async () => {
    const { POST } = await importHandler();
    const badReq = new Request('http://localhost/api/admin/site-templates/theme-presets', {
      method: 'POST',
      body: '{not-json',
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(badReq as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('500s on generic supabase error', async () => {
    singleMock.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'boom' } });
    const { POST } = await importHandler();
    const res = await POST(
      makeRequest(VALID_BODY) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(500);
    expect((await res.json()).error.message).toBe('boom');
  });

  it('throws when requirePlatformAdmin rejects', async () => {
    requirePlatformAdminMock.mockRejectedValueOnce(new Error('not-admin'));
    const { POST } = await importHandler();
    await expect(
      POST(makeRequest(VALID_BODY) as unknown as Parameters<typeof POST>[0]),
    ).rejects.toThrow('not-admin');
    expect(insertMock).not.toHaveBeenCalled();
  });
});
