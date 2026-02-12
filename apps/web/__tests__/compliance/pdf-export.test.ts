import { describe, it, expect } from 'vitest';
import { generateChecklistPdf } from '../../src/lib/utils/pdf-export';

describe('p1-10 checklist PDF export', () => {
  it('contains expected checklist item text', () => {
    const bytes = generateChecklistPdf([
      { title: 'Articles of Incorporation', category: 'governing_documents', status: 'satisfied', deadline: '2026-03-01' },
      { title: 'Meeting Minutes', category: 'meeting_records', status: 'overdue', deadline: '2026-02-15' },
    ]);
    const text = new TextDecoder().decode(bytes);
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('Articles of Incorporation');
    expect(text).toContain('Meeting Minutes');
    expect(text).toContain('status=overdue');
  });
});

