/**
 * POST /api/admin/leads — convert a contact@ thread into a lead.
 *
 * Deviates from the brief's literal mock in two ways (see
 * task-16-dispatch-notes.md #1 and #4):
 *
 * 1. The route reuses `getThreadDetail` (`@/lib/server/inbox`), which reads
 *    `support_inbox_threads` via `.maybeSingle()` — not `.single()` as the
 *    brief's mock assumed. Mocked accordingly.
 * 2. The lead INSERT goes through the UNTYPED `createAdminClient`, not
 *    `createAdminTypedClient` — `marketing_leads`'s typed Insert shape
 *    requires the full row. Both exports are mocked from the same module.
 */
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const admin = { id: 'u1', email: 'ops@getpropertypro.com', role: 'super_admin' };
vi.mock('@/lib/auth/platform-admin', () => ({ requirePlatformAdmin: async () => admin }));

const logAdminAction = vi.fn(async (_params: unknown) => {});
vi.mock('@/lib/audit/log-admin-action', () => ({ logAdminAction: (p: unknown) => logAdminAction(p) }));

const insert = vi.fn();
const thread = {
  id: 12,
  mailbox: 'contact',
  status: 'open',
  subject: 'Pricing',
  participant_email: 'M@X.com',
  participant_name: 'Marcus',
  message_count: 1,
  first_message_at: '2026-09-01T00:00:00.000Z',
  last_message_at: '2026-09-01T00:00:00.000Z',
};

vi.mock('@propertypro/db/supabase/admin', () => ({
  // Backs `getThreadDetail`, called internally by the route.
  createAdminTypedClient: () => ({
    from: (table: string) => {
      if (table === 'support_inbox_threads') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: thread, error: null }) }) }),
        };
      }
      // support_inbox_messages — getThreadDetail loads these too; the route
      // never reads them, so an empty page is enough.
      return {
        select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }),
      };
    },
  }),
  // The untyped client the route uses for the marketing_leads insert.
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'marketing_leads') throw new Error(`unexpected table ${table}`);
      return { insert: (row: unknown) => ({ select: () => ({ single: async () => insert(row) }) }) };
    },
  }),
}));

import { POST } from '@/app/api/admin/leads/route';

const req = (body: unknown) =>
  new NextRequest('http://a/api/admin/leads', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

describe('POST /api/admin/leads', () => {
  it('creates a lead from the thread and audits it', async () => {
    insert.mockResolvedValueOnce({ data: { id: 99 }, error: null });
    const res = await POST(req({ threadId: 12 }));
    expect(res.status).toBe(201);
    expect(insert.mock.calls[0]![0]).toMatchObject({
      email: 'M@X.com',
      email_normalized: 'm@x.com',
      contact_name: 'Marcus',
      source: 'inbox_contact',
      status: 'new',
    });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'lead_created_from_thread', resourceId: 99 }),
    );
  });

  it('409s a duplicate email and does not audit the failed attempt', async () => {
    insert.mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate' } });
    const res = await POST(req({ threadId: 12 }));
    expect(res.status).toBe(409);
    // `clearMocks` (apps/admin/vitest.config.ts) resets call history before
    // EVERY test, so this counts only what THIS test produced — zero, because
    // the conflict branch throws before the audit-log call is reached.
    expect(logAdminAction).toHaveBeenCalledTimes(0);
  });

  it('400s a bad body', async () => {
    expect((await POST(req({ threadId: 'x' }))).status).toBe(400);
  });
});
