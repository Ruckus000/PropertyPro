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

const { runExportJob } = await import('@/lib/services/export/export-worker');

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
    expect(cursor).toMatchObject({ phase: 'metadata' });
  });
});
