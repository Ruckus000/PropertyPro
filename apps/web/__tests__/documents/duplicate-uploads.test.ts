import { describe, expect, it } from 'vitest';
import {
  findDuplicate,
  indexLibraryByFileName,
  type LibraryDocumentRef,
} from '../../src/lib/documents/duplicate-uploads';

function doc(id: number, fileName: string, extra: Partial<LibraryDocumentRef> = {}): LibraryDocumentRef {
  return { id, title: `Doc ${id}`, fileName, categoryId: 1, sourceType: 'library', ...extra };
}

describe('duplicate uploads', () => {
  it('matches the same name regardless of case and surrounding space', () => {
    const index = indexLibraryByFileName([doc(1, '2026 Annual Budget.pdf')]);

    expect(findDuplicate('  2026 annual BUDGET.pdf ', index)?.id).toBe(1);
  });

  it('matches across Unicode composition (é typed two ways)', () => {
    // Precomposed U+00E9 vs e + combining acute U+0301: the same name to a person.
    const index = indexLibraryByFileName([doc(1, 'Résumé.pdf')]);

    expect(findDuplicate('Résumé.pdf', index)?.id).toBe(1);
  });

  it('does not match a different name', () => {
    const index = indexLibraryByFileName([doc(1, 'budget.pdf')]);

    expect(findDuplicate('budget-2027.pdf', index)).toBeNull();
    expect(findDuplicate('budget.docx', index)).toBeNull();
  });

  it('returns the newest when several documents share the name', () => {
    const index = indexLibraryByFileName([doc(4, 'minutes.pdf'), doc(9, 'minutes.pdf'), doc(6, 'minutes.pdf')]);

    expect(findDuplicate('minutes.pdf', index)?.id).toBe(9);
  });

  it('ignores authored documents, whose file cannot be replaced by an upload', () => {
    const index = indexLibraryByFileName([doc(1, 'Minutes.pdf', { sourceType: 'authored' })]);

    expect(findDuplicate('Minutes.pdf', index)).toBeNull();
  });

  it('treats a row with no source type as an upload (the list predates the field)', () => {
    const index = indexLibraryByFileName([doc(1, 'rules.pdf', { sourceType: undefined })]);

    expect(findDuplicate('rules.pdf', index)?.id).toBe(1);
  });

  it('finds nothing in an empty library', () => {
    expect(findDuplicate('anything.pdf', indexLibraryByFileName([]))).toBeNull();
  });
});
