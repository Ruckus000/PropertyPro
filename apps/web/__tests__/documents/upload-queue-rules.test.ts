import { describe, expect, it } from 'vitest';
import { indexLibraryByFileName } from '../../src/lib/documents/duplicate-uploads';
import {
  isReplacing,
  makeRows,
  queueBlocker,
  queueSummary,
  rowNeedsAttestation,
  sendableRows,
  type QueueRow,
} from '../../src/lib/documents/upload-queue';
import {
  MAX_DOCUMENT_BYTES,
  MAX_IMAGE_BYTES,
  classifyUpload,
  titleFromFileName,
} from '../../src/lib/documents/upload-rules';

const MB = 1024 * 1024;

describe('classifyUpload', () => {
  it.each([
    ['budget.pdf', 2 * MB],
    ['rules.DOCX', 1 * MB],
  ])('accepts %s', (name, size) => {
    expect(classifyUpload({ name, size })).toEqual({ kind: 'ok' });
  });

  it('accepts a photo with advice to upload a PDF instead', () => {
    const verdict = classifyUpload({ name: 'scan_0034.jpg', size: 2 * MB });
    expect(verdict.kind).toBe('warning');
    expect(verdict.kind === 'warning' && verdict.note).toMatch(/Upload a PDF if you have one/);
  });

  it.each([
    ['Owner contact list.xlsx', /Spreadsheets can’t be posted/],
    ['ledger.csv', /Spreadsheets can’t be posted/],
    ['old memo.doc', /Older Word files/],
    ['minutes.pages', /can’t be posted/],
    ['no-extension', /can’t be posted/],
  ])('refuses %s, saying why', (name, message) => {
    const verdict = classifyUpload({ name, size: MB });
    expect(verdict.kind).toBe('error');
    expect(verdict.kind === 'error' && verdict.note).toMatch(message);
  });

  it('holds documents to 50 MB and images to 10 MB — the server’s limits', () => {
    expect(classifyUpload({ name: 'study.pdf', size: MAX_DOCUMENT_BYTES }).kind).toBe('ok');
    expect(classifyUpload({ name: 'study.pdf', size: MAX_DOCUMENT_BYTES + 1 })).toMatchObject({
      kind: 'error',
      note: expect.stringMatching(/under 50 MB/),
    });
    expect(classifyUpload({ name: 'photo.png', size: MAX_IMAGE_BYTES + 1 })).toMatchObject({
      kind: 'error',
      note: expect.stringMatching(/under 10 MB/),
    });
  });

  it('refuses an empty file', () => {
    expect(classifyUpload({ name: 'empty.pdf', size: 0 }).kind).toBe('error');
  });

  it('titles a file after its name', () => {
    expect(titleFromFileName('2026 Annual Budget.pdf')).toBe('2026 Annual Budget');
    expect(titleFromFileName('noext')).toBe('noext');
  });
});

