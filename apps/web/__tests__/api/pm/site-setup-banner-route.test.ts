import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError } from '@/lib/api/errors';

const { requireAuthMock, getPrefMock, setPrefMock } = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  getPrefMock: vi.fn(),
  setPrefMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthMock,
}));

vi.mock('@/lib/services/user-preferences-service', () => ({
  getUserPreference: getPrefMock,
  setUserPreference: setPrefMock,
}));

import { GET, POST } from '@/app/api/v1/pm/site-setup-banner/route';

function getReq() {
  return new NextRequest('http://localhost/api/v1/pm/site-setup-banner');
}
function postReq() {
  return new NextRequest('http://localhost/api/v1/pm/site-setup-banner', { method: 'POST' });
}

describe('GET /api/v1/pm/site-setup-banner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue('user-1');
  });

  it('returns dismissed=true when the stored preference says so', async () => {
    getPrefMock.mockResolvedValueOnce({ dismissed: true, dismissedAt: '2026-06-02T00:00:00Z' });
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { dismissed: true } });
  });

  it('returns dismissed=false when never set (null)', async () => {
    getPrefMock.mockResolvedValueOnce(null);
    const res = await GET(getReq());
    expect(await res.json()).toEqual({ data: { dismissed: false } });
  });

  it('401s when unauthenticated', async () => {
    requireAuthMock.mockRejectedValueOnce(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));
    const res = await GET(getReq());
    expect(res.status).toBe(401);
    expect(getPrefMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/pm/site-setup-banner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue('user-1');
    setPrefMock.mockResolvedValue(undefined);
  });

  it('persists the dismissal for the user and returns dismissed=true', async () => {
    const res = await POST(postReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { dismissed: true } });
    expect(setPrefMock).toHaveBeenCalledWith(
      'user-1',
      'pm_site_setup_banner_dismissed',
      expect.objectContaining({ dismissed: true }),
    );
  });

  it('401s when unauthenticated', async () => {
    requireAuthMock.mockRejectedValueOnce(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));
    const res = await POST(postReq());
    expect(res.status).toBe(401);
    expect(setPrefMock).not.toHaveBeenCalled();
  });
});
