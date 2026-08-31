/**
 * The export worker — turns a claimed job into ZIP volumes in storage.
 *
 * ── Why volumes rather than one archive ──
 *
 * A zip cannot be resumed mid-stream. No amount of chunking rescues a
 * single-archive design from the serverless duration ceiling, because a partial
 * zip is not a zip. Bounding BYTES PER VOLUME instead makes each unit of work
 * finite: a volume is built and uploaded inside one invocation, and the keyset
 * cursor records where the next one starts. That is what lets a large
 * association converge across several cron ticks instead of timing out forever.
 *
 * ── The two rules that matter most ──
 *
 * 1. Nothing is silently dropped. Row reads are keyset-paginated to exhaustion,
 *    never `.limit(N)`. Anything skipped — a missing storage object, a table
 *    that errored — lands in `manifest.warnings`, which is surfaced in the
 *    archive, the poll response and the completion email. An export that looks
 *    complete but isn't is worse than no export at all.
 *
 * 2. One bad file never costs an association its record set. Document streaming
 *    is try/caught PER FILE.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-07.
 */
import archiver from 'archiver';
import { PassThrough } from 'node:stream';
import {
  COMMUNITY_EXPORTS_BUCKET,
  DOCUMENTS_BUCKET,
  uploadStorageObject,
  createScopedClient,
  documents as documentsTable,
  openStorageObjectStream,
} from '@propertypro/db';
import type { CommunityExportJob, ExportJobCursor, ExportJobManifest } from '@propertypro/db';
import { asc, gt } from '@propertypro/db/filters';
import { generateCSVHeaderLine, generateCSVRowLine } from '@/lib/services/csv-export';
import { EXPORT_TABLES, type ExportTableSpec } from './table-registry';
import { recordJobPart, saveJobProgress } from './export-job-service';

/** Rows fetched per keyset page. */
const ROW_PAGE_SIZE = 5_000;

/**
 * Bytes per volume before rolling to the next one.
 *
 * Conservative on purpose: each volume is buffered in memory before upload (see
 * `uploadPart`), so this is a memory ceiling, not just a file-size preference.
 * Streaming the upload instead would let this grow — that needs a spike against
 * a real Supabase project first, so the buffered path ships and the constant
 * stays small.
 */
const MAX_PART_BYTES = 150 * 1024 * 1024;

/** Fraction of the invocation budget to use before flushing and yielding. */
const SOFT_DEADLINE_RATIO = 0.8;

export interface WorkerRunResult {
  status: 'completed' | 'yielded';
  /** Volumes written by THIS invocation. */
  partsWritten: number;
  /** Bytes written by THIS invocation. */
  bytesWritten: number;
  /**
   * Volumes and bytes across EVERY invocation of this job, from the manifest.
   *
   * `markJobReady` must use these. `partsWritten`/`bytesWritten` reset to 0 at
   * the top of each run, so on the final tick of a job that yielded even once
   * they describe that tick alone — a five-volume export would be recorded as
   * having one. Invisible until resume actually worked; wrong the moment it did.
   */
  totalParts: number;
  totalBytes: number;
  warnings: number;
  /**
   * The manifest AS BUILT by this run. Returned rather than left for the caller
   * to re-read, because the caller holds the job row it claimed BEFORE the run —
   * using that would persist a stale manifest and report zero warnings on an
   * export that had them.
   */
  manifest: ExportJobManifest;
}

interface PartBuilder {
  archive: archiver.Archiver;
  sink: PassThrough;
  chunks: Buffer[];
  /** Compressed bytes ACTUALLY drained from the sink. Lags `queuedBytes`. */
  bytes: number;
  /**
   * Uncompressed bytes handed to `archive.append()`, counted at append time.
   *
   * The volume ceiling MUST be tested against this and not `bytes`. `append()`
   * only queues an entry; `bytes` grows later, as archiver drains the sink. In
   * the document phase the loop can enqueue thousands of file streams before the
   * counter moves at all, so a `bytes`-based check does not bound memory — which
   * is the entire job of MAX_PART_BYTES.
   */
  queuedBytes: number;
  entries: number;
  done: Promise<void>;
}

function startPart(): PartBuilder {
  const archive = archiver('zip', { zlib: { level: 6 } });
  const sink = new PassThrough();
  const chunks: Buffer[] = [];
  const builder: PartBuilder = {
    archive,
    sink,
    chunks,
    bytes: 0,
    queuedBytes: 0,
    entries: 0,
    done: new Promise<void>((resolve, reject) => {
      sink.on('data', (c: Buffer) => {
        chunks.push(c);
        builder.bytes += c.length;
      });
      sink.on('end', () => resolve());
      sink.on('error', reject);
      archive.on('error', reject);
      // archiver emits 'warning' for recoverable problems (notably ENOENT).
      // Swallowing them is how a silently incomplete archive happens.
      archive.on('warning', reject);
    }),
  };
  archive.pipe(sink);
  return builder;
}

