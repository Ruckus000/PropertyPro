/**
 * A thread id that does not exist — rendered in the DETAIL PANE, beside the
 * list, rather than by `(console)/not-found.tsx` (which replaced the whole
 * inbox). The usual cause is a thread deleted in another tab or by another
 * operator while this list was on screen; going back to the list re-reads it
 * (`InboxDashboard`), so the dead row disappears.
 *
 * AUTHZ: inherited — the page that called `notFound()` and the `(split)` layout
 * both gate with requireAdminPageSession().
 */
import Link from 'next/link';
import { MailQuestion } from 'lucide-react';
import { Button, EmptyState } from '@propertypro/ui';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';

export default function ThreadNotFound() {
  return (
    <div className="space-y-4">
      <AdminPageHeader title="Conversation not found" />
      <EmptyState
        icon={MailQuestion}
        title="This conversation doesn't exist"
        description="It may have been deleted, or the link may be out of date."
        size="md"
        action={
          <Button asChild variant="outline">
            <Link href="/inbox">Back to inbox</Link>
          </Button>
        }
      />
    </div>
  );
}
