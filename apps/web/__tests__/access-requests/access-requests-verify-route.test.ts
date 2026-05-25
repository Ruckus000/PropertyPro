/**
 * Route unit tests — `POST /api/v1/access-requests/verify`.
 *
 * Added alongside Plan A1 drain #41. The route had inline coverage in
 * `route.test.ts` pre-migration; that file mocks `withErrorHandler` as an
 * identity passthrough and so cannot observe the canonical
 * `VALIDATION_ERROR` envelope. This dedicated file uses the REAL
 * `withErrorHandler` so the runner's body-validation 400 envelope is
 * end-to-end visible.
 *
 * The route is a public endpoint — no authentication mocks, no membership
 * mocks, no permission mocks. The handler reduces to body-validate →
 * `verifyOtp(body)` → `{ data: <result> }`. Tests below cover the
 * happy path and the full body-validation matrix (missing fields, wrong
 * length, non-object body).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { verifyOtpMock } = vi.hoisted(() => ({
  verifyOtpMock: vi.fn(),
}));

vi.mock('@/lib/services/access-request-service', () => ({
  verifyOtp: verifyOtpMock,
}));

// Prevent eager DATABASE_URL load via @propertypro/db/unsafe (some service
// modules transitively import it).
vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(() => ({})),
}));

import { POST } from '../../src/app/api/v1/access-requests/verify/route';

function jsonPost(payload: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/access-requests/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
  });
}

interface DataEnvelope {
  data: unknown;
}

interface ErrorEnvelope {
  error: { code: string; message?: string };
}

describe('POST /api/v1/access-requests/verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with the verifyOtp result wrapped in { data }', async () => {
    verifyOtpMock.mockResolvedValue({ verified: true, requestId: 42 });

    const res = await POST(
      jsonPost({ requestId: 42, otp: '123456', communityId: 1 }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as DataEnvelope;
    expect(json.data).toEqual({ verified: true, requestId: 42 });
    expect(verifyOtpMock).toHaveBeenCalledWith({
      requestId: 42,
      otp: '123456',
      communityId: 1,
    });
  });

  it('returns 400 VALIDATION_ERROR when requestId is missing', async () => {
    const res = await POST(jsonPost({ otp: '123456', communityId: 1 }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorEnvelope;
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(verifyOtpMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when otp is missing', async () => {
    const res = await POST(jsonPost({ requestId: 42, communityId: 1 }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorEnvelope;
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(verifyOtpMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when otp is not exactly 6 characters', async () => {
    const res = await POST(
      jsonPost({ requestId: 42, otp: '12345', communityId: 1 }),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorEnvelope;
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(verifyOtpMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when communityId is missing', async () => {
    const res = await POST(jsonPost({ requestId: 42, otp: '123456' }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorEnvelope;
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(verifyOtpMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when the body is not an object', async () => {
    const res = await POST(jsonPost(null));

    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorEnvelope;
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(verifyOtpMock).not.toHaveBeenCalled();
  });
});
