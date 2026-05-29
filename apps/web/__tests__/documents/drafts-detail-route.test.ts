import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePermissionMock,
  getDocumentDraftByIdMock,
  updateDocumentDraftMock,
  softDeleteDocumentDraftMock,
  logAuditEventMock,
  assertNotDemoGraceMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  getDocumentDraftByIdMock: vi.fn(),
  updateDocumentDraftMock: vi.fn(),
  softDeleteDocumentDraftMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@propertypro/db', () => ({
  logAuditEvent: logAuditEventMock,
}));

vi.mock('@/lib/services/document-draft-service', () => ({
  getDocumentDraftById: getDocumentDraftByIdMock,
  updateDocumentDraft: updateDocumentDraftMock,
  softDeleteDocumentDraft: softDeleteDocumentDraftMock,
}));

import { DELETE, GET, PATCH } from '../../src/app/api/v1/documents/drafts/[id]/route';

const BASE = 'http://localhost:3000/api/v1/documents/drafts/5';

describe('documents/drafts/[id] detail route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'board_member',
      isAdmin: true,
    });
    getDocumentDraftByIdMock.mockResolvedValue({
      id: 5,
      authorId: 'user-2',
      title: 'Draft',
      deletedAt: null,
    });
    updateDocumentDraftMock.mockResolvedValue([{ id: 5, title: 'Updated' }]);
  });

  it('GET returns draft for admin', async () => {
    const req = new NextRequest(`${BASE}?communityId=42`);
    const res = await GET(req, { params: Promise.resolve({ id: '5' }) });
    const json = (await res.json()) as { data: { id: number } };

    expect(res.status).toBe(200);
    expect(json.data.id).toBe(5);
    expect(getDocumentDraftByIdMock).toHaveBeenCalledWith(42, 5);
  });

  it('GET returns 403 when non-admin accesses another author draft', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce({
      role: 'owner',
      isAdmin: false,
    });

    const req = new NextRequest(`${BASE}?communityId=42`);
    const res = await GET(req, { params: Promise.resolve({ id: '5' }) });

    expect(res.status).toBe(403);
  });

  it('GET requires communityId', async () => {
    const req = new NextRequest(BASE);
    const res = await GET(req, { params: Promise.resolve({ id: '5' }) });

    expect(res.status).toBe(400);
    expect(getDocumentDraftByIdMock).not.toHaveBeenCalled();
  });

  it('PATCH updates draft fields', async () => {
    const req = new NextRequest(`${BASE}?communityId=42`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Updated title' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: '5' }) });
    const json = (await res.json()) as { data: { title: string } };

    expect(res.status).toBe(200);
    expect(json.data.title).toBe('Updated');
    expect(updateDocumentDraftMock).toHaveBeenCalled();
  });

  it('DELETE soft-deletes and logs audit', async () => {
    const req = new NextRequest(`${BASE}?communityId=42`, { method: 'DELETE' });
    const res = await DELETE(req, { params: Promise.resolve({ id: '5' }) });
    const json = (await res.json()) as { data: { id: number; deleted: boolean } };

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ id: 5, deleted: true });
    expect(softDeleteDocumentDraftMock).toHaveBeenCalledWith(42, 5);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'document_draft',
        resourceId: '5',
        communityId: 42,
      }),
    );
  });
});
