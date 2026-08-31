/**
 * Streaming reads of Supabase Storage objects.
 *
 * Separate from `./storage.ts` because it pulls in `node:stream` — kept out of
 * the module that content validators import so a browser-adjacent bundle never
 * reaches for Node built-ins.
 *
 * ── Why this exists at all ──
 *
 * `downloadStorageObject` (./storage.ts) ends in `await data.arrayBuffer()`, so
 * it materialises the ENTIRE file in memory. That is correct for its callers —
 * magic-byte validators need the head of the file and nothing more — but it
 * cannot build a multi-gigabyte export archive.
 *
 * `supabase.storage.download()` + `blob.stream()` does not help either: by the
 * time you hold the Blob the bytes are already buffered. The only genuinely
 * streaming path is a signed URL + `fetch`, whose response body is a web
 * ReadableStream that Node can adapt without buffering.
 */
import { Readable } from 'node:stream';
import { createPresignedDownloadUrl } from './storage';

/** Signed-URL lifetime for an internal streaming read. Server-to-server only. */
const INTERNAL_STREAM_URL_TTL_SECONDS = 300;

export interface StorageObjectStream {
  /** Node Readable. `archiver` consumes these with correct backpressure. */
  stream: Readable;
  /** From Content-Length when the CDN provides it; null otherwise. */
  contentLength: number | null;
}

/**
 * Open a storage object as a streaming Node Readable.
 *
 * Throws when the object is missing or the fetch fails — callers building an
 * archive should catch PER FILE and record a warning rather than failing the
 * whole export. One missing object must never cost an association its entire
 * statutory record set.
 */
export async function openStorageObjectStream(
  bucket: string,
  path: string,
): Promise<StorageObjectStream> {
  const url = await createPresignedDownloadUrl(bucket, path, INTERNAL_STREAM_URL_TTL_SECONDS);

  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(
      `Failed to stream storage object ${bucket}/${path}: HTTP ${response.status}`,
    );
  }

  const rawLength = response.headers.get('content-length');
  const parsedLength = rawLength === null ? Number.NaN : Number(rawLength);

  return {
    // Readable.fromWeb is stable on Node 20 (see package.json engines).
    stream: Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    contentLength: Number.isFinite(parsedLength) ? parsedLength : null,
  };
}
