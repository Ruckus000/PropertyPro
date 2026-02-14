import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  createScopedClientMock,
  logAuditEventMock,
  meetingsTableMock,
  meetingDocumentsTableMock,
  communitiesTableMock,
  documentsTableMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  meetingsTableMock: { id: Symbol('meetings.id') },
  meetingDocumentsTableMock: { id: Symbol('meeting_documents.id') },
  communitiesTableMock: { id: Symbol('communities.id') },
  documentsTableMock: { id: Symbol('documents.id') },
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  meetings: meetingsTableMock,
  meetingDocuments: meetingDocumentsTableMock,
  communities: communitiesTableMock,
  documents: documentsTableMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

import { GET, POST } from '../../src/app/api/v1/meetings/route';

describe('p1-16 meetings route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('session-user-1');

    // Default mock: query returns empty arrays and a condo community
    const query = vi.fn().mockImplementation(async (table) => {
      if (table === communitiesTableMock) {
        return [
          {
            id: 42,
            name: 'Test Condo',
            communityType: 'condo_718',
            timezone: 'America/New_York',
          },
        ];
      }
      return [];
    });

    createScopedClientMock.mockReturnValue({
      query,
      insert: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      hardDelete: vi.fn(),
    });
  });

  it('GET lists meetings for a community and computes deadlines', async () => {
    const query = vi.fn().mockImplementation(async (table) => {
      if (table === communitiesTableMock) {
        return [
          { id: 42, communityType: 'condo_718', timezone: 'America/New_York' },
        ];
      }
      if (table === meetingsTableMock) {
        return [
          {
            id: 1,
            title: 'Board Meeting',
            meetingType: 'board',
            startsAt: '2026-02-20T18:00:00.000Z',
            location: 'Clubhouse',
          },
        ];
      }
      return [];
    });
    createScopedClientMock.mockReturnValue({
      query,
      insert: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      hardDelete: vi.fn(),
    });

    const req = new NextRequest('http://localhost:3000/api/v1/meetings?communityId=42');
    const res = await GET(req);
    const json = (await res.json()) as { data: Array<{ id: number; deadlines: Record<string, string> }> };

    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(query).toHaveBeenCalledWith(meetingsTableMock);
    expect(json.data[0].id).toBe(1);
    expect(json.data[0].deadlines).toBeDefined();
  });

  it('POST create inserts meeting via scoped client and logs audit', async () => {
    const insert = vi.fn().mockResolvedValue([
      { id: 99, title: 'Annual Meeting', meetingType: 'annual', startsAt: '2026-03-01T00:00:00.000Z', location: 'Hall' },
    ]);

    createScopedClientMock.mockReturnValue({
      query: vi.fn().mockResolvedValue([]),
      insert,
      update: vi.fn(),
      softDelete: vi.fn(),
      hardDelete: vi.fn(),
    });

    const req = new NextRequest('http://localhost:3000/api/v1/meetings', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Annual Meeting',
        meetingType: 'annual',
        startsAt: '2026-03-01T00:00:00.000Z',
        location: 'Hall',
        communityId: 77,
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);
    const json = (await res.json()) as { data: { id: number } };

    expect(createScopedClientMock).toHaveBeenCalledWith(77);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(77, 'session-user-1');
    expect(insert).toHaveBeenCalledWith(
      meetingsTableMock,
      expect.objectContaining({ title: 'Annual Meeting', meetingType: 'annual' }),
    );
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'create', resourceType: 'meeting', resourceId: '99' }),
    );
    expect(json.data.id).toBe(99);
  });

  it('POST update writes audit with changed fields', async () => {
    const query = vi.fn().mockResolvedValue([
      { id: 5, title: 'Old', meetingType: 'board', startsAt: '2026-01-01T00:00:00.000Z', location: 'A' },
    ]);
    const update = vi.fn().mockResolvedValue([
      { id: 5, title: 'New', meetingType: 'board', startsAt: '2026-01-01T00:00:00.000Z', location: 'B' },
    ]);

    createScopedClientMock.mockReturnValue({
      query,
      insert: vi.fn(),
      update,
      softDelete: vi.fn(),
      hardDelete: vi.fn(),
    });

    const req = new NextRequest('http://localhost:3000/api/v1/meetings', {
      method: 'POST',
      body: JSON.stringify({
        action: 'update',
        id: 5,
        communityId: 55,
        title: 'New',
        location: 'B',
      }),
      headers: { 'content-type': 'application/json' },
    });

    await POST(req);
    expect(update).toHaveBeenCalled();
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'update', resourceType: 'meeting', resourceId: '5' }),
    );
  });

  it('POST delete soft-deletes and logs audit', async () => {
    const softDelete = vi.fn().mockResolvedValue([]);

    createScopedClientMock.mockReturnValue({
      query: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      softDelete,
      hardDelete: vi.fn(),
    });

    const req = new NextRequest('http://localhost:3000/api/v1/meetings', {
      method: 'POST',
      body: JSON.stringify({
        action: 'delete',
        id: 10,
        communityId: 88,
      }),
      headers: { 'content-type': 'application/json' },
    });

    await POST(req);
    expect(softDelete).toHaveBeenCalled();
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'delete', resourceType: 'meeting', resourceId: '10' }),
    );
  });

  it('POST attach creates join record and logs audit', async () => {
    const insert = vi.fn().mockResolvedValue([{ id: 123, meetingId: 1, documentId: 2 }]);
    const selectFrom = vi.fn().mockImplementation((table: unknown) => {
      if (table === meetingsTableMock) return Promise.resolve([{ id: 1 }]);
      if (table === documentsTableMock) return Promise.resolve([{ id: 2 }]);
      return Promise.resolve([]);
    });
    createScopedClientMock.mockReturnValue({
      query: vi.fn().mockResolvedValue([]),
      selectFrom,
      insert,
      update: vi.fn(),
      softDelete: vi.fn(),
      hardDelete: vi.fn(),
    });

    const req = new NextRequest('http://localhost:3000/api/v1/meetings', {
      method: 'POST',
      body: JSON.stringify({
        action: 'attach',
        communityId: 42,
        meetingId: 1,
        documentId: 2,
      }),
      headers: { 'content-type': 'application/json' },
    });

    await POST(req);
    expect(insert).toHaveBeenCalledWith(
      meetingDocumentsTableMock,
      expect.objectContaining({ meetingId: 1, documentId: 2 }),
    );
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ resourceType: 'meeting_document', action: 'update' }),
    );
  });

  it('POST attach returns 404 when meetingId does not belong to community', async () => {
    const selectFrom = vi.fn().mockImplementation((table: unknown) => {
      if (table === meetingsTableMock) return Promise.resolve([]); // not found
      if (table === documentsTableMock) return Promise.resolve([{ id: 2 }]);
      return Promise.resolve([]);
    });
    createScopedClientMock.mockReturnValue({
      query: vi.fn().mockResolvedValue([]),
      selectFrom,
      insert: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      hardDelete: vi.fn(),
    });

    const req = new NextRequest('http://localhost:3000/api/v1/meetings', {
      method: 'POST',
      body: JSON.stringify({
        action: 'attach',
        communityId: 42,
        meetingId: 999,
        documentId: 2,
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('POST attach returns 404 when documentId does not belong to community', async () => {
    const selectFrom = vi.fn().mockImplementation((table: unknown) => {
      if (table === meetingsTableMock) return Promise.resolve([{ id: 1 }]);
      if (table === documentsTableMock) return Promise.resolve([]); // not found
      return Promise.resolve([]);
    });
    createScopedClientMock.mockReturnValue({
      query: vi.fn().mockResolvedValue([]),
      selectFrom,
      insert: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      hardDelete: vi.fn(),
    });

    const req = new NextRequest('http://localhost:3000/api/v1/meetings', {
      method: 'POST',
      body: JSON.stringify({
        action: 'attach',
        communityId: 42,
        meetingId: 1,
        documentId: 999,
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('POST detach returns 404 when meetingId does not belong to community', async () => {
    const selectFrom = vi.fn().mockImplementation((table: unknown) => {
      if (table === meetingsTableMock) return Promise.resolve([]); // not found
      if (table === documentsTableMock) return Promise.resolve([{ id: 2 }]);
      return Promise.resolve([]);
    });
    createScopedClientMock.mockReturnValue({
      query: vi.fn().mockResolvedValue([]),
      selectFrom,
      insert: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      hardDelete: vi.fn(),
    });

    const req = new NextRequest('http://localhost:3000/api/v1/meetings', {
      method: 'POST',
      body: JSON.stringify({
        action: 'detach',
        communityId: 42,
        meetingId: 999,
        documentId: 2,
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('POST returns 403 for authenticated non-member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError());

    const req = new NextRequest('http://localhost:3000/api/v1/meetings', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Annual Meeting',
        meetingType: 'annual',
        startsAt: '2026-03-01T00:00:00.000Z',
        location: 'Hall',
        communityId: 77,
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
