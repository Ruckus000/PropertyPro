import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { makeAdminMembership } from '../helpers/membership-mock';

const {
  createScopedClientMock,
  logAuditEventMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireActiveSubscriptionForMutationMock,
  queueNotificationMock,
  meetingsTableMock,
  meetingDocumentsTableMock,
  documentsTableMock,
  communitiesTableMock,
  filtersMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireActiveSubscriptionForMutationMock: vi.fn().mockResolvedValue(undefined),
  queueNotificationMock: vi.fn().mockResolvedValue(undefined),
  meetingsTableMock: {
    id: Symbol('meetings.id'),
    title: Symbol('meetings.title'),
    meetingType: Symbol('meetings.meetingType'),
    startsAt: Symbol('meetings.startsAt'),
    endsAt: Symbol('meetings.endsAt'),
    location: Symbol('meetings.location'),
    noticePostedAt: Symbol('meetings.noticePostedAt'),
    minutesApprovedAt: Symbol('meetings.minutesApprovedAt'),
  },
  meetingDocumentsTableMock: {
    id: Symbol('meeting_documents.id'),
    meetingId: Symbol('meeting_documents.meetingId'),
    documentId: Symbol('meeting_documents.documentId'),
  },
  documentsTableMock: { id: Symbol('documents.id') },
  communitiesTableMock: {
    id: Symbol('communities.id'),
    timezone: Symbol('communities.timezone'),
  },
  filtersMock: {
    and: vi.fn((...parts) => ({ type: 'and', parts })),
    asc: vi.fn((value) => ({ type: 'asc', value })),
    eq: vi.fn((left, right) => ({ type: 'eq', left, right })),
    gte: vi.fn((left, right) => ({ type: 'gte', left, right })),
    lt: vi.fn((left, right) => ({ type: 'lt', left, right })),
  },
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  meetings: meetingsTableMock,
  meetingDocuments: meetingDocumentsTableMock,
  documents: documentsTableMock,
  communities: communitiesTableMock,
}));

vi.mock('@propertypro/db/filters', () => filtersMock);

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/services/notification-service', () => ({
  queueNotification: queueNotificationMock,
}));

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: requireActiveSubscriptionForMutationMock,
}));


vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: vi.fn().mockResolvedValue(undefined) }));
import { POST } from '../../src/app/api/v1/meetings/route';

