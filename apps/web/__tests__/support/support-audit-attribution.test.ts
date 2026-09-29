/**
 * Central support-session attribution: `withErrorHandler` enters the audit
 * actor from the middleware's support headers, and every compliance_audit_log
 * row written inside the handler carries `metadata.support`.
 *
 * The document-download case runs END TO END through the real route, the real
 * `withErrorHandler` and the REAL `logAuditEvent` — only the drizzle handle
 * underneath it is faked, so the assertion is on the row as it would be
 * inserted. Before this change that row named the impersonated user and
 * nothing else.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const h = vi.hoisted(() => {
  const valuesMock = vi.fn(async () => undefined);
  return {
    valuesMock,
    insertMock: vi.fn(() => ({ values: valuesMock })),
    resolveLibraryDocumentRequestMock: vi.fn(),
    createPresignedDownloadUrlMock: vi.fn(),
  };
});

// The real audit-logger's `db` — the ONLY stub on the audit path.
vi.mock('../../../../packages/db/src/drizzle', () => ({ db: { insert: h.insertMock } }));

vi.mock('@propertypro/db', async () => {
  const auditLogger = await vi.importActual<typeof import('../../../../packages/db/src/utils/audit-logger')>(
    '../../../../packages/db/src/utils/audit-logger',
  );
  return {
    createPresignedDownloadUrl: h.createPresignedDownloadUrlMock,
    logAuditEvent: auditLogger.logAuditEvent,
  };
});

vi.mock('@/lib/documents/library-document-resolver', () => ({
  resolveLibraryDocumentRequest: h.resolveLibraryDocumentRequestMock,
}));

import { GET as downloadGET } from '../../src/app/api/v1/documents/[id]/download/route';
import { withErrorHandler } from '../../src/lib/api/error-handler';
import { getAuditActor } from '@propertypro/db/audit-actor';

const SUPPORT_HEADERS: Record<string, string> = {
  'x-user-id': 'target-user-uuid',
  'x-support-session': '1',
  'x-support-admin-id': 'admin-uuid',
  'x-support-session-id': '42',
  'x-support-community-id': '8',
  'x-community-id': '8',
};

async function flush(): Promise<void> {
  // The download route's audit write is fire-and-forget.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function insertedRow(): Record<string, unknown> {
  const calls = h.valuesMock.mock.calls as unknown as Array<[Record<string, unknown>]>;
  expect(calls).toHaveLength(1);
  return calls[0]![0];
}

beforeEach(() => {
  vi.clearAllMocks();
  h.createPresignedDownloadUrlMock.mockResolvedValue('https://storage.example.com/signed');
  h.resolveLibraryDocumentRequestMock.mockResolvedValue({
    userId: 'target-user-uuid',
    communityId: 8,
    document: {
      id: 42,
      communityId: 8,
      filePath: 'communities/8/documents/42/minutes.pdf',
      fileName: 'minutes.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024,
    },
  });
});

describe('withErrorHandler enters the audit actor', () => {
  it('under a support session the handler sees { sessionId, adminUserId }', async () => {
    let seen: unknown = 'unset';
    const handler = withErrorHandler(async () => {
      seen = getAuditActor();
      return NextResponse.json({ ok: true });
    });
    await handler(new NextRequest('http://localhost:3000/api/v1/x', { headers: SUPPORT_HEADERS }));
    expect(seen).toEqual({ support: { sessionId: 42, adminUserId: 'admin-uuid' } });
  });

  it('without one the handler sees no actor at all', async () => {
    let seen: unknown = 'unset';
    const handler = withErrorHandler(async () => {
      seen = getAuditActor();
      return NextResponse.json({ ok: true });
    });
    await handler(new NextRequest('http://localhost:3000/api/v1/x'));
    expect(seen).toBeUndefined();
  });

  it('an unreadable session id still marks the row as support-driven (null, not absent)', async () => {
    let seen: unknown = 'unset';
    const handler = withErrorHandler(async () => {
      seen = getAuditActor();
      return NextResponse.json({ ok: true });
    });
    await handler(
      new NextRequest('http://localhost:3000/api/v1/x', {
        headers: { ...SUPPORT_HEADERS, 'x-support-session-id': 'abc' },
      }),
    );
    expect(seen).toEqual({ support: { sessionId: null, adminUserId: 'admin-uuid' } });
  });
});

describe('GET /api/v1/documents/[id]/download — document_accessed attribution', () => {
  it('under a support session the row carries metadata.support, existing keys preserved', async () => {
    const res = await downloadGET(
      new NextRequest('http://localhost:3000/api/v1/documents/42/download?communityId=8', {
        headers: SUPPORT_HEADERS,
      }),
      { params: Promise.resolve({ id: '42' }) },
    );
    await flush();

    expect(res.status).toBe(200);
    const row = insertedRow();
    expect(row).toMatchObject({
      userId: 'target-user-uuid',
      action: 'document_accessed',
      resourceType: 'document',
      resourceId: '42',
      communityId: 8,
    });
    expect(row.metadata).toEqual({
      accessType: 'preview',
      fileName: 'minutes.pdf',
      support: { sessionId: 42, adminUserId: 'admin-uuid' },
    });
  });

  it('without a support session the row is unchanged', async () => {
    await downloadGET(
      new NextRequest('http://localhost:3000/api/v1/documents/42/download?communityId=8'),
      { params: Promise.resolve({ id: '42' }) },
    );
    await flush();

    expect(insertedRow().metadata).toEqual({ accessType: 'preview', fileName: 'minutes.pdf' });
  });
});
