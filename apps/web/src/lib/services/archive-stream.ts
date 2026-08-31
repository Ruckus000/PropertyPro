/**
 * Bridge a Node `archiver` stream to a web `ReadableStream` — WITH backpressure.
 *
 * ── The bug this replaces ──
 *
 * The export route hand-rolled this bridge as:
 *
 *     new ReadableStream({
 *       start(controller) {
 *         archive.on('data', (c) => controller.enqueue(c));   // ← no backpressure
 *         archive.on('end', () => controller.close());
 *         archive.finalize();                                  // ← starts immediately
 *       },
 *     })
 *
 * Two independent faults. It enqueues on EVERY `data` event without ever
 * consulting `controller.desiredSize` or implementing `pull()`, so a slow client
 * cannot slow the producer — the entire zip accumulates in the controller queue.
 * And it calls `finalize()` inside `start()`, so production begins before any
 * consumer has pulled a single byte. Together that is an OOM vector proportional
 * to archive size, which was survivable for four small CSVs and is not
 * survivable once document bytes are in the archive.
 *
 * `Readable.toWeb` implements the bridge properly: it pauses the Node stream
 * when the web queue fills.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-07.
 */
import { Readable } from 'node:stream';
import type { Archiver } from 'archiver';

/**
 * Convert an archiver instance into a backpressure-aware web ReadableStream.
 *
 * Call this BEFORE appending entries, then append and call `archive.finalize()`.
 * Errors are surfaced by the stream itself.
 *
 * NOTE for callers: `withErrorHandler` cannot catch anything thrown after
 * headers are sent, so an `archive.on('error')` handler that reports to Sentry
 * belongs at the call site — a failure mid-stream is otherwise invisible.
 */
export function nodeArchiveToWebStream(archive: Archiver): ReadableStream<Uint8Array> {
  return Readable.toWeb(archive as unknown as Readable) as ReadableStream<Uint8Array>;
}
