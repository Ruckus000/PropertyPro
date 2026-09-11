import { createAdminClient } from '@propertypro/db/supabase/admin';
import { stripeKeyLivemode } from '@propertypro/shared';
import { PlatformSettings } from '@/components/settings/PlatformSettings';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { buildAuthUserMap } from '@/lib/auth/list-all-auth-users';
import { PLATFORM_LIST_LIMIT } from '@/lib/api/list-limits';
import { getPreferences } from '@/lib/server/preferences';
import { getHealthReport } from '@/lib/server/health';
import { withHealthCache } from '@/lib/server/health-cache';

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
  // Already resolved by the console layout this page renders inside, and
  // `getPreferences` is `cache()`d, so this is the same read, not a second one.
  const preferences = await getPreferences(currentAdmin.id);
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
  const [communityResult, demoResult] = await Promise.all([
    db
      .from('communities')
      .select('*', { count: 'exact', head: true })
      .eq('is_demo', false)
      .is('deleted_at', null),
    db
      .from('demo_instances')
      .select('*', { count: 'exact', head: true }),
  ]);

  // Headline counts: a failed count rendering as 0 is a plausible-looking lie.
  if (communityResult.error) {
    throw new Error(`Failed to count communities: ${communityResult.error.message}`);
  }
  if (demoResult.error) {
    throw new Error(`Failed to count demo instances: ${demoResult.error.message}`);
  }

  // Integrations (task 32). Read through `withHealthCache`, NOT a second
  // uncached `getHealthReport()` — that call is six outbound probes plus three
  // privileged reads, and the `(console)` layout's health signal has already
  // asked for exactly this report on this same request. The TTL cache
  // deduplicates in-flight loads, so the two callers share one probe set.
  //
  // No `adminOrigin` is passed, deliberately: the cache key is the report with
  // default deps, and none of the four rows rendered here is the `Admin` row.
  //
  // A failure must not 500 the page an operator opens to manage admins.
  // `getHealthReport` catches every probe internally, so this only fires if the
  // module itself blows up — in which case the section reports `Not reported`
  // (unknown) for all four rows, which is the honest reading.
  let healthServices: Awaited<ReturnType<typeof getHealthReport>>['services'] = [];
  let sentryAnswered = false;
  try {
    const report = await withHealthCache(() => getHealthReport());
    healthServices = report.services;
    sentryAnswered = report.errors !== null;
  } catch {
    healthServices = [];
    sentryAnswered = false;
  }

  // `PlatformSettings` renders its own `AdminPageHeader` (it's a client
  // component that also owns the add/remove-admin interaction state, so its
  // header lives alongside that rather than being hoisted onto this server
  // page — same reasoning as DemoListClient).
  return (
    <PlatformSettings
      currentAdmin={{ id: currentAdmin.id, email: currentAdmin.email, role: currentAdmin.role }}
      admins={admins}
      stats={{
        communityCount: communityResult.count ?? 0,
        demoCount: demoResult.count ?? 0,
      }}
      alertPrefs={preferences.alertPrefs}
      integrations={{
        services: healthServices,
        sentryAnswered,
        // `null` (unset, or a prefix we do not recognise) stays `null` all the
        // way to the badge, which labels it "Not configured". Coercing it with
        // `=== true` here — as the read-only billing page does for a dashboard
        // link — would render an undetermined mode as "Test mode", which is a
        // claim this deployment cannot make.
        stripeLivemode: stripeKeyLivemode(process.env.STRIPE_SECRET_KEY),
      }}
    />
  );
}
