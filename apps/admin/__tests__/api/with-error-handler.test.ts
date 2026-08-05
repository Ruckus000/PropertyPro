/**
 * Contract tests for withAdminErrorHandler.
 *
 * The behaviour under test did not exist before this handler landed: admin's
 * `requirePlatformAdmin` used to `throw new Response(...)`, which the Next.js
 * App Router never unwraps, so every intended 401/403 surfaced as a generic
 * 500. These assertions pin the statuses down so that regression is visible.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse, type NextRequest } from 'next/server';
import {
  AppError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '@propertypro/shared/http';

const captureException = vi.fn();
const withScope = vi.fn((fn: (scope: unknown) => void) =>
  fn({ setTag: vi.fn(), setUser: vi.fn() }),
);

vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
  withScope: (fn: (scope: unknown) => void) => withScope(fn),
}));

const { withAdminErrorHandler } = await import('@/lib/api/with-error-handler');

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new Request('http://admin.getpropertypro.com/api/admin/thing', {
    headers,
  }) as unknown as NextRequest;
}

beforeEach(() => {
  captureException.mockClear();
  withScope.mockClear();
});

describe('withAdminErrorHandler', () => {
  it('passes a successful response through untouched', async () => {
    const handler = withAdminErrorHandler(async () =>
      NextResponse.json({ ok: true }, { status: 201 }),
    );

    const res = await handler(makeRequest());

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(captureException).not.toHaveBeenCalled();
  });

  it.each([
    ['UnauthorizedError', new UnauthorizedError(), 401, 'UNAUTHORIZED'],
    ['ForbiddenError', new ForbiddenError(), 403, 'FORBIDDEN'],
    ['NotFoundError', new NotFoundError(), 404, 'NOT_FOUND'],
  ])('maps %s to its status code', async (_name, error, status, code) => {
    const handler = withAdminErrorHandler(async () => {
      throw error;
    });

    const res = await handler(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(status);
    expect(body.error.code).toBe(code);
    // Known errors are the app talking to itself — not Sentry-worthy noise.
    expect(captureException).not.toHaveBeenCalled();
  });

  it('preserves a custom code and details on ForbiddenError', async () => {
    const handler = withAdminErrorHandler(async () => {
      throw new ForbiddenError('Nope', 'ADMIN_LIMIT_REACHED', { maxAdmins: 3 });
    });

    const body = await (await handler(makeRequest())).json();

    expect(body.error.code).toBe('ADMIN_LIMIT_REACHED');
    expect(body.error.details).toEqual({ maxAdmins: 3 });
  });

  it('converts an unknown error to 500 without leaking the message', async () => {
    const handler = withAdminErrorHandler(async () => {
      throw new Error(
        'duplicate key value violates unique constraint "platform_admin_users_pkey"',
      );
    });

    const res = await handler(makeRequest());
    const body = await res.json();
    const serialized = JSON.stringify(body);

    expect(res.status).toBe(500);
    expect(body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
    // The specific leak this handler exists to prevent.
    expect(serialized).not.toContain('platform_admin_users_pkey');
    expect(serialized).not.toContain('unique constraint');
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('does not leak a raw Postgres error object either', async () => {
    const handler = withAdminErrorHandler(async () => {
      throw { code: '23505', detail: 'Key (user_id)=(abc) already exists.' };
    });

    const body = await (await handler(makeRequest())).json();

    expect(JSON.stringify(body)).not.toContain('already exists');
    expect(body.error.message).toBe('An unexpected error occurred');
  });

  it('echoes X-Request-ID on both known and unknown error paths', async () => {
    const known = withAdminErrorHandler(async () => {
      throw new ForbiddenError();
    });
    const unknown = withAdminErrorHandler(async () => {
      throw new Error('boom');
    });
    const headers = { 'x-request-id': 'req-abc-123' };

    expect((await known(makeRequest(headers))).headers.get('X-Request-ID')).toBe(
      'req-abc-123',
    );
    expect(
      (await unknown(makeRequest(headers))).headers.get('X-Request-ID'),
    ).toBe('req-abc-123');
  });

  it('still responds when no request id header is present', async () => {
    const handler = withAdminErrorHandler(async () => {
      throw new Error('boom');
    });

    const res = await handler(makeRequest());

    expect(res.status).toBe(500);
    expect(res.headers.get('X-Request-ID')).toBe('');
  });

  it('forwards the handler context argument unchanged', async () => {
    const seen: unknown[] = [];
    const handler = withAdminErrorHandler(
      async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
        seen.push(await ctx.params);
        return NextResponse.json({ ok: true });
      },
    );

    await handler(makeRequest(), { params: Promise.resolve({ id: '42' }) });

    expect(seen).toEqual([{ id: '42' }]);
  });

  it('maps a bare AppError to its explicit status', async () => {
    const handler = withAdminErrorHandler(async () => {
      throw new AppError('Server misconfiguration', 500, 'SERVER_MISCONFIGURED');
    });

    const res = await handler(makeRequest());

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: 'SERVER_MISCONFIGURED' },
    });
  });
});
