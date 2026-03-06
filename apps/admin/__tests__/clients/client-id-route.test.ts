import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requirePlatformAdminMock,
  createTypedAdminClientMock,
  communitiesPatchSingleMock,
  communitiesDeleteSingleMock,
  mockDb,
} = vi.hoisted(() => {
  const requirePlatformAdminMock = vi.fn();
  const createTypedAdminClientMock = vi.fn();
  const communitiesPatchSingleMock = vi.fn();
  const communitiesDeleteSingleMock = vi.fn();

  const afterIs = {
    select: vi.fn(() => ({
      single: communitiesPatchSingleMock,
    })),
    eq: vi.fn(() => ({
      select: vi.fn(() => ({
        single: communitiesDeleteSingleMock,
      })),
    })),
  };

  const communitiesTable = {
    update: vi.fn(() => ({
      eq: vi.fn(() => ({
        is: vi.fn(() => afterIs),
      })),
    })),
  };

  const mockDb = {
    from: vi.fn((table: string) => {
      if (table !== 'communities') {
        throw new Error(`Unexpected table: ${table}`);
      }

      return communitiesTable;
    }),
  };

  return {
    requirePlatformAdminMock,
    createTypedAdminClientMock,
    communitiesPatchSingleMock,
    communitiesDeleteSingleMock,
    mockDb,
  };
});

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: requirePlatformAdminMock,
}));

vi.mock('@/lib/db/admin-client-types', () => ({
  createTypedAdminClient: createTypedAdminClientMock,
}));

type ClientIdRoute = typeof import('../../src/app/api/admin/clients/[id]/route');

const BASE = 'http://localhost:3001';

let route: ClientIdRoute;

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function parseJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

describe('admin client id route', () => {
  beforeAll(async () => {
    route = await import('../../src/app/api/admin/clients/[id]/route');
  });

  beforeEach(() => {
    vi.clearAllMocks();

    requirePlatformAdminMock.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@propertyprofl.com',
      role: 'super_admin' as const,
    });
    createTypedAdminClientMock.mockReturnValue(mockDb);
    communitiesPatchSingleMock.mockResolvedValue({
      data: { id: 42, name: 'Sunrise Towers', slug: 'sunrise-towers' },
      error: null,
    });
    communitiesDeleteSingleMock.mockResolvedValue({
      data: { id: 42, name: 'Sunrise Towers' },
      error: null,
    });
  });

  it('rejects PATCH when the caller is not a platform admin', async () => {
    requirePlatformAdminMock.mockRejectedValueOnce(
      new Response('Unauthorized', { status: 401 }),
    );

    const response = await route.PATCH(
      new NextRequest(`${BASE}/api/admin/clients/42`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Name' }),
      }),
      makeContext('42'),
    );

    expect(response.status).toBe(401);
    expect(await parseJson<{ error: { message: string } }>(response)).toEqual({
      error: { message: 'Unauthorized' },
    });
    expect(createTypedAdminClientMock).not.toHaveBeenCalled();
  });

  it('rejects DELETE when the caller is not a platform admin', async () => {
    requirePlatformAdminMock.mockRejectedValueOnce(
      new Response('Forbidden', { status: 403 }),
    );

    const response = await route.DELETE(
      new NextRequest(`${BASE}/api/admin/clients/42`, { method: 'DELETE' }),
      makeContext('42'),
    );

    expect(response.status).toBe(403);
    expect(await parseJson<{ error: { message: string } }>(response)).toEqual({
      error: { message: 'Forbidden' },
    });
    expect(createTypedAdminClientMock).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed PATCH JSON bodies', async () => {
    const response = await route.PATCH(
      new NextRequest(`${BASE}/api/admin/clients/42`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: '{"name":',
      }),
      makeContext('42'),
    );

    expect(response.status).toBe(400);
    expect(await parseJson<{ error: { message: string } }>(response)).toEqual({
      error: { message: 'Invalid JSON body' },
    });
    expect(createTypedAdminClientMock).not.toHaveBeenCalled();
  });
});
