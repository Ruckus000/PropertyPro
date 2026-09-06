import { AdminLayout } from '@/components/AdminLayout';
import { InboxDashboard } from '@/components/inbox/InboxDashboard';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getInboxThreads } from '@/lib/server/inbox';

export const dynamic = 'force-dynamic';

export default async function InboxPage() {
  await requireAdminPageSession();
  const { threads, stats, truncated } = await getInboxThreads();

  return (
    <AdminLayout>
      <div className="p-6">
        <h1 className="mb-1 text-xl font-semibold text-content">Inbox</h1>
        <p className="mb-6 text-sm text-content-tertiary">
          Mail sent to support@, privacy@ and contact@getpropertypro.com.
        </p>
        <InboxDashboard
          initialThreads={threads}
          initialStats={stats}
          initialTruncated={truncated}
        />
      </div>
    </AdminLayout>
  );
}
