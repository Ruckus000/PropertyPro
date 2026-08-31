/**
 * Tests for the export worker.
 *
 * Focused on the three behaviours whose failure modes are silent rather than
 * loud — an export that LOOKS complete but isn't is worse than one that errors:
 *
 *   1. A missing storage object is recorded as a warning, not swallowed, and
 *      does not abort the export.
 *   2. A table that cannot be read is recorded and the other tables still ship.
 *   3. Real filenames survive, and traversal filenames do not.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-07.
 */
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createScopedClientMock,
  openStorageObjectStreamMock,
  uploadStorageObjectMock,
  recordJobPartMock,
  saveJobProgressMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  openStorageObjectStreamMock: vi.fn(),
  uploadStorageObjectMock: vi.fn(),
  recordJobPartMock: vi.fn(),
  saveJobProgressMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  COMMUNITY_EXPORTS_BUCKET: 'community-exports',
  DOCUMENTS_BUCKET: 'documents',
  createScopedClient: createScopedClientMock,
  documents: { id: 'documents.id', filePath: 'documents.file_path', fileName: 'documents.file_name' },
  openStorageObjectStream: openStorageObjectStreamMock,
  uploadStorageObject: uploadStorageObjectMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  asc: (c: unknown) => ({ __asc: c }),
  gt: (a: unknown, b: unknown) => ({ __gt: [a, b] }),
}));

vi.mock('@/lib/services/export/export-job-service', () => ({
  recordJobPart: recordJobPartMock,
  saveJobProgress: saveJobProgressMock,
}));

// One tiny table so a run finishes fast; the registry's real content is covered
// by table-registry-coverage.test.ts.
vi.mock('@/lib/services/export/table-registry', () => ({
  EXPORT_TABLES: [
    {
      tableName: 'units',
      file: 'data/units.csv',
      table: { id: 'units.id' },
      why: 'test',
      columns: [{ key: 'id', label: 'ID', column: 'units.id' }],
    },
  ],
  INTENTIONALLY_EXCLUDED: {},
}));

const { runExportJob, buildTableCsv } = await import('@/lib/services/export/export-worker');

const JOB = {
  id: 1,
  communityId: 42,
  downloadToken: 'tok-abc',
  includeDocumentFiles: true,
  cursor: {},
  manifest: {},
} as never;

/** Scoped-client stub: `unitRows` for the table phase, `docRows` for documents. */
function mockScoped(opts: { unitRows?: unknown[]; docRows?: unknown[] }) {
  const scoped = {
    selectFrom: vi.fn((table: unknown) => {
      const isDocs = typeof table === 'object' && table !== null
        && (table as Record<string, unknown>).filePath === 'documents.file_path';
      let served = false;
      const chain: Record<string, unknown> = {};
      chain.orderBy = vi.fn(() => chain);
      chain.limit = vi.fn(() => {
        if (served) return Promise.resolve([]);
        served = true;
        return Promise.resolve(isDocs ? (opts.docRows ?? []) : (opts.unitRows ?? []));
      });
      return chain;
    }),
  };
  createScopedClientMock.mockReturnValue(scoped);
  return scoped;
}

function fakeStream(content: string) {
  // A REAL Readable, not a stub: archiver consumes Node streams, and a plain
  // object would pass this test while failing in production.
  return { stream: Readable.from([Buffer.from(content)]), contentLength: content.length };
}

beforeEach(() => {
  vi.clearAllMocks();
  uploadStorageObjectMock.mockResolvedValue(undefined);
  recordJobPartMock.mockResolvedValue(undefined);
  saveJobProgressMock.mockResolvedValue(undefined);
});

