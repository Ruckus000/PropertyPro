/**
 * Marketing Leads API for the admin console.
 *
 * GET   /api/admin/leads — list leads (optional ?status= and ?source= filters)
 * PATCH /api/admin/leads — update a lead's triage status / notes
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
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
