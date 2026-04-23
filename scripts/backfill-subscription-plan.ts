/**
 * Backfill communities.subscription_plan where a raw Stripe price_id leaked in.
 *
 * Context: Prior to the plan-gate writer fix, the Stripe webhook fell back to
 * `price.id` when `price.lookup_key` was null (which is true for all 5 test-mode
 * Prices today). That wrote strings like `price_1THjwBK4289h3aRcMUun7mqB` into
 * `communities.subscription_plan` — which `resolvePlanId()` cannot map, so every
 * downstream plan gate silently fails open.
 *
 * This script finds all rows where `subscription_plan LIKE 'price_%'`, joins
 * `stripe_prices.stripe_price_id` to resolve the canonical `plan_id`, and updates
 * each community to the canonical PlanId.
 *
 * Safety:
 *   - Dry-run by default. `--apply` to commit.
 *   - NEVER touches rows where subscription_plan IS NULL or already canonical.
 *   - Skips rows whose raw value is not present in stripe_prices (surfaces in the
 *     report so an operator can handle them manually).
 *
 * Usage:
 *   scripts/with-env-local.sh pnpm tsx scripts/backfill-subscription-plan.ts
 *   scripts/with-env-local.sh pnpm tsx scripts/backfill-subscription-plan.ts --apply
 */
import { and, eq, like } from '@propertypro/db/filters';
import { communities, stripePrices } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { runOpsScript } from './lib/run-ops-script';

interface CommunityRow {
  id: number;
  name: string;
  communityType: string;
  subscriptionPlan: string | null;
}

interface PriceRow {
  stripePriceId: string;
  planId: string;
}

interface Outcome {
  communityId: number;
  communityName: string;
  communityType: string;
  currentValue: string;
  resolvedPlanId: string | null;
  action: 'backfill' | 'skip-unresolved' | 'error';
  errorMessage?: string;
}

async function run(): Promise<void> {
  const apply = process.argv.slice(2).includes('--apply');

  const db = createUnscopedClient();

  // 1. Find corrupt rows.
  const corruptRows = (await db
    .select({
      id: communities.id,
      name: communities.name,
      communityType: communities.communityType,
      subscriptionPlan: communities.subscriptionPlan,
    })
    .from(communities)
    .where(like(communities.subscriptionPlan, 'price_%'))) as CommunityRow[];

  if (corruptRows.length === 0) {
    // eslint-disable-next-line no-console
    console.log('No rows need backfilling — communities.subscription_plan is clean.');
    return;
  }

  // 2. Build a stripePriceId → planId map for O(1) resolution.
  const priceIds = Array.from(new Set(corruptRows.map((r) => r.subscriptionPlan).filter((v): v is string => v !== null)));
  const priceRows: PriceRow[] = priceIds.length
    ? ((await db
        .select({
          stripePriceId: stripePrices.stripePriceId,
          planId: stripePrices.planId,
        })
        .from(stripePrices)) as PriceRow[])
    : [];

  const priceToPlan = new Map(priceRows.map((r) => [r.stripePriceId, r.planId]));

  // 3. Plan updates.
  const outcomes: Outcome[] = [];
  for (const row of corruptRows) {
    const currentValue = row.subscriptionPlan ?? '';
    const resolvedPlanId = priceToPlan.get(currentValue) ?? null;

    if (!resolvedPlanId) {
      outcomes.push({
        communityId: row.id,
        communityName: row.name,
        communityType: row.communityType,
        currentValue,
        resolvedPlanId: null,
        action: 'skip-unresolved',
      });
      continue;
    }

    if (!apply) {
      outcomes.push({
        communityId: row.id,
        communityName: row.name,
        communityType: row.communityType,
        currentValue,
        resolvedPlanId,
        action: 'backfill',
      });
      continue;
    }

    try {
      // Guard: only update if the row is STILL LIKE 'price_%' at UPDATE time.
      // This prevents a race where a webhook fix wrote the correct plan between
      // our SELECT and UPDATE — we do not want to overwrite a canonical PlanId.
      await db
        .update(communities)
        .set({ subscriptionPlan: resolvedPlanId, updatedAt: new Date() })
        .where(
          and(
            eq(communities.id, row.id),
            like(communities.subscriptionPlan, 'price_%'),
          ),
        );
      outcomes.push({
        communityId: row.id,
        communityName: row.name,
        communityType: row.communityType,
        currentValue,
        resolvedPlanId,
        action: 'backfill',
      });
    } catch (err) {
      outcomes.push({
        communityId: row.id,
        communityName: row.name,
        communityType: row.communityType,
        currentValue,
        resolvedPlanId,
        action: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log(`\nBackfill communities.subscription_plan — ${apply ? 'APPLY' : 'DRY-RUN'}:`);
  // eslint-disable-next-line no-console
  console.table(
    outcomes.map((o) => ({
      community_id: o.communityId,
      community_name: o.communityName,
      community_type: o.communityType,
      before: o.currentValue,
      after: o.resolvedPlanId ?? '(unresolved)',
      action: o.action,
      error: o.errorMessage ?? '',
    })),
  );

  const done = outcomes.filter((o) => o.action === 'backfill').length;
  const unresolved = outcomes.filter((o) => o.action === 'skip-unresolved').length;
  const errors = outcomes.filter((o) => o.action === 'error').length;

  // eslint-disable-next-line no-console
  console.log(
    `\nSummary: ${done} row(s) ${apply ? 'updated' : 'would be updated'}, ${unresolved} unresolved, ${errors} error(s).`,
  );

  if (!apply && done > 0) {
    // eslint-disable-next-line no-console
    console.log('\nRe-run with --apply to commit the shown changes.');
  }

  if (errors > 0 || unresolved > 0) {
    throw new Error(
      `${errors} error(s) and ${unresolved} unresolved row(s) encountered during backfill.`,
    );
  }
}

void runOpsScript({ name: 'backfill-subscription-plan', url: import.meta.url, run });
