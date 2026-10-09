import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { checkSignupSubdomainAvailabilityMock } = vi.hoisted(() => ({
  checkSignupSubdomainAvailabilityMock: vi.fn(),
}));

vi.mock('../../src/lib/auth/signup', () => ({
  checkSignupSubdomainAvailability: checkSignupSubdomainAvailabilityMock,
}));

import { GET } from '../../src/app/api/v1/auth/signup/route';

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
