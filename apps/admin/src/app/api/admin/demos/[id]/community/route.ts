/**
 * Demo community API — read/update the seeded community's metadata.
 *
 * GET  /api/admin/demos/:id/community — fetch community name, address, type
 * PATCH /api/admin/demos/:id/community — update community name, address
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { getDemoCommunityId, markDemoCustomized } from '@/lib/db/demo-queries';
import { createAdminClient } from '@propertypro/db/supabase/admin';

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  address_line1: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(2).optional(),
  zip_code: z.string().max(10).optional(),
}).strict();

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  await requirePlatformAdmin();

  const { id: idRaw } = await context.params;
  const demoId = Number(idRaw);
  if (!Number.isInteger(demoId) || demoId <= 0) {
    return NextResponse.json(
      { error: { code: 'INVALID_ID', message: 'Invalid demo ID' } },
      { status: 400 },
    );
  }

  const communityId = await getDemoCommunityId(demoId);
  if (!communityId) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Demo not found' } },
      { status: 404 },
    );
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from('communities')
    .select('id, name, address_line1, city, state, zip_code, community_type')
    .eq('id', communityId)
    .is('deleted_at', null)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Community not found' } },
      { status: 404 },
    );
  }

  return NextResponse.json({ community: data });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const admin = await requirePlatformAdmin();

  const { id: idRaw } = await context.params;
  const demoId = Number(idRaw);
  if (!Number.isInteger(demoId) || demoId <= 0) {
    return NextResponse.json(
      { error: { code: 'INVALID_ID', message: 'Invalid demo ID' } },
      { status: 400 },
    );
  }

  const communityId = await getDemoCommunityId(demoId);
  if (!communityId) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Demo not found' } },
      { status: 404 },
    );
  }

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input' } },
      { status: 400 },
    );
  }

  const db = createAdminClient();

  // Fetch old values for audit log
  const { data: existing } = await db
    .from('communities')
    .select('name, address_line1, city, state, zip_code')
    .eq('id', communityId)
    .is('deleted_at', null)
    .single();

  if (!existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Community not found' } },
      { status: 404 },
    );
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      updates[key] = value;
    }
  }

  const { data: updated, error } = await db
    .from('communities')
    .update(updates as never)
    .eq('id', communityId)
    .select('id, name, address_line1, city, state, zip_code, community_type')
    .single();

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error.message } },
      { status: 500 },
    );
  }

  // Mark demo as customized (no-op if already set)
  await markDemoCustomized(demoId);

  // Fire-and-forget audit log
  db.from('compliance_audit_log')
    .insert({
      user_id: admin.id,
      community_id: communityId,
      action: 'demo_community_changed',
      resource_type: 'community',
      resource_id: String(communityId),
      old_values: existing as Record<string, unknown>,
      new_values: parsed.data as Record<string, unknown>,
      metadata: { source: 'admin_platform', admin_email: admin.email, demo_id: demoId },
    } as never)
    .then(({ error: auditError }) => {
      if (auditError) {
        console.error('[audit] Failed to log demo community change:', auditError.message);
      }
    });

  return NextResponse.json({ community: updated });
}
