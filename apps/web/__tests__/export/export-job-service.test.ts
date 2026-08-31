/**
 * Tests for the export job queue.
 *
 * The two properties worth pinning are the ones whose failures are SILENT:
 * queueing a duplicate full-dataset export, and two cron ticks working the same
 * job at once. Neither would throw; both would just quietly do the wrong thing.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-07.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createUnscopedClientMock,
  logAuditEventMock,
  tables,
} = vi.hoisted(() => ({
  createUnscopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  tables: {
    communityExportJobs: {
      id: 'jobs.id',
      communityId: 'jobs.community_id',
      status: 'jobs.status',
      queuedAt: 'jobs.queued_at',
      leaseExpiresAt: 'jobs.lease_expires_at',
      attemptCount: 'jobs.attempt_count',
      startedAt: 'jobs.started_at',
      deletedAt: 'jobs.deleted_at',
      expiresAt: 'jobs.expires_at',
      downloadToken: 'jobs.download_token',
    },
    communityExportJobParts: {
      id: 'parts.id',
      jobId: 'parts.job_id',
      partIndex: 'parts.part_index',
      communityId: 'parts.community_id',
      deletedAt: 'parts.deleted_at',
    },
  },
}));

vi.mock('@propertypro/db', () => ({
  communityExportJobs: tables.communityExportJobs,
  communityExportJobParts: tables.communityExportJobParts,
  logAuditEvent: logAuditEventMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...c: unknown[]) => ({ __and: c }),
  asc: (c: unknown) => ({ __asc: c }),
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
  inArray: (a: unknown, b: unknown) => ({ __inArray: [a, b] }),
  isNull: (a: unknown) => ({ __isNull: a }),
  lt: (a: unknown, b: unknown) => ({ __lt: [a, b] }),
  or: (...c: unknown[]) => ({ __or: c }),
  sql: Object.assign((s: unknown) => ({ __sql: s }), { raw: (s: unknown) => ({ __sql: s }) }),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

const {
  claimNextExportJob,
  queueExportJob,
} = await import('@/lib/services/export/export-job-service');

/**
 * Minimal chainable drizzle stub. `selectResults` and `updateReturning` are
 * consumed in order, which is what lets a test express "the SELECT saw a
 * claimable job, but the UPDATE lost the race".
 */
function buildDb(opts: {
  selectResults?: unknown[][];
  insertReturning?: unknown[][];
  updateReturning?: unknown[][];
  insertThrows?: Error;
}) {
  const selects = [...(opts.selectResults ?? [])];
  const inserts = [...(opts.insertReturning ?? [])];
  const updates = [...(opts.updateReturning ?? [])];

  const db = {
    select: vi.fn(() => {
      const rows = selects.shift() ?? [];
      const chain: Record<string, unknown> = {};
      for (const m of ['from', 'where', 'orderBy']) {
        chain[m] = vi.fn(() => chain);
      }
      chain.limit = vi.fn(() => Promise.resolve(rows));
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve(rows).then(res);
      return chain;
    }),
    insert: vi.fn(() => ({
      values: vi.fn(() => {
        if (opts.insertThrows) throw opts.insertThrows;
        return {
          returning: vi.fn(() => Promise.resolve(inserts.shift() ?? [])),
          onConflictDoUpdate: vi.fn(() => Promise.resolve([])),
        };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => {
          const rows = updates.shift() ?? [];
          const chain: Record<string, unknown> = {
            returning: vi.fn(() => Promise.resolve(rows)),
          };
          chain.then = (res: (v: unknown) => unknown) => Promise.resolve(rows).then(res);
          return chain;
        }),
      })),
    })),
  };
  return db;
}

beforeEach(() => {
  vi.clearAllMocks();
  logAuditEventMock.mockResolvedValue(undefined);
});

