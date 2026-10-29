/**
 * `findChecklistLinkConflict` — the one read the compliance PATCH makes before
 * a manual `link_document`, so one file fills one record and a record's file
 * is replaced only on purpose. The route's 409s are in compliance-route.test.ts;
 * the real SQL is in compliance-lifecycle.integration.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { selectFromMock, checklistTable } = vi.hoisted(() => ({
  selectFromMock: vi.fn(),
  checklistTable: {
    id: Symbol('compliance_checklist_items.id'),
    documentId: Symbol('compliance_checklist_items.document_id'),
  },
}));

vi.mock('@propertypro/db', () => ({
  complianceChecklistItems: checklistTable,
  createScopedClient: () => ({ selectFrom: selectFromMock }),
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  or: (...clauses: unknown[]) => ({ __or: clauses }),
}));

import { findChecklistLinkConflict } from '../../src/lib/services/compliance-service';

/** The rows the read returns: the target item and any item holding the document. */
function rows(...list: Array<{ id: number; documentId: number | null }>) {
  selectFromMock.mockResolvedValueOnce(list);
}

describe('findChecklistLinkConflict', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the target item and any item holding the document, in one read', async () => {
    rows({ id: 5, documentId: null });

    await expect(findChecklistLinkConflict(42, 5, 77)).resolves.toBeNull();

    expect(selectFromMock).toHaveBeenCalledTimes(1);
    expect(selectFromMock.mock.calls[0]![2]).toEqual({
      __or: [
        { __eq: { col: checklistTable.id, val: 5 } },
        { __eq: { col: checklistTable.documentId, val: 77 } },
      ],
    });
  });

  it('a file already filling another record is a conflict, even with replace', async () => {
    rows({ id: 5, documentId: null }, { id: 9, documentId: 77 });
    await expect(findChecklistLinkConflict(42, 5, 77)).resolves.toBe('document_fills_another_record');

    rows({ id: 5, documentId: 12 }, { id: 9, documentId: 77 });
    await expect(findChecklistLinkConflict(42, 5, 77, { replace: true })).resolves.toBe(
      'document_fills_another_record',
    );
  });

  it('a record with a different file is a conflict unless replace', async () => {
    rows({ id: 5, documentId: 12 });
    await expect(findChecklistLinkConflict(42, 5, 77)).resolves.toBe('record_has_another_document');

    rows({ id: 5, documentId: 12 });
    await expect(findChecklistLinkConflict(42, 5, 77, { replace: true })).resolves.toBeNull();
  });

  it('linking the same file to the same record again is not a conflict', async () => {
    rows({ id: 5, documentId: 77 });
    await expect(findChecklistLinkConflict(42, 5, 77)).resolves.toBeNull();
  });
});
