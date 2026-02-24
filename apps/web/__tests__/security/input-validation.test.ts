/**
 * P4-56: Input validation tests.
 *
 * Verifies that API routes return structured 400 errors when receiving
 * malformed JSON or missing required fields. Tests the Zod validation
 * layer and error sanitization via withErrorHandler.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Sentry mock — must be hoisted before any module that imports error-handler
// ---------------------------------------------------------------------------

vi.mock('@sentry/nextjs', () => ({
  withScope: vi.fn((cb: (scope: { setTag: () => void; setUser: () => void }) => void) => {
    cb({ setTag: vi.fn(), setUser: vi.fn() });
  }),
  captureException: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  createScopedClientMock,
  logAuditEventMock,
  scopedQueryMock,
  scopedInsertMock,
  scopedSelectFromMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  scopedQueryMock: vi.fn().mockResolvedValue([]),
  scopedInsertMock: vi.fn().mockResolvedValue([{ id: 1 }]),
  scopedSelectFromMock: vi.fn().mockResolvedValue([{ timezone: 'America/New_York' }]),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  communities: { id: Symbol('communities.id'), timezone: Symbol('communities.timezone') },
  meetings: { id: Symbol('meetings.id') },
  meetingDocuments: Symbol('meetingDocuments'),
  documents: { id: Symbol('documents.id') },
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock('@propertypro/shared', async () => {
  const actual = await vi.importActual<typeof import('@propertypro/shared')>('@propertypro/shared');
  return { ...actual };
});

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: vi.fn((_req: unknown, id: number) => id),
}));

vi.mock('@/lib/services/notification-service', () => ({
  queueNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/utils/timezone', () => ({
  resolveTimezone: vi.fn().mockReturnValue('America/New_York'),
}));

// ---------------------------------------------------------------------------
// Meetings endpoint — representative Zod-validated POST route
// ---------------------------------------------------------------------------

describe('P4-56 / Meetings POST input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-uuid-1');
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'board_president',
      communityType: 'condo_718',
    });
    createScopedClientMock.mockReturnValue({
      query: scopedQueryMock,
      insert: scopedInsertMock,
      selectFrom: scopedSelectFromMock,
    });
  });

  it('returns 400 when communityId is missing', async () => {
    const { POST } = await import('../../src/app/api/v1/meetings/route');

    const req = new NextRequest('http://localhost/api/v1/meetings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Board Meeting', meetingType: 'board' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when communityId is not a positive integer', async () => {
    const { POST } = await import('../../src/app/api/v1/meetings/route');

    const req = new NextRequest('http://localhost/api/v1/meetings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        communityId: -5,
        title: 'Board Meeting',
        meetingType: 'board',
        startsAt: '2026-03-01T10:00:00Z',
        location: 'Room 1',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 422 when required create fields are missing', async () => {
    const { POST } = await import('../../src/app/api/v1/meetings/route');

    const req = new NextRequest('http://localhost/api/v1/meetings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // communityId is valid but create fields are missing
      body: JSON.stringify({ communityId: 42 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it('returns 422 when meetingType is an invalid enum value', async () => {
    const { POST } = await import('../../src/app/api/v1/meetings/route');

    const req = new NextRequest('http://localhost/api/v1/meetings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        communityId: 42,
        title: 'Meeting',
        meetingType: 'invalid-type',
        startsAt: '2026-03-01T10:00:00Z',
        location: 'Room 1',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it('returns 422 when startsAt is not a valid date string', async () => {
    const { POST } = await import('../../src/app/api/v1/meetings/route');

    const req = new NextRequest('http://localhost/api/v1/meetings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        communityId: 42,
        title: 'Meeting',
        meetingType: 'board',
        startsAt: 'not-a-date',
        location: 'Room 1',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it('returns structured error body with error.code for validation failures', async () => {
    const { POST } = await import('../../src/app/api/v1/meetings/route');

    const req = new NextRequest('http://localhost/api/v1/meetings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId: 42 }),
    });

    const res = await POST(req);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error).toBeDefined();
    expect(typeof body.error.code).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Zod schemas primitives
// ---------------------------------------------------------------------------

describe('P4-56 / Zod schema primitives', () => {
  it('positiveIntSchema rejects zero', async () => {
    const { positiveIntSchema } = await import('../../src/lib/validation/zod-schemas');
    expect(positiveIntSchema.safeParse(0).success).toBe(false);
  });

  it('positiveIntSchema rejects negative numbers', async () => {
    const { positiveIntSchema } = await import('../../src/lib/validation/zod-schemas');
    expect(positiveIntSchema.safeParse(-1).success).toBe(false);
  });

  it('positiveIntSchema rejects floats', async () => {
    const { positiveIntSchema } = await import('../../src/lib/validation/zod-schemas');
    expect(positiveIntSchema.safeParse(1.5).success).toBe(false);
  });

  it('positiveIntSchema accepts valid positive integer', async () => {
    const { positiveIntSchema } = await import('../../src/lib/validation/zod-schemas');
    expect(positiveIntSchema.safeParse(42).success).toBe(true);
  });

  it('isoDateStringSchema rejects non-date strings', async () => {
    const { isoDateStringSchema } = await import('../../src/lib/validation/zod-schemas');
    expect(isoDateStringSchema.safeParse('not-a-date').success).toBe(false);
  });

  it('isoDateStringSchema accepts valid ISO strings', async () => {
    const { isoDateStringSchema } = await import('../../src/lib/validation/zod-schemas');
    expect(isoDateStringSchema.safeParse('2026-03-01T10:00:00Z').success).toBe(true);
  });

  it('passwordSchema rejects passwords shorter than 8 chars', async () => {
    const { passwordSchema } = await import('../../src/lib/validation/zod-schemas');
    expect(passwordSchema.safeParse('short').success).toBe(false);
  });

  it('passwordSchema rejects passwords longer than 72 chars', async () => {
    const { passwordSchema } = await import('../../src/lib/validation/zod-schemas');
    expect(passwordSchema.safeParse('a'.repeat(73)).success).toBe(false);
  });

  it('paginationLimitSchema rejects values above 200', async () => {
    const { paginationLimitSchema } = await import('../../src/lib/validation/zod-schemas');
    expect(paginationLimitSchema.safeParse(201).success).toBe(false);
  });

  it('emailSchema rejects non-email strings', async () => {
    const { emailSchema } = await import('../../src/lib/validation/zod-schemas');
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });

  it('emailSchema accepts valid emails', async () => {
    const { emailSchema } = await import('../../src/lib/validation/zod-schemas');
    expect(emailSchema.safeParse('user@propertyprofl.com').success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Error response shape — verify withErrorHandler sanitizes unknown errors
// ---------------------------------------------------------------------------

describe('P4-56 / API error sanitization', () => {
  it('withErrorHandler returns INTERNAL_ERROR code without leaking sensitive data', async () => {
    const { withErrorHandler } = await import('../../src/lib/api/error-handler');

    const handler = withErrorHandler(async () => {
      throw new Error('DB connection string: postgres://user:secret@host/db');
    });

    const req = new NextRequest('http://localhost/api/v1/test');
    const res = await handler(req);

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INTERNAL_ERROR');
    // Must not leak the original error message with sensitive connection details
    expect(body.error.message).not.toContain('postgres://');
    expect(body.error.message).not.toContain('secret');
  });

  it('withErrorHandler returns structured 422 for UnprocessableEntityError (Zod field failures)', async () => {
    const { withErrorHandler } = await import('../../src/lib/api/error-handler');
    const { UnprocessableEntityError } = await import('../../src/lib/api/errors');

    const handler = withErrorHandler(async () => {
      throw new UnprocessableEntityError('Validation failed', {
        fields: [{ field: 'communityId', message: 'Required' }],
      });
    });

    const req = new NextRequest('http://localhost/api/v1/test');
    const res = await handler(req);

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string; details: { fields: unknown[] } } };
    expect(body.error.code).toBe('UNPROCESSABLE_ENTITY');
    expect(Array.isArray(body.error.details.fields)).toBe(true);
  });

  it('withErrorHandler sets X-Request-ID on error responses', async () => {
    const { withErrorHandler } = await import('../../src/lib/api/error-handler');
    const { NotFoundError } = await import('../../src/lib/api/errors');

    const handler = withErrorHandler(async () => {
      throw new NotFoundError('Resource not found');
    });

    const req = new NextRequest('http://localhost/api/v1/test', {
      headers: { 'x-request-id': 'test-request-id-123' },
    });
    const res = await handler(req);

    expect(res.status).toBe(404);
    expect(res.headers.get('X-Request-ID')).toBe('test-request-id-123');
  });
});
