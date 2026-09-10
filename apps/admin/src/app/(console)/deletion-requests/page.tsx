/**
 * Deletion Requests page — shows all account/community deletion requests.
 */
import { PageBody } from '@propertypro/ui';
import { DeletionRequestsDashboard } from '@/components/deletion-requests/DeletionRequestsDashboard';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getDeletionRequestsData } from '@/lib/server/deletion-requests';
import { getThreadDetail } from '@/lib/server/inbox';

export const dynamic = 'force-dynamic';

interface DeletionRequestsPageProps {
  /**
   * `?q=` — an operator-typed email filter. Legitimate: the operator chose to
   * put it there, and the page's own filter box round-trips it.
   *
   * `?thread=<id>` — how the inbox privacy strip links here. It carries the
   * thread id and NOT the participant's email, because a link this console
   * generates would put a data subject's address into Vercel access logs,
   * browser history and Sentry navigation breadcrumbs, none of which redact a
   * bare `q=<email>` — the same sink this branch removed from the command
   * palette (`lib/server/search/users.ts`). The email is resolved server-side
   * below, so it never enters a URL.
   */
  searchParams: Promise<{ q?: string; thread?: string }>;
}

/**
 * The participant email for a `?thread=` id, or undefined.
 *
 * Falls through to no filter on an unparseable id or a missing thread rather
 * than throwing: this is a convenience deep-link from the inbox, and a deleted
 * or mistyped thread should land the operator on the unfiltered queue, not a
 * 404 or a 500.
 */
async function emailFilterForThread(thread: string | undefined): Promise<string | undefined> {
  if (!thread) return undefined;
  const threadId = Number(thread);
  if (!Number.isInteger(threadId) || threadId <= 0) return undefined;
  const detail = await getThreadDetail(threadId);
  return detail?.thread.participantEmail;
}

export default async function DeletionRequestsPage({ searchParams }: DeletionRequestsPageProps) {
  await requireAdminPageSession();
  const [{ requests }, params] = await Promise.all([getDeletionRequestsData(), searchParams]);

  // `?q=` wins when both are present: it is the operator's own typed filter,
  // while `?thread=` is a link's suggestion.
  const initialEmailFilter = params.q ?? (await emailFilterForThread(params.thread));

  return (
    <PageBody>
      <AdminPageHeader title="Deletion Requests" />
      <DeletionRequestsDashboard
        initialRequests={requests}
        initialStatusFilter="all"
        initialTypeFilter="all"
        initialEmailFilter={initialEmailFilter}
      />
    </PageBody>
  );
}
