/**
 * /tickets/[id] — one ticket, next to the queue it came from.
 *
 * Same master-detail shape as `/inbox/[threadId]`: the queue is reloaded here
 * so the list beside the open ticket is the same list the operator was
 * browsing, and the row for this ticket is highlighted.
 *
 * No `AdminPageHeader` — `TicketDetail` owns this screen's `<h1>` (the ticket
 * title), so the header'd chrome would give the route two.
 *
 * AUTHZ: requireAdminPageSession() gates the page.
 */
import { notFound } from 'next/navigation';

import { TicketDetail } from '@/components/tickets/TicketDetail';
import { TicketQueue } from '@/components/tickets/TicketQueue';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getTicket, listTickets } from '@/lib/server/tickets';

export const dynamic = 'force-dynamic';

interface TicketPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}

export default async function TicketPage({ params, searchParams }: TicketPageProps) {
  await requireAdminPageSession();

  const { id: raw } = await params;
  const id = Number(raw);
  // Rejected before the query, not after: `Number('abc')` is NaN, and a NaN
  // `.eq('id', …)` is a PostgREST error rather than a miss.
  if (!Number.isInteger(id) || id <= 0) notFound();

  const detail = await getTicket(id);
  if (!detail) notFound();

  const [{ status }, result] = await Promise.all([searchParams, listTickets()]);

  return (
    <TicketQueue
      result={result}
      initialStatus={status ?? 'all'}
      activeTicketId={id}
      detail={<TicketDetail ticket={detail.ticket} events={detail.events} />}
    />
  );
}