async function finishPart(builder: PartBuilder): Promise<Buffer> {
  await builder.archive.finalize();
  await builder.done;
  return Buffer.concat(builder.chunks);
}

function partPath(communityId: number, downloadToken: string, partIndex: number): string {
  return `exports/${communityId}/${downloadToken}/part-${String(partIndex).padStart(3, '0')}.zip`;
}

/**
 * Entry name for a table CSV that spilled past its first chunk.
 *
 * `data/units.csv` -> `data/units.part-001.csv`. Suffixed with the VOLUME index
 * the chunk lands in, so the name is stable if the same chunk is re-written by a
 * retry rather than drifting with a separate counter.
 */
function chunkName(file: string, partIndex: number): string {
  const suffix = `.part-${String(partIndex).padStart(3, '0')}`;
  const dot = file.lastIndexOf('.');
  return dot <= 0 ? `${file}${suffix}` : `${file.slice(0, dot)}${suffix}${file.slice(dot)}`;
}

async function uploadPart(path: string, body: Buffer): Promise<void> {
  // `upsert` (the helper's default) matters here: a retried invocation must
  // overwrite the orphaned object from the attempt that died, not collide with it.
  await uploadStorageObject(COMMUNITY_EXPORTS_BUCKET, path, new Uint8Array(body), {
    contentType: 'application/zip',
  });
}

/**
 * Zip entry names are attacker-influenced: `documents.file_path` and `file_name`
 * are free-form text. A `../` in either would make the archive a zip-slip
 * against whoever extracts it — which here is the association, on their own
 * machine.
 */
function safeEntryName(raw: string, fallback: string): string {
  const cleaned = raw
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    // Strip control characters. Written as explicit escapes: the first draft
    // embedded the raw bytes, which are invisible in an editor and easy to
    // mangle. Spaces and hyphens are legitimate in filenames and are KEPT.
    ?.replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/^\.+/, '')
    .trim();
  return cleaned && cleaned.length > 0 ? cleaned : fallback;
}

function pushWarning(manifest: ExportJobManifest, code: string, detail: string, documentId?: number) {
  manifest.warnings = manifest.warnings ?? [];
  manifest.warnings.push(documentId === undefined ? { code, detail } : { code, detail, documentId });
}

/**
 * Run one invocation's worth of work against a claimed job.
 *
 * Returns `yielded` when the soft deadline or a volume boundary stopped it —
 * the cursor is persisted and the next tick resumes.
 */
