/**
 * /tickets — the operator work queue (spec D13).
 *
 * This route already existed as a placeholder, and its body is replaced rather
 * than the file recreated, for the reason that placeholder recorded: the rail
 * has linked here since Wave 1, and an unmatched URL renders the ROOT
 * not-found, which sits OUTSIDE this route group — no rail, no top bar, no way
 * back. `/tickets/[id]` and `/tickets/new` had to land in the same commit for
 * the same reason, because this list links to both.
 *
 * All four data states are covered, per `.claude/rules/design.md`: loading is
 * `loading.tsx` (the route is `force-dynamic`, so the Suspense boundary is
 * real), empty and populated are `TicketList`'s two branches, and an error in
 * `listTickets()` propagates to the error boundary — deliberately, unlike
 * `/health`: a queue that silently rendered "no tickets" because a read failed
 * would tell an operator their work is done when it is not.
 *
 * AUTHZ: requireAdminPageSession() gates the page.
 */
import Link from 'next/link';
import { Button, PageBody } from '@propertypro/ui';

import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import { TicketQueue } from '@/components/tickets/TicketQueue';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { listTickets } from '@/lib/server/tickets';

export const dynamic = 'force-dynamic';

interface TicketsPageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function TicketsPage({ searchParams }: TicketsPageProps) {
  await requireAdminPageSession();

  // Loaded UNFILTERED: `TicketQueue` filters by status client-side over this one
  // read, and `counts` (which ignores the status filter by design) is what the
  // tabs render. Passing the status through would make every unselected tab
  // read zero.
  const [{ status }, result] = await Promise.all([searchParams, listTickets()]);

  return (
    <PageBody>
      <AdminPageHeader
        title="Tickets"
        description="Work items you own. Threads stay in Inbox; tickets track the fix."
        actions={
          <Button asChild size="sm">
            <Link href="/tickets/new">New ticket</Link>
          </Button>
        }
      />
      <TicketQueue result={result} initialStatus={status ?? 'all'} />
    </PageBody>
  );
}
