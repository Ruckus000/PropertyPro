import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createScopedClientMock,
  queryMock,
  insertMock,
  communitiesTable,
  checklistTable,
  meetingsTable,
  documentsTable,
  getComplianceTemplateMock,
  getFeaturesForCommunityMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  queryMock: vi.fn(),
  insertMock: vi.fn(),
  communitiesTable: Symbol('communities'),
  checklistTable: Symbol('compliance_checklist_items'),
  meetingsTable: Symbol('meetings'),
  documentsTable: Symbol('documents'),
  getComplianceTemplateMock: vi.fn(),
  getFeaturesForCommunityMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  communities: communitiesTable,
  complianceChecklistItems: checklistTable,
  meetings: meetingsTable,
  documents: documentsTable,
  createScopedClient: createScopedClientMock,
}));

vi.mock('@propertypro/shared', () => ({
  getComplianceTemplate: getComplianceTemplateMock,
  getFeaturesForCommunity: getFeaturesForCommunityMock,
}));

import {
  ensureTransparencyChecklistInitialized,
  getTransparencyPageData,
} from '../../src/lib/services/transparency-service';

describe('transparency service', () => {
  let checklistRows: Array<Record<string, unknown>>;

  beforeEach(() => {
    vi.clearAllMocks();

    checklistRows = [
      {
        id: 1,
        templateKey: '718_bylaws',
        title: 'Bylaws',
        category: 'governing_documents',
        statuteReference: '§718.111(12)(g)(2)(b)',
        documentId: 10,
        documentPostedAt: new Date('2026-02-01T12:00:00.000Z'),
        isConditional: false,
      },
      {
        id: 2,
        templateKey: '718_insurance',
        title: 'Insurance',
        category: 'insurance',
        statuteReference: '§718.111(11)',
        documentId: null,
        documentPostedAt: null,
        isConditional: false,
      },
      {
        id: 3,
        templateKey: '718_sirs',
        title: 'SIRS',
        category: 'operations',
        statuteReference: '§718.112(2)(g)',
        documentId: null,
        documentPostedAt: null,
        isConditional: true,
      },
    ];

    queryMock.mockImplementation(async (table: unknown) => {
      if (table === communitiesTable) {
        return [{
          id: 1,
          slug: 'sunset-condos',
          name: 'Sunset Condos',
          city: 'Miami',
          state: 'FL',
          logoPath: null,
          timezone: 'America/New_York',
        }];
      }

      if (table === checklistTable) {
        return checklistRows;
      }

      if (table === meetingsTable) {
        return [{
          id: 44,
          title: 'Board Meeting',
          meetingType: 'board',
          startsAt: new Date('2026-02-20T18:00:00.000Z'),
          noticePostedAt: new Date('2026-02-18T14:00:00.000Z'),
        }];
      }

      if (table === documentsTable) {
        return [{
          id: 100,
          title: 'Meeting Minutes March 2026',
          description: 'Approved minutes',
          fileName: 'minutes-2026-03.pdf',
          createdAt: new Date('2026-03-21T10:00:00.000Z'),
          updatedAt: new Date('2026-03-21T10:00:00.000Z'),
        }];
      }

      return [];
    });

    insertMock.mockImplementation(async (_table: unknown, rows: Array<Record<string, unknown>>) => {
      checklistRows = rows.map((row, index) => ({
        id: index + 1,
        communityId: 1,
        ...row,
      }));
      return checklistRows;
    });

    createScopedClientMock.mockReturnValue({
      query: queryMock,
      insert: insertMock,
    });

    getComplianceTemplateMock.mockReturnValue([
      {
        templateKey: '718_bylaws',
        title: 'Bylaws',
        description: 'Bylaws',
        category: 'governing_documents',
        statuteReference: '§718.111(12)(g)(2)(b)',
      },
    ]);

    getFeaturesForCommunityMock.mockReturnValue({
      hasPublicNoticesPage: true,
    });
  });

  it('maps checklist, meeting, and portal data into transparency output shape', async () => {
    const result = await getTransparencyPageData({
      id: 1,
      slug: 'sunset-condos',
      name: 'Sunset Condos',
      communityType: 'condo_718',
      timezone: 'America/New_York',
      addressLine1: null,
      addressLine2: null,
      city: 'Miami',
      state: 'FL',
      zipCode: null,
    });

    const flattened = result.documents.flatMap((group) => group.items);
    expect(flattened.find((item) => item.templateKey === '718_bylaws')?.status).toBe('posted');
    expect(flattened.find((item) => item.templateKey === '718_insurance')?.status).toBe('not_posted');
    expect(flattened.find((item) => item.templateKey === '718_sirs')?.status).toBe('not_required');

    expect(result.meetingNotices.meetings[0]?.requiredLeadTimeHours).toBe(48);
    expect(result.meetingNotices.meetings[0]?.metRequirement).toBe(true);
    expect(result.portalStatus.publicNoticesPage).toBe(true);
    expect(result.minutesAvailability.months).toHaveLength(12);
  });

  it('initializes checklist rows when none exist yet', async () => {
    checklistRows = [];
    getComplianceTemplateMock.mockReturnValueOnce([
      {
        templateKey: '718_budget',
        title: 'Budget',
        description: 'Budget',
        category: 'financial_records',
        statuteReference: '§718.112(2)(f)',
        deadlineDays: 30,
        isConditional: false,
      },
    ]);

    const rows = await ensureTransparencyChecklistInitialized(1, 'condo_718');

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.['templateKey']).toBe('718_budget');
  });

  it('handles empty meetings/documents without throwing and returns defaults', async () => {
    checklistRows = [];
    getComplianceTemplateMock.mockReturnValueOnce([]);

    queryMock.mockImplementation(async (table: unknown) => {
      if (table === communitiesTable) {
        return [{
          id: 1,
          slug: 'sunset-condos',
          name: 'Sunset Condos',
          city: 'Miami',
          state: 'FL',
          logoPath: null,
          timezone: 'America/New_York',
        }];
      }

      if (table === checklistTable) {
        return checklistRows;
      }

      if (table === meetingsTable || table === documentsTable) {
        return [];
      }

      return [];
    });

    const result = await getTransparencyPageData({
      id: 1,
      slug: 'sunset-condos',
      name: 'Sunset Condos',
      communityType: 'condo_718',
      timezone: 'America/New_York',
      addressLine1: null,
      addressLine2: null,
      city: 'Miami',
      state: 'FL',
      zipCode: null,
    });

    expect(result.documents).toEqual([]);
    expect(result.meetingNotices.meetings).toEqual([]);
    expect(result.minutesAvailability.totalMonths).toBe(12);
    expect(result.minutesAvailability.monthsWithMinutes).toBe(0);
  });
});
