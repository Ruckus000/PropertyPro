#!/usr/bin/env tsx
/**
 * Clear Stripe ids that the configured key cannot resolve.
 *
 * After a test→live cutover every stored `cus_…` / `sub_…` created in the other
 * mode is a dangling pointer. Left in place they fail quietly, which is worse
 * than failing loudly:
 *   - `getCommunityByStripeSubscriptionId` matches nothing, so every
 *     `customer.subscription.*` webhook for that community silently no-ops;
 *   - `/billing/portal` fails for those communities;
 *   - `applyVolumeDiscountToSubscriptions` throws `resource_missing` while
 *     iterating a dead customer.
 *
 * A community left `subscription_status='active'` with an unresolvable
 * subscription is the worst case: it keeps its plan entitlement with no live
 * subscription behind it, and nothing will ever correct it, because the
 * correcting events are the ones that no longer match.
 *
 * WHAT IT DOES (only to rows whose ids genuinely fail to resolve):
 *   - communities: null `stripe_customer_id` / `stripe_subscription_id`, and
 *     null `subscription_status` + `subscription_plan` so the row stops
 *     claiming an entitlement.
 *   - billing_groups: SOFT-delete (`deleted_at`) and null `billing_group_id` on
 *     any community pointing at it. Not a hard DELETE: `communities.
 *     billing_group_id` is `onDelete: 'set null'`, so a hard delete would
 *     silently detach communities with no record that it happened. Soft-delete
 *     is reversible and consistent with the rest of the schema.
 *
 * A `resource_missing` from Stripe is the ONLY signal treated as stale. Any
 * other error (network, auth, rate limit) aborts rather than being mistaken for
 * a dangling id — the failure mode of "wrongly decided your live data is stale"
 * is unacceptable.
 *
 * Dry-run by default; `--apply` plus an explicit acknowledgement to write.
 *
 * Usage:
 *   pnpm tsx scripts/remediate-stale-stripe-ids.ts
 *   pnpm tsx scripts/remediate-stale-stripe-ids.ts --apply --i-understand-this-clears-billing-state
 */
import Stripe from 'stripe';
import { billingGroups, communities } from '@propertypro/db';
import { eq, isNotNull, isNull, and } from '@propertypro/db/filters';
// AUTHZ: CLI/ops script — runs out-of-band of tenant scoping with explicit operator authorization.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { redactStripeKey, stripeKeyLivemode, describeLivemode } from '@propertypro/shared';
import { runOpsScript } from './lib/run-ops-script';
import { assertAcknowledged, databaseHost } from './lib/stripe-guards';

const ACK_FLAG = '--i-understand-this-clears-billing-state';

/** True only on an explicit `resource_missing`. Anything else re-throws. */
async function isMissing(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError && err.code === 'resource_missing') return true;
    throw err;
  }
}

interface Row extends Record<string, string | number> {
  entity: string;
  id: number;
  name: string;
  detail: string;
  action: string;
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not set. Aborting.');

  const livemode = stripeKeyLivemode(secretKey);
  if (livemode === null) {
    throw new Error(
      `REFUSING TO RUN — STRIPE_SECRET_KEY (${redactStripeKey(secretKey)}) has an unrecognised ` +
        'prefix. This script decides what to erase based on what that key can see; it will not ' +
        'run against a key whose mode it cannot name.',
    );
  }

  if (apply) {
    assertAcknowledged(argv, ACK_FLAG, {
      because:
        'This nulls stored Stripe ids and subscription status, and soft-deletes billing groups. ' +
        'Run without --apply first and read the report.',
    });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is not set. Aborting.');

  const stripe = new Stripe(secretKey);
  const db = createUnscopedClient();
  const rows: Row[] = [];

  // eslint-disable-next-line no-console
  console.log(
    `\nStale Stripe id remediation — ${apply ? 'APPLY' : 'DRY-RUN'}\n` +
      `  key: ${redactStripeKey(secretKey)} (${describeLivemode(livemode)} mode)\n` +
      `  database host: ${databaseHost(dbUrl)}\n`,
  );

  // --- communities -----------------------------------------------------------
  const communityRows = await db
    .select({
      id: communities.id,
      name: communities.name,
      customerId: communities.stripeCustomerId,
      subscriptionId: communities.stripeSubscriptionId,
      status: communities.subscriptionStatus,
      plan: communities.subscriptionPlan,
    })
    .from(communities)
    .where(isNotNull(communities.stripeCustomerId));

  for (const row of communityRows) {
    if (!row.customerId) continue;
    const customerMissing = await isMissing(() =>
      stripe.customers.retrieve(row.customerId as string),
    );
    const subscriptionMissing = row.subscriptionId
      ? await isMissing(() => stripe.subscriptions.retrieve(row.subscriptionId as string))
      : true;

    if (!customerMissing && !subscriptionMissing) continue;

    rows.push({
      entity: 'community',
      id: row.id,
      name: row.name,
      detail:
        `customer ${customerMissing ? 'MISSING' : 'ok'}, subscription ` +
        `${subscriptionMissing ? 'MISSING' : 'ok'}, was status=${row.status ?? 'null'} plan=${row.plan ?? 'null'}`,
      action: apply ? 'cleared' : 'would clear',
    });

    if (apply) {
      await db
        .update(communities)
        .set({
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          subscriptionStatus: null,
          subscriptionPlan: null,
          updatedAt: new Date(),
        })
        .where(eq(communities.id, row.id));
    }
  }

  // --- billing groups --------------------------------------------------------
  const groupRows = await db
    .select({
      id: billingGroups.id,
      name: billingGroups.name,
      customerId: billingGroups.stripeCustomerId,
    })
    .from(billingGroups)
    .where(isNull(billingGroups.deletedAt));

  for (const row of groupRows) {
    const missing = await isMissing(() => stripe.customers.retrieve(row.customerId));
    if (!missing) continue;

    // Detach referencing communities EXPLICITLY. The FK is onDelete:'set null',
    // which never fires for a soft delete — leaving live rows pointing at a
    // tombstoned group.
    const referencing = await db
      .select({ id: communities.id })
      .from(communities)
      .where(and(eq(communities.billingGroupId, row.id), isNull(communities.deletedAt)));

    rows.push({
      entity: 'billing_group',
      id: row.id,
      name: row.name,
      detail: `customer MISSING, ${referencing.length} community(ies) reference it`,
      action: apply ? 'soft-deleted + detached' : 'would soft-delete + detach',
    });

    if (apply) {
      await db
        .update(communities)
        .set({ billingGroupId: null, updatedAt: new Date() })
        .where(eq(communities.billingGroupId, row.id));
      await db
        .update(billingGroups)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(billingGroups.id, row.id));
    }
  }

  if (rows.length === 0) {
    // eslint-disable-next-line no-console
    console.log('Nothing to remediate — every stored Stripe id resolves against this key.');
    return;
  }

  // eslint-disable-next-line no-console
  console.table(rows);

  if (!apply) {
    // eslint-disable-next-line no-console
    console.log(
      `\nNothing was written. Re-run with --apply ${ACK_FLAG} to commit.\n` +
        'The "was status=…" column is the only record of the prior value — capture this output.',
    );
  }
}

void runOpsScript({ name: 'remediate-stale-stripe-ids', url: import.meta.url, run });
