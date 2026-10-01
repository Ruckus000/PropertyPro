/**
 * Does a file about to be uploaded already exist in the library?
 *
 * Matched by file name, the way a board thinks about it ("I already put up
 * 2026 Annual Budget.pdf"). The comparison ignores case, surrounding space and
 * Unicode composition, because the same name typed on two machines can differ
 * in all three and still be the same record to the person uploading it.
 *
 * It deliberately does NOT compare bytes. The library has no content hashes,
 * and a revised budget with the same name is the case this exists for: the
 * answer to "same name" is a question to the uploader (replace the old one, or
 * keep both), never a silent refusal.
 *
 * Pure, and fed the library the caller already holds. The documents screen
 * fetches the whole accessible library once (see `document-library.tsx`), so a
 * round trip here would only repeat a read the screen has made.
 */

export interface LibraryDocumentRef {
  id: number;
  title: string;
  fileName: string;
  categoryId: number | null;
  sourceType?: string | null;
  /** `null` = a draft. Decides whether replacing its file asks the redaction question. */
  postedAt?: string | null;
}

export function normalizeFileName(fileName: string): string {
  return fileName.normalize('NFC').trim().toLowerCase();
}

export type DuplicateIndex = ReadonlyMap<string, readonly LibraryDocumentRef[]>;

/**
 * Index the library by normalized file name. Only uploaded (`library`)
 * documents take part: an authored document's file name is derived from its
 * title, so a match against one would be a coincidence, and its file cannot be
 * replaced by an upload anyway.
 */
export function indexLibraryByFileName(documents: readonly LibraryDocumentRef[]): DuplicateIndex {
  const index = new Map<string, LibraryDocumentRef[]>();
  for (const doc of documents) {
    if (doc.sourceType != null && doc.sourceType !== 'library') continue;
    const key = normalizeFileName(doc.fileName);
    const bucket = index.get(key);
    if (bucket) bucket.push(doc);
    else index.set(key, [doc]);
  }
  return index;
}

/**
 * The existing document a new file would duplicate, or null.
 *
 * When several share the name, the newest (highest id) is the one a
 * "replace the old one" choice should act on — it is the one most likely to be
 * the current record.
 */
export function findDuplicate(fileName: string, index: DuplicateIndex): LibraryDocumentRef | null {
  const matches = index.get(normalizeFileName(fileName));
  if (!matches || matches.length === 0) return null;
  return matches.reduce((newest, doc) => (doc.id > newest.id ? doc : newest));
}
