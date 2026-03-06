/**
 * Operational Dashboard — platform admin home page.
 *
 * Shows KPI cards, action items, recent activity, and pipeline overview.
 */
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { AdminLayout } from '@/components/AdminLayout';
import { Dashboard } from '@/components/dashboard/Dashboard';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const db = createAdminClient();

  const now = new Date();
  const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Fetch all data in parallel
  const [
    communitiesResult,
    demosResult,
    staleDemosResult,
    newClientsResult,
    pastDueResult,
    recentCommunitiesResult,
    recentDemosResult,
  ] = await Promise.all([
    // Active clients (non-demo, non-deleted)
    db
      .from('communities')
      .select('id, name, slug, community_type, subscription_status, subscription_plan, created_at')
      .eq('is_demo', false)
      .is('deleted_at', null),
    // All demos
    db
      .from('demo_instances')
      .select('id, prospect_name, template_type, created_at')
      .order('created_at', { ascending: false }),
    // Stale demos (>10 days old)
    db
      .from('demo_instances')
      .select('id, prospect_name, template_type, created_at')
      .lt('created_at', tenDaysAgo)
      .order('created_at'),
    // New clients this month
    db
      .from('communities')
      .select('id, name, created_at')
      .eq('is_demo', false)
      .is('deleted_at', null)
      .gte('created_at', monthStart),
    // Past-due subscriptions
    db
      .from('communities')
      .select('id, name, slug, subscription_status, updated_at')
      .eq('is_demo', false)
      .is('deleted_at', null)
      .eq('subscription_status', 'past_due'),
    // Recently created/updated communities (for activity feed)
    db
      .from('communities')
      .select('id, name, slug, created_at, updated_at')
      .eq('is_demo', false)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(5),
    // Recent demos (for activity feed)
    db
      .from('demo_instances')
      .select('id, prospect_name, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const communities = communitiesResult.data ?? [];
  const demos = demosResult.error ? [] : (demosResult.data ?? []);
  const staleDemos = staleDemosResult.error ? [] : (staleDemosResult.data ?? []);
  const newClients = newClientsResult.data ?? [];
  const pastDueCommunities = pastDueResult.data ?? [];
  const recentCommunities = recentCommunitiesResult.data ?? [];
  const recentDemos = recentDemosResult.error ? [] : (recentDemosResult.data ?? []);

  // Build activity feed by merging recent communities and demos
  const activityItems = [
    ...recentCommunities.map((c: { id: number; name: string; slug: string; created_at: string; updated_at: string }) => ({
      type: 'community' as const,
      id: `community-${c.id}`,
      label: c.name,
      action: 'updated',
      timestamp: c.updated_at,
      href: `/clients/${c.id}`,
    })),
    ...recentDemos.map((d: { id: number; prospect_name: string; created_at: string }) => ({
      type: 'demo' as const,
      id: `demo-${d.id}`,
      label: d.prospect_name,
      action: 'demo created',
      timestamp: d.created_at,
      href: '/demo',
    })),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 8);

  return (
    <AdminLayout>
      <Dashboard
        stats={{
          activeClients: communities.length,
          activeDemos: demos.length,
          staleDemos: staleDemos.length,
          newClientsThisMonth: newClients.length,
          pastDueCount: pastDueCommunities.length,
        }}
        actionItems={{
          staleDemos,
          pastDueCommunities,
        }}
        activityFeed={activityItems}
        pipeline={{
          demos: demos.length,
          active: communities.length,
        }}
      />
    </AdminLayout>
  );
}
