/**
 * /tickets/[id] — one ticket. The queue beside it, with this ticket's row
 * highlighted, is `(split)/layout.tsx`'s, which a row click does not re-render.
 *
 * No `AdminPageHeader` — `TicketDetail` owns this screen's `<h1>` (the ticket
 * title); the layout's `TicketQueue` hides the "Tickets" header while a ticket
 * is open, so the route still has one.
 *
 * AUTHZ: requireAdminPageSession() gates the page.
 */
import { notFound } from 'next/navigation';

import { TicketDetail } from '@/components/tickets/TicketDetail';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getTicket } from '@/lib/server/tickets';

export const dynamic = 'force-dynamic';

interface TicketPageProps {
  params: Promise<{ id: string }>;
}

export default async function TicketPage({ params }: TicketPageProps) {
  await requireAdminPageSession();

  const { id: raw } = await params;
  const id = Number(raw);
  // Rejected before the query, not after: `Number('abc')` is NaN, and a NaN
  // `.eq('id', …)` is a PostgREST error rather than a miss.
  if (!Number.isInteger(id) || id <= 0) notFound();

  const detail = await getTicket(id);
  if (!detail) notFound();

  return <TicketDetail ticket={detail.ticket} events={detail.events} />;
}
