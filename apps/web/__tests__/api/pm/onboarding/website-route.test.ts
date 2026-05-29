import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError } from '@/lib/api/errors/AppError';

const {
  updateBrandingMock,
  requireAuthMock,
  requireMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePlanFeatureMock,
} = vi.hoisted(() => ({
  updateBrandingMock: vi.fn(),
  requireAuthMock: vi.fn(),
  requireMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
}));

vi.mock('@/lib/api/branding', () => ({
  updateBrandingForCommunity: updateBrandingMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireMembershipMock,
}));

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));

vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: requirePlanFeatureMock,
}));

import { PATCH } from '@/app/api/v1/pm/onboarding/website/route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/pm/onboarding/website', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('PATCH /api/v1/pm/onboarding/website', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue('user-1');
    requireMembershipMock.mockResolvedValue({ role: 'pm_admin', communityId: 42 });
    resolveEffectiveCommunityIdMock.mockImplementation((_req: unknown, id: number) => id);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    updateBrandingMock.mockResolvedValue({
      layoutId: 'tidewater',
      themePresetSlug: null,
      tagline: null,
      primaryColor: '#0e3338',
      secondaryColor: '#f6f1e6',
      accentColor: '#c66f49',
      fontHeading: 'Fraunces',
      fontBody: 'Manrope',
    });
  });

  it('200s on a layoutId-only patch and returns shaped branding', async () => {
    const res = await PATCH(makeRequest({ communityId: 42, layoutId: 'tidewater' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.branding).toMatchObject({
      layoutId: 'tidewater',
      themePresetSlug: null,
    });
    expect(updateBrandingMock).toHaveBeenCalledWith(42, { layoutId: 'tidewater' });
  });

  it('forwards multi-field patches as a single merge call', async () => {
    await PATCH(makeRequest({
      communityId: 42,
      themePresetSlug: 'bay-light',
      tagline: 'Coastal living',
    }));
    expect(updateBrandingMock).toHaveBeenCalledWith(42, {
      themePresetSlug: 'bay-light',
      tagline: 'Coastal living',
    });
  });

  it('400s when no wizard fields are supplied', async () => {
    const res = await PATCH(makeRequest({ communityId: 42 }));
    expect(res.status).toBe(400);
    expect(updateBrandingMock).not.toHaveBeenCalled();
  });

  it('400s on invalid hex color', async () => {
    const res = await PATCH(makeRequest({ communityId: 42, primaryColor: 'red' }));
    expect(res.status).toBe(400);
    expect(updateBrandingMock).not.toHaveBeenCalled();
  });

  it('400s when communityId is missing', async () => {
    const res = await PATCH(makeRequest({ layoutId: 'tidewater' }));
    expect(res.status).toBe(400);
    expect(updateBrandingMock).not.toHaveBeenCalled();
  });

  it('401s when unauthenticated', async () => {
    requireAuthMock.mockRejectedValueOnce(
      new AppError('Unauthorized', 401, 'UNAUTHORIZED'),
    );
    const res = await PATCH(makeRequest({ communityId: 42, layoutId: 'tidewater' }));
    expect(res.status).toBe(401);
    expect(updateBrandingMock).not.toHaveBeenCalled();
  });

  it('403s when membership role is not pm_admin/cam', async () => {
    requireMembershipMock.mockResolvedValueOnce({ role: 'owner', communityId: 42 });
    const res = await PATCH(makeRequest({ communityId: 42, layoutId: 'tidewater' }));
    expect(res.status).toBe(403);
    expect(updateBrandingMock).not.toHaveBeenCalled();
  });

  it('allows CAM managers to write through the wizard', async () => {
    requireMembershipMock.mockResolvedValueOnce({ role: 'manager', presetKey: 'cam', communityId: 42 });
    const res = await PATCH(makeRequest({ communityId: 42, layoutId: 'tidewater' }));
    expect(res.status).toBe(200);
    expect(updateBrandingMock).toHaveBeenCalled();
  });

  it('403s when the plan does not include hasSiteEditor', async () => {
    requirePlanFeatureMock.mockRejectedValueOnce(
      new AppError('Plan upgrade required', 403, 'PLAN_UPGRADE_REQUIRED'),
    );
    const res = await PATCH(makeRequest({ communityId: 42, layoutId: 'tidewater' }));
    expect(res.status).toBe(403);
    expect(updateBrandingMock).not.toHaveBeenCalled();
  });
});
