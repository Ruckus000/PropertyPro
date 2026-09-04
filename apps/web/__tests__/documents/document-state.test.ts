/**
 * The derived reading of a document library.
 *
 * A document is evidence for a statutory requirement, so the library is not a
 * list of files — it is the set of records, some of which have a file and some
 * of which do not. Everything the screen says about a row is derived here, with
 * no DOM and no network, so the rules can be tested directly.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  boardColumns,
  coerceDocumentsView,
  coverageFacts,
  documentState,
  filterRows,
  linkedRequirementsByDocumentId,
  mergeDocumentsAndGaps,
  owedToPublic,
  timelineRows,
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

describe('coerceDocumentsView', () => {
  it('offers the three readings and falls back to the historical one', () => {
    expect(coerceDocumentsView('board')).toBe('board');
    expect(coerceDocumentsView('timeline')).toBe('timeline');
    expect(coerceDocumentsView('list')).toBe('list');
    // The screen has always opened on a list; an old link must not change.
    expect(coerceDocumentsView(null)).toBe('list');
    expect(coerceDocumentsView('zzz')).toBe('list');
  });
});

describe('boardColumns', () => {
  it('lays the statutory lifecycle out as four columns', () => {
    const rows = mergeDocumentsAndGaps(
      [doc({ id: 1, publicAccess: true }), doc({ id: 2, publicAccess: false })],
      [item({ id: 100, documentId: 1 }), item({ id: 101, documentId: 2 }), item({ id: 102 })],
    );

    const columns = boardColumns(rows, [doc({ id: 9, title: 'Old minutes' })]);

    expect(columns.map((c) => c.id)).toEqual(['gap', 'private', 'public', 'deleted']);
    expect(columns[0]?.rows).toHaveLength(1);
    expect(columns[1]?.rows.map((r) => r.id)).toEqual([2]);
    expect(columns[2]?.rows.map((r) => r.id)).toEqual([1]);
    expect(columns[3]?.rows.map((r) => r.id)).toEqual([9]);
  });

  it('keeps deleted documents out of the live columns', () => {
    // They arrive on their own channel — the list endpoint filters them out of
    // every other view, so a deleted file must never appear as "not public".
    const columns = boardColumns([], [doc({ id: 9 })]);
    expect(columns[1]?.rows).toHaveLength(0);
    expect(columns[3]?.rows).toHaveLength(1);
  });
});

describe('timelineRows', () => {
  const NOW = new Date('2026-08-15T00:00:00.000Z');

  it('places a record on its deadline month', () => {
    const rows = timelineRows(
      [],
      [item({ deadline: '2026-03-10T00:00:00.000Z' })],
      NOW,
    );
    expect(rows[0]?.monthIndex).toBe(2);
  });

  it('falls back to when the document was posted', () => {
    const rows = timelineRows(
      [doc({ id: 5 })],
      [item({ documentId: 5, deadline: null, documentPostedAt: '2026-05-02T00:00:00.000Z' })],
      NOW,
    );
    expect(rows[0]?.monthIndex).toBe(4);
  });

  it('runs an overdue exposure from its own month to today', () => {
    // The bar is the argument: an obligation owed in March and still open in
    // August reads as a span, not a dot in the past.
    const rows = timelineRows(
      [],
      [item({ deadline: '2026-03-10T00:00:00.000Z', status: 'overdue' })],
      NOW,
    );
    expect(rows[0]?.bar).toEqual({ from: 2, to: 7 });
    // A gap past its deadline is the only thing that reads as already missed.
    expect(rows[0]?.tone).toBe('bad');
    expect(rows[0]?.label).toBe('no file');
  });

  it('separates a gap that is merely open from one already missed', () => {
    const notYet = timelineRows([], [item({ deadline: '2026-11-01T00:00:00.000Z' })], NOW);
    expect(notYet[0]?.tone).toBe('none');
  });

  it('draws no bar for a record that is satisfied', () => {
    const rows = timelineRows(
      [doc({ id: 5, publicAccess: true })],
      [item({ documentId: 5, deadline: '2026-03-10T00:00:00.000Z', status: 'satisfied' })],
      NOW,
    );
    expect(rows[0]?.bar).toBeNull();
    expect(rows[0]?.tone).toBe('ok');
  });

  it('marks a linked but unpublished record as owed, not overdue', () => {
    const rows = timelineRows(
      [doc({ id: 5, publicAccess: false })],
      [item({ documentId: 5, deadline: '2026-03-10T00:00:00.000Z', status: 'satisfied' })],
      NOW,
    );
    expect(rows[0]?.tone).toBe('warn');
    expect(rows[0]?.label).toBe('not public');
  });

  it('reads the month in UTC, in every timezone', () => {
    /**
     * The sort test above catches a local-calendar read — but ONLY outside UTC,
     * and localci runs `TZ=UTC`, where `getMonth()` and `getUTCMonth()` are the
     * same call. Measured: injecting `getMonth()` reddens that test under EDT
     * and passes under TZ=UTC. So it is vacuous exactly where CI runs it.
     *
     * This asserts the choice itself, which is the only thing that can fail in
     * any timezone: a deadline is a UTC timestamp, and midnight UTC on the 1st
     * belongs to that month, not the previous one.
     */
    const localMonth = vi.spyOn(Date.prototype, 'getMonth');
    const localYear = vi.spyOn(Date.prototype, 'getFullYear');
    try {
      timelineRows(
        [doc({ id: 5 })],
        [item({ documentId: 5, deadline: '2026-02-01T00:00:00.000Z' })],
        NOW,
      );
      expect(localMonth).not.toHaveBeenCalled();
      expect(localYear).not.toHaveBeenCalled();
    } finally {
      localMonth.mockRestore();
      localYear.mockRestore();
    }
  });

  it('clamps a record from another year to the edge rather than dropping it', () => {
    const older = timelineRows([], [item({ deadline: '2024-06-01T00:00:00.000Z' })], NOW);
    const later = timelineRows([], [item({ deadline: '2027-06-01T00:00:00.000Z' })], NOW);
    expect(older[0]?.monthIndex).toBe(0);
    expect(later[0]?.monthIndex).toBe(11);
  });

  it('leaves out requirements the community does not have', () => {
    expect(timelineRows([], [item({ isApplicable: false })], NOW)).toHaveLength(0);
  });

  it('sorts by month so the year reads left to right', () => {
    const rows = timelineRows(
      [],
      [
        item({ id: 1, deadline: '2026-09-01T00:00:00.000Z' }),
        item({ id: 2, deadline: '2026-02-01T00:00:00.000Z' }),
      ],
      NOW,
    );
    expect(rows.map((r) => r.monthIndex)).toEqual([1, 8]);
  });
});
