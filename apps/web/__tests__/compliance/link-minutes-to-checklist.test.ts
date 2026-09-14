/**
 * `linkMinutesDocumentToChecklist` — the linking half of the compliance
 * checklist's automatic satisfaction.
 *
 * Satisfaction is `compliance_checklist_items.document_id IS NOT NULL`, derived
 * at read time and never stored. Deleting a document already un-satisfies an
 * item automatically (`unlinkChecklistItemsForDocument`, called from the
 * documents DELETE handler); only the linking half was missing, so publishing
 * minutes left the rolling-12-month item unsatisfied forever.
 *
 * These cover the selection logic that `drafts-publish-minutes.test.ts` mocks
 * out: which item is chosen, and the two ways there is legitimately none.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createScopedClientMock, queryMock, updateMock, checklistTable, eqMock } = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  queryMock: vi.fn(),
  updateMock: vi.fn().mockResolvedValue(undefined),
  checklistTable: { id: Symbol('compliance_checklist_items.id') },
  eqMock: vi.fn((col: unknown, val: unknown) => ({ __eq: { col, val } })),
}));

vi.mock('@propertypro/db', () => ({
  complianceChecklistItems: checklistTable,
  createScopedClient: createScopedClientMock,
}));

vi.mock('@propertypro/db/filters', () => ({ eq: eqMock }));

import { linkMinutesDocumentToChecklist } from '../../src/lib/services/compliance-service';

const POSTED_AT = new Date('2026-09-14T18:05:00.000Z');

describe('linkMinutesDocumentToChecklist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMock.mockResolvedValue(undefined);
    createScopedClientMock.mockReturnValue({ query: queryMock, update: updateMock });
  });

  it.each([
    ['condo', '718_minutes_rolling_12m'],
    ['HOA', '720_minutes_rolling_12m'],
  ])('links the %s rolling-12-month minutes item', async (_label, templateKey) => {
    queryMock.mockResolvedValue([
      { id: 1, templateKey: '718_bylaws', isApplicable: true },
      { id: 9, templateKey, isApplicable: true },
    ]);

    const linked = await linkMinutesDocumentToChecklist(42, 900, 'author-1', POSTED_AT);

    expect(linked).toBe(9);
    expect(updateMock).toHaveBeenCalledWith(
      checklistTable,
      { documentId: 900, documentPostedAt: POSTED_AT, lastModifiedBy: 'author-1' },
      expect.anything(),
    );
    expect(eqMock).toHaveBeenCalledWith(checklistTable.id, 9);
  });

  it('writes nothing when the community has no minutes item', async () => {
    // Every apartment: the compliance checklist is condo/HOA-only.
    queryMock.mockResolvedValue([{ id: 1, templateKey: '718_bylaws', isApplicable: true }]);

    const linked = await linkMinutesDocumentToChecklist(42, 900, 'author-1', POSTED_AT);

    expect(linked).toBeNull();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('leaves an item a board marked not-applicable alone', async () => {
    queryMock.mockResolvedValue([
      { id: 9, templateKey: '718_minutes_rolling_12m', isApplicable: false },
    ]);

    const linked = await linkMinutesDocumentToChecklist(42, 900, 'author-1', POSTED_AT);

    expect(linked).toBeNull();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('replaces an existing link, because the rolling window wants the newest minutes', async () => {
    queryMock.mockResolvedValue([
      { id: 9, templateKey: '718_minutes_rolling_12m', isApplicable: true, documentId: 500 },
    ]);

    const linked = await linkMinutesDocumentToChecklist(42, 901, 'author-1', POSTED_AT);

    expect(linked).toBe(9);
    expect(updateMock).toHaveBeenCalledWith(
      checklistTable,
      expect.objectContaining({ documentId: 901 }),
      expect.anything(),
    );
  });
});
