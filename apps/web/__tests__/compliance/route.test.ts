import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { DataIntegrityError } from '../../src/lib/api/errors/DataIntegrityError';

const {
  createScopedClientMock,
  logAuditEventMock,
  scopedQueryMock,
  scopedInsertMock,
  communitiesTable,
  complianceChecklistItemsTable,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  scopedQueryMock: vi.fn(),
  scopedInsertMock: vi.fn(),
  communitiesTable: Symbol('communities'),
  complianceChecklistItemsTable: Symbol('compliance_checklist_items'),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  communities: communitiesTable,
  complianceChecklistItems: complianceChecklistItemsTable,
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@propertypro/shared', () => ({
  getComplianceTemplate: (communityType: string) => {
    if (communityType === 'condo_718') {
      return [
        {
          templateKey: '718_budget',
          title: 'Budget',
          description: 'Budget posting',
          category: 'financial_records',
          statuteReference: '§718.112(2)(f)',
          deadlineDays: 30,
        },
      ];
    }

    if (communityType === 'hoa_720') {
      return [
        {
          templateKey: '720_minutes',
          title: 'Minutes',
          description: 'Minutes retention',
          category: 'meeting_records',
          statuteReference: '§720.303(4)(l)',
          rollingMonths: 12,
        },
      ];
    }

    return [];
  },
  getFeaturesForCommunity: (communityType: string) => ({
    hasCompliance: communityType !== 'apartment',
  }),
}));

import { GET, POST } from '../../src/app/api/v1/compliance/route';

describe('p1-09 compliance route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('f8a6fbc9-ae4f-4f13-ad8b-a5217af0bd81');
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'board_president',
      communityType: 'condo_718',
    });

    createScopedClientMock.mockReturnValue({
      query: scopedQueryMock,
      insert: scopedInsertMock,
    });
  });

  it('POST apartment returns 403', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce({
      role: 'site_manager',
      communityType: 'apartment',
    });

    const req = new NextRequest('http://localhost:3000/api/v1/compliance', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 7,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(scopedInsertMock).not.toHaveBeenCalled();
  });

  it('POST rejects payloads with extra keys', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/compliance', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 42,
        communityType: 'condo_718',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  it('POST condo generates checklist rows and logs audit event', async () => {
    scopedQueryMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 100,
          templateKey: '718_budget',
        },
      ]);

    scopedInsertMock.mockResolvedValueOnce([]);

    const req = new NextRequest('http://localhost:3000/api/v1/compliance', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 42,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(
      42,
      'f8a6fbc9-ae4f-4f13-ad8b-a5217af0bd81',
    );
    expect(scopedInsertMock).toHaveBeenCalledWith(
      complianceChecklistItemsTable,
      expect.arrayContaining([
        expect.objectContaining({
          templateKey: '718_budget',
        }),
      ]),
    );

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create',
        resourceType: 'compliance_checklist',
        communityId: 42,
      }),
    );
  });

  it('POST returns existing rows when checklist is already generated', async () => {
    scopedQueryMock.mockResolvedValueOnce([
      {
        id: 10,
        templateKey: '718_budget',
      },
    ]);

    const req = new NextRequest('http://localhost:3000/api/v1/compliance', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 42,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      meta?: { alreadyGenerated?: boolean };
    };
    expect(json.meta?.alreadyGenerated).toBe(true);
    expect(scopedInsertMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('POST recovers from unique-violation race and returns canonical rows', async () => {
    scopedQueryMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 11,
          templateKey: '718_budget',
        },
      ]);
    scopedInsertMock.mockRejectedValueOnce({ code: '23505' });

    const req = new NextRequest('http://localhost:3000/api/v1/compliance', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 42,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: Array<{ templateKey: string }>;
      meta?: { alreadyGenerated?: boolean };
    };

    expect(json.data[0]?.templateKey).toBe('718_budget');
    expect(json.meta?.alreadyGenerated).toBe(true);
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('POST returns 500 when membership has invalid community type', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new DataIntegrityError('Invalid community type in requireCommunityMembership', {
        value: 'not_a_type',
      }),
    );

    const req = new NextRequest('http://localhost:3000/api/v1/compliance', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 42,
      }),
    });

    const res = await POST(req);
    const json = (await res.json()) as { error: { code: string } };
    expect(res.status).toBe(500);
    expect(json.error.code).toBe('DATA_INTEGRITY_ERROR');
  });

  it('GET computes status for checklist rows', async () => {
    scopedQueryMock.mockResolvedValueOnce([
      {
        id: 1,
        templateKey: '718_budget',
        documentId: null,
        documentPostedAt: null,
        deadline: '2026-01-01T00:00:00.000Z',
        rollingWindow: null,
      },
    ]);

    const req = new NextRequest('http://localhost:3000/api/v1/compliance?communityId=55');
    const res = await GET(req);
    const json = (await res.json()) as {
      data: Array<{ status: string }>;
    };

    expect(createScopedClientMock).toHaveBeenCalledWith(55);
    expect(json.data[0]?.status).toBe('overdue');
  });

  it('POST rejects unauthenticated requests', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const req = new NextRequest('http://localhost:3000/api/v1/compliance', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 42,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('POST returns 403 for authenticated non-member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError());

    const req = new NextRequest('http://localhost:3000/api/v1/compliance', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 42,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
