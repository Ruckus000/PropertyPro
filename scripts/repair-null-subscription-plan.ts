/**
 * Repair communities that are billing but carry NO plan at all.
 *
 * Context: until the `stepCommunityCreated` plan stamp landed, the self-serve
 * signup path never wrote `communities.subscription_plan`. The plan was only
 * ever set by a later `customer.subscription.*` webhook, which resolves its
 * community through `stripe_subscription_id` — a link that does not exist while
 * provisioning is still running. Stripe does not order
 * `checkout.session.completed` against `customer.subscription.created`, so a
 * signup could lose that race and keep a null plan indefinitely; the
 * provisioning watchdog made it certain, because it recovers signups minutes to
 * hours after checkout, long after every subscription event was dropped.
 * Communities 2358 and 2359 (recovered 2026-08-09) are exactly this case: both
 * live, both billing, both `subscription_plan = null`, both with
 * `pending_signups.plan_key = 'professional'`.
 *
 * The code fix stops NEW rows landing this way and backfills on any subsequent
 * provisioning retry — but a job that already reached `completed` is never
 * re-run, so historical rows need this one-shot.
 *
 * Sibling script: `backfill-subscription-plan.ts` repairs rows holding a raw
 * `price_…` id. It deliberately skips NULLs, which is the gap this fills.
 *
 * Source of truth: `pending_signups.plan_key` — what the customer actually
 * chose and paid for. Values are passed through `resolvePlanId` so a legacy
 * alias is normalised and an unrecognised key is reported rather than written.
 *
 * Safety:
 *   - Dry-run by default. `--apply` to commit.
 *   - Only ever touches rows where `subscription_plan IS NULL`, re-asserted in
 *     the UPDATE's WHERE so a webhook writing a real plan between our SELECT
 *     and UPDATE is never overwritten.
 *   - Only considers communities with a live billing status; a community with
 *     no subscription SHOULD have a null plan.
 *
 * Usage:
 *   scripts/with-env-local.sh pnpm tsx scripts/repair-null-subscription-plan.ts
 *   scripts/with-env-local.sh pnpm tsx scripts/repair-null-subscription-plan.ts --apply
 */
import { and, eq, inArray, isNull } from '@propertypro/db/filters';
import { communities, pendingSignups, provisioningJobs } from '@propertypro/db';
// AUTHZ: CLI/seed script — runs out-of-band of tenant scoping with explicit operator authorization.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { resolvePlanId } from '@propertypro/shared';
import { runOpsScript } from './lib/run-ops-script';

/** Statuses that mean the community has a subscription and so must have a plan. */
const BILLING_STATUSES = ['trialing', 'active', 'past_due', 'unpaid'] as const;

interface Candidate {
  communityId: number;
  communityName: string;
  subscriptionStatus: string | null;
  planKey: string | null;
  resolvedPlanId: string | null;
  action: 'repair' | 'skip-no-signup' | 'skip-unresolved' | 'error';
  errorMessage?: string;
}

async function run(): Promise<void> {
  const apply = process.argv.slice(2).includes('--apply');
  const db = createUnscopedClient();

  // Join through provisioning_jobs: it is the only link from a community back
  // to the signup that created it (communities carry no signup_request_id).
  const rows = (await db
    .select({
      communityId: communities.id,
      communityName: communities.name,
      subscriptionStatus: communities.subscriptionStatus,
      planKey: pendingSignups.planKey,
    })
    .from(communities)
    .leftJoin(provisioningJobs, eq(provisioningJobs.communityId, communities.id))
    .leftJoin(
      pendingSignups,
      eq(pendingSignups.signupRequestId, provisioningJobs.signupRequestId),
    )
    .where(
      and(
        isNull(communities.subscriptionPlan),
        isNull(communities.deletedAt),
        inArray(communities.subscriptionStatus, [...BILLING_STATUSES]),
      ),
    )) as Array<Omit<Candidate, 'resolvedPlanId' | 'action' | 'errorMessage'>>;

  if (rows.length === 0) {
    // eslint-disable-next-line no-console
    console.log('No billing community is missing its plan — nothing to repair.');
    return;
  }

  const outcomes: Candidate[] = [];
  for (const row of rows) {
    if (!row.planKey) {
      outcomes.push({ ...row, resolvedPlanId: null, action: 'skip-no-signup' });
      continue;
    }
    const resolvedPlanId = resolvePlanId(row.planKey);
    if (!resolvedPlanId) {
      outcomes.push({ ...row, resolvedPlanId: null, action: 'skip-unresolved' });
      continue;
    }
    if (!apply) {
      outcomes.push({ ...row, resolvedPlanId, action: 'repair' });
      continue;
    }
    try {
      await db
        .update(communities)
        .set({ subscriptionPlan: resolvedPlanId, updatedAt: new Date() })
        .where(
          and(eq(communities.id, row.communityId), isNull(communities.subscriptionPlan)),
        );
      outcomes.push({ ...row, resolvedPlanId, action: 'repair' });
    } catch (err) {
      outcomes.push({
        ...row,
        resolvedPlanId,
        action: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log(`\nRepair null communities.subscription_plan — ${apply ? 'APPLY' : 'DRY-RUN'}:`);
  // eslint-disable-next-line no-console
  console.table(
    outcomes.map((o) => ({
      community_id: o.communityId,
      community_name: o.communityName,
      status: o.subscriptionStatus ?? '',
      plan_key: o.planKey ?? '(no signup row)',
      after: o.resolvedPlanId ?? '(unresolved)',
      action: o.action,
      error: o.errorMessage ?? '',
    })),
  );

  const repaired = outcomes.filter((o) => o.action === 'repair').length;
  const noSignup = outcomes.filter((o) => o.action === 'skip-no-signup').length;
  const unresolved = outcomes.filter((o) => o.action === 'skip-unresolved').length;
  const errors = outcomes.filter((o) => o.action === 'error').length;

  // eslint-disable-next-line no-console
  console.log(
    `\nSummary: ${repaired} row(s) ${apply ? 'repaired' : 'would be repaired'}, ` +
      `${noSignup} with no signup row, ${unresolved} unresolved, ${errors} error(s).`,
  );

  if (!apply && repaired > 0) {
    // eslint-disable-next-line no-console
    console.log('\nRe-run with --apply to commit the shown changes.');
  }

  // `skip-no-signup` is NOT an error: PM-created and demo-converted communities
  // legitimately have no pending_signups row. They still need a human to pick a
  // plan, so they are listed above — but they must not fail the script and
  // block the repair of the rows it CAN fix.
  if (errors > 0 || unresolved > 0) {
    throw new Error(
      `${errors} error(s) and ${unresolved} unresolved row(s) encountered during repair.`,
    );
  }
}

void runOpsScript({ name: 'repair-null-subscription-plan', url: import.meta.url, run });
