/**
 * Route unit tests — `GET`, `PATCH`, and `POST /api/v1/onboarding/checklist`.
 *
 * Plan A1 drain #123.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  getChecklistItemsMock,
  markItemCompleteMock,
  createChecklistItemsMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  getChecklistItemsMock: vi.fn(),
  markItemCompleteMock: vi.fn(),
  createChecklistItemsMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));

vi.mock('@/lib/services/onboarding-checklist-service', () => ({
  getChecklistItems: getChecklistItemsMock,
  markItemComplete: markItemCompleteMock,
  createChecklistItems: createChecklistItemsMock,
  CHECKLIST_DISPLAY: {
    add_units: 'Add your units',
    upload_first_document: 'Upload your first compliance document',
  },
}));

import { GET, PATCH, POST } from '../../src/app/api/v1/onboarding/checklist/route';

const MEMBERSHIP = {
  userId: 'user-1',
  communityId: 42,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'CAM',
  communityType: 'condo_718' as const,
  designation: null as string | null,
};

const CHECKLIST_ITEM = {
  id: 1,
  communityId: 42,
  userId: 'user-1',
  itemKey: 'add_units',
  completedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

describe('GET /api/v1/onboarding/checklist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    getChecklistItemsMock.mockResolvedValue([CHECKLIST_ITEM]);
  });

  it('returns enriched checklist items', async () => {
    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/onboarding/checklist'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Array<{ displayText: string }> };
    expect(json.data[0]?.displayText).toContain('units');
    expect(getChecklistItemsMock).toHaveBeenCalledWith(42, 'user-1');
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/onboarding/checklist'),
    );

    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v1/onboarding/checklist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    markItemCompleteMock.mockResolvedValue(undefined);
  });

  it('marks an item complete', async () => {
    const res = await PATCH(
      new NextRequest('http://localhost:3000/api/v1/onboarding/checklist', {
        method: 'PATCH',
        body: JSON.stringify({ itemKey: 'add_units' }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(res.status).toBe(200);
    expect(markItemCompleteMock).toHaveBeenCalledWith(42, 'user-1', 'add_units');
  });

  it('returns 400 for invalid itemKey', async () => {
    const res = await PATCH(
      new NextRequest('http://localhost:3000/api/v1/onboarding/checklist', {
        method: 'PATCH',
        body: JSON.stringify({ itemKey: 'not_a_real_key' }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(res.status).toBe(400);
    expect(markItemCompleteMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/onboarding/checklist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    createChecklistItemsMock.mockResolvedValue(undefined);
  });

  it('creates checklist items', async () => {
    const res = await POST(
      new NextRequest('http://localhost:3000/api/v1/onboarding/checklist', {
        method: 'POST',
        body: JSON.stringify({ communityId: 42 }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { created: boolean } };
    expect(json.data.created).toBe(true);
    expect(createChecklistItemsMock).toHaveBeenCalledWith(42, 'user-1', 'cam', null, 'condo_718');
  });
});
