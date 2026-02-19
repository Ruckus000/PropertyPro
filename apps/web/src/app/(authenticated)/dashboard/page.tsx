import { headers } from 'next/headers';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { loadDashboardData } from '@/lib/dashboard/load-dashboard-data';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { DashboardWelcome } from '@/components/dashboard/dashboard-welcome';
import { DashboardAnnouncements } from '@/components/dashboard/dashboard-announcements';
import { DashboardMeetings } from '@/components/dashboard/dashboard-meetings';
import { DashboardQuickLinks } from '@/components/dashboard/dashboard-quick-links';

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const [resolvedSearchParams, requestHeaders] = await Promise.all([
    searchParams,
    headers(),
  ]);
  const context = resolveCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    host: requestHeaders.get('host'),
  });

  if (!context.communityId) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-sm text-gray-600">
          Add a valid <code>communityId</code> query parameter to load your community dashboard.
        </p>
      </main>
    );
  }

  const userId = await requireAuthenticatedUserId();
  await requireCommunityMembership(context.communityId, userId);
  const data = await loadDashboardData(context.communityId, userId);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <DashboardWelcome firstName={data.firstName} communityName={data.communityName} />
      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardAnnouncements items={data.announcements} />
        <DashboardMeetings items={data.meetings} timezone={data.timezone} />
      </div>
      <DashboardQuickLinks communityId={context.communityId} />
    </main>
  );
}
