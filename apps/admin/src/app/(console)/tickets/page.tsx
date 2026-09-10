/**
 * /tickets — placeholder for the Wave 3 ticketing surface (spec D13).
 *
 * The rail has linked here since Wave 1, and an unmatched URL renders the ROOT
 * not-found, which sits OUTSIDE this route group: no rail, no top bar, no way
 * back. So the route has to exist for the nav entry to be honest. Wave 3
 * replaces this body in place — keep the session call when it does.
 *
 * AUTHZ: requireAdminPageSession() gates the page.
 */
import Link from 'next/link';
import { Ticket } from 'lucide-react';
import { Button, EmptyState, PageBody } from '@propertypro/ui';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';

export const dynamic = 'force-dynamic';

export default async function TicketsPage() {
  await requireAdminPageSession();

  return (
    <PageBody>
      <AdminPageHeader title="Tickets" />
      <EmptyState
        icon={Ticket}
        title="Ticketing isn't built yet"
        description="Tracked work raised from a conversation will live here. Mail to support@, privacy@ and contact@ is already received and answered in the Inbox."
        action={
          <Button asChild>
            <Link href="/inbox">Go to the Inbox</Link>
          </Button>
        }
      />
    </PageBody>
  );
}