describe('meetings route — delete / attach / detach actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('session-user-1');
    requireCommunityMembershipMock.mockResolvedValue(makeAdminMembership());
  });

  // ---------------------------------------------------------------------------
  // DELETE action
  // ---------------------------------------------------------------------------
  describe('DELETE action', () => {
    it('soft-deletes the meeting and logs an audit event', async () => {
      const softDeleteMock = vi.fn().mockResolvedValue(undefined);
      createScopedClientMock.mockReturnValue({
        selectFrom: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        softDelete: softDeleteMock,
        hardDelete: vi.fn(),
      });

      const response = await POST(
        new NextRequest('http://localhost:3000/api/v1/meetings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'delete', communityId: 42, id: 10 }),
        }),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({ data: { success: true } });
      expect(softDeleteMock).toHaveBeenCalledWith(
        meetingsTableMock,
        expect.objectContaining({ type: 'eq' }),
      );
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'delete',
          resourceType: 'meeting',
          resourceId: '10',
        }),
      );
    });

    it('returns 422 when id is missing', async () => {
      const response = await POST(
        new NextRequest('http://localhost:3000/api/v1/meetings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'delete', communityId: 42 }),
        }),
      );

      expect(response.status).toBe(422);
    });

    it('returns 422 when id is non-positive (0)', async () => {
      const response = await POST(
        new NextRequest('http://localhost:3000/api/v1/meetings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'delete', communityId: 42, id: 0 }),
        }),
      );

      expect(response.status).toBe(422);
    });
  });

  // ---------------------------------------------------------------------------
  // ATTACH action
  // ---------------------------------------------------------------------------
  describe('ATTACH action', () => {
    function setupAttachMocks(overrides?: {
      meetingRows?: unknown[];
      documentRows?: unknown[];
    }) {
      const meetingRows = overrides?.meetingRows ?? [{ id: 10 }];
      const documentRows = overrides?.documentRows ?? [{ id: 5 }];

      const selectFromMock = vi.fn((table: unknown) => {
        if (table === meetingsTableMock) return Promise.resolve(meetingRows);
        if (table === documentsTableMock) return Promise.resolve(documentRows);
        return Promise.resolve([]);
      });
      const insertMock = vi.fn().mockResolvedValue([{ id: 77, meetingId: 10, documentId: 5 }]);

      createScopedClientMock.mockReturnValue({
        selectFrom: selectFromMock,
        insert: insertMock,
        update: vi.fn(),
        softDelete: vi.fn(),
        hardDelete: vi.fn(),
      });

      return { selectFromMock, insertMock };
    }

    it('attaches a document to a meeting and returns 201', async () => {
      const { insertMock } = setupAttachMocks();

      const response = await POST(
        new NextRequest('http://localhost:3000/api/v1/meetings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'attach',
            communityId: 42,
            meetingId: 10,
            documentId: 5,
          }),
        }),
      );

      expect(response.status).toBe(201);
      expect(insertMock).toHaveBeenCalledWith(meetingDocumentsTableMock, {
        meetingId: 10,
        documentId: 5,
        attachedBy: 'session-user-1',
      });
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          resourceType: 'meeting_document',
          metadata: { subAction: 'attach' },
        }),
      );
    });

    it('returns 404 when meeting is not found', async () => {
      setupAttachMocks({ meetingRows: [] });

      const response = await POST(
        new NextRequest('http://localhost:3000/api/v1/meetings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'attach',
            communityId: 42,
            meetingId: 10,
            documentId: 5,
          }),
        }),
      );

      expect(response.status).toBe(404);
    });

    it('returns 404 when document is not found', async () => {
      setupAttachMocks({ documentRows: [] });

      const response = await POST(
        new NextRequest('http://localhost:3000/api/v1/meetings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'attach',
            communityId: 42,
            meetingId: 10,
            documentId: 5,
          }),
        }),
      );

      expect(response.status).toBe(404);
    });

    it('returns 422 when documentId is missing', async () => {
      const response = await POST(
        new NextRequest('http://localhost:3000/api/v1/meetings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'attach',
            communityId: 42,
            meetingId: 10,
          }),
        }),
      );

      expect(response.status).toBe(422);
    });

    it('sets attachedBy to the actor userId', async () => {
      const { insertMock } = setupAttachMocks();

      await POST(
        new NextRequest('http://localhost:3000/api/v1/meetings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'attach',
            communityId: 42,
            meetingId: 10,
            documentId: 5,
          }),
        }),
      );

      expect(insertMock).toHaveBeenCalledWith(
        meetingDocumentsTableMock,
        expect.objectContaining({ attachedBy: 'session-user-1' }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // DETACH action
  // ---------------------------------------------------------------------------
  describe('DETACH action', () => {
    function setupDetachMocks(overrides?: {
      meetingRows?: unknown[];
      documentRows?: unknown[];
    }) {
      const meetingRows = overrides?.meetingRows ?? [{ id: 10 }];
      const documentRows = overrides?.documentRows ?? [{ id: 5 }];

      const selectFromMock = vi.fn((table: unknown) => {
        if (table === meetingsTableMock) return Promise.resolve(meetingRows);
        if (table === documentsTableMock) return Promise.resolve(documentRows);
        return Promise.resolve([]);
      });
      const hardDeleteMock = vi.fn().mockResolvedValue(undefined);

      createScopedClientMock.mockReturnValue({
        selectFrom: selectFromMock,
        insert: vi.fn(),
        update: vi.fn(),
        softDelete: vi.fn(),
        hardDelete: hardDeleteMock,
      });

      return { selectFromMock, hardDeleteMock };
    }

    it('detaches a document from a meeting and returns 200', async () => {
      const { hardDeleteMock } = setupDetachMocks();

      const response = await POST(
        new NextRequest('http://localhost:3000/api/v1/meetings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'detach',
            communityId: 42,
            meetingId: 10,
            documentId: 5,
          }),
        }),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({ data: { success: true } });
      expect(hardDeleteMock).toHaveBeenCalledWith(
        meetingDocumentsTableMock,
        expect.objectContaining({ type: 'and' }),
      );
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          resourceType: 'meeting_document',
          resourceId: '10:5',
          metadata: { subAction: 'detach' },
        }),
      );
    });

    it('returns 404 when meeting is not found', async () => {
      setupDetachMocks({ meetingRows: [] });

      const response = await POST(
        new NextRequest('http://localhost:3000/api/v1/meetings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'detach',
            communityId: 42,
            meetingId: 10,
            documentId: 5,
          }),
        }),
      );

      expect(response.status).toBe(404);
    });

    it('returns 404 when document is not found', async () => {
      setupDetachMocks({ documentRows: [] });

      const response = await POST(
        new NextRequest('http://localhost:3000/api/v1/meetings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'detach',
            communityId: 42,
            meetingId: 10,
            documentId: 5,
          }),
        }),
      );

      expect(response.status).toBe(404);
    });

    it('returns 422 when meetingId is missing', async () => {
      const response = await POST(
        new NextRequest('http://localhost:3000/api/v1/meetings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'detach',
            communityId: 42,
            documentId: 5,
          }),
        }),
      );

      expect(response.status).toBe(422);
    });
  });
});
