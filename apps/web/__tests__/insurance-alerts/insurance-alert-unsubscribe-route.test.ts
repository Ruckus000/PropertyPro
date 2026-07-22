/**
 * Route tests for the no-login insurance-alert unsubscribe.
 *  - POST is the RFC 8058 one-click target (mail clients POST here),
 *  - GET backs the human-clicked link and returns a confirmation page,
 *  - a missing/invalid token neither writes nor 200s.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { verifyMock, applyMock } = vi.hoisted(() => ({
  verifyMock: vi.fn(),
  applyMock: vi.fn(),
}));

vi.mock('../../src/lib/services/insurance-alert-unsubscribe-token', () => ({
  verifyInsuranceAlertUnsubscribeToken: verifyMock,
}));
vi.mock('../../src/lib/services/insurance-alert-unsubscribe-service', () => ({
  applyInsuranceAlertUnsubscribe: applyMock,
}));

import { GET, POST } from '../../src/app/api/v1/insurance-alerts/unsubscribe/route';

const url = (token?: string) =>
  new NextRequest(
    `http://localhost:3000/api/v1/insurance-alerts/unsubscribe${token ? `?token=${token}` : ''}`,
    { method: 'GET' },
  );

describe('insurance-alert unsubscribe route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyMock.mockResolvedValue(undefined);
  });

  it('POST unsubscribes on a valid token (one-click)', async () => {
    verifyMock.mockReturnValue({ communityId: 1, userId: 'u1' });
    const res = await POST(url('good'));
    expect(res.status).toBe(200);
    expect(applyMock).toHaveBeenCalledWith({ communityId: 1, userId: 'u1' });
  });

  it('GET unsubscribes and returns an HTML confirmation page', async () => {
    verifyMock.mockReturnValue({ communityId: 1, userId: 'u1' });
    const res = await GET(url('good'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(applyMock).toHaveBeenCalledWith({ communityId: 1, userId: 'u1' });
  });

  it('does not write on an invalid token', async () => {
    verifyMock.mockReturnValue(null);
    const res = await POST(url('bad'));
    expect(res.status).toBe(400);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('does not write when the token is missing', async () => {
    const res = await GET(url());
    expect(res.status).toBe(400);
    expect(applyMock).not.toHaveBeenCalled();
    expect(verifyMock).not.toHaveBeenCalled();
  });
});
