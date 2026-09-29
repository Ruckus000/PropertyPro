import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireAuthenticatedUserIdMock, isPmAdminInAnyCommunityMock } = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  isPmAdminInAnyCommunityMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: requireAuthenticatedUserIdMock }));
vi.mock('@/lib/api/pm-communities', () => ({ isPmAdminInAnyCommunity: isPmAdminInAnyCommunityMock }));

import { requirePmPortfolioAccess } from '@/lib/api/pm-portfolio-access';
import { ForbiddenError, UnauthorizedError } from '@/lib/api/errors';

const SUPPORT = { 'x-support-session-id': '42', 'x-support-community-id': '7', 'x-community-id': '7' };

function req(init: Record<string, string> = {}): { headers: Headers } {
  return { headers: new Headers(init) };
}

describe('requirePmPortfolioAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('pm-1');
    isPmAdminInAnyCommunityMock.mockResolvedValue(true);
  });

  it('admits a property manager outside a support session', async () => {
    await expect(requirePmPortfolioAccess(req())).resolves.toBe('pm-1');
    expect(isPmAdminInAnyCommunityMock).toHaveBeenCalledWith('pm-1');
  });

  it('refuses a support session even when the impersonated user is a PM', async () => {
    const err = await requirePmPortfolioAccess(req(SUPPORT)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenError);
    expect((err as Error).message).toBe('Not available during a support session');
    // Refused before the portfolio is even consulted.
    expect(isPmAdminInAnyCommunityMock).not.toHaveBeenCalled();
  });

  it('refuses a support session whose community could not be read', async () => {
    await expect(
      requirePmPortfolioAccess(req({ 'x-support-session-id': '42' })),
    ).rejects.toThrow('Not available during a support session');
  });

  it('keeps the non-PM 403 with the caller-supplied message', async () => {
    isPmAdminInAnyCommunityMock.mockResolvedValue(false);
    await expect(requirePmPortfolioAccess(req(), 'custom message')).rejects.toThrow('custom message');
  });

  it('still authenticates first (401 beats the support refusal)', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());
    await expect(requirePmPortfolioAccess(req(SUPPORT))).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
