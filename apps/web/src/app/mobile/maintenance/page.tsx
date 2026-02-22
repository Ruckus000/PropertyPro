export const dynamic = 'force-dynamic';

/**
 * P3-48/49: Mobile maintenance requests list page (resident view).
 *
 * Residents see only their own submitted requests.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { desc, eq } from '@propertypro/db/filters';
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
  // Filter by submittedById at the DB level; communityId + deletedAt IS NULL are injected automatically
  const active = await scoped
    .selectFrom(maintenanceRequests, {}, eq(maintenanceRequests.submittedById, userId!))
    .orderBy(desc(maintenanceRequests.createdAt));

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
