/**
 * Publishing minutes closes the loop on the meeting they were authored from.
 *
 * The loop was open: the "Author minutes" button seeds a draft carrying
 * `target_meeting_id`, publishing it inserts a documents row and links it to
 * the meeting — and nothing ever wrote `meetings.minutes_approved_at`. That
 * column had ZERO writers in the repo, so every past meeting read "minutes
 * owed" forever, the meetings screen kept offering "Author minutes" after the
 * minutes were published, and the snowbird digest's board-decisions section
 * (which queries the column directly) was permanently empty.
 *
 * `target_meeting_id` is set from exactly one place — the minutes author page
 * — so a meeting-linked authored document IS the minutes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  createScopedClientMock,
  logAuditEventMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  getDocumentDraftByIdMock,
  getMeetingForDraftSeedMock,
  linkPublishedDocumentToMeetingMock,
  softDeleteDocumentDraftMock,
  createAuthoredDocumentMock,
  meetingsTableMock,
  filtersMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  getDocumentDraftByIdMock: vi.fn(),
  getMeetingForDraftSeedMock: vi.fn(),
  linkPublishedDocumentToMeetingMock: vi.fn().mockResolvedValue(undefined),
  softDeleteDocumentDraftMock: vi.fn().mockResolvedValue(undefined),
  createAuthoredDocumentMock: vi.fn(),
  meetingsTableMock: {
    id: Symbol('meetings.id'),
    minutesApprovedAt: Symbol('meetings.minutesApprovedAt'),
    noticePostedAt: Symbol('meetings.noticePostedAt'),
  },
  filtersMock: {
    and: vi.fn((...parts: unknown[]) => ({ type: 'and', parts })),
    asc: vi.fn((value: unknown) => ({ type: 'asc', value })),
    eq: vi.fn((left: unknown, right: unknown) => ({ type: 'eq', left, right })),
    gte: vi.fn((left: unknown, right: unknown) => ({ type: 'gte', left, right })),
    inArray: vi.fn((left: unknown, right: unknown) => ({ type: 'inArray', left, right })),
    lt: vi.fn((left: unknown, right: unknown) => ({ type: 'lt', left, right })),
  },
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  createPresignedDownloadUrl: vi.fn().mockResolvedValue(null),
  meetings: meetingsTableMock,
  meetingDocuments: { id: Symbol('meeting_documents.id') },
  documents: { id: Symbol('documents.id') },
  communities: { id: Symbol('communities.id'), timezone: Symbol('communities.timezone') },
}));

vi.mock('@propertypro/db/filters', () => filtersMock);

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: vi.fn((_req: unknown, value: number) => value),
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: vi.fn(),
}));

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/utils/sanitize-authored-html', () => ({
  sanitizeAuthoredHtml: (html: string) => html,
}));

vi.mock('@/lib/documents/render-authored-html', () => ({
  renderAuthoredHtml: () => '<html><body>minutes</body></html>',
}));

vi.mock('@/lib/documents/render-pdf', () => ({
  renderHtmlToPdf: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
}));

vi.mock('@/lib/documents/create-authored-document', () => ({
  createAuthoredDocument: createAuthoredDocumentMock,
}));

vi.mock('@/lib/services/document-draft-service', () => ({
  getAuthorDisplayName: vi.fn().mockResolvedValue({ fullName: 'Marisol Reyes' }),
  getCommunityForDocumentPublish: vi.fn().mockResolvedValue({ name: 'Sunset Condos' }),
  getDocumentDraftById: getDocumentDraftByIdMock,
  getMeetingForDraftSeed: getMeetingForDraftSeedMock,
  linkPublishedDocumentToMeeting: linkPublishedDocumentToMeetingMock,
  softDeleteDocumentDraft: softDeleteDocumentDraftMock,
}));

import { POST } from '../../src/app/api/v1/documents/drafts/[id]/publish/route';

const NOW = new Date('2026-09-14T18:05:00.000Z');

function mockMeetingRow(row: Record<string, unknown> | null) {
  const updateMock = vi.fn().mockResolvedValue(undefined);
  const selectFromMock = vi.fn(() => Promise.resolve(row === null ? [] : [row]));
  createScopedClientMock.mockReturnValue({
    selectFrom: selectFromMock,
    insert: vi.fn(),
    update: updateMock,
    softDelete: vi.fn(),
    hardDelete: vi.fn(),
  });
  return { updateMock };
}

function publish() {
  return POST(
    new NextRequest('http://localhost:3000/api/v1/documents/drafts/5/publish?communityId=42', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }),
    { params: Promise.resolve({ id: '5' }) },
  );
}

describe('publishing a draft authored from a meeting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    requireAuthenticatedUserIdMock.mockResolvedValue('author-1');
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'author-1',
      communityId: 42,
      role: 'manager',
      isAdmin: true,
      communityType: 'condo_718',
      timezone: 'America/New_York',
    });
    createAuthoredDocumentMock.mockResolvedValue({ document: { id: 900 }, warnings: [] });
    getMeetingForDraftSeedMock.mockResolvedValue({ id: 13, title: 'August Board Meeting' });
    getDocumentDraftByIdMock.mockResolvedValue({
      id: 5,
      authorId: 'author-1',
      title: 'Minutes — August Board Meeting',
      bodyHtml: '<p>The board met.</p>',
      targetCategoryId: 3,
      targetMeetingId: 13,
      sourceDocumentId: null,
      coverSheetEnabled: false,
      letterheadOptions: {},
      deletedAt: null,
    });
  });

  it('stamps the meeting as having minutes on the record', async () => {
    const { updateMock } = mockMeetingRow({ id: 13, minutesApprovedAt: null });

    const response = await publish();

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      meetingsTableMock,
      { minutesApprovedAt: NOW },
      expect.anything(),
    );
  });

  it('logs the meeting_minutes_approved audit action that nothing has ever emitted', async () => {
    mockMeetingRow({ id: 13, minutesApprovedAt: null });

    await publish();

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'meeting_minutes_approved',
        resourceType: 'meeting',
        resourceId: '13',
        communityId: 42,
        newValues: { minutesApprovedAt: NOW.toISOString(), documentId: 900 },
      }),
    );
  });

  it('leaves an earlier posting date alone when a corrected set is published', async () => {
    const original = new Date('2026-08-20T15:00:00.000Z');
    const { updateMock } = mockMeetingRow({ id: 13, minutesApprovedAt: original });

    const response = await publish();

    expect(response.status).toBe(200);
    // The first posting is what the 30-day window measures.
    expect(updateMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'meeting_minutes_approved' }),
    );
    // The document is still linked to the meeting.
    expect(linkPublishedDocumentToMeetingMock).toHaveBeenCalledWith(42, 13, 900);
  });

  it('stamps nothing when the draft was not authored from a meeting', async () => {
    getDocumentDraftByIdMock.mockResolvedValue({
      id: 5,
      authorId: 'author-1',
      title: 'Pool Rules',
      bodyHtml: '<p>No diving.</p>',
      targetCategoryId: 3,
      targetMeetingId: null,
      sourceDocumentId: null,
      coverSheetEnabled: false,
      letterheadOptions: {},
      deletedAt: null,
    });
    const { updateMock } = mockMeetingRow({ id: 13, minutesApprovedAt: null });

    const response = await publish();

    expect(response.status).toBe(200);
    expect(updateMock).not.toHaveBeenCalled();
    expect(linkPublishedDocumentToMeetingMock).not.toHaveBeenCalled();
  });

  it('still publishes when the stamp fails', async () => {
    // The document exists and the author is done. A bookkeeping failure must
    // not throw away a rendered PDF that is already in storage.
    createScopedClientMock.mockReturnValue({
      selectFrom: vi.fn(() => Promise.reject(new Error('connection lost'))),
      insert: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
      hardDelete: vi.fn(),
    });

    const response = await publish();

    expect(response.status).toBe(200);
    expect(softDeleteDocumentDraftMock).toHaveBeenCalledWith(42, 5);
  });
});
