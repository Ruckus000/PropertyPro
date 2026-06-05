import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  isPmAdminInAnyCommunityMock,
  userHasAccessMock,
  applyTemplateMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  isPmAdminInAnyCommunityMock: vi.fn(),
  userHasAccessMock: vi.fn(),
  applyTemplateMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: requireAuthenticatedUserIdMock }));
vi.mock('@/lib/api/pm-communities', () => ({ isPmAdminInAnyCommunity: isPmAdminInAnyCommunityMock }));
vi.mock('@/lib/services/site-portfolio-template-service', () => ({
  userHasPortfolioTemplatesAccess: userHasAccessMock,
  applyTemplate: applyTemplateMock,
}));

import { POST } from '../../src/app/api/v1/pm/portfolio/templates/[id]/apply/route';

const RESULTS = {
  results: [
    { communityId: 1, communityName: 'Sunset Condos', status: 'applied' as const },
    { communityId: 2, communityName: 'Palm Shores', status: 'failed' as const, reason: 'db down' },
  ],
};

function applyReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/pm/portfolio/templates/5/apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const CTX = { params: Promise.resolve({ id: '5' }) };

describe('pm portfolio templates apply route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('pm-1');
    isPmAdminInAnyCommunityMock.mockResolvedValue(true);
    userHasAccessMock.mockResolvedValue(true);
    applyTemplateMock.mockResolvedValue(RESULTS);
  });

  it('403 when the user is not a PM', async () => {
    isPmAdminInAnyCommunityMock.mockResolvedValueOnce(false);
    const res = await POST(applyReq({ communityIds: [1, 2] }), CTX);
    expect(res.status).toBe(403);
    expect(applyTemplateMock).not.toHaveBeenCalled();
  });

  it('403 PLAN_UPGRADE_REQUIRED when the user lacks the feature', async () => {
    userHasAccessMock.mockResolvedValueOnce(false);
    const res = await POST(applyReq({ communityIds: [1, 2] }), CTX);
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('PLAN_UPGRADE_REQUIRED');
  });

  it('400 when communityIds is empty', async () => {
    const res = await POST(applyReq({ communityIds: [] }), CTX);
    expect(res.status).toBe(400);
    expect(applyTemplateMock).not.toHaveBeenCalled();
  });

  it('applies the template and returns per-community results', async () => {
    const res = await POST(applyReq({ communityIds: [1, 2] }), CTX);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: typeof RESULTS };
    expect(json.data.results).toHaveLength(2);
    expect(applyTemplateMock).toHaveBeenCalledWith('pm-1', 5, [1, 2]);
  });
});
