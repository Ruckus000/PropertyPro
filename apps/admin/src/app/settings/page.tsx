import { createAdminClient } from '@propertypro/db/supabase/admin';
import { AdminLayout } from '@/components/AdminLayout';
import { PlatformSettings } from '@/components/settings/PlatformSettings';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getCoolingDeletionRequestCount } from '@/lib/server/deletion-requests';

export const dynamic = 'force-dynamic';

/** Row shape for platform_admin_users (not in generated Supabase types). */
interface PlatformAdminRow {
  user_id: string;
  role: string;
  invited_by: string | null;
  created_at: string;
}

export default async function SettingsPage() {
  const currentAdmin = await requireAdminPageSession();
  const db = createAdminClient();

  // Fetch platform admins with emails
  const { data } = await db
    .from('platform_admin_users')
    .select('user_id, role, invited_by, created_at')
    .order('created_at');

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

  // Fetch platform stats
  const [communityResult, demoResult, coolingCount] = await Promise.all([
    db
      .from('communities')
      .select('*', { count: 'exact', head: true })
      .eq('is_demo', false)
      .is('deleted_at', null),
    db
      .from('demo_instances')
      .select('*', { count: 'exact', head: true }),
    getCoolingDeletionRequestCount(),
  ]);

  return (
    <AdminLayout coolingCount={coolingCount}>
      <PlatformSettings
        currentAdmin={{ id: currentAdmin.id, email: currentAdmin.email, role: currentAdmin.role }}
        admins={admins}
        stats={{
          communityCount: communityResult.count ?? 0,
          demoCount: demoResult.count ?? 0,
        }}
      />
    </AdminLayout>
  );
}
