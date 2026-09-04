/**
 * One derived reading of a document library.
 *
 * The library is not a list of files. A document is *evidence for a statutory
 * requirement*, so the set the board cares about is the requirements — some of
 * which have a file and some of which do not. Every claim the screen makes
 * about a row is derived here: no DOM, no network, no React.
 *
 * The link is `compliance_checklist_items.document_id`, not a column on
 * `documents` — a checklist item points at the file that satisfies it.
 *
 * ## On "owed to the public site"
 *
 * There is no per-item "must be public" flag. §718.111(12)(g) is the posting
 * duty and the checklist IS the statutory record set, so the conservative
 * reading is that an applicable record whose file is not on the site is owed to
 * it. That is deliberately the cautious direction: it over-reports the duty
 * rather than telling a board it has posted something it has not.
 *
 * Note that `documents.public_access` currently has no writer anywhere in the
 * product, so `publicCount` reads 0 for every community and every linked
 * document reads `owed`. That is the true posture, not a bug in this module.
 */

export type DocumentExtractionStatus =
  | 'pending'
  | 'completed'
  | 'failed'
  | 'not_applicable'
  | 'skipped';

/** A document row as the list endpoint delivers it — dates are ISO strings. */
export interface DocumentRow {
  id: number;
  title: string;
  description: string | null;
  fileName: string;
  fileSize: number;
  mimeType: string;
  categoryId: number | null;
  createdAt: string;
  uploadedBy: string | null;
  /**
   * `documents.public_access`. `paginate()` projects every column, so this is
   * already on the wire; optional because the field post-dates the row type and
   * a cached payload may predate it. Absent must read as NOT public.
   */
  publicAccess?: boolean;
  extractionStatus?: DocumentExtractionStatus | null;
  sourceType?: 'library' | 'violation_evidence' | 'authored' | null;
}

/** A compliance checklist item as `GET /api/v1/compliance` delivers it. */
export interface ChecklistRow {
  id: number;
  title: string;
  category: string;
  statuteReference?: string | null;
  documentId?: number | null;
  /** When the linked document was posted (ISO). */
  documentPostedAt?: string | null;
  deadline?: string | null;
  isApplicable?: boolean;
  status: string;
}

/**
 * What a row is, in one word.
 *
 * `deleted` is deliberately absent: the list endpoint filters soft-deleted
 * documents out, so the client never receives one and a state for it would be
 * unreachable.
 */
export type DocumentState = 'unlinked' | 'owed' | 'public' | 'private';

export type LibraryRow =
  | {
      kind: 'document';
      id: number;
      document: DocumentRow;
      requirement: ChecklistRow | null;
      state: DocumentState;
    }
  | { kind: 'gap'; id: number; requirement: ChecklistRow };

export type DocumentQuickFilter = 'all' | 'unlinked' | 'owed';

/** An item counts only when the community has not excluded it. */
function isApplicable(row: ChecklistRow): boolean {
  return row.isApplicable !== false;
}

function isPublic(row: DocumentRow): boolean {
  return row.publicAccess === true;
}

/** The reverse of the link: which requirement, if any, points at this file. */
export function linkedRequirementsByDocumentId(
  items: readonly ChecklistRow[],
): Map<number, ChecklistRow> {
  const byDocument = new Map<number, ChecklistRow>();
  for (const row of items) {
    if (typeof row.documentId === 'number') {
      byDocument.set(row.documentId, row);
    }
  }
  return byDocument;
}

export function documentState(
  document: DocumentRow,
  requirement: ChecklistRow | null,
): DocumentState {
  if (!requirement) return 'unlinked';
  if (isPublic(document)) return 'public';
  return isApplicable(requirement) ? 'owed' : 'private';
}

/**
 * Files and the requirements that have none, in one list.
 *
 * A requirement counts as a gap only when it is applicable AND carries no
 * `documentId`. An item whose file is simply absent from this page — filtered
 * out by category — is still satisfied, and reporting it as a gap would invent
 * a coverage hole.
 */
