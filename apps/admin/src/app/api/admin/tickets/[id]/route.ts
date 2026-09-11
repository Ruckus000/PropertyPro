/**
 * Platform support tickets — one ticket.
 *
 * GET   /api/admin/tickets/[id] — the ticket and its timeline
 * PATCH /api/admin/tickets/[id] — a triage edit
 *
 * The PATCH audit entry records ONLY the fields that actually moved, computed
 * from the rows on both sides of the write rather than echoed from the request
 * body. A patch may name a field and change nothing (re-submitting the current
 * status from a dropdown does exactly that), and `platform_admin_audit_log` is
 * append-only — an entry claiming a change that never happened cannot be
 * corrected afterwards.
 */
import { NextResponse, type NextRequest } from 'next/server';

import type { SupportTicketRow } from '@propertypro/db/supabase/admin-types';

import { parseAdminBody } from '@/lib/api/parse-body';
import { updateTicketSchema } from '@/lib/api/ticket-schemas';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { logAdminAction } from '@/lib/audit/log-admin-action';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { getTicket, updateTicket } from '@/lib/server/tickets';

/**
 * The columns worth an audit entry.
 *
 * `updated_at` is absent on purpose — it changes on every write by definition,
 * so including it would make every entry's diff non-empty and hide which field
 * an operator actually touched. `resolved_at` IS included: it moves as a
 * consequence of a status change, and the consequence is part of the record.
 */
const AUDITED_FIELDS = [
  'title',
  'description',
  'priority',
  'category',
  'status',
  'community_id',
  'thread_id',
  'external_ref',
  'assignee_user_id',
  'resolved_at',
] as const satisfies ReadonlyArray<keyof SupportTicketRow>;

function changedFields(
  before: SupportTicketRow,
  after: SupportTicketRow,
): { oldValues: Record<string, unknown>; newValues: Record<string, unknown> } {
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  for (const field of AUDITED_FIELDS) {
    if (before[field] !== after[field]) {
      oldValues[field] = before[field];
      newValues[field] = after[field];
    }
  }
  return { oldValues, newValues };
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

function parseTicketId(raw: string): number | NextResponse {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid ticket id' } },
      { status: 400 },
    );
  }
  return id;
}

export const GET = withAdminErrorHandler(
  async (_request: NextRequest, { params }: RouteParams) => {
    await requirePlatformAdmin();

    const id = parseTicketId((await params).id);
    if (id instanceof NextResponse) return id;

    const detail = await getTicket(id);
    if (!detail) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Ticket not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: detail });
  },
);

export const PATCH = withAdminErrorHandler(
  async (request: NextRequest, { params }: RouteParams) => {
    const admin = await requirePlatformAdmin();

    const id = parseTicketId((await params).id);
    if (id instanceof NextResponse) return id;

    const parsed = await parseAdminBody(request, updateTicketSchema);
    if (parsed instanceof NextResponse) return parsed;

    // Throws NotFoundError (→ 404) for an unknown id; see updateTicket.
    const { before, after } = await updateTicket(id, parsed, admin);

    await logAdminAction({
      admin,
      action: 'ticket_updated',
      resourceType: 'support_ticket',
      resourceId: id,
      communityId: after.community_id,
      ...changedFields(before, after),
    });

    // Re-read so the response carries the same enriched shape as GET — the
    // community name, thread subject and assignee email the raw row lacks.
    const detail = await getTicket(id);
    if (!detail) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Ticket not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: detail.ticket });
  },
);
