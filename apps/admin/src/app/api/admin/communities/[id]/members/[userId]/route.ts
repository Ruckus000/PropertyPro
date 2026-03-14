/**
 * Individual member management for the admin platform.
 *
 * PATCH  /api/admin/communities/:id/members/:userId — update member role
 * DELETE /api/admin/communities/:id/members/:userId — remove member from community
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';

interface RouteContext {
  params: Promise<{ id: string; userId: string }>;
}

const patchSchema = z.object({
  role: z.enum(['resident', 'manager', 'pm_admin']).optional(),
  preset_key: z.enum(['board_president', 'board_member', 'cam', 'site_manager']).nullable().optional(),
  display_title: z.string().max(200).nullable().optional(),
  is_unit_owner: z.boolean().optional(),
}).strict();

export async function PATCH(request: NextRequest, context: RouteContext) {
  await requirePlatformAdmin();

  const { id, userId } = await context.params;
  const communityId = Number(id);
  if (!Number.isInteger(communityId) || communityId <= 0) {
    return NextResponse.json(
      { error: { code: 'INVALID_ID', message: 'Invalid community ID' } },
      { status: 400 },
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

  // Verify the user_role exists
  const { data: existing } = await db
    .from('user_roles')
    .select('id, role')
    .eq('community_id', communityId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Member not found in this community' } },
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

  // If changing away from manager, clear preset_key and permissions
  if (parsed.data.role && parsed.data.role !== 'manager') {
    updates.preset_key = null;
    updates.permissions = null;
  }

  const { data: updated, error } = await db
    .from('user_roles')
    .update(updates as never)
    .eq('community_id', communityId)
    .eq('user_id', userId)
    .select('id, user_id, role, preset_key, display_title, is_unit_owner, created_at, updated_at')
    .single();

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ member: updated });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  await requirePlatformAdmin();

  const { id, userId } = await context.params;
  const communityId = Number(id);
  if (!Number.isInteger(communityId) || communityId <= 0) {
    return NextResponse.json(
      { error: { code: 'INVALID_ID', message: 'Invalid community ID' } },
      { status: 400 },
    );
  }

  const db = createAdminClient();

  const { data, error } = await db
    .from('user_roles')
    .delete()
    .eq('community_id', communityId)
    .eq('user_id', userId)
    .select('id')
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Member not found in this community' } },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}
