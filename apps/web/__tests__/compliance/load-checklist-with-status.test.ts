/**
 * `loadChecklistWithStatus` reads the community's meetings when, and only
 * when, its checklist has a meeting-notice or minutes row, and scores those
 * rows from them (audit 2026-11-05, H-4 and H-5).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listComplianceChecklistItems: vi.fn(),
  getLinkedDocumentStatesByIds: vi.fn(),
  getCommunityUnitCount: vi.fn(),
  listMeetingsForComplianceScoring: vi.fn(),
}));

vi.mock('@/lib/services/compliance-service', () => ({
  listComplianceChecklistItems: mocks.listComplianceChecklistItems,
}));
vi.mock('@/lib/services/documents-service', () => ({
  getLinkedDocumentStatesByIds: mocks.getLinkedDocumentStatesByIds,
}));
vi.mock('@/lib/services/community-profile-service', () => ({
  getCommunityUnitCount: mocks.getCommunityUnitCount,
}));
vi.mock('@/lib/services/meeting-service', () => ({
  listMeetingsForComplianceScoring: mocks.listMeetingsForComplianceScoring,
}));

import { loadChecklistWithStatus } from '@/lib/compliance/load-checklist-with-status';

const DAY = 24 * 60 * 60 * 1000;

const noticeRow = {
  id: 1,
  templateKey: '718_meeting_notices',
  isApplicable: true,
  documentId: 9,
  documentPostedAt: new Date(Date.now() - 20 * DAY).toISOString(),
  deadline: null,
  rollingWindow: { months: 12 },
};

describe('loadChecklistWithStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLinkedDocumentStatesByIds.mockResolvedValue(new Map([[9, { deletedAt: null, isDraft: false }]]));
    mocks.getCommunityUnitCount.mockResolvedValue(60);
    mocks.listMeetingsForComplianceScoring.mockResolvedValue([]);
  });

  it('does not read meetings for a checklist with no meeting-notice row', async () => {
    mocks.listComplianceChecklistItems.mockResolvedValue([{ ...noticeRow, templateKey: '718_budget' }]);
    await loadChecklistWithStatus(42, 'condo_718');
    expect(mocks.listMeetingsForComplianceScoring).not.toHaveBeenCalled();
  });

  it('scores the meeting-notice row from the last 12 months of meetings', async () => {
    mocks.listComplianceChecklistItems.mockResolvedValue([noticeRow]);
    mocks.listMeetingsForComplianceScoring.mockResolvedValue([
      {
        id: 3,
        title: 'Annual Meeting',
        meetingType: 'annual',
        startsAt: new Date(Date.now() - 2 * DAY),
        noticePostedAt: null,
      },
    ]);

    const [row] = await loadChecklistWithStatus(42, 'condo_718');

    const since = mocks.listMeetingsForComplianceScoring.mock.calls[0]![1] as Date;
    expect(mocks.listMeetingsForComplianceScoring).toHaveBeenCalledWith(42, expect.any(Date));
    expect(Date.now() - since.getTime()).toBeGreaterThan(360 * DAY);
    expect(row!['status']).toBe('overdue');
    expect(row!['meetingNotices']).toMatchObject({ dueCount: 1, onTimeCount: 0 });
  });

  it('scores the minutes row per board meeting, reading the minutes documents the meetings name', async () => {
    const minutesRow = { ...noticeRow, id: 2, templateKey: '718_minutes_rolling_12m', documentId: 9 };
    mocks.listComplianceChecklistItems.mockResolvedValue([minutesRow]);
    const approvedAt = new Date(Date.now() - 80 * DAY);
    mocks.listMeetingsForComplianceScoring.mockResolvedValue([
      {
        id: 3,
        title: 'Board Meeting',
        meetingType: 'board',
        startsAt: new Date(Date.now() - 90 * DAY),
        noticePostedAt: null,
        // Posted 45 days after approval: late.
        minutesApprovedAt: new Date(approvedAt.getTime() + 45 * DAY),
        minutesDocumentId: 31,
      },
      {
        id: 4,
        title: 'Board Meeting',
        meetingType: 'board',
        startsAt: new Date(Date.now() - 10 * DAY),
        noticePostedAt: null,
        minutesApprovedAt: null,
        minutesDocumentId: null,
      },
    ]);
    mocks.getLinkedDocumentStatesByIds.mockImplementation(async (_id: number, ids: number[]) =>
      ids.includes(31)
        ? new Map([[31, { deletedAt: null, isDraft: false, receivedAt: approvedAt }]])
        : new Map([[9, { deletedAt: null, isDraft: false }]]),
    );

    const [row] = await loadChecklistWithStatus(42, 'condo_718');

    // The checklist's own document first, then only the minutes document not yet read.
    expect(mocks.getLinkedDocumentStatesByIds.mock.calls).toEqual([[42, [9]], [42, [31]]]);
    expect(row!['status']).toBe('overdue');
    expect(row!['meetingMinutes']).toMatchObject({ dueCount: 1, onTimeCount: 0 });
    expect(row!['clock']).toMatchObject({ state: 'met_late' });
  });

  it('reads no extra documents when the minutes document is already the checklist\'s', async () => {
    mocks.listComplianceChecklistItems.mockResolvedValue([
      { ...noticeRow, templateKey: '718_minutes_rolling_12m', documentId: 9 },
    ]);
    mocks.listMeetingsForComplianceScoring.mockResolvedValue([
      {
        id: 3,
        title: 'Board Meeting',
        meetingType: 'board',
        startsAt: new Date(Date.now() - 30 * DAY),
        noticePostedAt: null,
        minutesApprovedAt: new Date(Date.now() - 5 * DAY),
        minutesDocumentId: 9,
      },
    ]);
    await loadChecklistWithStatus(42, 'condo_718');
    expect(mocks.getLinkedDocumentStatesByIds).toHaveBeenCalledTimes(1);
  });
});
