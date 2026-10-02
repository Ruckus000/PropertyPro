/**
 * The website editor's Documents tool reads its statuses off the compliance
 * checklist. These pin the mapping from a checklist row to what the panel
 * says — above all that a deleted file is never offered as "Review and post".
 */
import { describe, expect, it } from 'vitest';
import type { ChecklistItemData } from '@/components/compliance/compliance-checklist-item';
import { recordsNeedingAttention, summarizeRecords } from '@/lib/site-editor/records-status';

let nextId = 1;
function item(overrides: Partial<ChecklistItemData>): ChecklistItemData {
  return {
    id: nextId++,
    templateKey: 'k',
    title: 'Item',
    category: 'governing_documents',
    status: 'unsatisfied',
    documentId: null,
    documentState: null,
    ...overrides,
  };
}

const posted = (o: Partial<ChecklistItemData> = {}) =>
  item({ status: 'satisfied', documentId: 1, documentState: 'posted', ...o });

describe('summarizeRecords', () => {
  it('is up to date when every applicable item is satisfied', () => {
    const [group] = summarizeRecords([posted(), posted()]);
    expect(group).toMatchObject({ status: 'up_to_date', satisfied: 2, total: 2, draftDocumentId: null });
  });

  it('points a group with a saved draft at that draft', () => {
    const [group] = summarizeRecords([posted(), item({ documentId: 42, documentState: 'draft' })]);
    expect(group).toMatchObject({ status: 'not_posted', satisfied: 1, total: 2, draftDocumentId: 42 });
  });

  it('reads a draft as "not posted" even once its deadline has passed', () => {
    const [group] = summarizeRecords([item({ status: 'overdue', documentId: 42, documentState: 'draft' })]);
    expect(group).toMatchObject({ status: 'not_posted', draftDocumentId: 42 });
  });

  it('reads a deleted file as nothing posted, never as a draft to open', () => {
    const [group] = summarizeRecords([item({ documentId: 9, documentState: 'deleted' })]);
    expect(group).toMatchObject({ status: 'nothing_posted', draftDocumentId: null });
  });

  it('reads a posted file past its rolling window as out of date', () => {
    const [group] = summarizeRecords([
      item({
        status: 'overdue',
        documentId: 1,
        documentState: 'posted',
        documentPostedAt: '2020-01-01T00:00:00.000Z',
        rollingWindow: { months: 12 },
      }),
    ]);
    expect(group).toMatchObject({ status: 'out_of_date', satisfied: 0 });
  });

  it('counts a file posted after its deadline as on the website — nothing to do now', () => {
    const [group] = summarizeRecords([
      item({
        status: 'overdue',
        documentId: 1,
        documentState: 'posted',
        documentPostedAt: new Date().toISOString(),
        deadline: '2020-01-01T00:00:00.000Z',
      }),
    ]);
    expect(group).toMatchObject({ status: 'up_to_date', satisfied: 1 });
  });

  it('shows the worst status in a group', () => {
    const [group] = summarizeRecords([
      posted(),
      item({ documentId: 42, documentState: 'draft' }),
      item({}),
    ]);
    expect(group?.status).toBe('nothing_posted');
  });

  it('leaves out not-applicable items, and conditional ones with no record', () => {
    const groups = summarizeRecords([
      posted(),
      item({ isApplicable: false, status: 'not_applicable' }),
      item({ isConditional: true }),
      item({ isConditional: true, documentId: 3, documentState: 'deleted' }),
    ]);
    expect(groups[0]).toMatchObject({ status: 'up_to_date', total: 1 });
  });

  it('counts a conditional item once a draft is saved for it', () => {
    const [group] = summarizeRecords([item({ isConditional: true, documentId: 5, documentState: 'draft' })]);
    expect(group).toMatchObject({ status: 'not_posted', total: 1 });
  });

  it('groups in the Compliance page order and drops empty groups', () => {
    const groups = summarizeRecords([
      posted({ category: 'insurance' }),
      posted({ category: 'governing_documents' }),
    ]);
    expect(groups.map((g) => g.label)).toEqual(['Governing documents', 'Insurance']);
  });
});

describe('recordsNeedingAttention', () => {
  it('counts the groups that are not up to date', () => {
    const groups = summarizeRecords([
      posted({ category: 'governing_documents' }),
      item({ category: 'financial_records' }),
      item({ category: 'insurance', documentId: 2, documentState: 'draft' }),
    ]);
    expect(recordsNeedingAttention(groups)).toBe(2);
  });
});
