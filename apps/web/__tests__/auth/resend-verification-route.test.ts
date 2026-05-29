/**
 * Unit tests for POST /api/v1/auth/resend-verification (A1 drain #154).
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  getPendingSignupForResendMock,
  generateVerificationActionLinkMock,
  markVerificationEmailSentMock,
  sendEmailMock,
} = vi.hoisted(() => ({
  getPendingSignupForResendMock: vi.fn(),
  generateVerificationActionLinkMock: vi.fn(),
  markVerificationEmailSentMock: vi.fn(),
  sendEmailMock: vi.fn(),
}));

vi.mock('@/lib/services/provisioning-service', () => ({
  getPendingSignupForResend: getPendingSignupForResendMock,
  generateVerificationActionLink: generateVerificationActionLinkMock,
  markVerificationEmailSent: markVerificationEmailSentMock,
}));

vi.mock('@propertypro/email', () => ({
  sendEmail: sendEmailMock,
  SignupVerificationEmail: () => null,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, createElement: vi.fn((_type, props) => props) };
});

import { POST } from '../../src/app/api/v1/auth/resend-verification/route';

const URL = 'http://localhost:3000/api/v1/auth/resend-verification';

function buildRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const pendingSignup = {
  id: 1,
  signupRequestId: 'req-abc',
  email: 'user@example.com',
  status: 'pending_verification',
  authUserId: 'auth-1',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  verificationEmailSentAt: null,
  primaryContactName: 'Alex',
  communityName: 'Sunset Condos',
};

describe('POST /api/v1/auth/resend-verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPendingSignupForResendMock.mockResolvedValue(pendingSignup);
    generateVerificationActionLinkMock.mockResolvedValue({
      ok: true,
      actionLink: 'https://auth.example/verify',
    });
    sendEmailMock.mockResolvedValue({ id: 'msg-1' });
    markVerificationEmailSentMock.mockResolvedValue(undefined);
  });

  it('sends verification email and returns cooldownSeconds', async () => {
    const res = await POST(buildRequest({ signupRequestId: 'req-abc' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ data: { sent: true, cooldownSeconds: 120 } });
    expect(sendEmailMock).toHaveBeenCalled();
    expect(markVerificationEmailSentMock).toHaveBeenCalledWith(1, 'msg-1');
  });

  it('returns 404 when signup is not found', async () => {
    getPendingSignupForResendMock.mockResolvedValue(null);
    const res = await POST(buildRequest({ signupRequestId: 'missing' }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.message).toBe('Signup request not found or has expired.');
  });

  it('returns 409 with alreadyVerified payload', async () => {
    getPendingSignupForResendMock.mockResolvedValue({
      ...pendingSignup,
      status: 'email_verified',
    });
    const res = await POST(buildRequest({ signupRequestId: 'req-abc' }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.data).toEqual({ alreadyVerified: true, signupRequestId: 'req-abc' });
  });

  it('returns 429 with cooldownRemainingSeconds on cooldown', async () => {
    getPendingSignupForResendMock.mockResolvedValue({
      ...pendingSignup,
      verificationEmailSentAt: new Date().toISOString(),
    });
    const res = await POST(buildRequest({ signupRequestId: 'req-abc' }));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error.message).toContain('Please wait');
    expect(json.error.cooldownRemainingSeconds).toBeGreaterThan(0);
  });

  it('returns 400 when signupRequestId is missing', async () => {
    const res = await POST(buildRequest({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 500 when email send fails', async () => {
    sendEmailMock.mockRejectedValue(new Error('smtp down'));
    const res = await POST(buildRequest({ signupRequestId: 'req-abc' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error.message).toBe('Unable to send verification email. Please try again.');
  });
});
