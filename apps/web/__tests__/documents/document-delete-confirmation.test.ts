/**
 * Deleting the posted file behind a statutory requirement says what happens
 * to the requirement — the library's last-document guard (website builder v4,
 * Phase 6). Neutral copy: no penalty claims (florida-compliance.md).
 */
import { describe, expect, it } from 'vitest';
import { deleteConfirmation } from '../../src/components/documents/document-inspector';
import type { ChecklistRow, DocumentRow } from '../../src/lib/documents/document-state';

const POSTED: DocumentRow = {
  id: 71,
  title: '2026 Annual Budget',
  description: null,
  fileName: 'budget.pdf',
  fileSize: 1000,
  mimeType: 'application/pdf',
  categoryId: 1,
  createdAt: '2026-09-01T00:00:00.000Z',
  uploadedBy: null,
  publicAccess: false,
  sourceType: 'library',
  postedAt: '2026-09-02T00:00:00.000Z',
};
const REQUIREMENT = { id: 1, title: 'Annual Budget', category: 'financial_records', status: 'satisfied' } as ChecklistRow;

describe('deleteConfirmation', () => {
  it('asks plainly for a document that is no requirement’s record', () => {
    expect(deleteConfirmation(POSTED, null)).toBe('Are you sure you want to delete “2026 Annual Budget”?');
  });

  it('warns that the requirement will read as missing, and how to undo it', () => {
    const text = deleteConfirmation(POSTED, REQUIREMENT);
    expect(text).toContain('record for “Annual Budget”. That requirement will show as missing');
    expect(text).toContain('until you restore it or link another document');
    expect(text).not.toMatch(/\$\d|fine|penalt/i);
  });

  it('does not warn for a draft, which never satisfied the requirement', () => {
    expect(deleteConfirmation({ ...POSTED, postedAt: null }, REQUIREMENT)).not.toContain('missing');
  });

  it('does not warn when the requirement does not apply', () => {
    expect(deleteConfirmation(POSTED, { ...REQUIREMENT, isApplicable: false })).not.toContain('missing');
  });
});
