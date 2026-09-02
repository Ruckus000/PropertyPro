import { AdminReviewList } from '@/components/join-requests/admin-review-list';
import { PageBody } from '@/components/shared/page-body';

export default function AdminJoinRequestsPage() {
  return (
    <PageBody width="content">
      <div>
        <h1 className="text-2xl font-semibold">Pending Join Requests</h1>
        <p className="text-sm text-content-secondary mt-2">
          Review residents requesting access to your community. Approving a request creates
          a member record; denial leaves a cooldown of 30 days before the user can re-apply.
        </p>
      </div>
      <AdminReviewList />
    </PageBody>
  );
}
