import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  createScopedClientMock,
  logAuditEventMock,
  scopedQueryMock,
  scopedInsertMock,
  communitiesTable,
  complianceChecklistItemsTable,
  requireAuthenticatedUserIdMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  scopedQueryMock: vi.fn(),
  scopedInsertMock: vi.fn(),
  communitiesTable: Symbol('communities'),
  complianceChecklistItemsTable: Symbol('compliance_checklist_items'),
  requireAuthenticatedUserIdMock: vi.fn(),
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

vi.mock('@propertypro/shared', () => ({
  COMMUNITY_TYPES: ['condo_718', 'hoa_720', 'apartment'],
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
}));

import { GET, POST } from '../../src/app/api/v1/compliance/route';

describe('p1-09 compliance route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('f8a6fbc9-ae4f-4f13-ad8b-a5217af0bd81');

    createScopedClientMock.mockReturnValue({
      query: scopedQueryMock,
      insert: scopedInsertMock,
    });
  });

  it('POST apartment returns no checklist items', async () => {
    scopedQueryMock.mockResolvedValueOnce([
      {
        id: 7,
      },
    ]);

    const req = new NextRequest('http://localhost:3000/api/v1/compliance', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 7,
        communityType: 'apartment',
      }),
    });

    const res = await POST(req);
    const json = (await res.json()) as {
      data: unknown[];
    };

    expect(res.status).toBe(201);
    expect(json.data).toEqual([]);
    expect(scopedInsertMock).not.toHaveBeenCalled();
  });

  it('POST condo generates checklist rows and logs audit event', async () => {
    scopedQueryMock
      .mockResolvedValueOnce([
        {
          id: 42,
          communityType: 'condo_718',
        },
      ])
      .mockResolvedValueOnce([]);

    scopedInsertMock.mockResolvedValueOnce([
      {
        id: 100,
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
        communityType: 'condo_718',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(scopedInsertMock).toHaveBeenCalledWith(
      complianceChecklistItemsTable,
      expect.objectContaining({
        templateKey: '718_budget',
      }),
    );

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create',
        resourceType: 'compliance_checklist',
        communityId: 42,
      }),
    );
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
        communityType: 'condo_718',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
