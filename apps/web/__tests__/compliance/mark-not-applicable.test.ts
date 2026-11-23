/**
 * `markChecklistItemNotApplicable` — "doesn't apply" may switch off only a
 * conditional record with no file posted. The restriction is the WHERE of one
 * UPDATE, so these tests pin that predicate; the route's 400/409 mapping is in
 * compliance-route.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { updateMock, selectFromMock, checklistTable } = vi.hoisted(() => ({
  updateMock: vi.fn(),
  selectFromMock: vi.fn(),
  checklistTable: {
    id: Symbol('compliance_checklist_items.id'),
    documentId: Symbol('compliance_checklist_items.document_id'),
    isConditional: Symbol('compliance_checklist_items.is_conditional'),
  },
}));

vi.mock('@propertypro/db', () => ({
  complianceChecklistItems: checklistTable,
  createScopedClient: () => ({ update: updateMock, selectFrom: selectFromMock }),
  logAuditEvent: vi.fn(),
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...clauses: unknown[]) => ({ __and: clauses }),
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  isNull: (col: unknown) => ({ __isNull: col }),
  or: (...clauses: unknown[]) => ({ __or: clauses }),
}));

import { markChecklistItemNotApplicable } from '../../src/lib/services/compliance-service';

describe('markChecklistItemNotApplicable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes only where the row is conditional and has no file', async () => {
    updateMock.mockResolvedValueOnce([{ id: 7, isApplicable: false }]);

    await expect(markChecklistItemNotApplicable(42, 7, 'No elevator.', 'user-1')).resolves.toEqual({
      row: { id: 7, isApplicable: false },
    });

    expect(updateMock).toHaveBeenCalledWith(
      checklistTable,
      { isApplicable: false, notApplicableReason: 'No elevator.', lastModifiedBy: 'user-1' },
      {
        __and: [
          { __eq: { col: checklistTable.id, val: 7 } },
          { __eq: { col: checklistTable.isConditional, val: true } },
          { __isNull: checklistTable.documentId },
        ],
      },
    );
    expect(selectFromMock).not.toHaveBeenCalled();
  });

  it('refuses a required record', async () => {
    updateMock.mockResolvedValueOnce([]);
    selectFromMock.mockResolvedValueOnce([{ isConditional: false }]);

    await expect(markChecklistItemNotApplicable(42, 7, 'No budget.', 'user-1')).resolves.toEqual({
      refused: 'not_conditional',
    });
  });

  it('refuses a conditional record that has a file posted', async () => {
    updateMock.mockResolvedValueOnce([]);
    selectFromMock.mockResolvedValueOnce([{ isConditional: true }]);

    await expect(markChecklistItemNotApplicable(42, 7, 'No elevator.', 'user-1')).resolves.toEqual({
      refused: 'has_document',
    });
  });

  it('says "not found" for a row outside the community', async () => {
    updateMock.mockResolvedValueOnce([]);
    selectFromMock.mockResolvedValueOnce([]);

    await expect(markChecklistItemNotApplicable(42, 999, 'No elevator.', 'user-1')).resolves.toEqual({
      refused: 'not_found',
    });
  });
});
