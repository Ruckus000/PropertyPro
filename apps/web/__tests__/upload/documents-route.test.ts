import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  createScopedClientMock,
  logAuditEventMock,
  scopedInsertMock,
  scopedQueryMock,
  documentsTable,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  scopedInsertMock: vi.fn(),
  scopedQueryMock: vi.fn(),
  documentsTable: Symbol('documents'),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  documents: documentsTable,
  logAuditEvent: logAuditEventMock,
}));

import { GET, POST } from '../../src/app/api/v1/documents/route';

describe('p1-11 documents route', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createScopedClientMock.mockReturnValue({
      insert: scopedInsertMock,
      query: scopedQueryMock,
    });
  });

  it('POST creates document metadata with scoped client and audit log', async () => {
    scopedInsertMock.mockResolvedValue([
      {
        id: 99,
        communityId: 42,
        title: 'Board Minutes',
        filePath: 'communities/42/documents/abc/minutes.pdf',
      },
    ]);

    const req = new NextRequest('http://localhost:3000/api/v1/documents', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': '95c454d2-9728-4f1f-8b75-5b9549fb9679',
      },
      body: JSON.stringify({
        communityId: 42,
        title: 'Board Minutes',
        description: 'March meeting minutes',
        categoryId: null,
        filePath: 'communities/42/documents/abc/minutes.pdf',
        fileName: 'minutes.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(scopedInsertMock).toHaveBeenCalledWith(
      documentsTable,
      expect.objectContaining({
        title: 'Board Minutes',
        filePath: 'communities/42/documents/abc/minutes.pdf',
      }),
    );

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create',
        resourceType: 'document',
        communityId: 42,
      }),
    );
  });

  it('GET lists documents scoped by communityId', async () => {
    scopedQueryMock.mockResolvedValue([
      { id: 1, communityId: 8, title: 'A' },
      { id: 2, communityId: 8, title: 'B' },
    ]);

    const req = new NextRequest('http://localhost:3000/api/v1/documents?communityId=8');
    const res = await GET(req);
    const json = (await res.json()) as {
      data: Array<{ id: number }>;
    };

    expect(res.status).toBe(200);
    expect(createScopedClientMock).toHaveBeenCalledWith(8);
    expect(scopedQueryMock).toHaveBeenCalledWith(documentsTable);
    expect(json.data).toHaveLength(2);
  });

  it('POST rejects missing auth header', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/documents', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 42,
        title: 'Board Minutes',
        filePath: 'communities/42/documents/abc/minutes.pdf',
        fileName: 'minutes.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
