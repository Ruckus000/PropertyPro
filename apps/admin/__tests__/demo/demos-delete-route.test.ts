import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requirePlatformAdmin = vi.fn();
const getDemoByIdWithConversionState = vi.fn();
const deleteDemo = vi.fn();
const deleteCommunity = vi.fn();
const deleteUser = vi.fn();

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: (...args: unknown[]) => requirePlatformAdmin(...args),
}));

vi.mock('@/lib/db/demo-queries', () => ({
  getDemoById: vi.fn(),
  getDemoByIdWithConversionState: (...args: unknown[]) =>
    getDemoByIdWithConversionState(...args),
  deleteDemo: (...args: unknown[]) => deleteDemo(...args),
  deleteCommunity: (...args: unknown[]) => deleteCommunity(...args),
  updateDemo: vi.fn(),
  sanitizeDemoRow: <T,>(row: T) => row,
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { deleteUser: (...args: unknown[]) => deleteUser(...args) } },
  }),
}));


// Audit writes go through logAdminAction, which uses its OWN supabase client
// (createAdminClient) rather than the one these tests stub. Mock the helper so
// the route tests stay focused, and so the call itself can be asserted — the
// helper's own semantics are covered by __tests__/audit/log-admin-action.test.ts.
const logAdminAction = vi.fn(async () => {});
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
  return mod.DELETE(new Request('http://localhost/api/admin/demos/' + id, { method: 'DELETE' }), ctx);
}

describe('DELETE /api/admin/demos/[id]', () => {
  beforeEach(() => {
    logAdminAction.mockReset();
    requirePlatformAdmin.mockReset();
    getDemoByIdWithConversionState.mockReset();
    deleteDemo.mockReset();
    deleteCommunity.mockReset();
    deleteUser.mockReset();
    requirePlatformAdmin.mockResolvedValue(undefined);
    deleteUser.mockResolvedValue(undefined);
    deleteDemo.mockResolvedValue({ data: baseDemo, error: null });
    deleteCommunity.mockResolvedValue({ error: null });
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
    expect(deleteCommunity).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
    expect(deleteDemo).not.toHaveBeenCalled();
  });

  it('cascades community + user + demo deletion when the demo is still a demo', async () => {
    getDemoByIdWithConversionState.mockResolvedValue({
      data: { ...baseDemo, is_converted: false },
      error: null,
    });

    const response = await callDelete(42);

    expect(response.status).toBe(200);
    expect(deleteUser).toHaveBeenCalledWith('resident-uuid');
    expect(deleteUser).toHaveBeenCalledWith('board-uuid');
    expect(deleteCommunity).toHaveBeenCalledWith(99);
    expect(deleteDemo).toHaveBeenCalledWith(42);

    // Hard-deleting a tenant must leave a record naming who did it. The
    // community row itself is gone by this point, which is why the audit
    // table's community_id is nullable with ON DELETE SET NULL.
    expect(logAdminAction).toHaveBeenCalledTimes(1);
    expect(logAdminAction.mock.calls[0][0]).toMatchObject({
      action: 'demo_deleted',
      resourceType: 'demo_instance',
      resourceId: 42,
      communityId: 99,
    });
  });

  it('does not write an audit entry when the demo is already converted', async () => {
    getDemoByIdWithConversionState.mockResolvedValue({
      data: { ...baseDemo, is_converted: true },
      error: null,
    });

    const response = await callDelete(42);

    expect(response.status).toBe(409);
    expect(deleteCommunity).not.toHaveBeenCalled();
    // Nothing happened, so nothing should be recorded as having happened.
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('returns 404 when the demo is not found', async () => {
    getDemoByIdWithConversionState.mockResolvedValue({ data: null, error: null });

    const response = await callDelete(42);

    expect(response.status).toBe(404);
    expect(deleteCommunity).not.toHaveBeenCalled();
  });
});
