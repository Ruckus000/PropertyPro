/**
 * /tickets and /tickets/[id] — the operator work queue (spec D13), kept on
 * screen.
 *
 * The queue lives here, not in each page, so Next keeps it mounted across row
 * clicks: opening a ticket renders only `[id]/page.tsx`, and `loading.tsx`
 * beside this file fills only the detail pane. Before, each ticket page re-ran
 * `listTickets()` (four reads, then names, subjects and possibly the paged auth
 * walk) and the whole master-detail was swapped for a full-page skeleton.
 *
 * The queue is re-read by `router.refresh()` — which every ticket mutation
 * calls — and on any navigation into the queue (`TicketForm` lands on
 * `/tickets/<id>` from `/tickets/new`, outside this group, so the new ticket is
 * listed), but not on a row click.
 *
 * Inside the `(split)` group for two reasons: `/tickets/new` must not get the
 * queue beside its form, and `tickets/loading.tsx` must sit ABOVE this layout —
 * Next prefetches a dynamic route down to its first loading boundary, and the
 * rail links here from every console page.
 *
 * All four data states are covered, per `.claude/rules/design.md`: loading is
 * `tickets/loading.tsx` on entry and `loading.tsx` here for the pane, empty and
 * populated are `TicketList`'s two branches, and an error in `listTickets()`
 * propagates to the error boundary — deliberately, unlike `/health`: a queue
 * that silently rendered "no tickets" because a read failed would tell an
 * operator their work is done when it is not.
 *
 * AUTHZ: requireAdminPageSession() gates the layout; each page calls it too,
 * because a layout is not a security boundary (see `(console)/layout.tsx`).
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Button, PageBody } from '@propertypro/ui';

import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import { TicketQueue } from '@/components/tickets/TicketQueue';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { listTickets } from '@/lib/server/tickets';

export const dynamic = 'force-dynamic';

export default async function TicketsSplitLayout({ children }: { children: ReactNode }) {
  await requireAdminPageSession();

  // Loaded UNFILTERED: `TicketQueue` filters by status client-side over this one
  // read, and `counts` (which ignores the status filter by design) is what the
  // tabs render. Passing the status through would make every unselected tab
  // read zero. `?status=` is read by `TicketQueue` from the URL itself.
  const result = await listTickets();

  return (
    <PageBody>
      <TicketQueue
        result={result}
        header={
          <AdminPageHeader
            title="Tickets"
            description="Work items you own. Threads stay in Inbox; tickets track the fix."
            actions={
              <Button asChild size="sm">
                <Link href="/tickets/new">New ticket</Link>
              </Button>
            }
          />
        }
      >
        {children}
      </TicketQueue>
    </PageBody>
  );
}
