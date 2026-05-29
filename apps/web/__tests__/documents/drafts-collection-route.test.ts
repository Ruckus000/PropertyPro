import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePermissionMock,
  listMyActiveDocumentDraftsMock,
  createDocumentDraftMock,
  getMeetingForDraftSeedMock,
  getAuthoredDocumentForReeditMock,
  logAuditEventMock,
  assertNotDemoGraceMock,
  requireActiveSubscriptionForMutationMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  listMyActiveDocumentDraftsMock: vi.fn(),
  createDocumentDraftMock: vi.fn(),
  getMeetingForDraftSeedMock: vi.fn(),
  getAuthoredDocumentForReeditMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn().mockResolvedValue(undefined),
  requireActiveSubscriptionForMutationMock: vi.fn().mockResolvedValue(undefined),
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

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: requireActiveSubscriptionForMutationMock,
}));

vi.mock('@propertypro/db', () => ({
  logAuditEvent: logAuditEventMock,
}));

vi.mock('@/lib/services/document-draft-service', () => ({
  listMyActiveDocumentDrafts: listMyActiveDocumentDraftsMock,
  createDocumentDraft: createDocumentDraftMock,
  getMeetingForDraftSeed: getMeetingForDraftSeedMock,
  getAuthoredDocumentForReedit: getAuthoredDocumentForReeditMock,
}));

import { GET, POST } from '../../src/app/api/v1/documents/drafts/route';

describe('documents/drafts collection route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'board_member',
      communityType: 'condo_718',
    });
    listMyActiveDocumentDraftsMock.mockResolvedValue([{ id: 1, title: 'Draft A' }]);
    createDocumentDraftMock.mockResolvedValue({ id: 9, title: 'New draft' });
  });

  it('GET lists drafts for the community', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/documents/drafts?communityId=42');
    const res = await GET(req);
    const json = (await res.json()) as { data: Array<{ id: number }> };

    expect(res.status).toBe(200);
    expect(json.data[0]?.id).toBe(1);
    expect(listMyActiveDocumentDraftsMock).toHaveBeenCalledWith(42, 'user-1');
  });

  it('GET requires communityId', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/documents/drafts');
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(listMyActiveDocumentDraftsMock).not.toHaveBeenCalled();
  });

  it('POST creates a draft and logs audit', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/documents/drafts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        communityId: 42,
        title: 'Board minutes draft',
      }),
    });

    const res = await POST(req);
    const json = (await res.json()) as { data: { id: number } };

    expect(res.status).toBe(200);
    expect(json.data.id).toBe(9);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'document_draft',
        resourceId: '9',
        communityId: 42,
      }),
    );
  });

  it('POST returns 404 when meeting seed is missing', async () => {
    getMeetingForDraftSeedMock.mockResolvedValueOnce(null);

    const req = new NextRequest('http://localhost:3000/api/v1/documents/drafts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        communityId: 42,
        targetMeetingId: 5,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('POST returns 403 when create returns null', async () => {
    createDocumentDraftMock.mockResolvedValueOnce(null);

    const req = new NextRequest('http://localhost:3000/api/v1/documents/drafts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId: 42 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
