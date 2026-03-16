/**
 * Platform admin management API.
 *
 * GET  /api/admin/platform-admins — list all platform admins with emails
 * POST /api/admin/platform-admins — add an existing user as a platform admin
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';

/** Row shape for platform_admin_users (not in generated Supabase types). */
interface PlatformAdminRow {
  user_id: string;
  role: string;
  invited_by: string | null;
  created_at: string;
}

const addAdminSchema = z.object({
  email: z.string().email(),
});

export async function GET() {
  await requirePlatformAdmin();

  const db = createAdminClient();

  const { data, error } = await db
    .from('platform_admin_users')
    .select('user_id, role, invited_by, created_at')
    .order('created_at');

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error.message } },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as unknown as PlatformAdminRow[];

  // Batch fetch all auth users to avoid N+1 queries
  const { data: { users: authUsers } } = await db.auth.admin.listUsers();
  const authUserMap = new Map(authUsers.map((u) => [u.id, u]));

  const admins = rows.map((row) => {
    const user = authUserMap.get(row.user_id);
    return {
      userId: row.user_id,
      email: user?.email ?? 'unknown',
      role: row.role,
      invitedBy: row.invited_by,
      createdAt: row.created_at,
    };
  });

  return NextResponse.json({ admins });
}

export async function POST(request: NextRequest) {
  const currentAdmin = await requirePlatformAdmin();

  const body = await request.json();
  const parsed = addAdminSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input' } },
      { status: 400 },
    );
  }

  const { email } = parsed.data;
  const db = createAdminClient();

  // Look up the user by email in auth.users
  const { data: { users } } = await db.auth.admin.listUsers();
  const targetUser = users.find((u) => u.email === email);

  if (!targetUser) {
    return NextResponse.json(
      { error: { code: 'USER_NOT_FOUND', message: 'No account found with that email. The user must create an account first.' } },
      { status: 404 },
    );
  }

  // Check if already an admin
  const { data: existing } = await db
    .from('platform_admin_users')
    .select('user_id')
    .eq('user_id', targetUser.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: { code: 'ALREADY_ADMIN', message: 'This user is already a platform admin.' } },
      { status: 409 },
    );
  }

  // Insert as platform admin — use rpc or raw insert since table is not in generated types
  const { error: insertError } = await db
    .from('platform_admin_users')
    .insert({
      user_id: targetUser.id,
      role: 'super_admin',
      invited_by: currentAdmin.id,
    } as never);

  if (insertError) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: insertError.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({
    admin: {
      userId: targetUser.id,
      email: targetUser.email,
      role: 'super_admin',
      invitedBy: currentAdmin.id,
      createdAt: new Date().toISOString(),
    },
  }, { status: 201 });
}
