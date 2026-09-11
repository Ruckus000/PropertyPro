/**
 * `parseJsonBody` — the one place an admin request body becomes a value.
 *
 * The cases that matter here are about the CSRF shape rather than about JSON.
 * `parseJsonBody` used to `JSON.parse` any body it was handed, which made the
 * five money-moving routes reachable by a cross-site
 * `<form enctype="text/plain">`: no CORS preflight, cookies attached,
 * `{"confirm": true, …}` smuggled into the field name.
 *
 * There was no exploit, because `@supabase/ssr`'s `DEFAULT_COOKIE_OPTIONS` sets
 * `sameSite: 'lax'` and blocks the session cookie on a cross-site POST. That
 * control is INHERITED from a dependency and nothing in this repo asserted it —
 * a bump that changed the default would have turned five money endpoints into
 * CSRF targets with every test still green. These cases plus the `sameSite`
 * assertion in `auth/cookie-config.test.ts` are the two independent pins.
 */
import { describe, expect, it } from 'vitest';
import { NextResponse } from 'next/server';

import { parseJsonBody } from '@/lib/api/parse-body';

const body = (init: RequestInit) => new Request('http://localhost/x', { method: 'POST', ...init });

async function statusOf(result: unknown): Promise<number> {
  return result instanceof NextResponse ? result.status : 200;
}

describe('parseJsonBody content-type gate', () => {
  it('parses a body that declares application/json', async () => {
    const result = await parseJsonBody(
      body({ headers: { 'content-type': 'application/json' }, body: '{"a":1}' }),
    );
    expect(result).toEqual({ a: 1 });
  });

  it('accepts parameters on the content type', async () => {
    const result = await parseJsonBody(
      body({ headers: { 'content-type': 'application/json; charset=utf-8' }, body: '{"a":1}' }),
    );
    expect(result).toEqual({ a: 1 });
  });

  it.each([
    // The three CORS-safelisted types. A cross-site <form> can post any of them
    // with no preflight to refuse.
    ['text/plain', 'text/plain;charset=UTF-8'],
    ['a url-encoded form', 'application/x-www-form-urlencoded'],
    ['a multipart form', 'multipart/form-data; boundary=x'],
    // Not form-postable, but not JSON either — admitted on a guess would be the
    // wrong direction for a gate whose whole job is refusing.
    ['a json suffix type', 'application/merge-patch+json'],
  ])('refuses %s with a 400, without parsing it', async (_label, contentType) => {
    const result = await parseJsonBody(
      body({ headers: { 'content-type': contentType }, body: '{"confirm":true}' }),
    );

    expect(await statusOf(result)).toBe(400);
  });

  it('refuses a body with NO content type at all', async () => {
    // This is why the check is an allowlist and not a denylist of the three
    // form types: `fetch` with a typeless `Blob` body sends no `Content-Type`
    // header, and a denylist would wave it straight through.
    const request = new Request('http://localhost/x', { method: 'POST', body: '{"confirm":true}' });
    request.headers.delete('content-type');

    expect(await statusOf(await parseJsonBody(request))).toBe(400);
  });

  it('still allows an EMPTY body, which several routes are legitimately called with', async () => {
    // A bodyless DELETE sends no content type. Refusing it would break every one
    // of them, so the empty short-circuit runs before the gate.
    const result = await parseJsonBody(new Request('http://localhost/x', { method: 'DELETE' }));
    expect(result).toEqual({});
  });

  it('still returns 400 rather than 500 for malformed JSON', async () => {
    const result = await parseJsonBody(
      body({ headers: { 'content-type': 'application/json' }, body: '{not json' }),
    );
    expect(await statusOf(result)).toBe(400);
  });
});