export async function runExportJob(
  job: CommunityExportJob,
  options: { budgetMs: number; now?: Date },
): Promise<WorkerRunResult> {
  const now = options.now ?? new Date();
  const softDeadline = Date.now() + options.budgetMs * SOFT_DEADLINE_RATIO;
  /** Cumulative across ticks — manifest.parts is the only cross-run record. */
  const cumulative = () => ({
    totalParts: manifest.parts?.length ?? 0,
    totalBytes: (manifest.parts ?? []).reduce((n, part) => n + part.bytes, 0),
  });
  const outOfTime = () => Date.now() >= softDeadline;

  const scoped = createScopedClient(job.communityId);
  const cursor: ExportJobCursor = { ...(job.cursor ?? {}) };
  const manifest: ExportJobManifest = {
    schemaVersion: 1,
    tables: [],
    documents: { expected: 0, included: 0, bytes: 0 },
    warnings: [],
    parts: [],
    ...(job.manifest ?? {}),
  };

  let partIndex = cursor.partIndex ?? 0;
  let builder = startPart();
  let partsWritten = 0;
  let bytesWritten = 0;

  const flushPart = async (): Promise<void> => {
    if (builder.entries > 0) {
      const buffer = await finishPart(builder);
      const path = partPath(job.communityId, job.downloadToken, partIndex);
      await uploadPart(path, buffer);
      await recordJobPart({
        jobId: job.id,
        communityId: job.communityId,
        partIndex,
        storagePath: path,
        byteSize: buffer.length,
        fileCount: builder.entries,
      });
      // Replace rather than append, mirroring the `manifest.tables` filter
      // below. `recordJobPart` upserts on (jobId, partIndex) and storage writes
      // are upserts too, so a retry after a crash between the upload and
      // `saveJobProgress` re-writes the same index — the manifest must not then
      // carry two entries for one volume.
      manifest.parts = (manifest.parts ?? []).filter((p) => p.index !== partIndex);
      manifest.parts.push({ index: partIndex, file: path, bytes: buffer.length });
      partsWritten += 1;
      bytesWritten += buffer.length;
      partIndex += 1;
      builder = startPart();
    }

    // ALWAYS, including the nothing-to-flush path above.
    //
    // The cursor names the NEXT index to write, never the one just written.
    // Callers used to set `cursor.partIndex = partIndex` BEFORE awaiting this
    // function, which captured the pre-increment value: the next tick then
    // resumed at the index it had already uploaded and overwrote that volume,
    // silently dropping every document in it while the job still reported
    // `ready`. Owning the assignment here is what makes that unrepresentable.
    cursor.partIndex = partIndex;
  };

  // ── Phase: metadata ───────────────────────────────────────────────────────
  //
  // A cursor can name a table that no longer exists in EXPORT_TABLES — a deploy
  // between two cron ticks is enough. `Math.max(0, findIndex(...))` used to fold
  // that -1 into 0, silently restarting the phase and re-appending every CSV
  // already written into a fresh volume. Record it instead: rule 1 of this file
  // is that nothing is dropped or redone silently.
  let startTableIndex = 0;
  if (cursor.tableName) {
    const found = EXPORT_TABLES.findIndex((t) => t.tableName === cursor.tableName);
    if (found < 0) {
      pushWarning(
        manifest,
        'CURSOR_TABLE_UNKNOWN',
        `resume cursor named table "${cursor.tableName}", which is not in the export registry; restarted the metadata phase`,
      );
      cursor.lastId = 0;
    } else {
      startTableIndex = found;
    }
  }

  if ((cursor.phase ?? 'metadata') === 'metadata') {
    for (let i = startTableIndex; i < EXPORT_TABLES.length; i += 1) {
      const spec = EXPORT_TABLES[i]!;
      const resumingThisTable = cursor.tableName === spec.tableName;

      const startAfterId = resumingThisTable ? (cursor.lastId ?? 0) : 0;

      try {
        const { csv, rowCount, lastId, complete } = await buildTableCsv(
          scoped,
          spec,
          startAfterId,
          { outOfTime, maxBytes: MAX_PART_BYTES },
        );

        // A table too large for one invocation is emitted as several entries.
        // The first keeps the plain name and carries the header; continuations
        // are suffixed and header-less, so concatenating them in volume order
        // reproduces one valid CSV. Distinct names matter: two chunks can land
        // in the SAME volume when the byte bound rather than the deadline ends
        // them, and `startPart()` wires `archive.on('warning', reject)` — a
        // duplicate entry name would reject the whole run.
        const entryName = startAfterId === 0 ? spec.file : chunkName(spec.file, partIndex);
        builder.archive.append(csv, { name: entryName });
        builder.entries += 1;
        builder.queuedBytes += Buffer.byteLength(csv);

        const prior = (manifest.tables ?? []).find((t) => t.name === spec.tableName);
        manifest.tables = (manifest.tables ?? []).filter((t) => t.name !== spec.tableName);
        manifest.tables.push({
          name: spec.tableName,
          file: spec.file,
          // Cumulative across chunks — a resumed chunk only counts its own rows.
          rowCount: (prior?.rowCount ?? 0) + rowCount,
          complete,
          files: [...(prior?.files ?? [spec.file]), ...(startAfterId === 0 ? [] : [entryName])],
        });

        if (!complete) {
          // Stay on THIS table and remember where inside it we stopped. Without
          // this the loop advanced past a table it had only partly read.
          cursor.phase = 'metadata';
          cursor.tableName = spec.tableName;
          cursor.lastId = lastId;
          await flushPart();
          await saveJobProgress(job.id, cursor, manifest, now);
          return {
            status: 'yielded',
            partsWritten,
            bytesWritten,
            ...cumulative(),
            warnings: manifest.warnings?.length ?? 0,
            manifest,
          };
        }
      } catch (error) {
        // A table that cannot be read must NOT abort the whole export — the
        // other twenty tables are still the association's records.
        pushWarning(
          manifest,
          'TABLE_READ_FAILED',
          `${spec.tableName}: ${error instanceof Error ? error.message : String(error)}`,
        );
        manifest.tables = manifest.tables ?? [];
        manifest.tables.push({ name: spec.tableName, file: spec.file, rowCount: 0, complete: false });
      }

      cursor.tableName = EXPORT_TABLES[i + 1]?.tableName;
      cursor.lastId = 0;

      if (builder.queuedBytes >= MAX_PART_BYTES) await flushPart();
      if (outOfTime()) {
        cursor.phase = 'metadata';
        // cursor.partIndex is set by flushPart, AFTER the index it wrote.
        await flushPart();
        await saveJobProgress(job.id, cursor, manifest, now);
        return {
          status: 'yielded',
          partsWritten,
          bytesWritten,
          ...cumulative(),
          warnings: manifest.warnings?.length ?? 0,
          manifest,
        };
      }
    }

    builder.archive.append(buildReadme(manifest), { name: 'README.txt' });
    builder.entries += 1;
    cursor.phase = job.includeDocumentFiles ? 'documents' : 'finalize';
    cursor.tableName = undefined;
    cursor.lastId = 0;
  }

  // ── Phase: document bytes ─────────────────────────────────────────────────
  if (cursor.phase === 'documents') {
    let lastId = cursor.lastId ?? 0;

    for (;;) {
      const rows = (await scoped
        .selectFrom(
          documentsTable,
          {
            id: documentsTable.id,
            filePath: documentsTable.filePath,
            fileName: documentsTable.fileName,
          },
          gt(documentsTable.id, lastId),
        )
        .orderBy(asc(documentsTable.id))
        .limit(ROW_PAGE_SIZE)) as unknown as Array<{
        id: number;
        filePath: string | null;
        fileName: string | null;
      }>;

      if (rows.length === 0) break;

      for (const row of rows) {
        lastId = row.id;
        manifest.documents = manifest.documents ?? { expected: 0, included: 0, bytes: 0 };
        manifest.documents.expected += 1;

        if (!row.filePath) {
          pushWarning(manifest, 'DOCUMENT_NO_FILE_PATH', `document ${row.id} has no file path`, row.id);
          continue;
        }

        let unknownSize = false;
        try {
          const { stream, contentLength } = await openStorageObjectStream(
            DOCUMENTS_BUCKET,
            row.filePath,
          );
          const name = `documents/${row.id}-${safeEntryName(row.fileName ?? row.filePath, `document-${row.id}`)}`;
          builder.archive.append(stream, { name });
          builder.entries += 1;
          // Counted at APPEND time from the length the storage response
          // advertised — see PartBuilder.queuedBytes for why the drained
          // counter cannot bound this loop.
          if (typeof contentLength === 'number') {
            builder.queuedBytes += contentLength;
            manifest.documents.bytes += contentLength;
          } else {
            // No content-length header. Any assumed size is a guess that a large
            // file still blows past, so flush right after this one instead: the
            // volume then holds at most a single unmeasured document beyond the
            // ceiling, which is a bound rather than a hope.
            unknownSize = true;
          }
          manifest.documents.included += 1;
        } catch (error) {
          // Per-file, deliberately. A single missing object must never fail an
          // entire statutory export.
          pushWarning(
            manifest,
            'DOCUMENT_FILE_MISSING',
            `document ${row.id}: ${error instanceof Error ? error.message : String(error)}`,
            row.id,
          );
        }

        if (unknownSize || builder.queuedBytes >= MAX_PART_BYTES) {
          cursor.lastId = lastId;
          await flushPart();
        }

        if (outOfTime()) {
          cursor.phase = 'documents';
          cursor.lastId = lastId;
          await flushPart();
          await saveJobProgress(job.id, cursor, manifest, now);
          return {
          status: 'yielded',
          partsWritten,
          bytesWritten,
          ...cumulative(),
          warnings: manifest.warnings?.length ?? 0,
          manifest,
        };
        }
      }

      if (rows.length < ROW_PAGE_SIZE) break;
    }

    cursor.phase = 'finalize';
    cursor.lastId = 0;
  }

  // ── Phase: finalize ───────────────────────────────────────────────────────
  builder.archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
  builder.entries += 1;
  await flushPart();

  return {
    status: 'completed',
    partsWritten,
    bytesWritten,
    ...cumulative(),
    warnings: manifest.warnings?.length ?? 0,
    manifest,
  };
}

