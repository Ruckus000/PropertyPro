import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { logAuditEventMock, generateRequestIdMock } = vi.hoisted(() => ({
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  generateRequestIdMock: vi.fn().mockReturnValue('generated-request-id'),
}));

vi.mock('@propertypro/db', () => ({
  logAuditEvent: logAuditEventMock,
}));

vi.mock('../../src/lib/api/request-id', () => ({
  generateRequestId: generateRequestIdMock,
}));

import { withAuditLog } from '../../src/lib/middleware/audit-middleware';

function createRequest(headers?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/test', { headers });
}

describe('withAuditLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateRequestIdMock.mockReturnValue('generated-request-id');
  });

  it('provides audit.log with extracted user/community context', async () => {
    const extractContext = vi.fn().mockResolvedValue({
      userId: 'user-1',
      communityId: 42,
    });

    const handler = vi.fn(async (_req, _context, audit) => {
      await audit.log({
        action: 'create',
        resourceType: 'document',
        resourceId: 'doc-1',
      });
      return NextResponse.json({ ok: true });
    });

    const wrapped = withAuditLog(extractContext, handler);
    const response = await wrapped(createRequest({ 'x-request-id': 'req-123' }));

    expect(response.status).toBe(200);
    expect(extractContext).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(logAuditEventMock).toHaveBeenCalledWith({
      action: 'create',
      resourceType: 'document',
      resourceId: 'doc-1',
      userId: 'user-1',
      communityId: 42,
      metadata: { requestId: 'req-123' },
    });
  });

  it('merges caller metadata and enforces middleware requestId', async () => {
    const extractContext = vi.fn().mockResolvedValue({
      userId: 'user-2',
      communityId: 7,
    });

    const handler = vi.fn(async (_req, _context, audit) => {
      await audit.log({
        action: 'update',
        resourceType: 'meeting',
        resourceId: 'meeting-1',
        metadata: { source: 'unit-test', requestId: 'should-not-win' },
      });
      return NextResponse.json({ ok: true });
    });

    const wrapped = withAuditLog(extractContext, handler);
    await wrapped(createRequest({ 'x-request-id': 'req-999' }));

    expect(logAuditEventMock).toHaveBeenCalledWith({
      action: 'update',
      resourceType: 'meeting',
      resourceId: 'meeting-1',
      userId: 'user-2',
      communityId: 7,
      metadata: { source: 'unit-test', requestId: 'req-999' },
    });
  });

  it('generates requestId when request header is missing or blank', async () => {
    const extractContext = vi.fn().mockResolvedValue({
      userId: 'user-3',
      communityId: 3,
    });

    const handler = vi.fn(async (_req, _context, audit) => {
      await audit.log({
        action: 'delete',
        resourceType: 'announcement',
        resourceId: 'ann-1',
      });
      return NextResponse.json({ ok: true });
    });

    const wrapped = withAuditLog(extractContext, handler);
    await wrapped(createRequest({ 'x-request-id': '   ' }));

    expect(generateRequestIdMock).toHaveBeenCalledTimes(1);
    expect(logAuditEventMock).toHaveBeenCalledWith({
      action: 'delete',
      resourceType: 'announcement',
      resourceId: 'ann-1',
      userId: 'user-3',
      communityId: 3,
      metadata: { requestId: 'generated-request-id' },
    });
  });
});
