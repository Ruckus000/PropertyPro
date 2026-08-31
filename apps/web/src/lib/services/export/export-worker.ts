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
  partsWritten: number;
  bytesWritten: number;
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
  bytes: number;
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
    if (builder.entries === 0) return;
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
    manifest.parts = manifest.parts ?? [];
    manifest.parts.push({ index: partIndex, file: path, bytes: buffer.length });
    partsWritten += 1;
    bytesWritten += buffer.length;
    partIndex += 1;
    builder = startPart();
  };

  // ── Phase: metadata ───────────────────────────────────────────────────────
  const startTableIndex = cursor.tableName
    ? Math.max(0, EXPORT_TABLES.findIndex((t) => t.tableName === cursor.tableName))
    : 0;

  if ((cursor.phase ?? 'metadata') === 'metadata') {
    for (let i = startTableIndex; i < EXPORT_TABLES.length; i += 1) {
      const spec = EXPORT_TABLES[i]!;
      const resumingThisTable = cursor.tableName === spec.tableName;

      try {
        const { csv, rowCount } = await buildTableCsv(
          scoped,
          spec,
          resumingThisTable ? (cursor.lastId ?? 0) : 0,
        );
        builder.archive.append(csv, { name: spec.file });
        builder.entries += 1;
        manifest.tables = (manifest.tables ?? []).filter((t) => t.name !== spec.tableName);
        manifest.tables.push({ name: spec.tableName, file: spec.file, rowCount, complete: true });
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

      if (builder.bytes >= MAX_PART_BYTES) await flushPart();
      if (outOfTime()) {
        cursor.phase = 'metadata';
        cursor.partIndex = partIndex;
        await flushPart();
        await saveJobProgress(job.id, cursor, manifest, now);
        return {
          status: 'yielded',
          partsWritten,
          bytesWritten,
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

        try {
          const { stream } = await openStorageObjectStream(DOCUMENTS_BUCKET, row.filePath);
          const name = `documents/${row.id}-${safeEntryName(row.fileName ?? row.filePath, `document-${row.id}`)}`;
          builder.archive.append(stream, { name });
          builder.entries += 1;
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

        if (builder.bytes >= MAX_PART_BYTES) {
          cursor.lastId = lastId;
          cursor.partIndex = partIndex;
          await flushPart();
        }

        if (outOfTime()) {
          cursor.phase = 'documents';
          cursor.lastId = lastId;
          cursor.partIndex = partIndex;
          await flushPart();
          await saveJobProgress(job.id, cursor, manifest, now);
          return {
          status: 'yielded',
          partsWritten,
          bytesWritten,
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
    warnings: manifest.warnings?.length ?? 0,
    manifest,
  };
}

/**
 * Read one table to exhaustion via keyset pagination and render it as CSV.
 *
 * Keyset, not offset, and no `.limit(N)` cap: the legacy synchronous export
 * capped every table at 10,000 rows and reported a boolean `truncated` flag that
 * nothing surfaced to the user. That is the silent-truncation failure this whole
 * feature exists to fix.
 */
async function buildTableCsv(
  scoped: ReturnType<typeof createScopedClient>,
  spec: ExportTableSpec,
  startAfterId: number,
): Promise<{ csv: string; rowCount: number }> {
  const projection: Record<string, unknown> = {};
  for (const c of spec.columns) projection[c.key] = c.column;

  const idColumn = (spec.table as unknown as Record<string, unknown>).id;
  const lines: string[] = [generateCSVHeaderLine(spec.columns)];
  let lastId = startAfterId;
  let rowCount = 0;

  for (;;) {
    const rows = (await scoped
      .selectFrom(spec.table, projection, gt(idColumn as never, lastId))
      .orderBy(asc(idColumn as never))
      .limit(ROW_PAGE_SIZE)) as unknown as Array<Record<string, unknown>>;

    if (rows.length === 0) break;

    for (const row of rows) {
      lines.push(generateCSVRowLine(spec.columns, row));
      const id = row.id;
      if (typeof id === 'number') lastId = id;
      rowCount += 1;
    }

    if (rows.length < ROW_PAGE_SIZE) break;
  }

  return { csv: lines.join('\r\n') + '\r\n', rowCount };
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
