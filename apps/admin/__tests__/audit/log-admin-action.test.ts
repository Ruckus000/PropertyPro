import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const insertMock = vi.fn();
const captureException = vi.fn();

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'platform_admin_audit_log') {
        throw new Error(`Unexpected table: ${table}`);
      }
      return { insert: (row: unknown) => insertMock(row) };
    },
  }),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

const ADMIN = { id: 'admin-uuid', email: 'admin@getpropertypro.com' };

async function load() {
  const mod = await import('@/lib/audit/log-admin-action');
  return mod;
}

describe('logAdminAction', () => {
  beforeEach(() => {
    insertMock.mockReset();
    captureException.mockReset();
    insertMock.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('writes the acting admin id and denormalized email', async () => {
    const { logAdminAction } = await load();

    await logAdminAction({
      admin: ADMIN,
      action: 'platform_admin_added',
      resourceType: 'platform_admin_user',
      resourceId: 'target-uuid',
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0]![0]).toMatchObject({
      admin_user_id: 'admin-uuid',
      admin_email: 'admin@getpropertypro.com',
      action: 'platform_admin_added',
      resource_type: 'platform_admin_user',
      resource_id: 'target-uuid',
    });
  });

  it('writes a NULL community_id for platform-level actions', async () => {
    // The entire reason this table exists. compliance_audit_log and
    // support_access_log both have community_id NOT NULL.
    const { logAdminAction } = await load();

    await logAdminAction({
      admin: ADMIN,
      action: 'platform_admin_removed',
      resourceType: 'platform_admin_user',
    });

    expect(insertMock.mock.calls[0]![0]).toMatchObject({ community_id: null });
  });

  it('coerces a numeric resource id to text', async () => {
    const { logAdminAction } = await load();

    await logAdminAction({
      admin: ADMIN,
      action: 'access_plan_granted',
      resourceType: 'access_plan',
      resourceId: 42,
      communityId: 7,
    });

    expect(insertMock.mock.calls[0]![0]).toMatchObject({
      resource_id: '42',
      community_id: 7,
    });
  });

  it('does not confuse resource id 0 with a missing id', async () => {
    const { logAdminAction } = await load();

    await logAdminAction({
      admin: ADMIN,
      action: 'file_uploaded',
      resourceType: 'storage_object',
      resourceId: 0,
    });

    expect(insertMock.mock.calls[0]![0]).toMatchObject({ resource_id: '0' });
  });

  // --- Failure semantics ---------------------------------------------------
  //
  // The trap these cover: supabase-js RESOLVES with an `{ error }` object
  // rather than rejecting. A bare `await` on the insert would therefore
  // succeed silently on every write failure, and the audit log would appear to
  // work while recording nothing — the same class of bug as the Phase 1
  // sign-out that discarded the `{ error }` it resolved with.

  it('THROWS when the insert resolves with an error', async () => {
    insertMock.mockResolvedValue({ error: { message: 'permission denied' } });
    const { logAdminAction, AdminAuditLogError } = await load();

    await expect(
      logAdminAction({
        admin: ADMIN,
        action: 'platform_admin_added',
        resourceType: 'platform_admin_user',
      }),
    ).rejects.toBeInstanceOf(AdminAuditLogError);

    expect(captureException).toHaveBeenCalled();
  });

  it('throws when the insert rejects outright', async () => {
    insertMock.mockRejectedValue(new Error('network down'));
    const { logAdminAction, AdminAuditLogError } = await load();

    await expect(
      logAdminAction({
        admin: ADMIN,
        action: 'demo_deleted',
        resourceType: 'demo_instance',
      }),
    ).rejects.toBeInstanceOf(AdminAuditLogError);
  });

  it('swallows failures and reports to Sentry when bestEffort is set', async () => {
    insertMock.mockResolvedValue({ error: { message: 'permission denied' } });
    const { logAdminAction } = await load();

    await expect(
      logAdminAction({
        admin: ADMIN,
        action: 'file_uploaded',
        resourceType: 'storage_object',
        bestEffort: true,
      }),
    ).resolves.toBeUndefined();

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0]![1]).toMatchObject({ level: 'warning' });
  });

  it('does not report to Sentry on success', async () => {
    const { logAdminAction } = await load();

    await logAdminAction({
      admin: ADMIN,
      action: 'member_removed',
      resourceType: 'user_role',
      communityId: 1,
    });

    expect(captureException).not.toHaveBeenCalled();
  });
});
