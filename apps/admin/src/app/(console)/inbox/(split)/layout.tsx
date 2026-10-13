/**
 * /inbox and /inbox/[threadId] — the thread list, kept on screen.
 *
 * The list lives here, not in each page, so Next keeps it mounted across row
 * clicks: opening a thread renders only `[threadId]/page.tsx`, and
 * `loading.tsx` beside this file fills only the detail pane. Before, each
 * thread page re-ran `getInboxOverview()` and the whole master-detail was
 * swapped for a full-page skeleton until it landed.
 *
 * Next never re-renders a layout on a navigation between its own children, so
 * the list is re-read only: when a thread closes (`InboxDashboard` refreshes once
 * on the way back to the list), on `router.refresh()` — which every inbox
 * mutation calls — and on entry from outside the inbox. Thread to thread is free.
 *
 * Inside the `(split)` group so `inbox/loading.tsx` sits ABOVE this layout:
 * Next prefetches a dynamic route down to its first loading boundary, and the
 * rail links here from every console page, so a data layout above that
 * boundary would run on every prefetch.
 *
 * AUTHZ: requireAdminPageSession() gates the layout; each page calls it too,
 * because a layout is not a security boundary (see `(console)/layout.tsx`).
 */
import type { ReactNode } from 'react';
import { PageBody } from '@propertypro/ui';

import { InboxDashboard } from '@/components/inbox/InboxDashboard';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getInboxOverview } from '@/lib/server/inbox';

export const dynamic = 'force-dynamic';

export default async function InboxSplitLayout({ children }: { children: ReactNode }) {
  await requireAdminPageSession();
  const overview = await getInboxOverview();

  return (
    <PageBody>
      <InboxDashboard
        overview={overview}
        header={
          <AdminPageHeader
            title="Inbox"
            description="Three shared mailboxes, one queue. Each mailbox has its own next step."
          />
        }
      >
        {children}
      </InboxDashboard>
    </PageBody>
  );
}
