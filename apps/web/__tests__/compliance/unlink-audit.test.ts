/**
 * `unlinkChecklistItemsForDocument` audits each item it unlinks (D12).
 *
 * Deleting a document, or taking a posted one back to a draft, clears every
 * checklist link to it. An item that stops counting as posted must say so in
 * its own audit trail, as the manual Unlink action does.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createScopedClientMock, updateMock, logAuditEventMock, checklistTable } = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  updateMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  checklistTable: { id: 'cci.id', documentId: 'cci.documentId' },
}));

vi.mock('@propertypro/db', () => ({
  complianceChecklistItems: checklistTable,
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
}));

import { unlinkChecklistItemsForDocument } from '../../src/lib/services/compliance-service';

describe('unlinkChecklistItemsForDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createScopedClientMock.mockReturnValue({ update: updateMock });
    logAuditEventMock.mockResolvedValue(undefined);
  });

  it('unlinking a document audits unlink_document for each item', async () => {
    updateMock.mockResolvedValue([
      { id: 10, documentId: null },
      { id: 14, documentId: null },
    ]);

    await unlinkChecklistItemsForDocument(42, 100, 'user-1');

    expect(updateMock).toHaveBeenCalledWith(
      checklistTable,
      { documentId: null, documentPostedAt: null, lastModifiedBy: 'user-1' },
      { __eq: { col: checklistTable.documentId, val: 100 } },
    );
    expect(logAuditEventMock).toHaveBeenCalledTimes(2);
    for (const itemId of ['10', '14']) {
      expect(logAuditEventMock).toHaveBeenCalledWith({
        userId: 'user-1',
        action: 'unlink_document',
        resourceType: 'compliance_checklist_item',
        resourceId: itemId,
        communityId: 42,
        oldValues: { documentId: 100 },
        newValues: { documentId: null },
      });
    }
  });

  it('audits nothing when no item pointed at the document', async () => {
    updateMock.mockResolvedValue([]);

    await unlinkChecklistItemsForDocument(42, 100, 'user-1');

    expect(logAuditEventMock).not.toHaveBeenCalled();
  });
});