/**
 * Read one table via keyset pagination and render it as CSV, BOUNDED.
 *
 * Keyset, not offset, and no `.limit(N)` cap: the legacy synchronous export
 * capped every table at 10,000 rows and reported a boolean `truncated` flag that
 * nothing surfaced to the user. That is the silent-truncation failure this whole
 * feature exists to fix — so this does not truncate. It STOPS, and says where.
 *
 * The bound is why. This used to read to exhaustion with no deadline check, and
 * `outOfTime()` was only consulted BETWEEN tables. One table larger than the
 * invocation budget therefore hard-killed the function every time: the platform
 * kill never reaches `markJobFailed`, which is the only place `maxAttempts` is
 * consulted, so the job was re-claimed on every tick forever. Checking after
 * each page turns that into an ordinary yield-and-resume.
 *
 * Returns `complete: false` with the resume point when it stopped early. The
 * caller keeps `cursor.tableName` on this table and passes `lastId` back as
 * `startAfterId` on the next tick.
 *
 * The header is emitted ONLY for the first chunk (`startAfterId === 0`), so
 * concatenating the chunks in order yields one valid CSV rather than one with a
 * header line buried in the middle.
 */
// Exported for tests. The header-only-on-first-chunk rule and the deadline bound
// are the two properties fix F-07/2 turns on, and asserting them through a
// finished zip would mean inflating a deflate stream to read a CSV — archaeology
// that obscures what is being claimed.
export async function buildTableCsv(
  scoped: ReturnType<typeof createScopedClient>,
  spec: ExportTableSpec,
  startAfterId: number,
  opts: { outOfTime: () => boolean; maxBytes: number },
): Promise<{ csv: string; rowCount: number; lastId: number; complete: boolean }> {
  const projection: Record<string, unknown> = {};
  for (const c of spec.columns) projection[c.key] = c.column;

  const idColumn = (spec.table as unknown as Record<string, unknown>).id;
  const lines: string[] = startAfterId === 0 ? [generateCSVHeaderLine(spec.columns)] : [];
  let lastId = startAfterId;
  let rowCount = 0;
  let bytes = 0;
  let complete = true;

  for (;;) {
    const rows = (await scoped
      .selectFrom(spec.table, projection, gt(idColumn as never, lastId))
      .orderBy(asc(idColumn as never))
      .limit(ROW_PAGE_SIZE)) as unknown as Array<Record<string, unknown>>;

    if (rows.length === 0) break;

    for (const row of rows) {
      const line = generateCSVRowLine(spec.columns, row);
      lines.push(line);
      bytes += Buffer.byteLength(line) + 2; // + CRLF
      const id = row.id;
      if (typeof id === 'number') lastId = id;
      rowCount += 1;
    }

    if (rows.length < ROW_PAGE_SIZE) break;

    // Checked per PAGE, not per row: `Date.now()` per row on a million-row table
    // is its own cost, and a page is already a bounded amount of work.
    if (opts.outOfTime() || bytes >= opts.maxBytes) {
      complete = false;
      break;
    }
  }

  return { csv: lines.join('\r\n') + '\r\n', rowCount, lastId, complete };
}

