/**
 * What can be uploaded as a document, decided before any bytes move.
 *
 * Client-safe on purpose: no `file-type` import (that lives in
 * `lib/utils/file-validation.ts`, which reads magic bytes on the server). The
 * server remains the enforcement point — this exists so a board member hears
 * "Spreadsheets can't be posted" before uploading 40 MB, not after.
 *
 * The size limits are single-sourced here; the presign route and the server's
 * magic-byte validator read the same constants.
 */

export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

/** The `accept` attribute for every document picker. The server takes exactly these. */
export const DOCUMENT_ACCEPT = '.pdf,.docx,.png,.jpg,.jpeg';

const DOCUMENT_EXTENSIONS = new Set(['pdf', 'docx']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg']);
const SPREADSHEET_EXTENSIONS = new Set(['xls', 'xlsx', 'xlsm', 'csv', 'numbers', 'ods']);

export type UploadVerdict =
  | { kind: 'ok' }
  | { kind: 'warning'; note: string }
  | { kind: 'error'; note: string };

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

function megabytes(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

/**
 * One file's verdict, in words a board member can act on.
 *
 * `error` files cannot be posted at all; `warning` files can, with advice.
 */
export function classifyUpload(file: { name: string; size: number }): UploadVerdict {
  const ext = extensionOf(file.name);

  if (SPREADSHEET_EXTENSIONS.has(ext)) {
    return {
      kind: 'error',
      note: 'Spreadsheets can’t be posted. Save it as a PDF, and remove phone numbers and emails first.',
    };
  }
  if (ext === 'doc') {
    return {
      kind: 'error',
      note: 'Older Word files (.doc) can’t be posted. Save it as a PDF or a .docx file.',
    };
  }

  const isImage = IMAGE_EXTENSIONS.has(ext);
  if (!isImage && !DOCUMENT_EXTENSIONS.has(ext)) {
    return {
      kind: 'error',
      note: 'This type of file can’t be posted. Upload a PDF, a Word (.docx) file, or a PNG or JPG image.',
    };
  }

  if (file.size === 0) {
    return { kind: 'error', note: 'This file is empty. Choose the file again.' };
  }

  const limit = isImage ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES;
  if (file.size > limit) {
    return {
      kind: 'error',
      note: isImage
        ? `Too large. Images must be under ${megabytes(MAX_IMAGE_BYTES)}.`
        : `Too large. Files must be under ${megabytes(MAX_DOCUMENT_BYTES)}. Try saving a compressed copy from your PDF app.`,
    };
  }

  if (isImage) {
    return {
      kind: 'warning',
      note: 'Photos of paper documents are hard to read on phones and with screen readers. Upload a PDF if you have one.',
    };
  }

  return { kind: 'ok' };
}

/** "Rules 2026.pdf" → "Rules 2026" — the title a document gets until someone renames it. */
export function titleFromFileName(name: string): string {
  return name.replace(/\.[^/.]+$/, '').trim() || name;
}
