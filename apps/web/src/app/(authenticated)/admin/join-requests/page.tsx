import { AdminReviewList } from '@/components/join-requests/admin-review-list';
import { PageBody } from '@/components/shared/page-body';
import { PageHeader } from '@/components/shared/page-header';

export default async function AdminJoinRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ communityId?: string }>;
}) {
  // Off a tenant subdomain the community comes only from the URL (Directory
  // links here with it); without it the requests could not load.
  const raw = Number((await searchParams).communityId);
  const communityId = Number.isInteger(raw) && raw > 0 ? raw : undefined;
  return (
    <PageBody width="content">
      <div>
        <PageHeader title="Pending Join Requests" />
        <p className="text-sm text-content-secondary mt-2">
          Review residents requesting access to your community. Approving a request creates
          a member record; denial leaves a cooldown of 30 days before the user can re-apply.
        </p>
      </div>
      <AdminReviewList communityId={communityId} />
    </PageBody>
  );
}
