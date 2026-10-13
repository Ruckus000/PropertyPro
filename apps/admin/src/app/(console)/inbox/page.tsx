import { PageBody } from '@propertypro/ui';
import { InboxDashboard } from '@/components/inbox/InboxDashboard';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getInboxOverview } from '@/lib/server/inbox';

export const dynamic = 'force-dynamic';

export default async function InboxPage() {
  await requireAdminPageSession();
  // `?mailbox=` / `?status=` are read by `InboxDashboard` from the URL itself.
  const overview = await getInboxOverview();

  return (
    <PageBody>
      <AdminPageHeader
        title="Inbox"
        description="Three shared mailboxes, one queue. Each mailbox has its own next step."
      />
      <InboxDashboard overview={overview} />
    </PageBody>
  );
}
