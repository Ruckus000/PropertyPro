/**
 * The derived reading of a document library.
 *
 * A document is evidence for a statutory requirement, so the library is not a
 * list of files — it is the set of records, some of which have a file and some
 * of which do not. Everything the screen says about a row is derived here, with
 * no DOM and no network, so the rules can be tested directly.
 */
import { describe, expect, it } from 'vitest';
import {
  coverageFacts,
  documentState,
  filterRows,
  linkedRequirementsByDocumentId,
  mergeDocumentsAndGaps,
  owedToPublic,
  unlinkedDocuments,
  type ChecklistRow,
  type DocumentRow,
} from '@/lib/documents/document-state';

function doc(over: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: 1,
    title: 'Declaration of Condominium',
    description: null,
    fileName: 'declaration.pdf',
    fileSize: 1024,
    mimeType: 'application/pdf',
    categoryId: 10,
    createdAt: '2026-01-05T00:00:00.000Z',
    uploadedBy: null,
    publicAccess: false,
    ...over,
  };
}

function item(over: Partial<ChecklistRow> = {}): ChecklistRow {
  return {
    id: 100,
    title: 'Declaration of condominium',
    category: 'governing_documents',
    statuteReference: '§718.111(12)(a)1',
    documentId: null,
    deadline: null,
    isApplicable: true,
    status: 'missing',
    ...over,
  };
}

describe('documentState', () => {
  it('calls a document no requirement points at "unlinked"', () => {
    expect(documentState(doc(), null)).toBe('unlinked');
  });

  it('calls a public document "public"', () => {
    expect(documentState(doc({ publicAccess: true }), item({ documentId: 1 }))).toBe('public');
  });

  it('calls a linked, non-public document "owed"', () => {
    // §718.111(12)(g) is the posting duty and the checklist IS the record set,
    // so a record with a file that is not on the site is owed to it.
    expect(documentState(doc({ publicAccess: false }), item({ documentId: 1 }))).toBe('owed');
  });

  it('does not owe the public site a requirement marked not applicable', () => {
    expect(
      documentState(doc({ publicAccess: false }), item({ documentId: 1, isApplicable: false })),
    ).toBe('private');
  });

  it('treats a missing publicAccess field as not public', () => {
    // The column is on the wire, but the row type has carried it only since
    // this module — an older cached payload must not read as published.
    const { publicAccess: _omitted, ...withoutFlag } = doc();
    expect(documentState(withoutFlag as DocumentRow, item({ documentId: 1 }))).toBe('owed');
  });
});

describe('mergeDocumentsAndGaps', () => {
  it('puts requirements with no file in the same list as the files', () => {
    const rows = mergeDocumentsAndGaps(
      [doc({ id: 1 })],
      [item({ id: 100, documentId: 1 }), item({ id: 101, title: 'Bylaws', documentId: null })],
    );

    expect(rows).toHaveLength(2);
    const gaps = rows.filter((r) => r.kind === 'gap');
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.requirement.title).toBe('Bylaws');
  });

  it('gives a document its linked requirement', () => {
    const rows = mergeDocumentsAndGaps([doc({ id: 7 })], [item({ id: 100, documentId: 7 })]);
    const row = rows.find((r) => r.kind === 'document');

    expect(row?.kind).toBe('document');
    if (row?.kind !== 'document') throw new Error('expected a document row');
    expect(row.requirement?.statuteReference).toBe('§718.111(12)(a)1');
    expect(row.state).toBe('owed');
  });

  it('leaves out a requirement that is not applicable', () => {
    // An inapplicable item is not a gap — reporting it as one would invent an
    // obligation the community does not have.
    const rows = mergeDocumentsAndGaps([], [item({ documentId: null, isApplicable: false })]);
    expect(rows).toHaveLength(0);
  });

  it('does not invent a gap for a requirement whose file the filter excluded', () => {
    // Filtering by category narrows the documents but not the checklist. An
    // item that HAS a documentId is satisfied even when that file is not in
    // this page of rows — calling it a gap would report a false coverage hole.
    const rows = mergeDocumentsAndGaps([], [item({ documentId: 999 })]);
    expect(rows).toHaveLength(0);
  });

  it('reads every document as unlinked when there is no checklist at all', () => {
    // Apartment communities have zero checklist items. The screen gates the
    // statutory column away for them; the rule still must not throw.
    const rows = mergeDocumentsAndGaps([doc({ id: 1 }), doc({ id: 2 })], []);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.kind === 'document' && r.state === 'unlinked')).toBe(true);
  });
});

describe('coverageFacts', () => {
  it('counts records, coverage and what is actually on the public site', () => {
    const facts = coverageFacts(
      [doc({ id: 1, publicAccess: true }), doc({ id: 2, publicAccess: false })],
      [item({ id: 100, documentId: 1 }), item({ id: 101, documentId: null })],
    );

    expect(facts).toEqual({ total: 2, covered: 1, publicCount: 1 });
  });

  it('excludes inapplicable requirements from the record count', () => {
    const facts = coverageFacts([], [item({ documentId: null, isApplicable: false })]);
    expect(facts.total).toBe(0);
  });
});

describe('the quick-filter predicates', () => {
  it('finds documents no requirement points at', () => {
    const orphans = unlinkedDocuments(
      [doc({ id: 1 }), doc({ id: 2 })],
      [item({ documentId: 1 })],
    );
    expect(orphans.map((d) => d.id)).toEqual([2]);
  });

  it('finds linked documents that are not on the public site', () => {
    const owed = owedToPublic(
      [doc({ id: 1, publicAccess: true }), doc({ id: 2, publicAccess: false })],
      [item({ id: 100, documentId: 1 }), item({ id: 101, documentId: 2 })],
    );
    expect(owed.map((d) => d.id)).toEqual([2]);
  });
});

describe('filterRows', () => {
  it('narrows documents by category without dropping gaps', () => {
    const rows = mergeDocumentsAndGaps(
      [doc({ id: 1, categoryId: 10 }), doc({ id: 2, categoryId: 20 })],
      [item({ id: 101, documentId: null })],
    );

    const filtered = filterRows(rows, { categoryId: 10, quickFilter: 'all' });

    expect(filtered.filter((r) => r.kind === 'document').map((r) => r.id)).toEqual([1]);
    expect(filtered.some((r) => r.kind === 'gap')).toBe(true);
  });

  it('keeps a document with no category out of a category selection', () => {
    const rows = mergeDocumentsAndGaps([doc({ id: 1, categoryId: null })], []);
    expect(filterRows(rows, { categoryId: 10, quickFilter: 'all' })).toHaveLength(0);
  });

  it('drops gaps entirely when a quick filter is on', () => {
    // "Unlinked" is a question about files. Leaving gap rows in would answer a
    // different question in the same table.
    const rows = mergeDocumentsAndGaps(
      [doc({ id: 1 }), doc({ id: 2 })],
      [item({ id: 100, documentId: 1 }), item({ id: 101, documentId: null })],
    );

    const filtered = filterRows(rows, { categoryId: null, quickFilter: 'unlinked' });

    expect(filtered.every((r) => r.kind === 'document')).toBe(true);
    expect(filtered.map((r) => r.id)).toEqual([2]);
  });
});

describe('linkedRequirementsByDocumentId', () => {
  it('indexes only items that actually carry a document', () => {
    const map = linkedRequirementsByDocumentId([
      item({ id: 100, documentId: 5 }),
      item({ id: 101, documentId: null }),
    ]);

    expect(map.size).toBe(1);
    expect(map.get(5)?.id).toBe(100);
  });
});
