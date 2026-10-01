/**
 * Unit tests — `POST /api/v1/documents/send` gates. Delivery itself is covered
 * against a real database in integration/document-share.integration.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePermissionMock,
  assertNotDemoGraceMock,
  requireActiveSubscriptionMock,
  shareDocumentsMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  requireActiveSubscriptionMock: vi.fn(),
  shareDocumentsMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: requireAuthenticatedUserIdMock }));
vi.mock('@/lib/api/community-membership', () => ({ requireCommunityMembership: requireCommunityMembershipMock }));
vi.mock('@/lib/api/tenant-context', () => ({ resolveEffectiveCommunityId: (_req: unknown, id: number) => id }));
vi.mock('@/lib/db/access-control', () => ({ requirePermission: requirePermissionMock }));
vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: assertNotDemoGraceMock }));
vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: requireActiveSubscriptionMock,
}));
vi.mock('@/lib/invitations/send-community-invitation', () => ({ inviterNameFrom: () => 'Pat Manager' }));
vi.mock('@/lib/services/document-share-service', () => ({ shareDocuments: shareDocumentsMock }));

import { POST } from '../../src/app/api/v1/documents/send/route';

const SEND_ID = '6f1c1c3e-1b8e-4c7a-9a52-2a3f7c1d9e10';
const post = (body: Record<string, unknown>) =>
  POST(
    new NextRequest('http://localhost:3000/api/v1/documents/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId: 42, documentIds: [7], userIds: ['u1'], sendId: SEND_ID, ...body }),
    }),
  );

describe('POST /api/v1/documents/send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('actor-1');
    requireCommunityMembershipMock.mockResolvedValue({ communityId: 42, role: 'property_manager', communityType: 'condo_718' });
    requirePermissionMock.mockReturnValue(undefined);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireActiveSubscriptionMock.mockResolvedValue(undefined);
    shareDocumentsMock.mockResolvedValue([{ userId: 'u1', status: 'emailed', documentIds: [7] }]);
  });

  it('passes the request through and returns every result', async () => {
    const res = await post({});
    expect(res.status).toBe(200);
    expect((await res.json()).data.results).toEqual([{ userId: 'u1', status: 'emailed', documentIds: [7] }]);
    expect(requirePermissionMock).toHaveBeenCalledWith(expect.anything(), 'documents', 'write');
    expect(shareDocumentsMock).toHaveBeenCalledWith({
      communityId: 42,
      communityType: 'condo_718',
      documentIds: [7],
      userIds: ['u1'],
      sendId: SEND_ID,
      actorUserId: 'actor-1',
      senderName: 'Pat Manager',
    });
  });

  it('is refused without documents:write and sends nothing', async () => {
    requirePermissionMock.mockImplementation(() => {
      throw new ForbiddenError('no');
    });
    expect((await post({})).status).toBe(403);
    expect(shareDocumentsMock).not.toHaveBeenCalled();
  });

  it.each([
    ['no sendId', { sendId: undefined }],
    ['a non-uuid sendId', { sendId: 'abc' }],
    ['no documents', { documentIds: [] }],
    ['11 documents', { documentIds: Array.from({ length: 11 }, (_, i) => i + 1) }],
    ['101 recipients', { userIds: Array.from({ length: 101 }, (_, i) => `u${i}`) }],
  ])('rejects %s', async (_label, body) => {
    expect((await post(body)).status).toBe(400);
    expect(shareDocumentsMock).not.toHaveBeenCalled();
  });
});
