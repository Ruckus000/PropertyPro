/**
 * `GET /api/v1/public/documents/[id]/download` — the only unauthenticated read
 * of the private `documents` storage bucket in the product.
 *
 * There is no session and no membership here, so the reader's filter IS the
 * authorization. These tests pin the two things that matter: a signed URL is
 * only ever minted for a row the reader returned, and a row it declines is
 * indistinguishable from one that does not exist.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  createPresignedDownloadUrlMock,
  getPublicDocumentFileMock,
  logAuditEventMock,
  unscopedClientHolder,
} = vi.hoisted(() => ({
  createPresignedDownloadUrlMock: vi.fn(),
  getPublicDocumentFileMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  // Set by the soft-deleted-community suite below, which runs the REAL reader.
  unscopedClientHolder: { db: null as unknown },
}));

vi.mock('@propertypro/db', () => ({
  createPresignedDownloadUrl: createPresignedDownloadUrlMock,
  logAuditEvent: logAuditEventMock,
  // Schema stubs — column identities are strings so the fake DB below can
  // evaluate the reader's real WHERE clause against a row map.
  documents: {
    id: 'documents.id',
    communityId: 'documents.communityId',
    filePath: 'documents.filePath',
    fileName: 'documents.fileName',
    mimeType: 'documents.mimeType',
    publicAccess: 'documents.publicAccess',
    deletedAt: 'documents.deletedAt',
  },
  communities: {
    id: 'communities.id',
    deletedAt: 'communities.deletedAt',
  },
  // Imported by the reader module but never reached by this route.
  announcements: {},
  documentCategories: {},
  meetings: {},
  siteBlocks: {},
  sitePageRedirects: {},
  sitePages: {},
  userRoles: {},
  users: {},
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...args: unknown[]) => ({ __and: args }),
  asc: (col: unknown) => ({ __asc: col }),
  desc: (col: unknown) => ({ __desc: col }),
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  gte: (col: unknown, val: unknown) => ({ __gte: { col, val } }),
  inArray: (col: unknown, vals: unknown) => ({ __inArray: { col, vals } }),
  isNull: (col: unknown) => ({ __isNull: col }),
  lte: (col: unknown, val: unknown) => ({ __lte: { col, val } }),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => unscopedClientHolder.db,
}));

vi.mock('@/lib/db/public-community-reader', () => ({
  getPublicCommunityScopedReader: (communityId: number) => ({
    communityId,
    getPublicDocumentFile: getPublicDocumentFileMock,
  }),
}));

import { GET } from '../../src/app/api/v1/public/documents/[id]/download/route';

const PUBLIC_DOCUMENT = {
  id: 7,
  filePath: 'community-42/bylaws.pdf',
  fileName: 'bylaws.pdf',
  mimeType: 'application/pdf',
};

function request(query = 'communityId=42') {
  return new NextRequest(`http://localhost/api/v1/public/documents/7/download?${query}`);
}

function params(id = '7') {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  getPublicDocumentFileMock.mockResolvedValue(PUBLIC_DOCUMENT);
  createPresignedDownloadUrlMock.mockResolvedValue('https://storage.example.com/signed');
});

describe('the public download', () => {
  it('redirects an anonymous visitor to a signed URL', async () => {
    const response = await GET(request(), params());

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://storage.example.com/signed');
    expect(getPublicDocumentFileMock).toHaveBeenCalledWith(7);
  });

  it('signs a short-lived URL, not the hour the authenticated route uses', async () => {
    await GET(request(), params());

    expect(createPresignedDownloadUrlMock).toHaveBeenCalledWith(
      'documents',
      'community-42/bylaws.pdf',
      300,
    );
  });

  it('404s — and mints nothing — for a document the reader will not release', async () => {
    // Private, soft-deleted, or in another community all arrive here as null.
    // This is the whole authorization: no row, no signed URL.
    getPublicDocumentFileMock.mockResolvedValue(null);

    const response = await GET(request(), params());

    expect(response.status).toBe(404);
    expect(createPresignedDownloadUrlMock).not.toHaveBeenCalled();
  });

  it('gives the same answer for a missing id as for a private one', async () => {
    // A distinguishable response would let an anonymous caller enumerate which
    // document ids exist in a community.
    getPublicDocumentFileMock.mockResolvedValue(null);

    const missing = await GET(request(), params('999999'));
    const privateDoc = await GET(request(), params('7'));

    expect(missing.status).toBe(privateDoc.status);
    await expect(missing.json()).resolves.toEqual(await privateDoc.json());
  });

  it('rejects a non-numeric document id', async () => {
    const response = await GET(request(), params('not-a-number'));

    expect(response.status).toBe(400);
    expect(getPublicDocumentFileMock).not.toHaveBeenCalled();
  });

  it('requires a communityId', async () => {
    const response = await GET(request(''), params());

    expect(response.status).toBe(400);
    expect(getPublicDocumentFileMock).not.toHaveBeenCalled();
  });

  it('writes no audit entry for anonymous traffic', async () => {
    // `compliance_audit_log` is append-only, permanent and board-readable. The
    // accountable act is PUBLISHING, which the PATCH audits.
    await GET(request(), params());

    expect(logAuditEventMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The exploit, end to end, through the REAL reader
// ---------------------------------------------------------------------------
//
// Every other public surface resolves its community through the middleware RPC
// `pp_public_community_id_by_slug` (migration 0045), which filters
// `deleted_at IS NULL` — so a soft-deleted community's host 404s before a
// reader is ever constructed. This route takes `communityId` off the query
// string instead, so nothing upstream checks the community at all: the
// reader's own WHERE clause is the entire gate.
//
// The suite above mocks the reader, which can only prove the route honours a
// null. These cases run the real reader against a fake DB that evaluates the
// clause it actually builds, so the predicate itself decides the HTTP result.

type FakeRow = Record<string, unknown>;

/** Evaluates the reader's mocked-operator clause tree against a joined row. */
function matches(clause: unknown, row: FakeRow): boolean {
  const c = clause as {
    __and?: unknown[];
    __eq?: { col: string; val: unknown };
    __isNull?: string;
  };
  if (c.__and) return c.__and.every((sub) => matches(sub, row));
  if (c.__eq) {
    // The join predicate compares two columns; the document predicates compare
    // a column to a literal.
    const right = typeof c.__eq.val === 'string' && c.__eq.val in row ? row[c.__eq.val] : c.__eq.val;
    return row[c.__eq.col] === right;
  }
  if (c.__isNull) return row[c.__isNull] == null;
  throw new Error(`fake DB cannot evaluate ${JSON.stringify(clause)}`);
}

