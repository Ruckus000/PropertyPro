'use client';

/**
 * The client workspace's Billing tab (spec D17, wave 3 slice 3c).
 *
 * Replaces the wave-2 placeholder. Reads
 * `GET /api/admin/communities/[id]/billing` — which is NOT gated on Stripe
 * mode, deliberately — and renders the plan, the action tiles, the invoices and
 * the lifecycle timeline.
 *
 * ## All FIVE states, per `.claude/rules/design.md`
 *
 * - **loading** — skeleton blocks while the fetch is in flight.
 * - **error** — the read failed: an `AlertBanner status="danger"` carrying the
 *   server's own message, plus a Retry. Retry is safe here and only here,
 *   because this is a GET; none of the five WRITES offers one (see
 *   `BillingActionDialog`).
 * - **not configured** — a FIFTH state, and distinct from the error above.
 *   `getCommunityBilling` calls `assertStripeConfigured()`, which throws a 503
 *   carrying `code: 'STRIPE_NOT_CONFIGURED'`. This component used to read only
 *   `error.message` and discard the code, so a deployment with no Stripe key got
 *   a red "Billing could not be loaded" and a Retry button that would fail
 *   identically every time — a failure headline over a configuration fact, and
 *   an action that cannot succeed. It now branches on the code to the same
 *   warning banner plus `EmptyState` pair `/billing/page.tsx` already uses, with
 *   NO Retry. `/billing/page.tsx` got this right; this file did not.
 * - **empty** — the community has no `stripe_subscription_id`. Not an error:
 *   plenty of communities are on a comped access plan. It still links into
 *   Stripe, because "no subscription linked here" and "no subscription exists"
 *   are different facts and only Stripe can tell them apart.
 * - **success** — plan card, tiles, invoices, timeline.
 *
 * ## What a reviewer will see in THIS environment
 *
 * Everything on this tab renders. `billing.ts` is deliberately not gated on
 * Stripe mode, so the plan card, invoices and timeline all work against a
 * test-mode key. Only the five writes refuse, with a 503 and a specific code,
 * and that refusal renders inside the action dialog as its own sentence. The
 * read-only surface is untouched by it — which is the whole point of the split.
 *
 * ## Two things the plan asked for that are not here, and why
 *
 * 1. **Card `•••• last4`.** `getCommunityBilling` does not expand the
 *    customer's default payment method and returns no card fields at all, so
 *    the plan line omits it. It is "omitted when absent" — here it is always
 *    absent. Adding it means widening the service, which is task 24's file.
 * 2. **A single `Pause / cancel` tile.** Split into two. They are two different
 *    endpoints with different reversibility — `cancel_at_period_end` is an
 *    update you can undo from the Stripe dashboard, `subscriptions.cancel` is
 *    terminal — and a single dialog whose radio silently decides between
 *    "stop charging for now" and "end this customer" is the shape in which an
 *    operator aiming for one gets the other.
 */
import { useCallback, useEffect, useState } from 'react';
import { CreditCard, ExternalLink } from 'lucide-react';
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from '@propertypro/ui';
import { planLabel } from '@propertypro/shared';
import type { CommunityBilling } from '@/lib/server/billing';
import { formatCentsAsCurrency } from '@/lib/billing/format';
import { BILLING_STATUS_LABELS, BILLING_STATUS_VARIANTS } from '@/lib/billing/status-display';
import { BillingActionDialog, type BillingAction } from './BillingActionDialog';
import { InvoicesCard } from './InvoicesCard';
import { SubscriptionTimeline } from './SubscriptionTimeline';

interface BillingTabProps {
  communityId: number;
}

/** The five write tiles, in the order an operator reaches for them. */
const ACTION_TILES: { action: BillingAction; label: string }[] = [
  { action: 'change-plan', label: 'Change plan' },
  { action: 'extend-trial', label: 'Extend trial' },
  { action: 'apply-coupon', label: 'Apply coupon' },
  { action: 'pause', label: 'Pause / resume collection' },
  { action: 'cancel', label: 'Cancel subscription' },
];

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * The failure, with its CODE kept.
 *
 * Reading only `message` is what made a configuration state render as a red
 * failure: `withAdminErrorHandler` carries an `AppError`'s `code` through, and
 * that code is the only thing distinguishing "no Stripe key in this deployment"
 * from "the read broke".
 */
interface LoadFailure {
  code: string;
  message: string;
}

