/**
 * Demo instance API — get and delete individual demos.
 *
 * GET    /api/admin/demos/:id — returns a single demo instance
 * DELETE /api/admin/demos/:id — hard-deletes a demo instance + community + auth users
 */
import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { getDemoById, deleteDemo, deleteCommunity } from '@/lib/db/demo-queries';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  await requirePlatformAdmin();

  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'id must be a positive integer' } },
      { status: 400 },
    );
  }

  const { data, error } = await getDemoById(id);

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error.message } },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Demo not found' } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data });
}

export async function DELETE(_request: Request, context: RouteContext) {
  await requirePlatformAdmin();

  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'id must be a positive integer' } },
      { status: 400 },
    );
  }

  // 1. Look up the demo instance
  const { data: demo, error: fetchError } = await getDemoById(id);
  if (fetchError || !demo) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Demo not found' } },
      { status: 404 },
    );
  }

  // 2. Delete demo users from Supabase Auth
  const supabase = createAdminClient();
  const userIds = [demo.demo_resident_user_id, demo.demo_board_user_id].filter(Boolean) as string[];
  for (const userId of userIds) {
    try {
      await supabase.auth.admin.deleteUser(userId);
    } catch {
      // User may already be deleted — continue
    }
  }

  // 3. Delete the community (cascades demo data)
  if (demo.seeded_community_id) {
    await deleteCommunity(demo.seeded_community_id);
  }

  // 4. Delete the demo_instances row
  const { error: deleteError } = await deleteDemo(id);
  if (deleteError) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: deleteError.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