/**
 * A one-row database. `documents` and `communities` are pre-joined into a
 * single column map; an inner join on `communities.id = documents.communityId`
 * matches it (a soft-deleted community row still EXISTS — that is exactly why
 * the join alone is not the fix), and the WHERE clause decides the rest.
 */
function fakeDbHolding(row: FakeRow) {
  let projection: Record<string, string> = {};
  let where: unknown = null;
  const chain: Record<string, unknown> = {};
  const passthrough = () => chain;
  Object.assign(chain, {
    from: passthrough,
    innerJoin: passthrough,
    leftJoin: passthrough,
    orderBy: passthrough,
    limit: passthrough,
    where: (clause: unknown) => {
      where = clause;
      return chain;
    },
    then: (resolve: (rows: unknown[]) => unknown) => {
      const rows = where !== null && matches(where, row)
        ? [Object.fromEntries(
          Object.entries(projection).map(([alias, col]) => [alias, row[col]]),
        )]
        : [];
      return Promise.resolve(rows).then(resolve);
    },
  });
  return {
    select: (p: Record<string, string>) => {
      projection = p;
      where = null;
      return chain;
    },
  };
}

/** A published, live document — the row every case below asks for. */
const PUBLISHED_DOCUMENT_ROW: FakeRow = {
  'documents.id': 7,
  'documents.communityId': 42,
  'documents.publicAccess': true,
  'documents.deletedAt': null,
  'documents.filePath': 'community-42/bylaws.pdf',
  'documents.fileName': 'bylaws.pdf',
  'documents.mimeType': 'application/pdf',
  'communities.id': 42,
};

async function routeWithRealReader() {
  vi.resetModules();
  vi.doUnmock('@/lib/db/public-community-reader');
  const mod = await import('../../src/app/api/v1/public/documents/[id]/download/route');
  return mod.GET;
}

describe('a community that has been soft-deleted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createPresignedDownloadUrlMock.mockResolvedValue('https://storage.example.com/signed');
  });

  it('404s, and mints no signed URL, for a document it published while live', async () => {
    // executeCommunitySoftDelete sets communities.deleted_at and touches
    // NOTHING on documents: the row stays public_access = true with a null
    // deleted_at. Without a liveness predicate on communities, the URLs
    // sitemap.ts advertised to crawlers keep working forever — past the
    // 6-month purge.
    unscopedClientHolder.db = fakeDbHolding({
      ...PUBLISHED_DOCUMENT_ROW,
      'communities.deletedAt': new Date('2026-03-01T00:00:00.000Z'),
    });
    const get = await routeWithRealReader();

    const response = await get(request(), params());

    expect(
      response.status,
      'getPublicDocumentFile is missing isNull(communities.deletedAt): a soft-deleted community still served its published document',
    ).toBe(404);
    expect(
      createPresignedDownloadUrlMock,
      'a signed URL into the private documents bucket was minted for a soft-deleted community',
    ).not.toHaveBeenCalled();
  });

  it('control: the same document downloads while the community is live', async () => {
    unscopedClientHolder.db = fakeDbHolding({
      ...PUBLISHED_DOCUMENT_ROW,
      'communities.deletedAt': null,
    });
    const get = await routeWithRealReader();

    const response = await get(request(), params());

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://storage.example.com/signed');
    expect(createPresignedDownloadUrlMock).toHaveBeenCalledWith(
      'documents',
      'community-42/bylaws.pdf',
      300,
    );
  });

  it('control: a private document in a live community still 404s', async () => {
    unscopedClientHolder.db = fakeDbHolding({
      ...PUBLISHED_DOCUMENT_ROW,
      'documents.publicAccess': false,
      'communities.deletedAt': null,
    });
    const get = await routeWithRealReader();

    const response = await get(request(), params());

    expect(response.status).toBe(404);
    expect(createPresignedDownloadUrlMock).not.toHaveBeenCalled();
  });
});
