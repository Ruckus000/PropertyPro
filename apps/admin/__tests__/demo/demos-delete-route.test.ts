import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requirePlatformAdmin = vi.fn();
const getDemoByIdWithConversionState = vi.fn();
const softDeleteDemo = vi.fn();
const updateUserById = vi.fn();

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: (...args: unknown[]) => requirePlatformAdmin(...args),
}));

vi.mock('@/lib/db/demo-queries', () => ({
  getDemoById: vi.fn(),
  getDemoByIdWithConversionState: (...args: unknown[]) =>
    getDemoByIdWithConversionState(...args),
  softDeleteDemo: (...args: unknown[]) => softDeleteDemo(...args),
  updateDemo: vi.fn(),
  sanitizeDemoRow: <T,>(row: T) => row,
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { updateUserById: (...args: unknown[]) => updateUserById(...args) } },
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

const baseDemo = {
  id: 42,
  template_type: 'condo_718',
  prospect_name: 'Sunset Demo',
  slug: 'demo-sunset',
  theme: {},
  seeded_community_id: 99,
  demo_resident_user_id: 'resident-uuid',
  demo_board_user_id: 'board-uuid',
  demo_resident_email: 'r@example.com',
  demo_board_email: 'b@example.com',
  auth_token_secret: 'secret',
  external_crm_url: null,
  prospect_notes: null,
  created_at: '2026-05-01T00:00:00.000Z',
  customized_at: null,
};

async function callDelete(id: number) {
  // Import lazily so vi.mock factories take effect.
  const mod = await import('@/app/api/admin/demos/[id]/route');
  const ctx = { params: Promise.resolve({ id: String(id) }) };
  // The handler only reads `request` through the Request surface here; the
  // cast keeps the test honest about that rather than fabricating a NextRequest.
  return mod.DELETE(
    new Request('http://localhost/api/admin/demos/' + id, { method: 'DELETE' }) as never,
    ctx,
  );
}

describe('DELETE /api/admin/demos/[id]', () => {
  beforeEach(() => {
    logAdminAction.mockReset();
    requirePlatformAdmin.mockReset();
    getDemoByIdWithConversionState.mockReset();
    softDeleteDemo.mockReset();
    updateUserById.mockReset();
    requirePlatformAdmin.mockResolvedValue(undefined);
    updateUserById.mockResolvedValue({ data: {}, error: null });
    softDeleteDemo.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 409 and does not cascade when the demo has been converted', async () => {
    getDemoByIdWithConversionState.mockResolvedValue({
      data: { ...baseDemo, is_converted: true },
      error: null,
    });

    const response = await callDelete(42);

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe('DEMO_ALREADY_CONVERTED');
    expect(softDeleteDemo).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('retires a live demo: soft-deletes it and its community, then bans its logins', async () => {
    getDemoByIdWithConversionState.mockResolvedValue({
      data: { ...baseDemo, is_converted: false },
      error: null,
    });

    const response = await callDelete(42);

    expect(response.status).toBe(200);
    // Soft, like the expire-demos cron: conversion_events' NO ACTION FKs made
    // the hard delete fail after the logins were already destroyed.
    expect(softDeleteDemo).toHaveBeenCalledWith(42, 99, expect.any(String));
    expect(updateUserById).toHaveBeenCalledWith('resident-uuid', { ban_duration: '876600h' });
    expect(updateUserById).toHaveBeenCalledWith('board-uuid', { ban_duration: '876600h' });
    expect(softDeleteDemo.mock.invocationCallOrder[0]).toBeLessThan(
      updateUserById.mock.invocationCallOrder[0]!,
    );

    expect(logAdminAction).toHaveBeenCalledTimes(1);
    expect(logAdminAction.mock.calls[0]![0]).toMatchObject({
      action: 'demo_deleted',
      resourceType: 'demo_instance',
      resourceId: 42,
      communityId: 99,
      metadata: { soft_deleted: true, banned_auth_user_count: 2, ban_failed_user_ids: [] },
    });
  });

  it('fails loudly, and bans nobody, when the soft delete fails', async () => {
    getDemoByIdWithConversionState.mockResolvedValue({
      data: { ...baseDemo, is_converted: false },
      error: null,
    });
    softDeleteDemo.mockResolvedValue({ error: { message: 'update on table "communities" violates …' } });

    const response = await callDelete(42);

    expect(response.status).toBe(500);
    expect(updateUserById).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('reports a ban it could not apply instead of claiming success', async () => {
    getDemoByIdWithConversionState.mockResolvedValue({
      data: { ...baseDemo, is_converted: false },
      error: null,
    });
    updateUserById.mockImplementation(async (userId: string) =>
      userId === 'board-uuid'
        ? { data: null, error: { status: 500, message: 'GoTrue down' } }
        : { data: {}, error: null },
    );

    const response = await callDelete(42);

    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe('DEMO_USER_BAN_FAILED');
    expect(logAdminAction.mock.calls[0]![0]).toMatchObject({
      metadata: { banned_auth_user_count: 1, ban_failed_user_ids: ['board-uuid'] },
    });
  });

  it('treats an already-deleted login as banned', async () => {
    getDemoByIdWithConversionState.mockResolvedValue({
      data: { ...baseDemo, is_converted: false },
      error: null,
    });
    updateUserById.mockResolvedValue({ data: null, error: { status: 404, message: 'User not found' } });

    const response = await callDelete(42);

    expect(response.status).toBe(200);
  });

  it('does not write an audit entry when the demo is already converted', async () => {
    getDemoByIdWithConversionState.mockResolvedValue({
      data: { ...baseDemo, is_converted: true },
      error: null,
    });

    const response = await callDelete(42);

    expect(response.status).toBe(409);
    expect(softDeleteDemo).not.toHaveBeenCalled();
    // Nothing happened, so nothing should be recorded as having happened.
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('returns 404 when the demo is not found', async () => {
    getDemoByIdWithConversionState.mockResolvedValue({ data: null, error: null });

    const response = await callDelete(42);

    expect(response.status).toBe(404);
    expect(softDeleteDemo).not.toHaveBeenCalled();
  });
});
