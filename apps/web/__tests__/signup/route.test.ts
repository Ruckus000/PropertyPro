import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { SignupEmailDeliveryError } from '../../src/lib/api/errors';

const { checkSignupSubdomainAvailabilityMock, submitSignupMock } = vi.hoisted(() => ({
  checkSignupSubdomainAvailabilityMock: vi.fn(),
  submitSignupMock: vi.fn(),
}));

vi.mock('../../src/lib/auth/signup', () => ({
  checkSignupSubdomainAvailability: checkSignupSubdomainAvailabilityMock,
  submitSignup: submitSignupMock,
}));

import { GET, POST } from '../../src/app/api/v1/auth/signup/route';

describe('signup route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkSignupSubdomainAvailabilityMock.mockResolvedValue({
      normalizedSubdomain: 'sunrise-cove',
      available: true,
      reason: 'available',
      message: 'Subdomain is available.',
    });
    submitSignupMock.mockResolvedValue({
      signupRequestId: 'req-1',
      subdomain: 'sunrise-cove',
      verificationRequired: true,
      checkoutEligible: false,
      message: 'ok',
    });
  });

  it('GET returns subdomain availability', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/auth/signup?subdomain=sunrise-cove',
    );

    const res = await GET(req);
    const body = (await res.json()) as { data: { available: boolean } };

    expect(res.status).toBe(200);
    expect(body.data.available).toBe(true);
    expect(checkSignupSubdomainAvailabilityMock).toHaveBeenCalledWith(
      'sunrise-cove',
      { excludeSignupRequestId: undefined },
    );
  });

  it('POST submits signup payload and returns 202', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'jordan@example.com' }),
    });

    const res = await POST(req);
    const body = (await res.json()) as { data: { signupRequestId: string } };

    expect(res.status).toBe(202);
    expect(body.data.signupRequestId).toBe('req-1');
    expect(submitSignupMock).toHaveBeenCalledWith({
      email: 'jordan@example.com',
    });
  });

  it('POST returns a structured 503 when signup email delivery fails', async () => {
    submitSignupMock.mockRejectedValueOnce(
      new SignupEmailDeliveryError('We could not send your verification email right now. Please try again.'),
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