function readFailure(payload: unknown): LoadFailure {
  const error = (payload as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  const message = typeof error?.message === 'string' ? error.message.trim() : '';
  return {
    code: typeof error?.code === 'string' ? error.code : 'UNKNOWN',
    message: message.length > 0 ? message : 'Billing could not be loaded.',
  };
}

export function BillingTab({ communityId }: BillingTabProps) {
  const [billing, setBilling] = useState<CommunityBilling | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [openAction, setOpenAction] = useState<BillingAction | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try {
      const response = await fetch(`/api/admin/communities/${communityId}/billing`);
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFailure(readFailure(payload));
        return;
      }
      setBilling((payload as { data: CommunityBilling }).data);
    } catch {
      // A transport failure has no server code to read, so it is a genuine
      // error rather than a configuration state.
      setFailure({
        code: 'NETWORK',
        message: 'We could not reach the server. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true" role="status" aria-label="Loading billing">
        <Skeleton className="h-32 w-full rounded-md" />
        <Skeleton className="h-24 w-full rounded-md" />
        <Skeleton className="h-40 w-full rounded-md" />
      </div>
    );
  }

  // Not configured is NOT an error, and must not be dressed as one. No danger
  // styling and no Retry: retrying cannot set an environment variable, and an
  // action that will fail identically every time is worse than no action.
  if (failure?.code === 'STRIPE_NOT_CONFIGURED') {
    return (
      <div className="space-y-6">
        <AlertBanner
          status="warning"
          title="Stripe is not configured"
          description={failure.message}
        />
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={CreditCard}
              title="Nothing to show until a Stripe key is set"
              description="This is a configuration state, not a billing failure — set STRIPE_SECRET_KEY for this deployment and this tab will render."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (failure) {
    return (
      <AlertBanner
        status="danger"
        title="Billing could not be loaded"
        description={failure.message}
        action={
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  if (!billing) return null;

  const { row, invoices, timeline, stripeDashboardUrl, livemode } = billing;

  if (!row) {
    return (
      <Card>
        <CardContent className="p-6">
          <EmptyState
            icon={CreditCard}
            title="No Stripe subscription is linked to this community"
            description="Nothing is being charged through this record. A comped community looks exactly like this, so check Stripe before concluding the customer is unbilled."
            action={
              <Button asChild size="sm" variant="outline">
                <a href={stripeDashboardUrl} target="_blank" rel="noreferrer">
                  Open in Stripe
                  <ExternalLink size={14} aria-hidden="true" className="ml-1" />
                </a>
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  const renewsOn = formatDate(row.renewsAt);
  const trialEndsOn = formatDate(row.trialEndsAt);
  const refundUrl = row.stripeCustomerId
    ? `https://dashboard.stripe.com/${livemode ? '' : 'test/'}customers/${row.stripeCustomerId}`
    : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Current plan</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={BILLING_STATUS_VARIANTS[row.status]} size="sm">
                {BILLING_STATUS_LABELS[row.status]}
              </Badge>
              {!livemode && (
                <Badge variant="warning" size="sm" outlined>
                  Stripe test mode
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xl font-semibold text-content">
            {planLabel(row.plan)}
          </p>
          <p className="text-sm text-content-secondary">
            {formatCentsAsCurrency(row.mrrCents)} / month
            {row.interval === 'year' ? ' (billed annually)' : ''}
            {renewsOn ? ` · renews ${renewsOn}` : ''}
            {trialEndsOn ? ` · trial ends ${trialEndsOn}` : ''}
          </p>
          {row.hasCoupon && (
            <p className="text-sm text-content-tertiary">A coupon is attached to this subscription.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ACTION_TILES.map((tile) => (
              <Button
                key={tile.action}
                variant="outline"
                className="min-h-11 justify-start md:min-h-9"
                onClick={() => setOpenAction(tile.action)}
              >
                {tile.label}
              </Button>
            ))}

            <Button asChild variant="outline" className="min-h-11 justify-start md:min-h-9">
              <a href={stripeDashboardUrl} target="_blank" rel="noreferrer">
                Open in Stripe
                <ExternalLink size={14} aria-hidden="true" className="ml-1" />
              </a>
            </Button>

            {/*
              Spec D17: a refund is a deep link, never a button here. Stripe owns
              the confirmation, the partial/full choice and the record of who
              issued it — this console would have to reimplement all three, and
              a refund is not reversible.
            */}
            {refundUrl && (
              <Button asChild variant="outline" className="min-h-11 justify-start md:min-h-9">
                <a href={refundUrl} target="_blank" rel="noreferrer">
                  Issue refund
                  <ExternalLink size={14} aria-hidden="true" className="ml-1" />
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <InvoicesCard invoices={invoices} stripeDashboardUrl={stripeDashboardUrl} />
      <SubscriptionTimeline entries={timeline} />

      {openAction && (
        <BillingActionDialog
          communityId={communityId}
          action={openAction}
          currentPlanId={row.plan}
          onCompleted={() => void load()}
          open
          onOpenChange={(next) => {
            if (!next) setOpenAction(null);
          }}
        />
      )}
    </div>
  );
}
