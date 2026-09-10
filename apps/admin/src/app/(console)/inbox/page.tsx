import { PageBody } from '@propertypro/ui';
import { InboxDashboard } from '@/components/inbox/InboxDashboard';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getInboxOverview } from '@/lib/server/inbox';

export const dynamic = 'force-dynamic';

interface InboxPageProps {
  searchParams: Promise<{ mailbox?: string; status?: string }>;
}

export default async function InboxPage({ searchParams }: InboxPageProps) {
  await requireAdminPageSession();
  const { mailbox, status } = await searchParams;
  const overview = await getInboxOverview();

  return (
    <PageBody>
      <AdminPageHeader
        title="Inbox"
        description="Three shared mailboxes, one queue. Each mailbox has its own next step."
      />
      <InboxDashboard
        overview={overview}
        initialMailbox={mailbox ?? 'all'}
        initialStatus={status ?? 'all'}
      />
    </PageBody>
  );
}
