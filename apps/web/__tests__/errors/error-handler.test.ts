import { beforeEach, describe, it, expect, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Mock Sentry before importing error-handler
const sentryMocks = vi.hoisted(() => {
  const setTag = vi.fn();
  const setUser = vi.fn();
  const captureException = vi.fn();
  const withScope = vi.fn(
    (
      cb: (scope: {
        setTag: ReturnType<typeof vi.fn>;
        setUser: ReturnType<typeof vi.fn>;
      }) => void,
    ) => {
      cb({ setTag, setUser });
    },
  );

  return { setTag, setUser, captureException, withScope };
});

vi.mock('@sentry/nextjs', () => ({
  withScope: sentryMocks.withScope,
  captureException: sentryMocks.captureException,
}));

import { withErrorHandler } from '../../src/lib/api/error-handler';
import { ValidationError } from '../../src/lib/api/errors/ValidationError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

/**
 * Create a mock NextRequest with optional headers.
 */
function createMockRequest(
  url = 'http://localhost:3000/api/test',
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(url, {
    headers: {
      'x-request-id': 'test-request-id',
      ...headers,
    },
  });
}

describe('withErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the handler response on success', async () => {
    const handler = withErrorHandler(async () => {
      return NextResponse.json({ data: 'ok' });
    });

    const req = createMockRequest();
    const res = await handler(req);
    const body = await res.json() as { data: string };

    expect(res.status).toBe(200);
    expect(body.data).toBe('ok');
  });

  it('returns 400 for ValidationError', async () => {
    const handler = withErrorHandler(async () => {
      throw new ValidationError('Email is required', { field: 'email' });
    });

    const req = createMockRequest();
    const res = await handler(req);
    const body = await res.json() as { error: { code: string; message: string; details?: Record<string, unknown> } };

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Email is required');
    expect(body.error.details).toEqual({ field: 'email' });
  });

  it('returns 401 for UnauthorizedError', async () => {
    const handler = withErrorHandler(async () => {
      throw new UnauthorizedError();
    });

    const req = createMockRequest();
    const res = await handler(req);
    const body = await res.json() as { error: { code: string; message: string } };

    expect(res.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 500 for unknown errors with no internal details', async () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const handler = withErrorHandler(async () => {
      throw new Error('database connection failed');
    });

    const req = createMockRequest();
    const res = await handler(req);
    const body = await res.json() as { error: { code: string; message: string } };

    expect(res.status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('An unexpected error occurred');
    // Must NOT contain the original error message or stack trace
    expect(JSON.stringify(body)).not.toContain('database connection failed');
    expect(sentryMocks.setTag).toHaveBeenCalledWith('request_id', 'test-request-id');
    expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });

  it('tags community_id and user context when headers are present', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const handler = withErrorHandler(async () => {
      throw new Error('boom');
    });

    const req = createMockRequest('http://localhost:3000/api/test', {
      'x-community-id': '42',
      'x-user-id': 'user_123',
    });

    await handler(req);

    expect(sentryMocks.setTag).toHaveBeenCalledWith('request_id', 'test-request-id');
    expect(sentryMocks.setTag).toHaveBeenCalledWith('community_id', '42');
    expect(sentryMocks.setUser).toHaveBeenCalledWith({ id: 'user_123' });
    expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });

  it('includes X-Request-ID header on error responses', async () => {
    const handler = withErrorHandler(async () => {
      throw new ValidationError('bad');
    });

    const req = createMockRequest();
    const res = await handler(req);

    expect(res.headers.get('X-Request-ID')).toBe('test-request-id');
  });

  it('includes X-Request-ID on 500 responses', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const handler = withErrorHandler(async () => {
      throw new Error('oops');
    });

    const req = createMockRequest();
    const res = await handler(req);

    expect(res.headers.get('X-Request-ID')).toBe('test-request-id');

    consoleSpy.mockRestore();
  });

  it('uses empty string for X-Request-ID when header is missing', async () => {
    const handler = withErrorHandler(async () => {
      throw new ValidationError('bad');
    });

    const req = new NextRequest('http://localhost:3000/api/test');
    const res = await handler(req);

    expect(res.headers.get('X-Request-ID')).toBe('');
  });
});
