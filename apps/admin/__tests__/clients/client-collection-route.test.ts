import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requirePlatformAdminMock,
  createTypedAdminClientMock,
  provisionInitialAdminMock,
  communitiesMaybeSingleMock,
  communitiesInsertSingleMock,
  communitiesDeleteEqMock,
  complianceInsertMock,
  mockDb,
} = vi.hoisted(() => {
  const requirePlatformAdminMock = vi.fn();
  const createTypedAdminClientMock = vi.fn();
  const provisionInitialAdminMock = vi.fn();
  const communitiesMaybeSingleMock = vi.fn();
  const communitiesInsertSingleMock = vi.fn();
  const communitiesDeleteEqMock = vi.fn();
  const complianceInsertMock = vi.fn();

  const communitiesTable = {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: communitiesMaybeSingleMock,
      })),
    })),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: communitiesInsertSingleMock,
      })),
    })),
    delete: vi.fn(() => ({
      eq: communitiesDeleteEqMock,
    })),
  };

  const complianceItemsTable = {
    insert: complianceInsertMock,
  };

  const mockDb = {
    from: vi.fn((table: string) => {
      if (table === 'communities') {
        return communitiesTable;
      }

      if (table === 'compliance_items') {
        return complianceItemsTable;
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return {
    requirePlatformAdminMock,
    createTypedAdminClientMock,
    provisionInitialAdminMock,
    communitiesMaybeSingleMock,
    communitiesInsertSingleMock,
    communitiesDeleteEqMock,
    complianceInsertMock,
    mockDb,
  };
});

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: requirePlatformAdminMock,
}));

vi.mock('@/lib/db/admin-client-types', () => ({
  createTypedAdminClient: createTypedAdminClientMock,
}));

vi.mock('@/lib/auth/provision-initial-admin', () => ({
  provisionInitialAdmin: provisionInitialAdminMock,
}));

type ClientsRoute = typeof import('../../src/app/api/admin/clients/route');

const BASE = 'http://localhost:3001';

let route: ClientsRoute;

function jsonRequest(path: string, method: 'POST', body: string): NextRequest {
  return new NextRequest(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  });
}

async function parseJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

describe('admin clients collection route', () => {
  beforeAll(async () => {
    route = await import('../../src/app/api/admin/clients/route');
  });

  beforeEach(() => {
    vi.clearAllMocks();

    requirePlatformAdminMock.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@propertyprofl.com',
      role: 'super_admin' as const,
    });
    createTypedAdminClientMock.mockReturnValue(mockDb);
    provisionInitialAdminMock.mockResolvedValue({ success: true, invitationSent: true });
    communitiesMaybeSingleMock.mockResolvedValue({ data: null });
    communitiesInsertSingleMock.mockResolvedValue({
      data: {
        id: 101,
        name: 'Sunrise Towers',
        slug: 'sunrise-towers',
        community_type: 'condo_718',
        subscription_status: 'active',
        created_at: '2026-03-06T00:00:00.000Z',
      },
      error: null,
    });
    complianceInsertMock.mockResolvedValue({ error: null });
    communitiesDeleteEqMock.mockResolvedValue({ error: null });
  });

  it('rejects GET when the caller is not a platform admin', async () => {
    requirePlatformAdminMock.mockRejectedValueOnce(
      new Response('Forbidden', { status: 403 }),
    );

    const response = await route.GET(
      new NextRequest(`${BASE}/api/admin/clients?slug=sunrise-towers`),
    );

    expect(response.status).toBe(403);
    expect(await parseJson<{ error: { message: string } }>(response)).toEqual({
      error: { message: 'Forbidden' },
    });
    expect(createTypedAdminClientMock).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed POST JSON bodies', async () => {
    const response = await route.POST(
      jsonRequest('/api/admin/clients', 'POST', '{"name":'),
    );

    expect(response.status).toBe(400);
    expect(await parseJson<{ error: { message: string } }>(response)).toEqual({
      error: { message: 'Invalid JSON body' },
    });
    expect(createTypedAdminClientMock).not.toHaveBeenCalled();
  });

  it('rolls back the community when baseline compliance item creation fails', async () => {
    complianceInsertMock.mockResolvedValueOnce({
      error: { message: 'insert failed' },
    });

    const response = await route.POST(
      jsonRequest(
        '/api/admin/clients',
        'POST',
        JSON.stringify({
          name: 'Sunrise Towers',
          slug: 'sunrise-towers',
          communityType: 'condo_718',
          state: 'FL',
          subscriptionPlan: 'professional',
        }),
      ),
    );

    expect(response.status).toBe(500);
    expect(await parseJson<{ error: { message: string } }>(response)).toEqual({
      error: { message: 'Failed to create compliance items for community' },
    });
    expect(communitiesDeleteEqMock).toHaveBeenCalledWith('id', 101);
    expect(provisionInitialAdminMock).not.toHaveBeenCalled();
  });

  it('rolls back the community when initial admin provisioning fails', async () => {
    provisionInitialAdminMock.mockResolvedValueOnce({
      success: false,
      invitationSent: false,
      reason: 'invitation_generation_failed',
    });

    const response = await route.POST(
      jsonRequest(
        '/api/admin/clients',
        'POST',
        JSON.stringify({
          name: 'Sunrise Towers',
          slug: 'sunrise-towers',
          communityType: 'condo_718',
          state: 'FL',
          subscriptionPlan: 'professional',
          initialAdmin: {
            email: 'president@example.com',
            role: 'board_president',
          },
        }),
      ),
    );

    expect(response.status).toBe(500);
    expect(await parseJson<{ error: { message: string } }>(response)).toEqual({
      error: { message: 'Failed to provision initial admin' },
    });
    expect(communitiesDeleteEqMock).toHaveBeenCalledWith('id', 101);
  });
});
