/**
 * Unit tests — `/api/v1/pm/site-editor/preferences` (builder v4, Phase 3).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError } from '@/lib/api/errors';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  requireAuthMock,
  requireMembershipMock,
  requirePlanFeatureMock,
  getPrefMock,
  mergePrefMock,
} = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  requireMembershipMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  getPrefMock: vi.fn(),
  mergePrefMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: requireAuthMock }));
vi.mock('@/lib/api/community-membership', () => ({ requireCommunityMembership: requireMembershipMock }));
vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: (_req: unknown, id: number) => id,
}));
vi.mock('@/lib/middleware/plan-guard', () => ({ requirePlanFeature: requirePlanFeatureMock }));
vi.mock('@/lib/services/user-preferences-service', () => ({
  getUserPreference: getPrefMock,
  mergeUserPreference: mergePrefMock,
}));

import { GET, PATCH } from '../../src/app/api/v1/pm/site-editor/preferences/route';

const get = () =>
  GET(new NextRequest('http://localhost:3000/api/v1/pm/site-editor/preferences?communityId=42'));
const patch = (body: Record<string, unknown>) =>
  PATCH(
    new NextRequest('http://localhost:3000/api/v1/pm/site-editor/preferences', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId: 42, ...body }),
    }),
  );

/** Stored rows, keyed like user_preferences. */
let store: Record<string, unknown>;

describe('/api/v1/pm/site-editor/preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store = {};
    requireAuthMock.mockResolvedValue('user-1');
    requireMembershipMock.mockResolvedValue({ communityId: 42, role: 'property_manager' });
    requirePlanFeatureMock.mockResolvedValue(undefined);
    getPrefMock.mockImplementation(async (_u: string, key: string) => store[key] ?? null);
    mergePrefMock.mockImplementation(async (_u: string, key: string, p: Record<string, unknown>) => {
      store[key] = { ...((store[key] as object) ?? {}), ...p };
    });
  });

  it('GET: nothing stored means not chosen yet, nothing done', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ mode: null, tourDone: false, marked: [], visited: [] });
    expect(getPrefMock).toHaveBeenCalledWith('user-1', 'site_editor_mode');
    expect(getPrefMock).toHaveBeenCalledWith('user-1', 'site_editor_checklist:42');
  });

  it('GET reads only known values; junk in the row is ignored', async () => {
    store['site_editor_mode'] = { mode: 'sideways', tourDone: 'yes' };
    store['site_editor_checklist:42'] = { 'mark.welcome': true, 'mark.evil': true, 'visit.pages': true };
    const body = (await (await get()).json()).data;
    expect(body).toEqual({ mode: null, tourDone: false, marked: ['welcome'], visited: ['pages'] });
  });

  it('PATCH writes the mode per USER and the checklist per user PER COMMUNITY', async () => {
    const res = await patch({ mode: 'guided', tourDone: true, mark: 'photo', visit: 'phone' });
    expect(res.status).toBe(200);
    expect(mergePrefMock).toHaveBeenCalledWith('user-1', 'site_editor_mode', { mode: 'guided', tourDone: true });
    expect(mergePrefMock).toHaveBeenCalledWith('user-1', 'site_editor_checklist:42', {
      'mark.photo': true,
      'visit.phone': true,
    });
    expect((await res.json()).data).toEqual({
      mode: 'guided', tourDone: true, marked: ['photo'], visited: ['phone'],
    });
  });

  it('PATCH unmark clears a hand-ticked step', async () => {
    store['site_editor_checklist:42'] = { 'mark.welcome': true };
    const res = await patch({ unmark: 'welcome' });
    expect((await res.json()).data.marked).toEqual([]);
  });

  it('PATCH touches only the key it changes', async () => {
    await patch({ visit: 'design' });
    expect(mergePrefMock).toHaveBeenCalledTimes(1);
    expect(mergePrefMock).toHaveBeenCalledWith('user-1', 'site_editor_checklist:42', { 'visit.design': true });
  });

  it.each([
    ['an unknown field', { theme: 'dark' }],
    ['an unknown step', { mark: 'design' }],
    ['an unknown mode', { mode: 'expert' }],
    ['an empty change', {}],
    ['mark and unmark of the same step', { mark: 'welcome', unmark: 'welcome' }],
  ])('PATCH 400s on %s and writes nothing', async (_label, body) => {
    const res = await patch(body);
    expect(res.status).toBe(400);
    expect(mergePrefMock).not.toHaveBeenCalled();
  });

  it('401s when signed out', async () => {
    requireAuthMock.mockRejectedValue(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));
    expect((await get()).status).toBe(401);
    expect((await patch({ mode: 'free' })).status).toBe(401);
    expect(mergePrefMock).not.toHaveBeenCalled();
  });

  it('403s a resident, before reading or writing anything', async () => {
    requireMembershipMock.mockResolvedValue({ communityId: 42, role: 'resident', isUnitOwner: true });
    expect((await get()).status).toBe(403);
    expect((await patch({ mode: 'free' })).status).toBe(403);
    expect(getPrefMock).not.toHaveBeenCalled();
    expect(mergePrefMock).not.toHaveBeenCalled();
  });

  it('403s a community without the site editor', async () => {
    requirePlanFeatureMock.mockRejectedValue(new ForbiddenError('Upgrade'));
    expect((await patch({ mode: 'free' })).status).toBe(403);
    expect(mergePrefMock).not.toHaveBeenCalled();
  });

  it('checks membership in the community the request names', async () => {
    await get();
    expect(requireMembershipMock).toHaveBeenCalledWith(42, 'user-1');
  });
});
