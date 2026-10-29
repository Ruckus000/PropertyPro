/**
 * `insertBulkDocumentsForCommunity` links the records a batch unambiguously
 * fills (D12), once per community, after every row is in. Linking is
 * bookkeeping: a failure is reported and the batch still counts as created.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { insertMock, autoLinkCommunityRecordsMock, captureExceptionMock, documentsTable } = vi.hoisted(
  () => ({
    insertMock: vi.fn(),
    autoLinkCommunityRecordsMock: vi.fn(),
    captureExceptionMock: vi.fn(),
    documentsTable: { __table: 'documents' },
  }),
);

vi.mock('@propertypro/db', () => ({
  createScopedClient: () => ({ insert: insertMock }),
  documents: documentsTable,
}));

vi.mock('@/lib/services/record-auto-link-service', () => ({
  autoLinkCommunityRecords: autoLinkCommunityRecordsMock,
}));

vi.mock('@sentry/nextjs', () => ({ captureException: captureExceptionMock }));

import { insertBulkDocumentsForCommunity } from '../../src/lib/pm/bulk-document-upload';

const DOCS = [
  { fileName: '2026 Budget.pdf', storagePath: 'communities/10/documents/a.pdf', categoryId: 1 },
  { fileName: 'Bylaws.pdf', storagePath: 'communities/10/documents/b.pdf', categoryId: 2 },
];

describe('insertBulkDocumentsForCommunity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertMock.mockResolvedValue([{ id: 1 }]);
    autoLinkCommunityRecordsMock.mockResolvedValue({ linked: 1, ambiguous: 0 });
  });

  it('links records once, after every row is inserted', async () => {
    const result = await insertBulkDocumentsForCommunity({ communityId: 10, uploadedBy: 'pm-1', docs: DOCS });

    expect(result).toEqual({ created: 2 });
    expect(autoLinkCommunityRecordsMock).toHaveBeenCalledTimes(1);
    expect(autoLinkCommunityRecordsMock).toHaveBeenCalledWith(10, 'pm-1');
    expect(insertMock.mock.invocationCallOrder.at(-1)).toBeLessThan(
      autoLinkCommunityRecordsMock.mock.invocationCallOrder[0]!,
    );
  });

  it('a linking failure does not fail the batch', async () => {
    const failure = new Error('checklist unavailable');
    autoLinkCommunityRecordsMock.mockRejectedValueOnce(failure);

    const result = await insertBulkDocumentsForCommunity({ communityId: 10, uploadedBy: 'pm-1', docs: DOCS });

    expect(result).toEqual({ created: 2 });
    expect(captureExceptionMock).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({ tags: { record_auto_link: 'bulk_upload' } }),
    );
  });
});
