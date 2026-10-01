/**
 * The multi-file upload queue, as pure rules: no React, no network.
 *
 * A row is one chosen file. Each row is judged on its own (`classifyUpload`),
 * may duplicate a document already in the library, and goes up either as a new
 * document or as a replacement for that document's file. The queue as a whole
 * is sent with ONE action — post now, or save as drafts — and ONE redaction
 * attestation covering every row that needs it.
 */
import { isRedactionSensitiveCategory, normalizeCategoryName } from '@propertypro/shared';
import { findDuplicate, type DuplicateIndex, type LibraryDocumentRef } from './duplicate-uploads';
import { classifyUpload, titleFromFileName, type UploadVerdict } from './upload-rules';

export type QueueAction = 'post' | 'draft';

/** The server's rule (`categoryRequiresRedactionAttestation`): unknown fails closed. */
function sensitive(categoryName: string | null): boolean {
  return isRedactionSensitiveCategory(normalizeCategoryName(categoryName));
}
export type DuplicateChoice = 'replace' | 'both';
export type RowStatus = 'ready' | 'uploading' | 'done' | 'failed';

export interface QueueRow {
  key: string;
  file: File;
  title: string;
  /** Optional; residents see it under the title and in search results. */
  description: string;
  categoryId: number | null;
  verdict: UploadVerdict;
  duplicate: LibraryDocumentRef | null;
  duplicateChoice: DuplicateChoice;
  status: RowStatus;
  progress: number;
  error: string | null;
}

let nextKey = 0;

export function makeRows(
  files: readonly File[],
  index: DuplicateIndex,
  defaultCategoryId: number | null,
): QueueRow[] {
  return files.map((file) => ({
    key: `row-${(nextKey += 1)}`,
    file,
    title: titleFromFileName(file.name),
    description: '',
    categoryId: defaultCategoryId,
    verdict: classifyUpload(file),
    duplicate: findDuplicate(file.name, index),
    duplicateChoice: 'replace',
    status: 'ready',
    progress: 0,
    error: null,
  }));
}

/** This row replaces an existing document's file rather than adding one. */
export function isReplacing(row: QueueRow): row is QueueRow & { duplicate: LibraryDocumentRef } {
  return row.duplicate != null && row.duplicateChoice === 'replace';
}

/** Rows that will be sent: everything not refused and not already done. */
export function sendableRows(rows: readonly QueueRow[]): QueueRow[] {
  return rows.filter((row) => row.verdict.kind !== 'error' && row.status !== 'done');
}

/** A new document needs a category; a replacement keeps its document's. */
export function needsCategory(row: QueueRow): boolean {
  return !isReplacing(row) && row.categoryId == null;
}

/**
 * Whether this row, sent with this action, needs the redaction attestation.
 * Mirrors the server, which remains the enforcement point:
 * - a new document asks when POSTED, by its category; a draft asks nothing;
 * - a replacement asks only when its document is already posted (whatever the
 *   action — new bytes reach the audience it already has), by its category.
 */
export function rowNeedsAttestation(
  row: QueueRow,
  action: QueueAction,
  categoryNameOf: (id: number | null) => string | null,
): boolean {
  if (isReplacing(row)) {
    const targetIsDraft = row.duplicate.postedAt === null;
    return !targetIsDraft && sensitive(categoryNameOf(row.duplicate.categoryId));
  }
  return action === 'post' && sensitive(categoryNameOf(row.categoryId));
}

/**
 * Why the queue cannot be sent yet, in the design's words, or null. Asked only
 * after a send was attempted, so an untouched queue does not open on a scold.
 */
export function queueBlocker(params: {
  rows: readonly QueueRow[];
  attestationRequired: boolean;
  attested: boolean;
}): string | null {
  const sendable = sendableRows(params.rows);
  if (sendable.length === 0) {
    return 'None of these files can be posted. Remove them and choose others.';
  }
  const missing = sendable.filter(needsCategory).length;
  if (missing > 0) {
    return `Choose a category for ${missing} file${missing === 1 ? '' : 's'}.`;
  }
  if (sendable.some((row) => !row.title.trim() && !isReplacing(row))) {
    return 'Give every document a title.';
  }
  if (params.attestationRequired && !params.attested) {
    return 'Tick the personal information check first.';
  }
  return null;
}

/** "4 files · 3 ready, 1 can’t be posted" */
export function queueSummary(rows: readonly QueueRow[]): string {
  const refused = rows.filter((row) => row.verdict.kind === 'error').length;
  const ready = rows.length - refused;
  return `${rows.length} file${rows.length === 1 ? '' : 's'} · ${ready} ready${
    refused ? `, ${refused} can’t be posted` : ''
  }`;
}
