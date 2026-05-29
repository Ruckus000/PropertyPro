/**
 * Unit tests for POST /api/v1/auth/confirm-verification (A1 drain #157).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  getPendingSignupForVerificationMock,
  getSupabaseEmailVerificationStatusMock,
  markPendingSignupEmailVerifiedIfPendingMock,
} = vi.hoisted(() => ({
  getPendingSignupForVerificationMock: vi.fn(),
  getSupabaseEmailVerificationStatusMock: vi.fn(),
  markPendingSignupEmailVerifiedIfPendingMock: vi.fn(),
}));

vi.mock('@/lib/services/provisioning-service', () => ({
  getPendingSignupForVerification: getPendingSignupForVerificationMock,
  getSupabaseEmailVerificationStatus: getSupabaseEmailVerificationStatusMock,
  markPendingSignupEmailVerifiedIfPending: markPendingSignupEmailVerifiedIfPendingMock,
}));

import { POST } from '../../src/app/api/v1/auth/confirm-verification/route';

const URL = 'http://localhost:3000/api/v1/auth/confirm-verification';

function buildRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const pendingSignup = {
  id: 1n,
  signupRequestId: 'req-abc',
  authUserId: 'auth-1',
  status: 'pending_verification',
  expiresAt: new Date(Date.now() + 60_000),
};

describe('POST /api/v1/auth/confirm-verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPendingSignupForVerificationMock.mockResolvedValue(pendingSignup);
    getSupabaseEmailVerificationStatusMock.mockResolvedValue({
      ok: true,
      emailConfirmedAt: new Date().toISOString(),
    });
    markPendingSignupEmailVerifiedIfPendingMock.mockResolvedValue({ updated: true });
  });

  it('marks signup email verified and returns success payload', async () => {
    const res = await POST(buildRequest({ signupRequestId: 'req-abc' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ data: { success: true, signupRequestId: 'req-abc' } });
    expect(markPendingSignupEmailVerifiedIfPendingMock).toHaveBeenCalledWith('req-abc');
  });

  it('returns idempotent success for email_verified status', async () => {
    getPendingSignupForVerificationMock.mockResolvedValue({
      ...pendingSignup,
      status: 'email_verified',
    });

    const res = await POST(buildRequest({ signupRequestId: 'req-abc' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ data: { success: true, signupRequestId: 'req-abc' } });
    expect(getSupabaseEmailVerificationStatusMock).not.toHaveBeenCalled();
    expect(markPendingSignupEmailVerifiedIfPendingMock).not.toHaveBeenCalled();
  });

  it('returns idempotent success for checkout_started status', async () => {
    getPendingSignupForVerificationMock.mockResolvedValue({
      ...pendingSignup,
      status: 'checkout_started',
    });

    const res = await POST(buildRequest({ signupRequestId: 'req-abc' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ data: { success: true, signupRequestId: 'req-abc' } });
    expect(markPendingSignupEmailVerifiedIfPendingMock).not.toHaveBeenCalled();
  });

  it('returns idempotent success when transition races to email_verified', async () => {
    markPendingSignupEmailVerifiedIfPendingMock.mockResolvedValue({
      updated: false,
      currentStatus: 'email_verified',
    });

    const res = await POST(buildRequest({ signupRequestId: 'req-abc' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ data: { success: true, signupRequestId: 'req-abc' } });
  });

  it('returns 400 when signup is not found', async () => {
    getPendingSignupForVerificationMock.mockResolvedValue(null);
    const res = await POST(buildRequest({ signupRequestId: 'missing' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.message).toBe('Signup request not found');
  });

  it('returns 400 when email is not verified in Supabase yet', async () => {
    getSupabaseEmailVerificationStatusMock.mockResolvedValue({
      ok: true,
      emailConfirmedAt: null,
    });

    const res = await POST(buildRequest({ signupRequestId: 'req-abc' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.message).toContain('Email has not been verified yet');
    expect(markPendingSignupEmailVerifiedIfPendingMock).not.toHaveBeenCalled();
  });

  it('returns 400 when signupRequestId is missing', async () => {
    const res = await POST(buildRequest({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });
});
