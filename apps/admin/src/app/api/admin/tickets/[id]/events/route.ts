/**
 * Platform support tickets — operator notes on the timeline.
 *
 * POST /api/admin/tickets/[id]/events
 *
 * Notes only. The machine-written transition kinds (`status_changed`,
 * `priority_changed`, `assigned`, `linked`) are produced by `updateTicket` from
 * the rows it actually wrote, and letting a client post one would mean the
 * timeline could claim a transition the ticket never made — the `kind` is not
 * in this schema for that reason, not by oversight.
 *
 * Deliberately NOT audited to `platform_admin_audit_log`: the event row already
 * carries `actor_user_id` and `created_at`, so it is self-auditing. Same call
 * the inbox's notes route makes, for the same reason.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { parseAdminBody } from '@/lib/api/parse-body';
import { ticketNoteSchema } from '@/lib/api/ticket-schemas';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { addTicketNote } from '@/lib/server/tickets';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAdminErrorHandler(
  async (request: NextRequest, { params }: RouteParams) => {
    const admin = await requirePlatformAdmin();

    const { id: raw } = await params;
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid ticket id' } },
        { status: 400 },
      );
    }

    const parsed = await parseAdminBody(request, ticketNoteSchema);
    if (parsed instanceof NextResponse) return parsed;

    // Throws NotFoundError (→ 404) for an unknown id; see addTicketNote.
    const event = await addTicketNote(id, parsed.body, admin);

    return NextResponse.json({ data: event }, { status: 201 });
  },
);
