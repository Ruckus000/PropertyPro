/**
 * POST /api/v1/pm/site/publish/revert — website editor v3, Phase 6.
 *
 * Route-level coverage: the PM gate, the deliberate absence of an entitlement
 * gate (revert ships on every plan), and — the one that matters — that a
 * snapshot id is only ever restored into the community the CALLER is
 * authorized for, never the one the body claims.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireRoleMock,
  requirePlanFeatureMock,
  revertToSnapshotMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn((_: unknown, id: number) => id),
  requireRoleMock: vi.fn(),
  requirePlanFeatureMock: vi.fn().mockResolvedValue(undefined),
  revertToSnapshotMock: vi.fn(),
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
vi.mock('@/lib/api/role-guard', () => ({
  requireRole: requireRoleMock,
  PM_MANAGER_ROLES: ['property_manager', 'root_manager'],
}));
vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: requirePlanFeatureMock,
}));
vi.mock('@/lib/services/site-blocks-service', () => ({
  revertToSnapshot: revertToSnapshotMock,
}));

import { POST } from '../../src/app/api/v1/pm/site/publish/revert/route';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { NotFoundError } from '../../src/lib/api/errors/NotFoundError';
import { ValidationError } from '../../src/lib/api/errors/ValidationError';

const PM_MEMBERSHIP = { role: 'property_manager', communityId: 1, isAdmin: true };

const RESULT = {
  snapshotId: 7,
  restoredPublishedAt: new Date('2026-06-01T12:00:00Z'),
  restoredCount: 3,
  stagedRemovalCount: 1,
  clearedDraftCount: 2,
};

function postReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/pm/site/publish/revert', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/pm/site/publish/revert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('pm-1');
    requireCommunityMembershipMock.mockResolvedValue(PM_MEMBERSHIP);
    resolveEffectiveCommunityIdMock.mockImplementation((_: unknown, id: number) => id);
    requireRoleMock.mockReturnValue(undefined);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    revertToSnapshotMock.mockResolvedValue(RESULT);
  });

  it('an authorized PM reverts and gets the restore summary', async () => {
    const res = await POST(postReq({ communityId: 1, snapshotId: 7 }));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toEqual({
      ok: true,
      snapshotId: 7,
      restoredPublishedAt: '2026-06-01T12:00:00.000Z',
      restoredCount: 3,
      stagedRemovalCount: 1,
      clearedDraftCount: 2,
    });
    expect(revertToSnapshotMock).toHaveBeenCalledWith({
      communityId: 1,
      actorUserId: 'pm-1',
      snapshotId: 7,
    });
  });

  it('runs the PM gate: membership, PM role, and hasSiteEditor', async () => {
    await POST(postReq({ communityId: 1, snapshotId: 7 }));

    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(1, 'pm-1');
    expect(requireRoleMock).toHaveBeenCalledWith(
      PM_MEMBERSHIP,
      ['property_manager', 'root_manager'],
      expect.any(String),
    );
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(1, 'hasSiteEditor');
  });

  it('rejects a resident', async () => {
    requireRoleMock.mockImplementation(() => {
      throw new ForbiddenError('Only property managers can revert the community site');
    });

    const res = await POST(postReq({ communityId: 1, snapshotId: 7 }));

    expect(res.status).toBe(403);
    expect(revertToSnapshotMock).not.toHaveBeenCalled();
  });

  it('IDOR: the snapshot id is only ever restored into the community the CALLER resolved to', async () => {
    // A PM of community 1 posts a body naming community 2. The effective
    // community comes from resolveEffectiveCommunityId (header-authoritative),
    // not from the body, and it is that value the service receives.
    resolveEffectiveCommunityIdMock.mockReturnValue(1);

    await POST(postReq({ communityId: 2, snapshotId: 7 }));

    expect(revertToSnapshotMock).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: 1 }),
    );
    expect(revertToSnapshotMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ communityId: 2 }),
    );
    // The membership check ran against the effective community too.
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(1, 'pm-1');
  });

  it("IDOR: another community's snapshot id is a 404, not someone else's content", async () => {
    revertToSnapshotMock.mockRejectedValue(
      new NotFoundError('That published version was not found for this community'),
    );

    const res = await POST(postReq({ communityId: 1, snapshotId: 999 }));

    expect(res.status).toBe(404);
  });

  it('a retention-pruned snapshot is a clear 400, never a 500', async () => {
    revertToSnapshotMock.mockRejectedValue(
      new ValidationError(
        'This version is too old to restore — its saved content has been cleared. The entry remains in the publish history.',
      ),
    );

    const res = await POST(postReq({ communityId: 1, snapshotId: 3 }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { message?: string } };
    expect(JSON.stringify(json)).toMatch(/too old to restore/i);
  });

  it('does NOT gate on admin read entitlement — revert is available on every plan', async () => {
    // Deliberate: the history LIST is the premium surface; the escape hatch is
    // not. If this route ever starts importing the read-entitlement guard, a
    // lapsed community loses its only way to take a broken page down.
    const { readFileSync, existsSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    // The root `pnpm test` runner and a direct `vitest` run inside apps/web
    // have different working directories, so a single cwd-relative path passes
    // in one and fails in the other — this exact trap already cost this project
    // a phase. `import.meta.url` is not a file: URL under this vitest config,
    // so resolve by trying both roots.
    const ROUTE = 'src/app/api/v1/pm/site/publish/revert/route.ts';
    const routePath = [
      resolve(process.cwd(), ROUTE),
      resolve(process.cwd(), 'apps/web', ROUTE),
    ].find(existsSync);
    // Fail loudly rather than vacuously passing on an unreadable path — a
    // source assertion that cannot find its source proves nothing.
    expect(routePath, 'revert route source not found from either root').toBeDefined();

    const source = readFileSync(routePath!, 'utf8');
    expect(source).not.toContain('requireEntitledForAdminRead');
  });

  it('returns 400 for a malformed body', async () => {
    const res = await POST(postReq({ communityId: 1 }));
    expect(res.status).toBe(400);
    expect(revertToSnapshotMock).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-positive snapshotId', async () => {
    const res = await POST(postReq({ communityId: 1, snapshotId: 0 }));
    expect(res.status).toBe(400);
    expect(revertToSnapshotMock).not.toHaveBeenCalled();
  });
});
