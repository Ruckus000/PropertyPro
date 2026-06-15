import { describe, it, expect } from 'vitest';
import { resolveComplianceCta } from '@/lib/utils/compliance-cta';
import type { ChecklistItemData } from '@/components/compliance/compliance-checklist-item';

function makeItem(overrides: Partial<ChecklistItemData> = {}): ChecklistItemData {
  return {
    id: 1, templateKey: '718_declaration', title: 'T',
    category: 'governing_documents', status: 'unsatisfied',
    documentId: null, documentPostedAt: null, deadline: null,
    rollingWindow: null, isApplicable: true,
    ...overrides,
  };
}

describe('resolveComplianceCta', () => {
  it('returns null for read-only user with no document', () => {
    expect(resolveComplianceCta(makeItem(), false)).toBeNull();
  });

  it('returns View document for read-only user with a document', () => {
    expect(resolveComplianceCta(makeItem({ documentId: 9 }), false)).toEqual({
      label: 'View document', handler: 'view',
    });
  });

  it('returns Mark applicable for not_applicable items when canWrite', () => {
    expect(resolveComplianceCta(makeItem({ status: 'not_applicable' }), true)).toEqual({
      label: 'Mark applicable', handler: 'mark_applicable',
    });
  });

  it('returns View document for satisfied items', () => {
    expect(resolveComplianceCta(makeItem({ status: 'satisfied', documentId: 9 }), true)).toEqual({
      label: 'View document', handler: 'view',
    });
  });

  it('returns Upload current document for rolling-window items with a linked document', () => {
    expect(
      resolveComplianceCta(makeItem({ status: 'unsatisfied', documentId: 9, rollingWindow: { months: 12 } }), true),
    ).toEqual({ label: 'Upload current document', handler: 'upload' });
  });

  it('returns Re-link or replace for non-rolling items with a linked document', () => {
    expect(resolveComplianceCta(makeItem({ status: 'unsatisfied', documentId: 9 }), true)).toEqual({
      label: 'Re-link or replace', handler: 'link',
    });
  });

  it('returns Link existing document for board designations with no document', () => {
    expect(resolveComplianceCta(makeItem(), true, 'board_president')).toEqual({
      label: 'Link existing document', handler: 'link',
    });
  });

  it('returns Upload document for non-board designation (null) with no document', () => {
    expect(resolveComplianceCta(makeItem(), true, null)).toEqual({
      label: 'Upload document', handler: 'upload',
    });
  });
});
