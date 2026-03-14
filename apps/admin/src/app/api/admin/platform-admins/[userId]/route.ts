/**
 * Single platform admin API.
 *
 * DELETE /api/admin/platform-admins/:userId — remove a platform admin
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const currentAdmin = await requirePlatformAdmin();
  const { userId } = await params;

  if (userId === currentAdmin.id) {
    return NextResponse.json(
      { error: { code: 'SELF_DELETE', message: 'You cannot remove yourself as a platform admin.' } },
      { status: 400 },
    );
  }

  const db = createAdminClient();

  const { data: existing } = await db
    .from('platform_admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Admin not found.' } },
      { status: 404 },
    );
  }

  const { error } = await db
    .from('platform_admin_users')
    .delete()
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