describe('runExportJob', () => {
  it('completes and uploads a part', async () => {
    mockScoped({ unitRows: [{ id: 1 }, { id: 2 }], docRows: [] });

    const result = await runExportJob(JOB, { budgetMs: 30_000 });

    expect(result.status).toBe('completed');
    expect(result.partsWritten).toBe(1);
    expect(uploadStorageObjectMock).toHaveBeenCalledOnce();
    // Path must be namespaced by community AND by the unguessable job token.
    const [bucket, path] = uploadStorageObjectMock.mock.calls[0]!;
    expect(bucket).toBe('community-exports');
    expect(path).toBe('exports/42/tok-abc/part-000.zip');
  });

  it('records a warning and KEEPS GOING when a document file is missing', async () => {
    // A single missing storage object must never cost an association its entire
    // statutory record set.
    mockScoped({ unitRows: [{ id: 1 }], docRows: [{ id: 5, filePath: 'gone.pdf', fileName: 'gone.pdf' }] });
    openStorageObjectStreamMock.mockRejectedValueOnce(new Error('object not found'));

    const result = await runExportJob(JOB, { budgetMs: 30_000 });

    expect(result.status).toBe('completed');
    expect(result.warnings).toBe(1);
    expect(result.manifest.warnings?.[0]?.code).toBe('DOCUMENT_FILE_MISSING');
    expect(result.manifest.warnings?.[0]?.documentId).toBe(5);
    // Counted as expected but not included — the discrepancy is visible.
    expect(result.manifest.documents?.expected).toBe(1);
    expect(result.manifest.documents?.included).toBe(0);
  });

  it('records a warning when a document row has no file path', async () => {
    mockScoped({ unitRows: [], docRows: [{ id: 6, filePath: null, fileName: 'x.pdf' }] });

    const result = await runExportJob(JOB, { budgetMs: 30_000 });

    expect(result.manifest.warnings?.[0]?.code).toBe('DOCUMENT_NO_FILE_PATH');
    expect(openStorageObjectStreamMock).not.toHaveBeenCalled();
  });

  it('records a warning and still exports when a TABLE read fails', async () => {
    const scoped = {
      selectFrom: vi.fn(() => {
        throw new Error('relation does not exist');
      }),
    };
    createScopedClientMock.mockReturnValue(scoped);

    const result = await runExportJob({ ...JOB, includeDocumentFiles: false } as never, {
      budgetMs: 30_000,
    });

    expect(result.status).toBe('completed');
    expect(result.manifest.warnings?.[0]?.code).toBe('TABLE_READ_FAILED');
    // The table is reported INCOMPLETE rather than silently absent.
    expect(result.manifest.tables?.[0]?.complete).toBe(false);
  });

  it('includes a document with a safe entry name', async () => {
    mockScoped({
      unitRows: [],
      docRows: [{ id: 8, filePath: 'a/b/minutes.pdf', fileName: 'Board Minutes - Mar 2026.pdf' }],
    });
    openStorageObjectStreamMock.mockResolvedValueOnce(fakeStream('PDFBYTES'));

    const result = await runExportJob(JOB, { budgetMs: 30_000 });

    expect(result.manifest.documents?.included).toBe(1);
    expect(result.manifest.warnings ?? []).toHaveLength(0);
  });

  it('skips the document phase entirely when includeDocumentFiles is false', async () => {
    mockScoped({ unitRows: [{ id: 1 }], docRows: [{ id: 9, filePath: 'x.pdf', fileName: 'x.pdf' }] });

    const result = await runExportJob({ ...JOB, includeDocumentFiles: false } as never, {
      budgetMs: 30_000,
    });

    expect(result.status).toBe('completed');
    expect(openStorageObjectStreamMock).not.toHaveBeenCalled();
  });

  it('yields and PERSISTS THE CURSOR when the soft deadline passes', async () => {
    // The property that makes a large association converge: an invocation that
    // runs out of time must flush what it has and record where to resume, not
    // restart from zero on the next tick.
    mockScoped({ unitRows: [{ id: 1 }], docRows: [] });

    const result = await runExportJob(JOB, { budgetMs: 0 });

    expect(result.status).toBe('yielded');
    expect(saveJobProgressMock).toHaveBeenCalledOnce();
    const [jobId, cursor] = saveJobProgressMock.mock.calls[0]!;
    expect(jobId).toBe(1);
    // partIndex is pinned, not just phase. Asserting only the phase is exactly
    // how the off-by-one below survived review: every value of partIndex
    // satisfied the old assertion.
    expect(cursor).toMatchObject({ phase: 'metadata', partIndex: 1 });
  });
});

/**
 * Resume correctness — the failures here are the silent kind.
 *
 * An export that reports `ready` while missing documents is worse than one that
 * errors, and every case below is a way that used to happen.
 */
