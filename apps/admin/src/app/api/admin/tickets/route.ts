/**
 * Platform support tickets — the queue.
 *
 * GET  /api/admin/tickets?status=&priority=&communityId= — list + status counts
 * POST /api/admin/tickets                                — open a ticket
 *
 * Both tables are RLS-locked to `service_role` with zero policies (0072), so
 * `requirePlatformAdmin()` on the first line of each handler is the ONLY thing
 * standing between the open internet and every ticket on the platform. It is
 * deliberately the first statement, before the body is even read.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { parseAdminBody } from '@/lib/api/parse-body';
import { createTicketSchema, ticketListQuerySchema } from '@/lib/api/ticket-schemas';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { logAdminAction } from '@/lib/audit/log-admin-action';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createTicket, listTickets } from '@/lib/server/tickets';

export const GET = withAdminErrorHandler(async (request: NextRequest) => {
  await requirePlatformAdmin();

  const params = request.nextUrl.searchParams;
  // `|| undefined`, not `?? undefined`: an empty param (`?status=`) is a
  // missing filter, not the empty string, which the enum would 400 on.
  const parsed = ticketListQuerySchema.safeParse({
    status: params.get('status') || undefined,
    priority: params.get('priority') || undefined,
    communityId: params.get('communityId') || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message ?? 'Invalid ticket filters',
        },
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ data: await listTickets(parsed.data) });
});

export const POST = withAdminErrorHandler(async (request: NextRequest) => {
  const admin = await requirePlatformAdmin();

  const parsed = await parseAdminBody(request, createTicketSchema);
  if (parsed instanceof NextResponse) return parsed;

  const ticket = await createTicket(parsed, admin);

  await logAdminAction({
    admin,
    action: 'ticket_created',
    resourceType: 'support_ticket',
    resourceId: ticket.id,
    // The ticket's own community when it has one — a ticket about a broken
    // deploy has none, which is what this column's nullability is for.
    communityId: ticket.communityId,
    newValues: {
      title: ticket.title,
      priority: ticket.priority,
      category: ticket.category,
      status: ticket.status,
      thread_id: ticket.threadId,
      external_ref: ticket.externalRef,
      assignee_user_id: ticket.assigneeUserId,
    },
    metadata: { key: ticket.key },
  });

  return NextResponse.json({ data: ticket }, { status: 201 });
});