describe('queueExportJob', () => {
  it('returns the existing in-flight job instead of queueing a second one', async () => {
    const existing = { id: 7, communityId: 42, status: 'running' };
    const db = buildDb({ selectResults: [[existing]] });
    createUnscopedClientMock.mockReturnValue(db);

    const result = await queueExportJob({ communityId: 42, requestedBy: 'u1' });

    expect(result.deduplicated).toBe(true);
    expect(result.job).toEqual(existing);
    // The whole point: a second full-dataset export was NOT created.
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('creates a job when none is in flight, and audits it', async () => {
    const created = { id: 9, communityId: 42, status: 'queued', includeDocumentFiles: true };
    const db = buildDb({ selectResults: [[]], insertReturning: [[created]] });
    createUnscopedClientMock.mockReturnValue(db);

    const result = await queueExportJob({ communityId: 42, requestedBy: 'u1' });

    expect(result.deduplicated).toBe(false);
    expect(result.job).toEqual(created);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ resourceType: 'community_export_job', communityId: 42 }),
    );
  });

  it('recovers when it LOSES the unique-index race', async () => {
    // Two concurrent requests can both pass the pre-check SELECT — the partial
    // unique index is the real guard, so the insert is allowed to fail and we
    // re-read rather than surfacing a constraint error to a board member.
    const winner = { id: 11, communityId: 42, status: 'queued' };
    const db = buildDb({
      selectResults: [[], [winner]],
      insertThrows: new Error('duplicate key value violates unique constraint'),
    });
    createUnscopedClientMock.mockReturnValue(db);

    const result = await queueExportJob({ communityId: 42, requestedBy: 'u1' });

    expect(result.deduplicated).toBe(true);
    expect(result.job).toEqual(winner);
  });

  it('rethrows an insert error that is NOT a lost race', async () => {
    // If no job exists after the failure, the error was real — swallowing it
    // would leave the caller believing an export was queued.
    const db = buildDb({ selectResults: [[], []], insertThrows: new Error('connection lost') });
    createUnscopedClientMock.mockReturnValue(db);

    await expect(queueExportJob({ communityId: 42, requestedBy: 'u1' })).rejects.toThrow(
      'connection lost',
    );
  });
});

describe('claimNextExportJob', () => {
  it('returns the job when the guarded UPDATE wins', async () => {
    const claimed = { id: 3, communityId: 42, status: 'running' };
    const db = buildDb({ selectResults: [[{ id: 3 }]], updateReturning: [[claimed]] });
    createUnscopedClientMock.mockReturnValue(db);

    expect(await claimNextExportJob('worker-1')).toEqual(claimed);
  });

  it('returns null when another tick claimed the job first', async () => {
    // The SELECT saw a claimable job; the state-guarded UPDATE matched no row
    // because a concurrent worker moved its lease. Exactly one tick may win.
    const db = buildDb({ selectResults: [[{ id: 3 }]], updateReturning: [[]] });
    createUnscopedClientMock.mockReturnValue(db);

    expect(await claimNextExportJob('worker-2')).toBeNull();
  });

  it('falls through to the next candidate after losing one', async () => {
    const second = { id: 5, communityId: 42, status: 'running' };
    const db = buildDb({
      selectResults: [[{ id: 3 }, { id: 5 }]],
      updateReturning: [[], [second]],
    });
    createUnscopedClientMock.mockReturnValue(db);

    expect(await claimNextExportJob('worker-3')).toEqual(second);
  });

  it('returns null when nothing is claimable', async () => {
    const db = buildDb({ selectResults: [[]] });
    createUnscopedClientMock.mockReturnValue(db);

    expect(await claimNextExportJob('worker-4')).toBeNull();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('re-asserts the lease guard inside the UPDATE, not just the SELECT', async () => {
    // Without the WHERE-clause re-assertion the guard is a TOCTOU: another tick
    // could claim between our SELECT and our UPDATE. This asserts the predicate
    // is actually built for the write.
    const db = buildDb({ selectResults: [[{ id: 3 }]], updateReturning: [[{ id: 3 }]] });
    createUnscopedClientMock.mockReturnValue(db);

    await claimNextExportJob('worker-5');

    const whereArg = db.update.mock.results[0]?.value.set.mock.results[0]?.value.where.mock
      .calls[0]?.[0] as { __and?: unknown[] };
    const serialized = JSON.stringify(whereArg);
    expect(serialized).toContain('jobs.lease_expires_at');
    expect(serialized).toContain('jobs.status');
  });
});
