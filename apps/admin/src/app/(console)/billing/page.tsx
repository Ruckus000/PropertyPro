/**
 * /billing — the subscription portfolio (spec D16-D17).
 *
 * The route predates this body, and the placeholder it replaces recorded why it
 * had to exist at all: the rail has linked here since Wave 1, and an unmatched
 * URL renders the ROOT not-found, which sits OUTSIDE this route group — no
 * rail, no top bar, no way back. That is also why `requireAdminPageSession()`
 * stays on the first line.
 *
 * ## All four data states, per `.claude/rules/design.md`
 *
 * - **loading** — `loading.tsx`. The route is `force-dynamic`, so the Suspense
 *   boundary is real.
 * - **error** — two kinds, handled differently on purpose. A MISSING Stripe
 *   credential is a configuration state, not a failure: `getBillingOverview`
 *   gives it its own 503 `STRIPE_NOT_CONFIGURED`, and this page catches it and
 *   says so, because rendering an empty portfolio would assert "no subscribers"
 *   as a fact. Anything else propagates to the error boundary — a portfolio
 *   that silently showed zero past-due subscriptions because a read failed is
 *   the one wrong answer this screen must never give.
 * - **empty** / **success** — `BillingList`'s two branches.
 *
 * ## Not gated on Stripe MODE, and that is deliberate
 *
 * Only the five writes refuse when the key's mode does not match
 * `STRIPE_EXPECTED_LIVEMODE` (`billing-actions.ts`). Every read on this page
 * works against a test-mode key, because a console that showed nothing because
 * of a mode mismatch would be useless for diagnosing the mode mismatch. The
 * badge below states which namespace the numbers came from, so a live-looking
 * MRR cannot be mistaken for one.
 *
 * AUTHZ: requireAdminPageSession() gates the page.
 */
import { formatDistanceToNow } from 'date-fns';
import { CreditCard } from 'lucide-react';
import { AlertBanner, Badge, EmptyState, PageBody } from '@propertypro/ui';
import { stripeKeyLivemode } from '@propertypro/shared';

import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import { BillingKpis } from '@/components/billing/BillingKpis';
import { BillingList } from '@/components/billing/BillingList';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getBillingOverview, StripeNotConfiguredError } from '@/lib/server/billing';

export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  await requireAdminPageSession();

  // `null` (unset or an unrecognised prefix) reads as NOT live here, which only
  // decides which Stripe dashboard an orphan row links to. The WRITES treat
  // `null` as a refusal — fail-closed belongs in `billing-actions.ts`, not on a
  // read-only screen.
  const livemode = stripeKeyLivemode(process.env.STRIPE_SECRET_KEY) === true;
  const stripeDashboardBase = `https://dashboard.stripe.com/${livemode ? '' : 'test/'}`;

  let overview;
  try {
    overview = await getBillingOverview();
  } catch (error) {
    if (error instanceof StripeNotConfiguredError) {
      return (
        <PageBody>
          <AdminPageHeader title="Billing" description="Subscriptions across all communities." />
          <AlertBanner
            status="warning"
            title="Stripe is not configured"
            description={error.message}
          />
          <EmptyState
            icon={CreditCard}
            title="Nothing to show until a Stripe key is set"
            description="This is a configuration state, not an empty portfolio — set STRIPE_SECRET_KEY for this deployment and the subscriptions will appear."
          />
        </PageBody>
      );
    }
    throw error;
  }

  const syncedAgo = formatDistanceToNow(new Date(overview.syncedAt));

  return (
    <PageBody>
      <AdminPageHeader
        title="Billing"
        description={`Subscriptions across all communities. Synced from Stripe ${syncedAgo} ago.`}
        eyebrow={
          livemode ? null : (
            <Badge variant="warning" size="sm" outlined>
              Stripe test mode
            </Badge>
          )
        }
      />

      <BillingKpis kpis={overview.kpis} series={overview.series} />
      <BillingList
        rows={overview.rows}
        truncated={overview.truncated}
        stripeDashboardBase={stripeDashboardBase}
      />
    </PageBody>
  );
}
