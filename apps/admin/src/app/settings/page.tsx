import { createAdminClient } from '@propertypro/db/supabase/admin';
import { AdminLayout } from '@/components/AdminLayout';
import { PlatformSettings } from '@/components/settings/PlatformSettings';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getCoolingDeletionRequestCount } from '@/lib/server/deletion-requests';
import { buildAuthUserMap } from '@/lib/auth/list-all-auth-users';
import { PLATFORM_LIST_LIMIT } from '@/lib/api/list-limits';

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
  const { data, error } = await db
    .from('platform_admin_users')
    .select('user_id, role, invited_by, created_at')
    .order('created_at')
    .limit(PLATFORM_LIST_LIMIT);

  // `error` was not even destructured here. A failed read rendered an EMPTY
  // admin list on the page whose whole purpose is managing platform admins —
  // which reads as "there are no other admins" and invites exactly the wrong
  // action. Fail loudly instead.
  if (error) {
    throw new Error(`Failed to load platform admins: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as PlatformAdminRow[];

  // Batch fetch all auth users to avoid N+1 queries. Paged — see
  // list-all-auth-users.ts for why a bare listUsers() truncates at 50.
  const authUserMap = await buildAuthUserMap(db);

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

  // Headline counts: a failed count rendering as 0 is a plausible-looking lie.
  if (communityResult.error) {
    throw new Error(`Failed to count communities: ${communityResult.error.message}`);
  }
  if (demoResult.error) {
    throw new Error(`Failed to count demo instances: ${demoResult.error.message}`);
  }

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
