/**
 * Route unit tests — `/api/v1/move-checklists/[id]` (GET + POST).
 *
 * Added alongside Plan A1 drain #19. The route had no isolated unit test
 * before; the migration adds coverage of the multi-gate auth chain
 * (`requireAuthenticatedUserId` → `requireCommunityMembership` → `isAdminRole`
 * gate → service call), the runner's params+query / params+body validation
 * envelopes, and both the 404-on-null GET branch and POST happy-path
 * `completeChecklist` call.
 *
 * Mirrors drain #13's (`payments/fee-policy`) two-contracts-per-file test
 * pattern, plus drain #11's (`polls/[id]/my-vote`) Next.js 15 `params:
 * Promise.resolve(...)` ctx shape for path-param plumbing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  isAdminRoleMock,
  getMoveChecklistMock,
  completeChecklistMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  isAdminRoleMock: vi.fn(),
  getMoveChecklistMock: vi.fn(),
  completeChecklistMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@propertypro/shared', async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  isAdminRole: isAdminRoleMock,
}));

vi.mock('@/lib/services/move-checklist-service', () => ({
  getMoveChecklist: getMoveChecklistMock,
  completeChecklist: completeChecklistMock,
}));

import { GET, POST } from '../../src/app/api/v1/move-checklists/[id]/route';

const ADMIN_MEMBERSHIP = {
  userId: 'admin-1',
  communityId: 42,
  role: 'board_president' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  communityType: 'condo_718' as const,
};

const RESIDENT_MEMBERSHIP = {
  userId: 'user-1',
  communityId: 42,
  role: 'resident' as const,
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Unit Owner',
  communityType: 'condo_718' as const,
};

const CHECKLIST_FIXTURE = {
  id: 7,
  communityId: 42,
  leaseId: 100,
  unitId: 200,
  residentId: 'resident-1',
  type: 'move_in',
  checklistData: { step1: { completed: true } },
  completedAt: null,
  completedBy: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  deletedAt: null,
};

interface DataEnvelope {
  data: unknown;
}

function ctx(id: number | string): { params: Promise<Record<string, string>> } {
  return { params: Promise.resolve({ id: String(id) }) };
}

function jsonPost(
  payload: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/move-checklists/7', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

describe('GET /api/v1/move-checklists/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('admin-1');
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    isAdminRoleMock.mockReturnValue(true);
  });

  it('returns the checklist envelope when admin and checklist exists', async () => {
    getMoveChecklistMock.mockResolvedValue(CHECKLIST_FIXTURE);

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/move-checklists/7?communityId=42'),
      ctx(7),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as DataEnvelope;
    expect(json.data).toBeDefined();
    // checklistId + communityId arrive coerced from the path/query strings.
    expect(getMoveChecklistMock).toHaveBeenCalledWith(42, 7);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'admin-1');
    expect(isAdminRoleMock).toHaveBeenCalledWith('board_president');
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/move-checklists/7?communityId=42'),
      ctx(7),
    );

    expect(res.status).toBe(401);
    expect(getMoveChecklistMock).not.toHaveBeenCalled();
  });

  it('returns 403 when user is not a community member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member'),
    );

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/move-checklists/7?communityId=42'),
      ctx(7),
    );

    expect(res.status).toBe(403);
    expect(isAdminRoleMock).not.toHaveBeenCalled();
    expect(getMoveChecklistMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the actor is not an admin role', async () => {
    requireCommunityMembershipMock.mockResolvedValue(RESIDENT_MEMBERSHIP);
    isAdminRoleMock.mockReturnValue(false);

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/move-checklists/7?communityId=42'),
      ctx(7),
    );

    expect(res.status).toBe(403);
    expect(getMoveChecklistMock).not.toHaveBeenCalled();
  });

  it('returns 404 when getMoveChecklist returns null', async () => {
    getMoveChecklistMock.mockResolvedValue(null);

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/move-checklists/7?communityId=42'),
      ctx(7),
    );

    expect(res.status).toBe(404);
  });

  it('returns 400 when the id path param is not a positive integer', async () => {
    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/move-checklists/abc?communityId=42'),
      ctx('abc'),
    );

    expect(res.status).toBe(400);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(getMoveChecklistMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId query is missing', async () => {
    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/move-checklists/7'),
      ctx(7),
    );

    expect(res.status).toBe(400);
    expect(getMoveChecklistMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId query is not a number', async () => {
    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/move-checklists/7?communityId=abc'),
      ctx(7),
    );

    expect(res.status).toBe(400);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(getMoveChecklistMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/move-checklists/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('admin-1');
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    isAdminRoleMock.mockReturnValue(true);
    completeChecklistMock.mockResolvedValue({
      ...CHECKLIST_FIXTURE,
      completedAt: new Date('2026-01-02T00:00:00.000Z'),
      completedBy: 'admin-1',
    });
  });

  it('completes the checklist and returns the envelope', async () => {
    const res = await POST(
      jsonPost({ communityId: 42 }),
      ctx(7),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as DataEnvelope;
    expect(json.data).toBeDefined();
    expect(completeChecklistMock).toHaveBeenCalledWith(42, 7, 'admin-1');
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'admin-1');
    expect(isAdminRoleMock).toHaveBeenCalledWith('board_president');
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(
      jsonPost({ communityId: 42 }),
      ctx(7),
    );

    expect(res.status).toBe(401);
    expect(completeChecklistMock).not.toHaveBeenCalled();
  });

  it('returns 403 when user is not a community member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member'),
    );

    const res = await POST(
      jsonPost({ communityId: 42 }),
      ctx(7),
    );

    expect(res.status).toBe(403);
    expect(completeChecklistMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the actor is not an admin role', async () => {
    requireCommunityMembershipMock.mockResolvedValue(RESIDENT_MEMBERSHIP);
    isAdminRoleMock.mockReturnValue(false);

    const res = await POST(
      jsonPost({ communityId: 42 }),
      ctx(7),
    );

    expect(res.status).toBe(403);
    expect(completeChecklistMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the id path param is not a positive integer', async () => {
    const res = await POST(
      jsonPost({ communityId: 42 }),
      ctx('abc'),
    );

    expect(res.status).toBe(400);
    expect(completeChecklistMock).not.toHaveBeenCalled();
  });

  it('returns 400 when body is missing communityId', async () => {
    const res = await POST(jsonPost({}), ctx(7));

    expect(res.status).toBe(400);
    expect(completeChecklistMock).not.toHaveBeenCalled();
  });

  it('returns 400 when body communityId is non-positive', async () => {
    const res = await POST(jsonPost({ communityId: -1 }), ctx(7));

    expect(res.status).toBe(400);
    expect(completeChecklistMock).not.toHaveBeenCalled();
  });
});
