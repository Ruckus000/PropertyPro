import { beforeEach, describe, expect, it, vi } from 'vitest';

const { deleteStorageObjectMock, createScopedClientMock, queryWhereMock } = vi.hoisted(() => ({
  deleteStorageObjectMock: vi.fn(),
  createScopedClientMock: vi.fn(),
  queryWhereMock: vi.fn(),
}));

// documents-service is imported for real (not mocked) so isFilePathReferenced
// itself is under test — that is what makes the soft-delete case below a
// behavioural check rather than an assertion about argument shape. The extra
// exports here are the ones that module imports at load time; omitting any one
// of them throws at import and every test in this file dies before running.
vi.mock('@propertypro/db', () => ({
  deleteStorageObject: deleteStorageObjectMock,
  createScopedClient: createScopedClientMock,
  documents: { filePath: { name: 'file_path' } },
  MAX_PAGE_SIZE: 100,
  buildAccessibleDocumentsFilter: vi.fn(),
  buildSourceTypeFilter: vi.fn(),
  paginate: vi.fn(),
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  and: (...clauses: unknown[]) => ({ __and: clauses }),
  inArray: (col: unknown, vals: unknown) => ({ __inArray: { col, vals } }),
  isNotNull: (col: unknown) => ({ __isNotNull: col }),
}));

import { deleteUnreferencedUpload, withUploadCleanup } from '@/lib/documents/upload-cleanup';

const COMMUNITY_ID = 42;
const ORPHAN_PATH = 'communities/42/documents/abc/minutes.pdf';

/**
 * A scoped client that behaves like the real one on the axis that matters here:
 * `selectFrom` hides soft-deleted rows, and `queryWhere` returns them ONLY when
 * `{ includeSoftDeleted: true }` is forwarded.
 *
 * Simulated rather than asserted on the argument shape, so the soft-delete test
 * below is a real behavioural check: dropping the option from
 * `isFilePathReferenced` makes this stop returning the row, the path reads as
 * unreferenced, and the bytes get deleted — which is exactly the production
 * failure the option prevents.
 */
function scopedClientWith(rows: {
  live?: Array<Record<string, unknown>>;
  softDeleted?: Array<Record<string, unknown>>;
}) {
  queryWhereMock.mockImplementation(
    async (_table: unknown, _where: unknown, options?: { includeSoftDeleted?: boolean }) => [
      ...(rows.live ?? []),
      ...(options?.includeSoftDeleted ? rows.softDeleted ?? [] : []),
    ],
  );
  return { queryWhere: queryWhereMock };
}

beforeEach(() => {
  vi.clearAllMocks();
  deleteStorageObjectMock.mockResolvedValue(undefined);
  createScopedClientMock.mockImplementation(() => scopedClientWith({}));
});

describe('deleteUnreferencedUpload', () => {
  it('deletes an object no documents row points at', async () => {
    const result = await deleteUnreferencedUpload(COMMUNITY_ID, ORPHAN_PATH);

    expect(result.reason).toBe('deleted');
    expect(deleteStorageObjectMock).toHaveBeenCalledWith('documents', ORPHAN_PATH);
  });

  it('declines to delete when a documents row already references the path', async () => {
    // The live bug this closes: before the guard, a member with documents:write
    // could POST a victim document's file_path with a wrong fileSize, trip the
    // size-mismatch branch, and destroy that document's bytes.
    createScopedClientMock.mockImplementation(() =>
      scopedClientWith({ live: [{ id: 7, filePath: ORPHAN_PATH }] }),
    );

    const result = await deleteUnreferencedUpload(COMMUNITY_ID, ORPHAN_PATH);

    expect(result.reason).toBe('referenced');
    expect(deleteStorageObjectMock).not.toHaveBeenCalled();
  });

  it('declines to delete when the referencing row is SOFT-deleted', async () => {
    // A soft-deleted document sits in the board's Deleted column awaiting
    // restore. `selectFrom` would hide it and the bytes would go; only
    // `queryWhere(..., { includeSoftDeleted: true })` sees it.
    createScopedClientMock.mockImplementation(() =>
      scopedClientWith({ softDeleted: [{ id: 7, filePath: ORPHAN_PATH }] }),
    );

    const result = await deleteUnreferencedUpload(COMMUNITY_ID, ORPHAN_PATH);

    expect(result.reason).toBe('referenced');
    expect(deleteStorageObjectMock).not.toHaveBeenCalled();
  });

  it('refuses a path scoped to another community', async () => {
    const result = await deleteUnreferencedUpload(
      COMMUNITY_ID,
      'communities/9999/documents/abc/victim.pdf',
    );

    expect(result.reason).toBe('refused');
    expect(deleteStorageObjectMock).not.toHaveBeenCalled();
  });

  it('refuses a traversal path even under a valid prefix', async () => {
    const result = await deleteUnreferencedUpload(
      COMMUNITY_ID,
      'communities/42/documents/../../communities/9999/victim.pdf',
    );

    expect(result.reason).toBe('refused');
    expect(deleteStorageObjectMock).not.toHaveBeenCalled();
  });

  it('fails CLOSED when the reference check throws', async () => {
    // Not knowing whether the object is a record is not a licence to delete it.
    createScopedClientMock.mockImplementation(() => ({
      queryWhere: vi.fn().mockRejectedValue(new Error('connection reset')),
    }));

    const result = await deleteUnreferencedUpload(COMMUNITY_ID, ORPHAN_PATH);

    expect(result.reason).toBe('failed');
    expect(result.error).toContain('connection reset');
    expect(deleteStorageObjectMock).not.toHaveBeenCalled();
  });

  it('reports a storage failure instead of throwing', async () => {
    deleteStorageObjectMock.mockRejectedValue(new Error('storage down'));

    const result = await deleteUnreferencedUpload(COMMUNITY_ID, ORPHAN_PATH);

    expect(result.reason).toBe('failed');
    expect(result.error).toContain('storage down');
  });
});

describe('withUploadCleanup', () => {
  it('returns the value and deletes nothing when the body succeeds', async () => {
    const result = await withUploadCleanup(COMMUNITY_ID, ORPHAN_PATH, async () => 'ok');

    expect(result).toBe('ok');
    expect(deleteStorageObjectMock).not.toHaveBeenCalled();
  });

  it('reclaims the object and rethrows the ORIGINAL error unchanged', async () => {
    // A cleanup failure must not convert the redaction-attestation 400 — the one
    // message the uploader can act on — into a 500 that says nothing.
    class Validationish extends Error {
      status = 400;
    }
    const thrown = new Validationish('Confirm you have redacted it before uploading.');

    await expect(
      withUploadCleanup(COMMUNITY_ID, ORPHAN_PATH, async () => {
        throw thrown;
      }),
    ).rejects.toBe(thrown);

    expect(deleteStorageObjectMock).toHaveBeenCalledWith('documents', ORPHAN_PATH);
  });

  it('still rethrows the original error when cleanup itself fails', async () => {
    deleteStorageObjectMock.mockRejectedValue(new Error('storage down'));
    const thrown = new Error('the real failure');

    await expect(
      withUploadCleanup(COMMUNITY_ID, ORPHAN_PATH, async () => {
        throw thrown;
      }),
    ).rejects.toBe(thrown);
  });
});
