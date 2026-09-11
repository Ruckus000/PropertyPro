/**
 * Client Portfolio view.
 *
 * Lists all non-demo communities with quick filters (all / past due / at
 * risk / trialing / rootless), search, type, and sort. The root-claim dispute
 * queue and the rootless report — formerly their own page at
 * `/communities/rootless` — are folded in here (Task 15 / spec D9); that
 * route is now a redirect to `/clients?filter=rootless`.
 */
import { ClientPortfolio, type ClientFilter } from '@/components/clients/ClientPortfolio';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getClientsData } from '@/lib/server/clients';

export const dynamic = 'force-dynamic';

const VALID_FILTERS: ClientFilter[] = ['all', 'past_due', 'at_risk', 'trialing', 'rootless'];

function parseFilter(raw: string | undefined): ClientFilter | undefined {
  return VALID_FILTERS.find((f) => f === raw);
}

interface ClientsPageProps {
  searchParams: Promise<{ filter?: string; q?: string }>;
}

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  // AUTHZ: platform-admin only. This page reads cross-tenant data with the
  // service-role client (RLS-bypassing), so it re-asserts the identity
  // middleware already verified rather than trusting the matcher alone.
  await requireAdminPageSession();

  const [{ clients, disputes, counts }, params] = await Promise.all([
    getClientsData(),
    searchParams,
  ]);

  // `ClientPortfolio` renders its own `AdminPageHeader` — its description is
  // the live filtered/unfiltered community count, so it stays with the
  // client component's filter state rather than being hoisted here.
  return (
    <ClientPortfolio
      clients={clients}
      disputes={disputes}
      counts={counts}
      initialFilter={parseFilter(params.filter)}
      initialSearch={params.q}
    />
  );
}
