/**
 * DELETE /api/admin/inbox/[threadId] — the erasure path.
 *
 * The assertions that matter are about what the audit entry does NOT carry.
 * `platform_admin_audit_log` is append-only and admin-readable, so a subject
 * line or body copied into it would survive the deletion it records — the
 * erasure would erase nothing, permanently and uncorrectably.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requirePlatformAdminMock, logAdminActionMock, deleteMock, selectMock } = vi.hoisted(
  () => ({
    requirePlatformAdminMock: vi.fn(),
    logAdminActionMock: vi.fn(),
    deleteMock: vi.fn(),
    selectMock: vi.fn(),
  }),
);

vi.mock('@/lib/auth/platform-admin', () => ({ requirePlatformAdmin: requirePlatformAdminMock }));
vi.mock('@/lib/audit/log-admin-action', () => ({ logAdminAction: logAdminActionMock }));
vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: () => ({
    from: () => ({ delete: () => ({ eq: (...args: unknown[]) => deleteMock(...args) }) }),
  }),
}));

const { DELETE } = await import('@/app/api/admin/inbox/[threadId]/route');

const ADMIN = { id: 'admin-uuid', email: 'ops@propertypro.test' };

const DELETED_ROW = {
  mailbox: 'privacy' as const,
  participant_email: 'jane@example.com',
  status: 'open' as const,
  message_count: 3,
  first_message_at: '2026-09-05T10:00:00.000Z',
  last_message_at: '2026-09-06T11:00:00.000Z',
};

function del(threadId = '42'): [NextRequest, { params: Promise<{ threadId: string }> }] {
  const request = new NextRequest('https://admin.getpropertypro.com/api/admin/inbox/42', {
    method: 'DELETE',
  });
  return [request, { params: Promise.resolve({ threadId }) }];
}

describe('DELETE /api/admin/inbox/[threadId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformAdminMock.mockResolvedValue(ADMIN);
    logAdminActionMock.mockResolvedValue(undefined);
    deleteMock.mockReturnValue({
      select: selectMock.mockResolvedValue({ data: [DELETED_ROW], error: null }),
    });
  });

  it('deletes the thread and reports ok', async () => {
    const response = await DELETE(...del());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(deleteMock).toHaveBeenCalledWith('id', 42);
  });

  it('records the deletion in the admin audit log', async () => {
    await DELETE(...del());

    expect(logAdminActionMock).toHaveBeenCalledTimes(1);
    expect(logAdminActionMock.mock.calls[0]?.[0]).toMatchObject({
      action: 'support_thread_deleted',
      resourceType: 'support_inbox_thread',
      resourceId: 42,
      communityId: null,
      metadata: { deleted_message_count: 3 },
    });
  });

  it('never copies message CONTENT into the append-only audit log', async () => {
    // The whole point. platform_admin_audit_log cannot be edited or deleted,
    // so a body or subject recorded here outlives the erasure it documents.
    // The row keeps the address and the counts — enough to prove a specific
    // request was honoured — and nothing a person wrote.
    deleteMock.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        data: [{ ...DELETED_ROW, subject: 'My medical records', text_body: 'please erase' }],
        error: null,
      }),
    });

    await DELETE(...del());

    const logged = JSON.stringify(logAdminActionMock.mock.calls[0]?.[0]);
    expect(logged).not.toContain('My medical records');
    expect(logged).not.toContain('please erase');
    // Control: the identifying fields it SHOULD keep are present, so this
    // cannot pass by logging nothing at all.
    expect(logged).toContain('jane@example.com');
    expect(logged).toContain('privacy');
  });

  it('404s on a thread that does not exist, and audits nothing', async () => {
    deleteMock.mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [], error: null }) });

    const response = await DELETE(...del());

    expect(response.status).toBe(404);
    expect(logAdminActionMock).not.toHaveBeenCalled();
  });

  it('400s on a non-numeric thread id, before touching the database', async () => {
    const response = await DELETE(...del('not-a-number'));

    expect(response.status).toBe(400);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller before touching the database', async () => {
    // withAdminErrorHandler converts the throw into an error response rather
    // than letting it escape, so assert the REFUSAL, not a rejection: nothing
    // was deleted and nothing was audited.
    requirePlatformAdminMock.mockRejectedValue(new Error('Unauthorized'));

    const response = await DELETE(...del());

    expect(response.ok).toBe(false);
    expect(deleteMock).not.toHaveBeenCalled();
    expect(logAdminActionMock).not.toHaveBeenCalled();
  });
});