export function mergeDocumentsAndGaps(
  documents: readonly DocumentRow[],
  items: readonly ChecklistRow[],
): LibraryRow[] {
  const byDocument = linkedRequirementsByDocumentId(items);

  const documentRows: LibraryRow[] = documents.map((document) => {
    const requirement = byDocument.get(document.id) ?? null;
    return {
      kind: 'document',
      id: document.id,
      document,
      requirement,
      state: documentState(document, requirement),
    };
  });

  const gapRows: LibraryRow[] = items
    .filter((row) => row.documentId == null && isApplicable(row))
    .map((requirement) => ({ kind: 'gap', id: requirement.id, requirement }));

  return [...gapRows, ...documentRows];
}

export function coverageFacts(
  documents: readonly DocumentRow[],
  items: readonly ChecklistRow[],
): { total: number; covered: number; publicCount: number } {
  const applicable = items.filter(isApplicable);
  return {
    total: applicable.length,
    covered: applicable.filter((row) => row.documentId != null).length,
    publicCount: documents.filter(isPublic).length,
  };
}

/** Files no requirement points at. */
export function unlinkedDocuments(
  documents: readonly DocumentRow[],
  items: readonly ChecklistRow[],
): DocumentRow[] {
  const byDocument = linkedRequirementsByDocumentId(items);
  return documents.filter((document) => !byDocument.has(document.id));
}

/** Linked, applicable records whose file is not on the public site. */
export function owedToPublic(
  documents: readonly DocumentRow[],
  items: readonly ChecklistRow[],
): DocumentRow[] {
  const byDocument = linkedRequirementsByDocumentId(items);
  return documents.filter(
    (document) => documentState(document, byDocument.get(document.id) ?? null) === 'owed',
  );
}

/**
 * A quick filter asks a question about FILES, so it drops gap rows — leaving
 * them in would answer a different question in the same table. A category
 * selection narrows files only; the checklist carries its own categories and a
 * gap stays visible so the hole is not hidden by a filter.
 */
export function filterRows(
  rows: readonly LibraryRow[],
  options: { categoryId: number | null; quickFilter: DocumentQuickFilter },
): LibraryRow[] {
  return rows.filter((row) => {
    if (row.kind === 'gap') {
      return options.quickFilter === 'all';
    }

    if (options.categoryId != null && row.document.categoryId !== options.categoryId) {
      return false;
    }

    if (options.quickFilter === 'unlinked') return row.state === 'unlinked';
    if (options.quickFilter === 'owed') return row.state === 'owed';
    return true;
  });
}

// ---------------------------------------------------------------------------
// The three readings of the same set
// ---------------------------------------------------------------------------

/**
 * List / Board / Timeline — one model, three questions.
 *
 *   List      what have we got, and what is each one's state
 *   Board     where does the whole set sit in the statutory lifecycle
 *   Timeline  where does each record sit against its own date
 *
 * The prototype opens on Board. This opens on List, because `coerce*View`'s
 * standing rule in this codebase is that an unknown value falls back to the
 * route's HISTORICAL landing view — the screen has always opened on a list, and
 * an existing link should not change what it shows.
 */
export type DocumentsView = 'list' | 'board' | 'timeline';

export function coerceDocumentsView(raw: string | null): DocumentsView {
  switch (raw) {
    case 'board':
      return 'board';
    case 'timeline':
      return 'timeline';
    default:
      return 'list';
  }
}

export type BoardColumnId = 'gap' | 'private' | 'public' | 'deleted';

export interface BoardColumn {
  id: BoardColumnId;
  label: string;
  emptyText: string;
  rows: LibraryRow[];
}

/**
 * The statutory lifecycle as columns: no file → uploaded but not public → on
 * the public site → deleted. Acting on a record means moving it between them.
 *
 * Deleted documents are passed in separately because the list endpoint filters
 * soft-deleted rows out of every other view; only the board asks for them.
 */
