import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The intervene route's mapping from `interveneDeletionRequestOp` outcomes to
 * responses and audit rows. The transaction itself (every cooling request of
 * the same target cancelled; nothing once the target is deleted) is tested
 * against a real database in
 * apps/web/__tests__/integration/deletion-recovery-lifecycle.integration.test.ts.
 */

const requirePlatformAdmin = vi.fn();
const interveneDeletionRequestOp = vi.fn();

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: (...args: unknown[]) => requirePlatformAdmin(...args),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  interveneDeletionRequestOp: (...args: unknown[]) => interveneDeletionRequestOp(...args),
}));

const logAdminAction = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/audit/log-admin-action', () => ({
  logAdminAction: (...args: unknown[]) => logAdminAction(...args),
  AdminAuditLogError: class AdminAuditLogError extends Error {},
}));

async function callIntervene(id: string, body?: unknown) {
  const mod = await import('@/app/api/admin/deletion-requests/[id]/intervene/route');
  return mod.POST(
    new Request(`http://localhost/${id}`, {
      method: 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
    }) as never,
    { params: Promise.resolve({ id }) },
  );
}

const USER_ROW = { id: 42, status: 'cancelled', requestType: 'user', userId: 'user-uuid', communityId: null };

describe('POST /api/admin/deletion-requests/[id]/intervene', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformAdmin.mockResolvedValue({ id: 'admin-1', email: 'ops@example.com' });
    interveneDeletionRequestOp.mockResolvedValue({ outcome: 'cancelled', request: USER_ROW, cancelledRequestIds: [42, 43] });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a non-numeric id before touching anything', async () => {
    expect((await callIntervene('abc')).status).toBe(400);
    expect(interveneDeletionRequestOp).not.toHaveBeenCalled();
  });

  it('cancels as the platform admin with a default note, and audits every id it cancelled', async () => {
    const response = await callIntervene('42');

    expect(response.status).toBe(200);
    expect(interveneDeletionRequestOp).toHaveBeenCalledWith(42, {
      cancelledBy: 'admin-1',
      notes: 'Intervened by platform admin ops@example.com',
    });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'deletion_request_intervened',
        resourceId: 42,
        communityId: null,
        newValues: { status: 'cancelled', intervention_notes: null, cancelled_request_ids: [42, 43] },
      }),
    );
  });

  it('passes the operator’s notes through', async () => {
    await callIntervene('42', { notes: 'Owner called' });

    expect(interveneDeletionRequestOp).toHaveBeenCalledWith(42, { cancelledBy: 'admin-1', notes: 'Owner called' });
  });

  it('audits a community request against its community', async () => {
    interveneDeletionRequestOp.mockResolvedValue({
      outcome: 'cancelled',
      request: { ...USER_ROW, requestType: 'community', communityId: 99 },
      cancelledRequestIds: [42],
    });

    await callIntervene('42');

    expect(logAdminAction).toHaveBeenCalledWith(expect.objectContaining({ communityId: 99 }));
  });

  it.each([['not_found'], ['not_cooling']])('returns 404, not 500, on %s, and audits nothing', async (outcome) => {
    interveneDeletionRequestOp.mockResolvedValue({ outcome, request: USER_ROW });

    const response = await callIntervene('42');

    expect(response.status).toBe(404);
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  // The account is already deleted through another request: cancelling this
  // one would say the account stays open while it stays deleted and banned.
  it('returns 409 TARGET_DELETED when the account is already deleted, and audits nothing', async () => {
    interveneDeletionRequestOp.mockResolvedValue({ outcome: 'target_deleted', request: { ...USER_ROW, status: 'cooling' } });

    const response = await callIntervene('42');

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe('TARGET_DELETED');
    expect(body.error.message).toMatch(/account is already deleted/);
    expect(logAdminAction).not.toHaveBeenCalled();
  });
});
