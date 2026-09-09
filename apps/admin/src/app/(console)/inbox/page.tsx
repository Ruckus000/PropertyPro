import { PageBody } from '@propertypro/ui';
import { InboxDashboard } from '@/components/inbox/InboxDashboard';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getInboxThreads } from '@/lib/server/inbox';

export const dynamic = 'force-dynamic';

export default async function InboxPage() {
  await requireAdminPageSession();
  const { threads, stats, truncated } = await getInboxThreads();

  return (
    <PageBody>
      <AdminPageHeader
        title="Inbox"
        description="Mail sent to support@, privacy@ and contact@getpropertypro.com."
      />
      <InboxDashboard
        initialThreads={threads}
        initialStats={stats}
        initialTruncated={truncated}
      />
    </PageBody>
  );
}
