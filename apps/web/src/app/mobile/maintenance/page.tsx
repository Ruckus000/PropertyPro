export const dynamic = 'force-dynamic';

/**
 * Mobile maintenance requests page — Warm Editorial stone palette redesign.
 *
 * Residents see only their own submitted requests.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { desc, eq } from '@propertypro/db/filters';
import { createScopedClient, maintenanceRequests } from '@propertypro/db';
import { resolveTimezone } from '@/lib/utils/timezone';
import { MobileMaintenanceContent } from '@/components/mobile/MobileMaintenanceContent';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function MobileMaintenancePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const communityId = Number(params['communityId']);

  let userId: string;
  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  let membership: Awaited<ReturnType<typeof requireCommunityMembership>>;
  try {
    membership = await requireCommunityMembership(communityId, userId!);
  } catch {
    redirect('/auth/login');
  }

  const timezone = resolveTimezone(membership!.timezone);
  const scoped = createScopedClient(communityId);
  const active = await scoped
    .selectFrom(maintenanceRequests, {}, eq(maintenanceRequests.submittedById, userId!))
    .orderBy(desc(maintenanceRequests.createdAt));

  const serialized = active.map((r) => ({
    id: r['id'] as number,
    title: r['title'] as string,
    status: r['status'] as string,
    createdAt: (r['createdAt'] as Date).toISOString(),
  }));

  return (
    <MobileMaintenanceContent
      requests={serialized}
      timezone={timezone}
      communityId={communityId}
    />
  );
}
