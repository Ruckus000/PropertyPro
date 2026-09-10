/**
 * Marketing Leads API for the admin console.
 *
 * GET   /api/admin/leads — list leads (optional ?status= and ?source= filters)
 * PATCH /api/admin/leads — update a lead's triage status / notes
 * POST  /api/admin/leads — convert a contact@ inbox thread into a lead
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createAdminClient } from '@propertypro/db/supabase/admin';
import { ConflictError, NotFoundError, ValidationError } from '@propertypro/shared/http';

import { parseAdminBody } from '@/lib/api/parse-body';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { logAdminAction } from '@/lib/audit/log-admin-action';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { getThreadDetail } from '@/lib/server/inbox';
import { getLeadsData, updateLead, LEAD_STATUSES, type LeadStatus } from '@/lib/server/leads';

export async function GET(request: NextRequest) {
  await requirePlatformAdmin();

  const status = request.nextUrl.searchParams.get('status');
  const source = request.nextUrl.searchParams.get('source');

  try {
    const data = await getLeadsData({ status, source });
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load leads';
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  await requirePlatformAdmin();

  let body: { id?: unknown; status?: unknown; notes?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: 'Invalid JSON body' } }, { status: 400 });
  }

  const id = typeof body.id === 'number' ? body.id : Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: { message: 'A valid lead id is required' } }, { status: 400 });
  }

  const updates: { status?: LeadStatus; notes?: string } = {};

  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !LEAD_STATUSES.includes(body.status as LeadStatus)) {
      return NextResponse.json(
        { error: { message: `status must be one of: ${LEAD_STATUSES.join(', ')}` } },
        { status: 400 },
      );
    }
    updates.status = body.status as LeadStatus;
  }

  if (body.notes !== undefined) {
    if (typeof body.notes !== 'string') {
      return NextResponse.json({ error: { message: 'notes must be a string' } }, { status: 400 });
    }
    updates.notes = body.notes;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: { message: 'Nothing to update' } }, { status: 400 });
  }

  try {
    await updateLead(id, updates);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update lead';
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}

const leadFromThreadSchema = z.object({ threadId: z.number().int().positive() });

/**
 * POST /api/admin/leads — convert a `contact@` inbox thread into a lead.
 *
 * Reuses `getThreadDetail` (the same accessor the thread page and the reply
 * route use) rather than a second, bespoke read of `support_inbox_threads`.
 *
 * The INSERT goes through the UNTYPED admin client (`createAdminClient`), not
 * `createAdminTypedClient`. `AdminDatabase['marketing_leads']`'s Insert type is
 * the full row — `id`, `created_at`, `updated_at`, `association_name`,
 * `association_type`, `unit_count`, `community_count`, `message` and
 * `obligation_required` would all be required — which does not fit a row built
 * from a support thread. `apps/admin/src/app/(console)/clients/[id]/page.tsx`
 * already reaches for the same untyped escape for a table absent from the
 * shim (`user_roles`); this is the same move for a table whose Insert type
 * exists but doesn't match this write.
 */
export const POST = withAdminErrorHandler(async (request: NextRequest) => {
  const admin = await requirePlatformAdmin();

  const parsed = await parseAdminBody(request, leadFromThreadSchema);
  if (parsed instanceof NextResponse) return parsed;

  const detail = await getThreadDetail(parsed.threadId);
  if (!detail) throw new NotFoundError('Thread not found');

  const { thread } = detail;
  if (thread.mailbox !== 'contact') {
    throw new ValidationError('Only contact@ threads can be converted to a lead');
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from('marketing_leads')
    .insert({
      email: thread.participantEmail,
      email_normalized: thread.participantEmail.trim().toLowerCase(),
      contact_name: thread.participantName,
      source: 'inbox_contact',
      status: 'new',
      notes: `Converted from support thread #${thread.id}: ${thread.subject}`,
    })
    .select('id')
    .single();

  if (error) {
    // `marketing_leads_email_normalized_key` (migration 0055) — dedupe is
    // enforced by the database, not by a pre-check here, which would race.
    if (error.code === '23505') {
      throw new ConflictError('A lead with this email already exists');
    }
    throw new Error(`Failed to create lead from thread: ${error.message}`);
  }

  await logAdminAction({
    admin,
    action: 'lead_created_from_thread',
    resourceType: 'marketing_lead',
    resourceId: data.id,
    // Platform-level: a lead has no community, same as the thread it came from.
    communityId: null,
    metadata: { threadId: thread.id },
  });

  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
});
