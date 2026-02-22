/**
 * P3-48/49: Mobile maintenance requests list page (resident view).
 *
 * Residents see only their own submitted requests.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { createScopedClient, maintenanceRequests } from '@propertypro/db';
import { CompactCard } from '@/components/mobile/CompactCard';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  submitted: 'Submitted',
  in_progress: 'In Progress',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
  closed: 'Closed',
};

export default async function MobileMaintenancePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const communityId = Number(params['communityId']);

  let userId: string;
  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  try {
    await requireCommunityMembership(communityId, userId!);
  } catch {
    redirect('/auth/login');
  }

  const scoped = createScopedClient(communityId);
  const allRows = await scoped.query(maintenanceRequests);
  // Residents see only their own requests — filter client-side after scoped fetch
  const rows = allRows.filter((r) => r['submittedById'] === userId);
  const active = rows
    .filter((r) => r['deletedAt'] == null)
    .sort(
      (a, b) =>
        new Date(b['createdAt'] as string).getTime() -
        new Date(a['createdAt'] as string).getTime(),
    );

  return (
    <div>
      <div className="mobile-page-header">Maintenance</div>
      {active.length === 0 ? (
        <p className="mobile-empty">No maintenance requests</p>
      ) : (
        active.map((r) => (
          <CompactCard
            key={r['id'] as number}
            title={r['title'] as string}
            subtitle={STATUS_LABEL[r['status'] as string] ?? (r['status'] as string)}
            meta={new Date(r['createdAt'] as string).toLocaleDateString()}
          />
        ))
      )}
    </div>
  );
}
