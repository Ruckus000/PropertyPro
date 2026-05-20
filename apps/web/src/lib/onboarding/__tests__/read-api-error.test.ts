/**
 * Unit tests for `readOnboardingApiError`.
 *
 * Covers the robustness branches added on top of the original
 * behavior-preserving DRY extraction (PR #402):
 *   - Content-Type check + statusText fallback for non-JSON responses
 *   - Null / array body validation
 *   - error.message → error.code → FALLBACK_ERROR cascade
 *   - Empty-string error.message falling through to error.code
 */
import { describe, expect, it } from 'vitest';
import { readOnboardingApiError } from '../read-api-error';

/**
 * Minimal Response stub. Real Response has many fields; the helper only
 * touches `headers.get`, `statusText`, and `json()`.
 */
function makeResponse(opts: {
  contentType?: string | null;
  statusText?: string;
  json?: () => unknown | Promise<unknown>;
}): Response {
  const headers = {
    get(name: string): string | null {
      if (name.toLowerCase() === 'content-type') {
        return opts.contentType ?? null;
      }
      return null;
    },
  };
  return {
    headers,
    statusText: opts.statusText ?? '',
    json: opts.json ?? (async () => ({})),
  } as unknown as Response;
}

describe('readOnboardingApiError', () => {
  describe('Content-Type handling', () => {
    it('returns response.statusText when Content-Type is missing', async () => {
      const res = makeResponse({ contentType: null, statusText: 'Internal Server Error' });
      expect(await readOnboardingApiError(res)).toBe('Internal Server Error');
    });

    it('returns response.statusText when Content-Type is text/html (proxy error page)', async () => {
      const res = makeResponse({ contentType: 'text/html; charset=utf-8', statusText: 'Bad Gateway' });
      expect(await readOnboardingApiError(res)).toBe('Bad Gateway');
    });

    it('falls back to "Request failed" when Content-Type is non-JSON AND statusText is empty', async () => {
      const res = makeResponse({ contentType: 'text/plain', statusText: '' });
      expect(await readOnboardingApiError(res)).toBe('Request failed');
    });

    it('parses JSON when Content-Type matches application/json (exact)', async () => {
      const res = makeResponse({
        contentType: 'application/json',
        json: async () => ({ error: { message: 'parsed-message' } }),
      });
      expect(await readOnboardingApiError(res)).toBe('parsed-message');
    });

    it('parses JSON when Content-Type matches application/json with charset suffix', async () => {
      const res = makeResponse({
        contentType: 'application/json; charset=utf-8',
        json: async () => ({ error: { message: 'parsed-message' } }),
      });
      expect(await readOnboardingApiError(res)).toBe('parsed-message');
    });
  });

  describe('Body shape validation', () => {
    it('returns FALLBACK_ERROR when JSON body is null', async () => {
      const res = makeResponse({
        contentType: 'application/json',
        json: async () => null,
      });
      expect(await readOnboardingApiError(res)).toBe('Request failed');
    });

    it('returns FALLBACK_ERROR when JSON body is an array', async () => {
      const res = makeResponse({
        contentType: 'application/json',
        json: async () => [1, 2, 3],
      });
      expect(await readOnboardingApiError(res)).toBe('Request failed');
    });

    it('returns FALLBACK_ERROR when JSON body is a primitive', async () => {
      const res = makeResponse({
        contentType: 'application/json',
        json: async () => 42,
      });
      expect(await readOnboardingApiError(res)).toBe('Request failed');
    });

    it('returns FALLBACK_ERROR when JSON body has no error key', async () => {
      const res = makeResponse({
        contentType: 'application/json',
        json: async () => ({ ok: true }),
      });
      expect(await readOnboardingApiError(res)).toBe('Request failed');
    });
  });

  describe('error envelope handling', () => {
    it('returns the string `error` value verbatim', async () => {
      const res = makeResponse({
        contentType: 'application/json',
        json: async () => ({ error: 'short' }),
      });
      expect(await readOnboardingApiError(res)).toBe('short');
    });

    it('returns error.message when present', async () => {
      const res = makeResponse({
        contentType: 'application/json',
        json: async () => ({ error: { message: 'human-readable' } }),
      });
      expect(await readOnboardingApiError(res)).toBe('human-readable');
    });

    it('falls back to error.code when error.message is missing', async () => {
      const res = makeResponse({
        contentType: 'application/json',
        json: async () => ({ error: { code: 'AUTH_FAILED' } }),
      });
      expect(await readOnboardingApiError(res)).toBe('AUTH_FAILED');
    });

    it('falls through empty-string error.message to error.code (|| semantics)', async () => {
      const res = makeResponse({
        contentType: 'application/json',
        json: async () => ({ error: { message: '', code: 'EMPTY_MESSAGE' } }),
      });
      expect(await readOnboardingApiError(res)).toBe('EMPTY_MESSAGE');
    });

    it('falls back to FALLBACK_ERROR when both message and code are missing', async () => {
      const res = makeResponse({
        contentType: 'application/json',
        json: async () => ({ error: {} }),
      });
      expect(await readOnboardingApiError(res)).toBe('Request failed');
    });

    it('falls back to FALLBACK_ERROR when both message and code are empty strings', async () => {
      const res = makeResponse({
        contentType: 'application/json',
        json: async () => ({ error: { message: '', code: '' } }),
      });
      expect(await readOnboardingApiError(res)).toBe('Request failed');
    });

    it('returns FALLBACK_ERROR when error is an unknown shape (e.g. number)', async () => {
      const res = makeResponse({
        contentType: 'application/json',
        json: async () => ({ error: 42 }),
      });
      expect(await readOnboardingApiError(res)).toBe('Request failed');
    });
  });

  describe('catch-all', () => {
    it('returns FALLBACK_ERROR when response.json() throws (unparseable JSON body)', async () => {
      const res = makeResponse({
        contentType: 'application/json',
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        },
      });
      expect(await readOnboardingApiError(res)).toBe('Request failed');
    });

    it('returns FALLBACK_ERROR when headers access itself throws', async () => {
      // headers omitted entirely — `response.headers.get(...)` will throw TypeError
      const res = { statusText: 'doesnt-matter', json: async () => ({}) } as unknown as Response;
      expect(await readOnboardingApiError(res)).toBe('Request failed');
    });
  });
});
