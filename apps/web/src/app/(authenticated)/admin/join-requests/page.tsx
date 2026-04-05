import { AdminReviewList } from '@/components/join-requests/admin-review-list';

export default function AdminJoinRequestsPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pending Join Requests</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Review residents requesting access to your community. Approving a request creates
          a member record; denial leaves a cooldown of 30 days before the user can re-apply.
        </p>
      </div>
      <AdminReviewList />
    </div>
  );
}
