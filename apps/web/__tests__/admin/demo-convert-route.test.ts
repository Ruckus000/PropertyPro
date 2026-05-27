/**
 * Route unit tests — POST and OPTIONS /api/v1/admin/demo/[slug]/convert.
 *
 * Added alongside Plan A1 drain #86. The route is a deprecated stub that
 * always returns HTTP 410 with `{ error: { code: 'DEPRECATED', message }}`.
 *
 * Coverage:
 *   - POST returns 410 with `error.code === 'DEPRECATED'` and the exact
 *     pre-migration message (verifies `AppError` → `withErrorHandler`
 *     envelope conversion).
 *   - OPTIONS returns 410 with the same envelope verbatim (verifies the
 *     plain Next.js handler is preserved — not routed through `runRoute`).
 */
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { POST, OPTIONS } from '../../src/app/api/v1/admin/demo/[slug]/convert/route';

function jsonPost(
  slug: string,
  body: unknown = {},
  headers?: Record<string, string>,
): NextRequest {
  const url = `http://localhost:3000/api/v1/admin/demo/${slug}/convert`;
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
    body: JSON.stringify(body),
  });
}

function routeCtx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

describe('POST /api/v1/admin/demo/[slug]/convert', () => {
  it('returns 410 with DEPRECATED error code and the pre-migration message', async () => {
    const res = await POST(jsonPost('sunset-condos', {}), routeCtx('sunset-condos'));

    expect(res.status).toBe(410);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe('DEPRECATED');
    expect(json.error.message).toBe('This endpoint has been moved to the admin app API');
  });
});

describe('OPTIONS /api/v1/admin/demo/[slug]/convert', () => {
  it('returns 410 with DEPRECATED error code and the pre-migration message', async () => {
    const res = await OPTIONS();

    expect(res.status).toBe(410);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe('DEPRECATED');
    expect(json.error.message).toBe('This endpoint has been moved to the admin app API');
  });
});
