import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for Sentry configuration.
 *
 * These mock @sentry/nextjs and verify:
 * - Sentry.init is called with expected config shape
 * - beforeSend callback redacts sensitive headers
 * - Sentry is disabled when DSN is not set
 */

// Mock @sentry/nextjs
const mockInit = vi.fn();
const mockCaptureException = vi.fn();
const mockCaptureRouterTransitionStart = vi.fn();
const mockWithScope = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  init: mockInit,
  captureException: mockCaptureException,
  captureRouterTransitionStart: mockCaptureRouterTransitionStart,
  withScope: mockWithScope,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('Sentry server config', () => {
  it('calls Sentry.init with the correct DSN', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://test@sentry.io/123');

    // Dynamic import to pick up the stubbed env
    vi.resetModules();
    await import('../../sentry.server.config');

    expect(mockInit).toHaveBeenCalledOnce();
    const config = mockInit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(config['dsn']).toBe('https://test@sentry.io/123');
    expect(config['enabled']).toBe(true);
  });

  it('disables Sentry when DSN is not set', async () => {
    vi.stubEnv('SENTRY_DSN', '');

    vi.resetModules();
    await import('../../sentry.server.config');

    expect(mockInit).toHaveBeenCalledOnce();
    const config = mockInit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(config['enabled']).toBe(false);
  });

  it('disables Sentry when DSN is undefined', async () => {
    // Remove the env var entirely
    delete process.env['SENTRY_DSN'];

    vi.resetModules();
    await import('../../sentry.server.config');

    expect(mockInit).toHaveBeenCalledOnce();
    const config = mockInit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(config['enabled']).toBe(false);
  });

  it('beforeSend redacts authorization header', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://test@sentry.io/123');

    vi.resetModules();
    await import('../../sentry.server.config');

    const config = mockInit.mock.calls[0]?.[0] as Record<string, unknown>;
    const beforeSend = config['beforeSend'] as (event: Record<string, unknown>) => Record<string, unknown>;
    expect(beforeSend).toBeDefined();

    const event = {
      request: {
        headers: {
          'authorization': 'Bearer secret-token',
          'cookie': 'session=abc123',
          'x-api-key': 'key-456',
          'content-type': 'application/json',
        },
      },
    };

    const result = beforeSend(event);
    const headers = (result['request'] as Record<string, unknown>)?.['headers'] as Record<string, string>;

    // Sensitive headers must be removed
    expect(headers).not.toHaveProperty('authorization');
    expect(headers).not.toHaveProperty('cookie');
    expect(headers).not.toHaveProperty('x-api-key');

    // Non-sensitive headers must remain
    expect(headers['content-type']).toBe('application/json');
  });

  it('beforeSend handles events without request headers gracefully', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://test@sentry.io/123');

    vi.resetModules();
    await import('../../sentry.server.config');

    const config = mockInit.mock.calls[0]?.[0] as Record<string, unknown>;
    const beforeSend = config['beforeSend'] as (event: Record<string, unknown>) => Record<string, unknown>;

    // Event without request
    const event = { message: 'test' };
    const result = beforeSend(event);
    expect(result).toEqual({ message: 'test' });

    // Event with request but no headers
    const event2 = { request: { url: '/api/test' } };
    const result2 = beforeSend(event2);
    expect(result2).toEqual({ request: { url: '/api/test' } });
  });
});

describe('Sentry client instrumentation', () => {
  it('uses NEXT_PUBLIC_SENTRY_DSN', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://public@sentry.io/456');

    vi.resetModules();
    const module = await import('../../instrumentation-client');

    expect(mockInit).toHaveBeenCalledOnce();
    const config = mockInit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(config['dsn']).toBe('https://public@sentry.io/456');
    expect(config['enabled']).toBe(true);
    expect(module.onRouterTransitionStart).toBe(mockCaptureRouterTransitionStart);
  });

  it('disables client Sentry when DSN is not set', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');

    vi.resetModules();
    const module = await import('../../instrumentation-client');

    expect(mockInit).toHaveBeenCalledOnce();
    const config = mockInit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(config['enabled']).toBe(false);
    expect(module.onRouterTransitionStart).toBe(mockCaptureRouterTransitionStart);
  });

  it('swallows client initialization errors so the app can keep rendering', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://public@sentry.io/456');
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockInit.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    vi.resetModules();
    const module = await import('../../instrumentation-client');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[Sentry] Failed to initialize client instrumentation',
      expect.any(Error),
    );
    expect(module.onRouterTransitionStart).toBe(mockCaptureRouterTransitionStart);

    consoleErrorSpy.mockRestore();
  });
});

describe('Sentry edge config', () => {
  it('beforeSend redacts sensitive headers (same as server)', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://test@sentry.io/789');

    vi.resetModules();
    await import('../../sentry.edge.config');

    const config = mockInit.mock.calls[0]?.[0] as Record<string, unknown>;
    const beforeSend = config['beforeSend'] as (event: Record<string, unknown>) => Record<string, unknown>;

    const event = {
      request: {
        headers: {
          'authorization': 'Bearer secret',
          'cookie': 'sess=x',
          'x-api-key': 'key',
          'accept': 'application/json',
        },
      },
    };

    const result = beforeSend(event);
    const headers = (result['request'] as Record<string, unknown>)?.['headers'] as Record<string, string>;

    expect(headers).not.toHaveProperty('authorization');
    expect(headers).not.toHaveProperty('cookie');
    expect(headers).not.toHaveProperty('x-api-key');
    expect(headers['accept']).toBe('application/json');
  });
});
