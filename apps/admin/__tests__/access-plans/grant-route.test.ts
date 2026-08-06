import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requirePlatformAdmin = vi.fn();
const accessPlansInsert = vi.fn();
const communitiesUpdate = vi.fn();

function makeFromMock(table: string) {
  switch (table) {
    case 'access_plans':
      return {
        insert: (payload: unknown) => ({
          select: () => ({
            single: () => accessPlansInsert(payload),
          }),
        }),
      };
    case 'communities':
      return {
        update: (payload: unknown) => ({
          eq: (_col: string, val: unknown) => communitiesUpdate(payload, val),
        }),
      };
    default:
      throw new Error(`Unexpected table: ${table}`);
  }
}

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: (...args: unknown[]) => requirePlatformAdmin(...args),
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: () => ({
    from: (table: string) => makeFromMock(table),
  }),
}));


// Audit writes go through logAdminAction, which uses its OWN supabase client
// (createAdminClient) rather than the one these tests stub. Mock the helper so
// the route tests stay focused, and so the call itself can be asserted — the
// helper's own semantics are covered by __tests__/audit/log-admin-action.test.ts.
// Typed with a rest parameter so the `(...args) => logAdminAction(...args)`
// forwarder below type-checks and `.mock.calls[0]![0]` is indexable.
const logAdminAction = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/audit/log-admin-action', () => ({
  logAdminAction: (...args: unknown[]) => logAdminAction(...args),
  AdminAuditLogError: class AdminAuditLogError extends Error {},
}));

async function callGrant(body: Record<string, unknown>) {
  const mod = await import('@/app/api/admin/access-plans/route');
  const req = new Request('http://localhost/api/admin/access-plans', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  // The Next route handler accepts NextRequest — Request shape is structurally compatible for our use.
  return mod.POST(req as never);
}

describe('POST /api/admin/access-plans', () => {
  beforeEach(() => {
    logAdminAction.mockReset();
    requirePlatformAdmin.mockReset();
    accessPlansInsert.mockReset();
    communitiesUpdate.mockReset();
    requirePlatformAdmin.mockResolvedValue({ id: 'admin-1' });
    communitiesUpdate.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('denormalizes free_access_expires_at onto the community after creating the plan', async () => {
    accessPlansInsert.mockResolvedValue({
      data: { id: 7, community_id: 99 },
      error: null,
    });

    const response = await callGrant({
      communityId: 99,
      durationMonths: 3,
      gracePeriodDays: 30,
    });

    expect(response.status).toBe(201);
    expect(accessPlansInsert).toHaveBeenCalledTimes(1);
    expect(communitiesUpdate).toHaveBeenCalledTimes(1);
    const [updatePayload, communityIdArg] = communitiesUpdate.mock.calls[0]!;
    expect(communityIdArg).toBe(99);
    // free_access_expires_at should equal grace_ends_at — derived from now + duration + grace.
    expect(updatePayload).toMatchObject({ free_access_expires_at: expect.any(String) });
    expect(new Date(updatePayload.free_access_expires_at).getTime()).toBeGreaterThan(Date.now());
    // Granting free access is a money decision; it must be attributable.
    expect(logAdminAction).toHaveBeenCalledTimes(1);
    expect(logAdminAction.mock.calls[0]![0]).toMatchObject({
      action: 'access_plan_granted',
      resourceType: 'access_plan',
    });

  });

  it('returns 400 for missing communityId or durationMonths', async () => {
    const response = await callGrant({ durationMonths: 3 });
    expect(response.status).toBe(400);
    expect(accessPlansInsert).not.toHaveBeenCalled();
    expect(communitiesUpdate).not.toHaveBeenCalled();
  });

  it('does not call community update if access_plans insert fails', async () => {
    accessPlansInsert.mockResolvedValue({
      data: null,
      error: { message: 'insert failed' },
    });

    const response = await callGrant({
      communityId: 99,
      durationMonths: 3,
    });

    expect(response.status).toBe(500);
    expect(communitiesUpdate).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/access-plans — duration bounds', () => {
  beforeEach(() => {
    logAdminAction.mockReset();
    requirePlatformAdmin.mockReset();
    requirePlatformAdmin.mockResolvedValue({ id: 'admin-1', email: 'a@b.com' });
    accessPlansInsert.mockReset();
    communitiesUpdate.mockReset();
  });

  // Granting free access is a money decision. durationMonths and
  // gracePeriodDays were previously unbounded numbers fed into setMonth() /
  // setDate(), so a single request could mint an effectively permanent grant —
  // and a large enough value produces an Invalid Date that lands in the column
  // as garbage.
  it('rejects an absurd durationMonths instead of granting forever', async () => {
    const res = await callGrant({ communityId: 1, durationMonths: 100000 });

    expect(res.status).toBe(400);
    expect(accessPlansInsert).not.toHaveBeenCalled();
  });

  it('rejects a non-integer durationMonths that setMonth would truncate', async () => {
    const res = await callGrant({ communityId: 1, durationMonths: 1.5 });

    expect(res.status).toBe(400);
    expect(accessPlansInsert).not.toHaveBeenCalled();
  });

  it('rejects a negative gracePeriodDays', async () => {
    const res = await callGrant({ communityId: 1, durationMonths: 3, gracePeriodDays: -10 });

    expect(res.status).toBe(400);
    expect(accessPlansInsert).not.toHaveBeenCalled();
  });

  it('rejects an unbounded gracePeriodDays', async () => {
    const res = await callGrant({ communityId: 1, durationMonths: 3, gracePeriodDays: 99999 });

    expect(res.status).toBe(400);
    expect(accessPlansInsert).not.toHaveBeenCalled();
  });

  it('rejects a non-positive communityId', async () => {
    const res = await callGrant({ communityId: 0, durationMonths: 3 });

    expect(res.status).toBe(400);
    expect(accessPlansInsert).not.toHaveBeenCalled();
  });

  it('returns 400, not 500, for a malformed body', async () => {
    const mod = await import('@/app/api/admin/access-plans/route');
    const req = new Request('http://localhost/api/admin/access-plans', {
      method: 'POST',
      body: '{not json',
    });
    const res = await mod.POST(req as never);

    expect(res.status).toBe(400);
    expect(accessPlansInsert).not.toHaveBeenCalled();
  });
});