export function boardColumns(
  rows: readonly LibraryRow[],
  deleted: readonly DocumentRow[],
): BoardColumn[] {
  const documents = rows.filter((row) => row.kind === 'document');
  return [
    {
      id: 'gap',
      label: 'No file',
      emptyText: 'Every requirement in view has a file.',
      rows: rows.filter((row) => row.kind === 'gap'),
    },
    {
      id: 'private',
      label: 'Uploaded · not public',
      emptyText: 'Nothing here.',
      rows: documents.filter((row) => row.kind === 'document' && row.state !== 'public'),
    },
    {
      id: 'public',
      label: 'On the public site',
      emptyText: 'Nothing on the site yet.',
      rows: documents.filter((row) => row.kind === 'document' && row.state === 'public'),
    },
    {
      id: 'deleted',
      label: 'Deleted',
      emptyText: 'None.',
      rows: deleted.map((document) => ({
        kind: 'document' as const,
        id: document.id,
        document,
        requirement: null,
        state: 'unlinked' as const,
      })),
    },
  ];
}

export type TimelineTone = 'none' | 'bad' | 'warn' | 'ok';

export interface TimelineRow {
  requirement: ChecklistRow;
  document: DocumentRow | null;
  /** 0-11. The statutory year is one calendar year wide. */
  monthIndex: number;
  tone: TimelineTone;
  label: string;
  /** Inclusive 0-based month span of an exposure still open today, or null. */
  bar: { from: number; to: number } | null;
}

/**
 * UTC, deliberately. Deadlines are stored as UTC timestamps, and a deadline at
 * midnight UTC on the 1st reads as the PREVIOUS month under `getMonth()` in any
 * US timezone — the same local-calendar trap that put every N-day compliance
 * window an hour out before `posting-deadline.ts` moved to elapsed time.
 */
function monthOf(iso: string | null | undefined, year: number): number | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  // Clamp anything outside the year on screen to its nearest edge, so an old
  // record still appears rather than falling off the grid silently.
  if (date.getUTCFullYear() < year) return 0;
  if (date.getUTCFullYear() > year) return 11;
  return date.getUTCMonth();
}

/**
 * Each statutory record placed against its own date.
 *
 * A record's month is its DEADLINE where it has one, otherwise the date its
 * document was posted — the obligation is what the year is about, and the
 * evidence is where it landed. A record with neither sits on the current month.
 *
 * The bar is the part that carries the argument: it runs from the record's own
 * month to today, so an overdue obligation reads as a span still open rather
 * than a dot in the past.
 */
export function timelineRows(
  documents: readonly DocumentRow[],
  items: readonly ChecklistRow[],
  now: Date,
): TimelineRow[] {
  const year = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const byId = new Map(documents.map((document) => [document.id, document]));

  return items
    .filter((item) => item.isApplicable !== false)
    .map((requirement) => {
      const document =
        typeof requirement.documentId === 'number'
          ? byId.get(requirement.documentId) ?? null
          : null;

      const monthIndex =
        monthOf(requirement.deadline, year) ??
        monthOf(requirement.documentPostedAt, year) ??
        currentMonth;

      const isGap = requirement.documentId == null;
      const isOverdue = requirement.status === 'overdue';
      const isOwed = document ? documentState(document, requirement) === 'owed' : false;

      // `bad` is reserved for an obligation already MISSED, which in this data
      // only ever means a gap past its deadline — a requirement holding a
      // document is not reported overdue. Scoring a non-gap `bad` would be a
      // branch that can never run.
      const tone: TimelineTone = isGap
        ? isOverdue
          ? 'bad'
          : 'none'
        : isOwed
          ? 'warn'
          : 'ok';

      const label = isGap ? 'no file' : isOwed ? 'not public' : 'on file';

      // An exposure is open while the record is unsatisfied. It reads from the
      // month it was owed through to today.
      const open = isGap || isOverdue;
      const bar = open
        ? { from: monthIndex, to: Math.max(monthIndex, currentMonth) }
        : null;

      return { requirement, document, monthIndex, tone, label, bar };
    })
    .sort((a, b) => a.monthIndex - b.monthIndex);
}
