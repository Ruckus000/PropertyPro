/**
 * /billing — placeholder for the Wave 3 billing surface (spec D16-D17).
 *
 * The rail has linked here since Wave 1, and an unmatched URL renders the ROOT
 * not-found, which sits OUTSIDE this route group: no rail, no top bar, no way
 * back. So the route has to exist for the nav entry to be honest. Wave 3
 * replaces this body in place — keep the session call when it does.
 *
 * AUTHZ: requireAdminPageSession() gates the page.
 */
import { CreditCard } from 'lucide-react';
import { EmptyState, PageBody } from '@propertypro/ui';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';

export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  await requireAdminPageSession();

  return (
    <PageBody>
      <AdminPageHeader title="Billing" />
      <EmptyState
        icon={CreditCard}
        title="Billing isn't built yet"
        description="Subscription state, plan changes and trial extensions will be managed here. Until then the Stripe dashboard is the only place to change a subscription, and it stays the single writer either way."
      />
    </PageBody>
  );
}
