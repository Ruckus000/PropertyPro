import { describe, it, expect } from 'vitest';
import type { ChecklistItemData } from '../../src/components/compliance/compliance-checklist-item';
import { filterChecklistItems } from '../../src/components/compliance/compliance-dashboard';

const sample: ChecklistItemData[] = [
  { id: 1, templateKey: 'a', title: 'Articles of Incorporation', category: 'governing_documents', status: 'satisfied' },
  { id: 2, templateKey: 'b', title: 'Bylaws', category: 'governing_documents', status: 'unsatisfied' },
  { id: 3, templateKey: 'c', title: 'Meeting Minutes', category: 'meeting_records', status: 'overdue', deadline: '2026-03-01T00:00:00.000Z' },
  { id: 4, templateKey: 'd', title: 'Insurance Policy', category: 'financial_records', status: 'not_applicable' },
];

describe('p1-10 compliance filters', () => {
  it('filters by status only', () => {
    const filtered = filterChecklistItems(sample, { status: 'unsatisfied', category: 'all' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.title).toBe('Bylaws');
  });

  it('filters by category only', () => {
    const filtered = filterChecklistItems(sample, { status: 'all', category: 'governing_documents' });
    expect(filtered).toHaveLength(2);
    expect(filtered.map((i) => i.title)).toEqual(['Articles of Incorporation', 'Bylaws']);
  });

  it('filters by both status and category', () => {
    const filtered = filterChecklistItems(sample, { status: 'satisfied', category: 'governing_documents' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.title).toBe('Articles of Incorporation');
  });
});

