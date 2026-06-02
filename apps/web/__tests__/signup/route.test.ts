import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { SignupEmailDeliveryError, ValidationError } from '../../src/lib/api/errors';

const { checkSignupSubdomainAvailabilityMock, submitSignupMock } = vi.hoisted(() => ({
  checkSignupSubdomainAvailabilityMock: vi.fn(),
  submitSignupMock: vi.fn(),
}));

vi.mock('../../src/lib/auth/signup', () => ({
  checkSignupSubdomainAvailability: checkSignupSubdomainAvailabilityMock,
  submitSignup: submitSignupMock,
}));

import { GET, POST } from '../../src/app/api/v1/auth/signup/route';

describe('GET /api/v1/auth/signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkSignupSubdomainAvailabilityMock.mockResolvedValue({
      normalizedSubdomain: 'sunrise-cove',
      available: true,
      reason: 'available',
      message: 'Subdomain is available.',
    });
  });

  it('returns subdomain availability on happy path', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/auth/signup?subdomain=sunrise-cove',
    );

    const res = await GET(req);
    const body = (await res.json()) as { data: { available: boolean } };

    expect(res.status).toBe(200);
    expect(body.data.available).toBe(true);
    expect(checkSignupSubdomainAvailabilityMock).toHaveBeenCalledWith(
      'sunrise-cove',
      { excludeSignupRequestId: undefined, signupRequestId: undefined },
    );
  });

  it('forwards signupRequestId to availability check', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/auth/signup?subdomain=sunrise-cove&signupRequestId=req-42',
    );

    await GET(req);

    expect(checkSignupSubdomainAvailabilityMock).toHaveBeenCalledWith(
      'sunrise-cove',
      { excludeSignupRequestId: 'req-42', signupRequestId: 'req-42' },
    );
  });

  it('returns 400 when subdomain query is missing', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/auth/signup');

    const res = await GET(req);
    const body = (await res.json()) as {
      error: {
        code: string;
        message: string;
        details?: { fields?: Array<{ field: string }> };
      };
    };

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Invalid query parameters');
    expect(body.error.details?.fields?.some((entry) => entry.field === 'subdomain')).toBe(true);
    expect(checkSignupSubdomainAvailabilityMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/auth/signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitSignupMock.mockResolvedValue({
      signupRequestId: 'req-1',
      subdomain: 'sunrise-cove',
      verificationRequired: true,
      checkoutEligible: false,
      message: 'ok',
    });
  });

  it('submits signup payload and returns canonical envelope', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'jordan@example.com' }),
    });

    const res = await POST(req);
    const body = (await res.json()) as { data: { signupRequestId: string } };

    expect(res.status).toBe(200);
    expect(body.data.signupRequestId).toBe('req-1');
    expect(submitSignupMock).toHaveBeenCalledWith({
      email: 'jordan@example.com',
    });
  });

  it('returns structured 400 fieldErrors when submitSignup rejects validation', async () => {
    submitSignupMock.mockRejectedValueOnce(
      new ValidationError('Invalid signup payload', {
        fieldErrors: { email: ['Please enter a valid email address'] },
      }),
    );

    const req = new NextRequest('http://localhost:3000/api/v1/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });

    const res = await POST(req);
    const body = (await res.json()) as {
      error: {
        code: string;
        details?: { fieldErrors?: { email?: string[] } };
      };
    };

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.fieldErrors?.email).toEqual([
      'Please enter a valid email address',
    ]);
  });

  it('returns a structured 503 when signup email delivery fails', async () => {
    submitSignupMock.mockRejectedValueOnce(
      new SignupEmailDeliveryError(
        'We could not send your verification email right now. Please try again.',
      ),
    );

    const req = new NextRequest('http://localhost:3000/api/v1/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'jordan@example.com' }),
    });

    const res = await POST(req);
    const body = (await res.json()) as {
      error: { code: string; message: string };
    };

    expect(res.status).toBe(503);
    expect(body.error.code).toBe('SIGNUP_EMAIL_DELIVERY_FAILED');
    expect(body.error.message).toBe(
      'We could not send your verification email right now. Please try again.',
    );
  });
});
