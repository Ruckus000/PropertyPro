import { AdminReviewList } from '@/components/join-requests/admin-review-list';
import { PageBody } from '@/components/shared/page-body';
import { PageHeader } from '@/components/shared/page-header';

export default function AdminJoinRequestsPage() {
  return (
    <PageBody width="content">
      <div>
        <PageHeader title="Pending Join Requests" />
        <p className="text-sm text-content-secondary mt-2">
          Review residents requesting access to your community. Approving a request creates
          a member record; denial leaves a cooldown of 30 days before the user can re-apply.
        </p>
      </div>
      <AdminReviewList />
    </PageBody>
  );
}
