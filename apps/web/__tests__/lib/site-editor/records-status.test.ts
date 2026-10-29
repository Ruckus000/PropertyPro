/**
 * The website editor's Documents tool reads its statuses off the compliance
 * checklist. These pin the mapping from a checklist row to what the panel
 * says — above all that a deleted file is never offered as "Review and post".
 */
import { describe, expect, it } from 'vitest';
import type { ChecklistItemData } from '@/components/compliance/compliance-checklist-item';
import {
  autoLinkedRecordCount,
  conditionalRecordItems,
  missingRecordItems,
  recordsNeedingAttention,
  summarizeRecords,
} from '@/lib/site-editor/records-status';

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

const COVERED = { communityType: 'condo_718', unitCount: 60 };

describe('missingRecordItems', () => {
  it('below the threshold nothing is missing', () => {
    const items = [item({}), item({ documentId: 3, documentState: 'draft' })];
    expect(missingRecordItems(items, COVERED)).toHaveLength(2);
    expect(missingRecordItems(items, { communityType: 'condo_718', unitCount: 24 })).toEqual([]);
    expect(missingRecordItems(items, { communityType: 'apartment', unitCount: 500 })).toEqual([]);
  });

  it('a record linked to a draft is not_posted', () => {
    const [missing] = missingRecordItems(
      [item({ id: 77, templateKey: '718_budget', status: 'overdue', documentId: 42, documentState: 'draft' })],
      COVERED,
    );
    expect(missing).toEqual({
      itemId: 77,
      templateKey: '718_budget',
      title: 'Item',
      category: 'governing_documents',
      state: 'not_posted',
    });
  });

  it('a deleted file is nothing_posted, a posted file past its window is out_of_date, a current one is not listed', () => {
    const states = missingRecordItems(
      [
        item({ documentId: 9, documentState: 'deleted' }),
        item({
          status: 'overdue',
          documentId: 1,
          documentState: 'posted',
          documentPostedAt: '2020-01-01T00:00:00.000Z',
          rollingWindow: { months: 12 },
        }),
        posted(),
      ],
      COVERED,
    ).map((m) => m.state);
    expect(states).toEqual(['nothing_posted', 'out_of_date']);
  });

  it('items marked not applicable are excluded', () => {
    const items = [
      item({ status: 'not_applicable', isApplicable: false }),
      item({ isApplicable: false }),
    ];
    expect(missingRecordItems(items, COVERED)).toEqual([]);
    expect(conditionalRecordItems(items, COVERED)).toEqual([]);
  });

  it('conditional items are only in conditionalRecordItems', () => {
    const conditional = item({ id: 5, isConditional: true });
    expect(missingRecordItems([conditional], COVERED)).toEqual([]);
    expect(conditionalRecordItems([conditional], COVERED).map((m) => m.itemId)).toEqual([5]);
    // The other way round: an ordinary item is never offered as conditional.
    expect(conditionalRecordItems([item({ id: 6 })], COVERED)).toEqual([]);
    // Once a conditional item has a record it is no longer a question.
    expect(conditionalRecordItems([posted({ isConditional: true })], COVERED)).toEqual([]);
  });

  it('a conditional item whose record is a draft or out of date is missing, never "all set"', () => {
    const draft = item({ id: 7, isConditional: true, status: 'overdue', documentId: 3, documentState: 'draft' });
    const stale = item({
      id: 8,
      isConditional: true,
      status: 'overdue',
      documentId: 4,
      documentState: 'posted',
      documentPostedAt: '2020-01-01T00:00:00.000Z',
      rollingWindow: { months: 12 },
    });
    const current = posted({ id: 9, isConditional: true });

    expect(missingRecordItems([draft, stale, current], COVERED).map((m) => [m.itemId, m.state])).toEqual([
      [7, 'not_posted'],
      [8, 'out_of_date'],
    ]);
    // Neither is offered as "does this apply?" either: it has a record.
    expect(conditionalRecordItems([draft, stale], COVERED)).toEqual([]);
  });
});

describe('autoLinkedRecordCount', () => {
  it('ignores items relinked by hand', () => {
    expect(
      autoLinkedRecordCount([
        posted({ documentId: 10, autoLinkedDocumentId: 10 }),
        // Relinked to another file: the auto link is left behind.
        posted({ documentId: 11, autoLinkedDocumentId: 10 }),
        // Unlinked afterwards.
        item({ documentId: null, autoLinkedDocumentId: 10 }),
      ]),
    ).toBe(1);
  });

  it('counts only records still posted: a draft or deleted document is missing instead', () => {
    expect(
      autoLinkedRecordCount([
        posted({ documentId: 10, autoLinkedDocumentId: 10 }),
        item({ documentId: 12, autoLinkedDocumentId: 12, documentState: 'draft' }),
        item({ documentId: 13, autoLinkedDocumentId: 13, documentState: 'deleted' }),
      ]),
    ).toBe(1);
  });

  it('does not count two nulls as a match', () => {
    expect(
      autoLinkedRecordCount([
        item({ documentId: null, autoLinkedDocumentId: null }),
        item({ documentId: null }),
        item({ documentId: 4, autoLinkedDocumentId: null }),
      ]),
    ).toBe(0);
  });
});