function file(name: string, size = MB): File {
  const f = new File(['x'], name, { type: 'application/pdf' });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

const LIBRARY = indexLibraryByFileName([
  { id: 71, title: 'Budget', fileName: 'budget.pdf', categoryId: 2, sourceType: 'library', postedAt: '2026-01-01T00:00:00Z' },
  { id: 72, title: 'Draft memo', fileName: 'memo.pdf', categoryId: 2, sourceType: 'library', postedAt: null },
]);

/** Category 1 is not redaction-sensitive; category 2 is. */
const nameOf = (id: number | null) => (id === 1 ? 'Rules' : id === 2 ? 'Lease Agreements' : null);

function row(name: string, over: Partial<QueueRow> = {}): QueueRow {
  return { ...makeRows([file(name)], LIBRARY, 1)[0]!, ...over };
}

describe('the queue rules', () => {
  it('makes one row per file, judged, titled, defaulted to the opened category, duplicates found', () => {
    const rows = makeRows([file('Rules 2026.pdf'), file('budget.pdf'), file('list.xlsx')], LIBRARY, 1);

    expect(rows.map((r) => r.title)).toEqual(['Rules 2026', 'budget', 'list']);
    expect(rows.map((r) => r.categoryId)).toEqual([1, 1, 1]);
    expect(rows[1]?.duplicate?.id).toBe(71);
    expect(isReplacing(rows[1]!)).toBe(true); // replace is the default choice
    expect(rows[2]?.verdict.kind).toBe('error');
    expect(new Set(rows.map((r) => r.key)).size).toBe(3);
  });

  it('never sends a refused file or one already done', () => {
    const rows = [row('a.pdf'), row('b.xlsx'), row('c.pdf', { status: 'done' })];
    expect(sendableRows(rows).map((r) => r.file.name)).toEqual(['a.pdf']);
  });

  describe('which rows ask the redaction question', () => {
    it('a new document asks when POSTED in a sensitive category, never as a draft', () => {
      const sensitive = row('new.pdf', { categoryId: 2 });
      expect(rowNeedsAttestation(sensitive, 'post', nameOf)).toBe(true);
      expect(rowNeedsAttestation(sensitive, 'draft', nameOf)).toBe(false);
      expect(rowNeedsAttestation(row('new.pdf', { categoryId: 1 }), 'post', nameOf)).toBe(false);
    });

    it('a new document with no category fails closed', () => {
      expect(rowNeedsAttestation(row('new.pdf', { categoryId: null }), 'post', nameOf)).toBe(true);
    });

    it('replacing a POSTED document asks by ITS category, whatever the action', () => {
      // The row's own category (1, not sensitive) is ignored: the replacement keeps the document's.
      const replace = row('budget.pdf');
      expect(rowNeedsAttestation(replace, 'post', nameOf)).toBe(true);
      expect(rowNeedsAttestation(replace, 'draft', nameOf)).toBe(true);
    });

    it('replacing a DRAFT asks nothing — owners cannot see it yet', () => {
      expect(rowNeedsAttestation(row('memo.pdf'), 'post', nameOf)).toBe(false);
    });

    it('choosing "keep both" makes it a new document again', () => {
      const keepBoth = row('budget.pdf', { duplicateChoice: 'both', categoryId: 1 });
      expect(isReplacing(keepBoth)).toBe(false);
      expect(rowNeedsAttestation(keepBoth, 'post', nameOf)).toBe(false);
    });
  });

  describe('queueBlocker', () => {
    it('nothing sendable', () => {
      expect(queueBlocker({ rows: [row('x.xlsx')], attestationRequired: false, attested: false })).toBe(
        'None of these files can be posted. Remove them and choose others.',
      );
    });

    it('counts the rows missing a category — a replacement needs none', () => {
      const rows = [row('a.pdf', { categoryId: null }), row('b.pdf', { categoryId: null }), row('budget.pdf', { categoryId: null })];
      expect(queueBlocker({ rows, attestationRequired: false, attested: false })).toBe(
        'Choose a category for 2 files.',
      );
    });

    it('a blank title', () => {
      expect(queueBlocker({ rows: [row('a.pdf', { title: '  ' })], attestationRequired: false, attested: false })).toBe(
        'Give every document a title.',
      );
    });

    it('the attestation, only when required', () => {
      const rows = [row('a.pdf')];
      expect(queueBlocker({ rows, attestationRequired: true, attested: false })).toBe(
        'Tick the personal information check first.',
      );
      expect(queueBlocker({ rows, attestationRequired: true, attested: true })).toBeNull();
      expect(queueBlocker({ rows, attestationRequired: false, attested: false })).toBeNull();
    });
  });

  it('summarises the queue', () => {
    expect(queueSummary([row('a.pdf'), row('b.pdf'), row('c.xlsx')])).toBe('3 files · 2 ready, 1 can’t be posted');
    expect(queueSummary([row('a.pdf')])).toBe('1 file · 1 ready');
  });
});