/** Plain-English orientation for whoever opens the archive. */
function buildReadme(manifest: ExportJobManifest): string {
  const lines = [
    'PropertyPro — Community Data Export',
    '===================================',
    '',
    'This archive contains your association\'s records as held by PropertyPro.',
    '',
    'WHAT IS HERE',
    '  data/          One CSV per record type. Column headers are human-readable.',
    '                 A very large table is split across volumes: look for',
    '                 <name>.csv plus <name>.part-NNN.csv. Only the first',
    '                 carries the header row, so concatenating them in volume',
    '                 order gives you one valid CSV. manifest.json lists every',
    '                 file each table produced.',
    '  documents/     The actual uploaded files, named <document id>-<file name>.',
    '                 Match them to rows in data/documents.csv using the ID column.',
    '  manifest.json  Machine-readable inventory, including anything skipped.',
    '',
    'DELETED RECORDS',
    '  Rows that were deleted in the app are INCLUDED, with a "Deleted At" value.',
    '  A deleted record can still be an official association record, so removing',
    '  them would make this something other than your complete record set.',
    '',
    'WHAT IS NOT HERE',
    '  Election ballots and poll votes are excluded to preserve ballot secrecy.',
    '  Invitation tokens, OAuth credentials and PropertyPro-internal operational',
    '  logs are excluded. See manifest.json for anything skipped unexpectedly.',
    '',
    'This export is provided as a convenience. PropertyPro is not a law firm and',
    'does not provide legal advice; your association remains responsible for its',
    'own record-keeping obligations.',
    '',
  ];

  const warnings = manifest.warnings ?? [];
  if (warnings.length > 0) {
    lines.push(`WARNINGS (${warnings.length}) — see manifest.json for the full list`);
    for (const w of warnings.slice(0, 20)) lines.push(`  [${w.code}] ${w.detail}`);
    lines.push('');
  }

  return lines.join('\n');
}
