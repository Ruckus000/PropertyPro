/**
 * The support-ticket route handlers.
 *
 * The service is mocked wholesale — `lib/server/tickets.ts`'s pure half is
 * covered in `tickets-service.test.ts`, and what these cases are about is the
 * boundary: the platform-admin gate, Zod at the edge, and the audit payload.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '@propertypro/shared/http';

const admin = { id: 'u1', email: 'ops@getpropertypro.com', role: 'super_admin' };
// Overridable so the gate can be made to REFUSE. A permanently-succeeding mock
// means the route's first line is never exercised.
let requirePlatformAdminImpl: () => Promise<typeof admin> = async () => admin;
vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: () => requirePlatformAdminImpl(),
}));

const logAdminAction = vi.fn(async (_params: unknown) => {});
vi.mock('@/lib/audit/log-admin-action', () => ({
  logAdminAction: (p: unknown) => logAdminAction(p),
}));

const createdTicket = {
  id: 118,
  key: 'T-118',
  title: 'PDF uploads fail',
  priority: 'high',
  category: 'site',
  status: 'open',
  communityId: null,
  threadId: 1,
  externalRef: null,
  assigneeUserId: 'u1',
};

const createTicket = vi.fn(async (..._args: unknown[]) => createdTicket);
const updateTicket = vi.fn(async (..._args: unknown[]) => ({
  before: { status: 'open', priority: 'medium', community_id: null },
  after: { status: 'resolved', priority: 'medium', community_id: null },
}));
const getTicket = vi.fn(async (..._args: unknown[]) => ({
  ticket: { id: 118, key: 'T-118' },
  events: [],
}));
const addTicketNote = vi.fn(async (..._args: unknown[]) => ({ id: 5, kind: 'note', body: 'looking' }));
const listTickets = vi.fn(async (..._args: unknown[]) => ({
  tickets: [],
  counts: { open: 0, waiting: 0, resolved: 0 },
  truncated: false,
}));

vi.mock('@/lib/server/tickets', () => ({
  createTicket: (...a: unknown[]) => createTicket(...a),
  updateTicket: (...a: unknown[]) => updateTicket(...a),
  getTicket: (...a: unknown[]) => getTicket(...a),
  addTicketNote: (...a: unknown[]) => addTicketNote(...a),
  listTickets: (...a: unknown[]) => listTickets(...a),
}));

import { GET as LIST, POST } from '@/app/api/admin/tickets/route';
import { GET as DETAIL, PATCH } from '@/app/api/admin/tickets/[id]/route';
import { POST as NOTE } from '@/app/api/admin/tickets/[id]/events/route';

const json = (url: string, method: string, body: unknown) =>
  new NextRequest(url, {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('tickets routes', () => {
  beforeEach(() => {
    requirePlatformAdminImpl = async () => admin;
  });

  it('POST creates and audits', async () => {
    const res = await POST(
      json('http://a/api/admin/tickets', 'POST', {
        title: 'PDF uploads fail',
        priority: 'high',
        category: 'site',
        threadId: 1,
        assignToMe: true,
      }),
    );

    expect(res.status).toBe(201);
    expect(createTicket).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'PDF uploads fail', assignToMe: true }),
      admin,
    );
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ticket_created',
        resourceType: 'support_ticket',
        resourceId: 118,
      }),
    );
    await expect(res.json()).resolves.toEqual({ data: createdTicket });
  });

  it('POST 400s an unknown priority, and creates nothing', async () => {
    const res = await POST(json('http://a/api/admin/tickets', 'POST', { title: 'x', priority: 'urgent' }));

    // The no-op assertion comes FIRST so that, when the schema is removed, the
    // failure message names the actual harm — a ticket written with a priority
    // the database's CHECK will reject — rather than a status that differs.
    expect(createTicket).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
  });

  it('POST 400s an empty title, the bound the database CHECK also enforces', async () => {
    const res = await POST(json('http://a/api/admin/tickets', 'POST', { title: '   ' }));
    expect(createTicket).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
  });

  it('GET passes validated filters through and 400s an unknown status', async () => {
    const ok = await LIST(new NextRequest('http://a/api/admin/tickets?status=waiting&priority=high'));
    expect(ok.status).toBe(200);
    expect(listTickets).toHaveBeenCalledWith({ status: 'waiting', priority: 'high' });

    const bad = await LIST(new NextRequest('http://a/api/admin/tickets?status=nope'));
    expect(listTickets).toHaveBeenCalledTimes(1);
    expect(bad.status).toBe(400);
  });

  it('GET treats an empty filter param as absent rather than 400ing on it', async () => {
    const res = await LIST(new NextRequest('http://a/api/admin/tickets?status=&priority='));
    expect(res.status).toBe(200);
    expect(listTickets).toHaveBeenCalledWith({});
  });

  it('GET /[id] 404s a missing ticket', async () => {
    getTicket.mockResolvedValueOnce(null as never);
    const res = await DETAIL(new NextRequest('http://a/api/admin/tickets/404'), ctx('404'));
    expect(res.status).toBe(404);
  });

  it('PATCH audits only the changed fields', async () => {
    const res = await PATCH(
      json('http://a/api/admin/tickets/118', 'PATCH', { status: 'resolved' }),
      ctx('118'),
    );

    expect(res.status).toBe(200);
    expect(logAdminAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'ticket_updated',
        oldValues: { status: 'open' },
        newValues: { status: 'resolved' },
      }),
    );
  });

  /**
   * The audit payload is built from the rows the write PRODUCED, not from the
   * request body. A patch that names a field and changes nothing — re-submitting
   * the current value from a dropdown does exactly that — must record an empty
   * diff, because `platform_admin_audit_log` is append-only and an entry
   * claiming a change that never happened cannot be corrected afterwards.
   */
  it('PATCH records an empty diff when the patch changed nothing', async () => {
    updateTicket.mockResolvedValueOnce({
      before: { status: 'open', priority: 'medium', community_id: null },
      after: { status: 'open', priority: 'medium', community_id: null },
    } as never);

    await PATCH(json('http://a/api/admin/tickets/118', 'PATCH', { status: 'open' }), ctx('118'));

    expect(logAdminAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ oldValues: {}, newValues: {} }),
    );
  });

  it('PATCH rejects unknown keys (.strict), and updates nothing', async () => {
    const res = await PATCH(
      json('http://a/api/admin/tickets/118', 'PATCH', { hacker: true }),
      ctx('118'),
    );

    expect(updateTicket).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
  });

  it('PATCH rejects assignToMe — a create-only field the service silently dropped', async () => {
    // `createTicketSchema.partial()` carried `assignToMe` through, so `.strict()`
    // ACCEPTED it while `UpdateTicketInput` has no such field and the assignment
    // block never reads it: 200, nothing changed, and the operator believing the
    // ticket was reassigned. That is the exact failure `.strict()` exists to
    // prevent, so the field is omitted before `.partial()`.
    const res = await PATCH(
      json('http://a/api/admin/tickets/118', 'PATCH', { assignToMe: true }),
      ctx('118'),
    );

    expect(updateTicket).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
  });

  it('PATCH still accepts an explicit assigneeUserId, which is the supported way', async () => {
    // The control: omitting `assignToMe` must not have removed the ability to
    // reassign, or the fix above would be a regression wearing a test.
    const res = await PATCH(
      json('http://a/api/admin/tickets/118', 'PATCH', {
        assigneeUserId: '00000000-0000-4000-8000-000000000001',
      }),
      ctx('118'),
    );

    expect(res.status).toBe(200);
    expect(updateTicket).toHaveBeenCalledWith(
      118,
      expect.objectContaining({ assigneeUserId: '00000000-0000-4000-8000-000000000001' }),
      expect.anything(),
    );
  });

  it('PATCH 400s a non-numeric id before touching the service', async () => {
    const res = await PATCH(
      json('http://a/api/admin/tickets/abc', 'PATCH', { status: 'resolved' }),
      ctx('abc'),
    );
    expect(updateTicket).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
  });

  it('POST /[id]/events adds a note and does NOT audit it', async () => {
    const res = await NOTE(
      json('http://a/api/admin/tickets/118/events', 'POST', { body: 'looking' }),
      ctx('118'),
    );

    expect(res.status).toBe(201);
    expect(addTicketNote).toHaveBeenCalledWith(118, 'looking', admin);
    // The event row carries actor_user_id + created_at, so it is self-auditing —
    // same call the inbox notes route makes.
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('POST /[id]/events 400s an empty note', async () => {
    const res = await NOTE(
      json('http://a/api/admin/tickets/118/events', 'POST', { body: '   ' }),
      ctx('118'),
    );
    expect(addTicketNote).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
  });

  /**
   * The gate is each route's first statement. `withAdminErrorHandler` RETURNS an
   * envelope for an `AppError` rather than rejecting, so these assert the STATUS
   * plus the no-op — a `.rejects` expectation here passes only when something
   * unplanned throws, which is how this case went green against a ReferenceError
   * in wave 2.
   */
  it('401s every handler before any service call', async () => {
    requirePlatformAdminImpl = async () => {
      throw new UnauthorizedError('Not a platform admin');
    };

    const responses = await Promise.all([
      LIST(new NextRequest('http://a/api/admin/tickets')),
      POST(json('http://a/api/admin/tickets', 'POST', { title: 'x' })),
      DETAIL(new NextRequest('http://a/api/admin/tickets/118'), ctx('118')),
      PATCH(json('http://a/api/admin/tickets/118', 'PATCH', { status: 'resolved' }), ctx('118')),
      NOTE(json('http://a/api/admin/tickets/118/events', 'POST', { body: 'x' }), ctx('118')),
    ]);

    expect(listTickets).not.toHaveBeenCalled();
    expect(createTicket).not.toHaveBeenCalled();
    expect(getTicket).not.toHaveBeenCalled();
    expect(updateTicket).not.toHaveBeenCalled();
    expect(addTicketNote).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401, 401]);
  });
});
