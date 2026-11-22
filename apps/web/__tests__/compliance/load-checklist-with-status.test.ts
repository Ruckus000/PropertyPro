/**
 * `loadChecklistWithStatus` reads the community's meetings when, and only
 * when, its checklist has a meeting-notice row, and scores that row from them
 * (audit 2026-11-05, H-4).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listComplianceChecklistItems: vi.fn(),
  getLinkedDocumentStatesByIds: vi.fn(),
  getCommunityUnitCount: vi.fn(),
  listMeetingsForNoticeScoring: vi.fn(),
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
  listMeetingsForNoticeScoring: mocks.listMeetingsForNoticeScoring,
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
    mocks.listMeetingsForNoticeScoring.mockResolvedValue([]);
  });

  it('does not read meetings for a checklist with no meeting-notice row', async () => {
    mocks.listComplianceChecklistItems.mockResolvedValue([{ ...noticeRow, templateKey: '718_budget' }]);
    await loadChecklistWithStatus(42, 'condo_718');
    expect(mocks.listMeetingsForNoticeScoring).not.toHaveBeenCalled();
  });

  it('scores the meeting-notice row from the last 12 months of meetings', async () => {
    mocks.listComplianceChecklistItems.mockResolvedValue([noticeRow]);
    mocks.listMeetingsForNoticeScoring.mockResolvedValue([
      {
        id: 3,
        title: 'Annual Meeting',
        meetingType: 'annual',
        startsAt: new Date(Date.now() - 2 * DAY),
        noticePostedAt: null,
      },
    ]);

    const [row] = await loadChecklistWithStatus(42, 'condo_718');

    const since = mocks.listMeetingsForNoticeScoring.mock.calls[0]![1] as Date;
    expect(mocks.listMeetingsForNoticeScoring).toHaveBeenCalledWith(42, expect.any(Date));
    expect(Date.now() - since.getTime()).toBeGreaterThan(360 * DAY);
    expect(row!['status']).toBe('overdue');
    expect(row!['meetingNotices']).toMatchObject({ dueCount: 1, onTimeCount: 0 });
  });
});