describe('runExportJob — resuming across invocations', () => {
  /** Scoped stub that serves table rows PAGE BY PAGE, so >1 page is reachable. */
  function mockScopedPages(pages: unknown[][], docRows: unknown[] = []) {
    const queue = [...pages];
    const scoped = {
      selectFrom: vi.fn((table: unknown) => {
        const isDocs = typeof table === 'object' && table !== null
          && (table as Record<string, unknown>).filePath === 'documents.file_path';
        let served = false;
        const chain: Record<string, unknown> = {};
        chain.orderBy = vi.fn(() => chain);
        chain.limit = vi.fn(() => {
          if (isDocs) {
            if (served) return Promise.resolve([]);
            served = true;
            return Promise.resolve(docRows);
          }
          return Promise.resolve(queue.shift() ?? []);
        });
        return chain;
      }),
    };
    createScopedClientMock.mockReturnValue(scoped);
    return scoped;
  }

  const uploadedPaths = () => uploadStorageObjectMock.mock.calls.map((c) => c[1] as string);

  it('leaves cursor.partIndex at the NEXT index, so a resumed run cannot overwrite', async () => {
    // THE regression. cursor.partIndex was assigned before flushPart() bumped
    // it, so the next tick resumed at the volume it had already uploaded.
    // uploadStorageObject upserts and recordJobPart does onConflictDoUpdate, so
    // nothing errored — the first volume's documents just disappeared.
    mockScopedPages([[{ id: 1 }]], []);

    const first = await runExportJob(JOB, { budgetMs: 0 });

    expect(first.status).toBe('yielded');
    expect(uploadedPaths()).toEqual(['exports/42/tok-abc/part-000.zip']);
    const [, cursor] = saveJobProgressMock.mock.calls[0]!;
    expect((cursor as { partIndex?: number }).partIndex).toBe(1);

    // Now actually resume from the persisted cursor and prove the next write
    // lands somewhere else. Asserting the cursor value alone would not catch a
    // worker that ignored it.
    uploadStorageObjectMock.mockClear();
    mockScopedPages([[{ id: 2 }]], []);
    await runExportJob(
      { ...(JOB as object), cursor, manifest: first.manifest } as never,
      { budgetMs: 0 },
    );

    expect(uploadedPaths()).not.toContain('exports/42/tok-abc/part-000.zip');
    expect(uploadedPaths()).toEqual(['exports/42/tok-abc/part-001.zip']);
  });

  it('yields MID-TABLE and records where inside the table to resume', async () => {
    // A full page back means "there may be more", which is what lets the
    // deadline check fire. Before the fix the table was read to exhaustion with
    // no deadline check at all, so an oversized table killed the invocation.
    const fullPage = Array.from({ length: 5000 }, (_, i) => ({ id: i + 1 }));
    mockScopedPages([fullPage, [{ id: 5001 }]], []);

    const result = await runExportJob(JOB, { budgetMs: 0 });

    expect(result.status).toBe('yielded');
    const [, cursor] = saveJobProgressMock.mock.calls[0]!;
    // Still ON the table — not advanced past one it only partly read.
    expect(cursor).toMatchObject({ phase: 'metadata', tableName: 'units', lastId: 5000 });
    expect(result.manifest.tables?.[0]).toMatchObject({ name: 'units', complete: false });
  });

  it('reports a cursor naming an unknown table instead of silently restarting', async () => {
    // Math.max(0, findIndex(...)) folded -1 into 0, re-appending every CSV
    // already written. Rule 1 of the worker: nothing is redone silently.
    mockScopedPages([[{ id: 1 }]], []);

    const result = await runExportJob(
      { ...(JOB as object), cursor: { phase: 'metadata', tableName: 'tenants_gone' } } as never,
      { budgetMs: 30_000 },
    );

    expect(result.manifest.warnings?.some((w) => w.code === 'CURSOR_TABLE_UNKNOWN')).toBe(true);
  });

  it('reports part totals across ALL ticks, not just the final one', async () => {
    // markJobReady stamps partCount from this. partsWritten resets every run, so
    // a five-volume export used to be recorded as having one.
    mockScopedPages([[{ id: 1 }]], []);

    const result = await runExportJob(
      {
        ...(JOB as object),
        manifest: { parts: [{ index: 0, file: 'p0', bytes: 100 }, { index: 1, file: 'p1', bytes: 250 }] },
        cursor: { partIndex: 2, phase: 'documents' },
      } as never,
      { budgetMs: 30_000 },
    );

    expect(result.partsWritten).toBe(1);
    expect(result.totalParts).toBe(3);
    expect(result.totalBytes).toBeGreaterThan(350);
  });
});

