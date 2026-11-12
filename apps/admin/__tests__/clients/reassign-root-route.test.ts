/**
 * POST /api/admin/communities/reassign-root maps reassignRootOp's two
 * intentional refusals to their own statuses, with their messages kept: an
 * ineligible target is 403, and billing that cannot follow root is 409. The op
 * itself is covered by packages/db (root-ops.test.ts and
 * add-community-billing.integration.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { requirePlatformAdmin, reassignRootOp, RoleOpForbiddenError, RootOpConflictError } = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  reassignRootOp: vi.fn(),
  RoleOpForbiddenError: class RoleOpForbiddenError extends Error {},
  RootOpConflictError: class RootOpConflictError extends Error {},
}));

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: (...args: unknown[]) => requirePlatformAdmin(...args),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  reassignRootOp: (...args: unknown[]) => reassignRootOp(...args),
  RoleOpForbiddenError,
  RootOpConflictError,
}));

const NEW_USER = '6f1f4f3e-2a6b-4c1e-9a43-1d2f3c4b5a69';

async function post(body: unknown) {
  const { POST } = await import('@/app/api/admin/communities/reassign-root/route');
  return POST(
    new NextRequest('http://localhost:3001/api/admin/communities/reassign-root', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

describe('POST /api/admin/communities/reassign-root', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformAdmin.mockResolvedValue({ id: 'admin-1' });
    reassignRootOp.mockResolvedValue(undefined);
  });

  it('reassigns as the signed-in platform admin', async () => {
    const res = await post({ communityId: 7, newUserId: NEW_USER });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reassigned: true });
    expect(reassignRootOp).toHaveBeenCalledWith({ communityId: 7, newUserId: NEW_USER, actingUserId: 'admin-1' });
  });

  it('answers 403 with the message for an ineligible target', async () => {
    reassignRootOp.mockRejectedValueOnce(new RoleOpForbiddenError('must already be a property manager'));

    const res = await post({ communityId: 7, newUserId: NEW_USER });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: 'FORBIDDEN', message: 'must already be a property manager' } });
  });

  it('answers 409 with the message when billing cannot follow root', async () => {
    reassignRootOp.mockRejectedValueOnce(new RootOpConflictError('already pays for another portfolio'));

    const res = await post({ communityId: 7, newUserId: NEW_USER });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: 'CONFLICT', message: 'already pays for another portfolio' } });
  });
});
