/**
 * A ticket id that does not exist — rendered in the DETAIL PANE, beside the
 * queue, rather than by `(console)/not-found.tsx` (which replaced the whole
 * queue). Going back to the queue re-reads it (`TicketQueue`).
 *
 * AUTHZ: inherited — the page that called `notFound()` and the `(split)` layout
 * both gate with requireAdminPageSession().
 */
import Link from 'next/link';
import { TicketCheck } from 'lucide-react';
import { Button, EmptyState } from '@propertypro/ui';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';

export default function TicketNotFound() {
  return (
    <div className="space-y-4">
      <AdminPageHeader title="Ticket not found" />
      <EmptyState
        icon={TicketCheck}
        title="This ticket doesn't exist"
        description="It may have been deleted, or the link may be out of date."
        size="md"
        action={
          <Button asChild variant="outline">
            <Link href="/tickets">Back to tickets</Link>
          </Button>
        }
      />
    </div>
  );
}