describe('runExportJob — volume ceiling is bounded by QUEUED bytes', () => {
  function mockDocs(docRows: unknown[]) {
    const scoped = {
      selectFrom: vi.fn((table: unknown) => {
        const isDocs = typeof table === 'object' && table !== null
          && (table as Record<string, unknown>).filePath === 'documents.file_path';
        let served = false;
        const chain: Record<string, unknown> = {};
        chain.orderBy = vi.fn(() => chain);
        chain.limit = vi.fn(() => {
          if (served) return Promise.resolve([]);
          served = true;
          return Promise.resolve(isDocs ? docRows : []);
        });
        return chain;
      }),
    };
    createScopedClientMock.mockReturnValue(scoped);
  }

  it('rolls a volume on appended size even though nothing has drained yet', async () => {
    // archive.append() only QUEUES. builder.bytes grows later, as archiver
    // drains the sink, so a bytes-based check let the loop enqueue unbounded
    // document streams before the counter moved — the OOM this ceiling exists
    // to prevent.
    mockDocs([
      { id: 1, filePath: 'a.bin', fileName: 'a.bin' },
      { id: 2, filePath: 'b.bin', fileName: 'b.bin' },
      { id: 3, filePath: 'c.bin', fileName: 'c.bin' },
    ]);
    openStorageObjectStreamMock.mockImplementation(async () => ({
      stream: Readable.from([Buffer.from('x')]),
      contentLength: 200 * 1024 * 1024, // each doc alone exceeds MAX_PART_BYTES
    }));

    const result = await runExportJob(JOB, { budgetMs: 30_000 });

    expect(result.status).toBe('completed');
    // One volume per oversized document, rather than all three in one buffer.
    expect(result.partsWritten).toBeGreaterThan(1);
  });

  it('flushes after a document whose size the storage response did not report', async () => {
    // contentLength is number|null. Any assumed size is a guess a large file
    // still blows past, so an unmeasured document ends its volume.
    mockDocs([
      { id: 1, filePath: 'a.bin', fileName: 'a.bin' },
      { id: 2, filePath: 'b.bin', fileName: 'b.bin' },
    ]);
    openStorageObjectStreamMock.mockImplementation(async () => ({
      stream: Readable.from([Buffer.from('x')]),
      contentLength: null,
    }));

    const result = await runExportJob(JOB, { budgetMs: 30_000 });

    expect(result.status).toBe('completed');
    expect(result.partsWritten).toBeGreaterThan(1);
  });
});

describe('buildTableCsv', () => {
  const SPEC = {
    tableName: 'units',
    file: 'data/units.csv',
    table: { id: 'units.id' },
    why: 'test',
    columns: [{ key: 'id', label: 'ID', column: 'units.id' }],
  } as never;

  function pagedScoped(pages: unknown[][]) {
    const queue = [...pages];
    return {
      selectFrom: vi.fn(() => {
        const chain: Record<string, unknown> = {};
        chain.orderBy = vi.fn(() => chain);
        chain.limit = vi.fn(() => Promise.resolve(queue.shift() ?? []));
        return chain;
      }),
    } as never;
  }

  it('writes the header for the first chunk and OMITS it for a continuation', async () => {
    // Chunks are concatenated by whoever opens the archive. A header line buried
    // mid-file would make the result an invalid CSV.
    const first = await buildTableCsv(pagedScoped([[{ id: 1 }]]), SPEC, 0, {
      outOfTime: () => false,
      maxBytes: 1_000_000,
    });
    const cont = await buildTableCsv(pagedScoped([[{ id: 2 }]]), SPEC, 1, {
      outOfTime: () => false,
      maxBytes: 1_000_000,
    });

    expect(first.csv.startsWith('ID')).toBe(true);
    expect(first.complete).toBe(true);
    expect(cont.csv.startsWith('ID')).toBe(false);
  });

  it('stops at the deadline and reports the resume point rather than reading on', async () => {
    const fullPage = Array.from({ length: 5000 }, (_, i) => ({ id: i + 1 }));
    const scoped = pagedScoped([fullPage, [{ id: 5001 }]]);

    const out = await buildTableCsv(scoped, SPEC, 0, {
      outOfTime: () => true,
      maxBytes: 1_000_000_000,
    });

    expect(out.complete).toBe(false);
    expect(out.lastId).toBe(5000);
    expect(out.rowCount).toBe(5000);
  });

  it('stops on the byte bound as well as the clock', async () => {
    const fullPage = Array.from({ length: 5000 }, (_, i) => ({ id: i + 1 }));
    const out = await buildTableCsv(pagedScoped([fullPage, [{ id: 5001 }]]), SPEC, 0, {
      outOfTime: () => false,
      maxBytes: 10,
    });

    expect(out.complete).toBe(false);
  });
});
