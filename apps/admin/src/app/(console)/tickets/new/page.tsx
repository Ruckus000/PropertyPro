/**
 * /tickets/new — open a ticket, usually from somewhere else.
 *
 * Three surfaces already link here and each carries its own context:
 * `/inbox/[threadId]`'s context strip sends `?thread=`, `/health`'s error list
 * sends `?ref=&title=` for a Sentry issue, and the dashboard sends nothing at
 * all. `?community=` is accepted for the same reason, for a link from a client
 * workspace.
 *
 * ## Every prefill is verified, not trusted
 *
 * These params arrive from the URL bar as readily as from a link, and two of
 * them are foreign keys. A `?thread=` naming a thread that does not exist would
 * pass Zod and then violate `support_tickets_thread_id_fkey` at insert time — a
 * 500 on a form that looked fine. A `?community=` naming a demo or soft-deleted
 * community would file real work against a community nobody is paying for, or
 * deep-link the finished ticket to a `/clients/[id]` that calls `notFound()`.
 * So each is resolved against the database here and DROPPED when it does not
 * check out: the operator still gets their form, just without a link that would
 * not have worked.
 *
 * `?title=` is truncated to the shared title bound. A Sentry issue title runs
 * well past 200 characters, and `maxLength` on an input constrains typing, not
 * a prefilled value — so an untruncated prefill would submit and come back 400
 * from a form the operator never touched.
 *
 * AUTHZ: requireAdminPageSession() gates the page.
 */
import { PageBody } from '@propertypro/ui';

import { SUPPORT_TICKET_TITLE_MAX_LENGTH } from '@propertypro/shared';

import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import { TicketForm } from '@/components/tickets/TicketForm';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getThreadDetail } from '@/lib/server/inbox';
import { listTicketCommunities } from '@/lib/server/tickets';

export const dynamic = 'force-dynamic';

interface NewTicketPageProps {
  searchParams: Promise<{
    thread?: string;
    community?: string;
    ref?: string;
    title?: string;
  }>;
}

/** A positive integer, or undefined — never NaN reaching a query. */
function positiveInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

export default async function NewTicketPage({ searchParams }: NewTicketPageProps) {
  await requireAdminPageSession();

  const params = await searchParams;
  const threadId = positiveInt(params.thread);
  const requestedCommunityId = positiveInt(params.community);

  const [communities, thread] = await Promise.all([
    listTicketCommunities(),
    threadId === undefined ? Promise.resolve(null) : getThreadDetail(threadId),
  ]);

  const communityId =
    requestedCommunityId !== undefined &&
    communities.some((community) => community.id === requestedCommunityId)
      ? requestedCommunityId
      : null;

  const rawTitle = params.title?.trim() || thread?.thread.subject || '';

  return (
    <PageBody width="form">
      <AdminPageHeader
        title="New ticket"
        description="A ticket is work we have committed to doing. Threads stay in Inbox."
        backHref="/tickets"
        backLabel="Back to tickets"
      />
      <TicketForm
        communities={communities}
        initial={{
          title: rawTitle.slice(0, SUPPORT_TICKET_TITLE_MAX_LENGTH),
          // Only when the thread actually resolved — see the docblock.
          threadId: thread ? threadId ?? null : null,
          communityId,
          externalRef: params.ref?.trim() || null,
        }}
      />
    </PageBody>
  );
}
