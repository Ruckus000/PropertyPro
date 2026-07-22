/**
 * Per-community storage quota helpers for the community-site-assets bucket.
 *
 * Usage tracked in `communities.branding.assetsBytesUsed` (jsonb field).
 * Quota comes from the plan config: `PLAN_FEATURES[planId].siteAssetsQuotaBytes`.
 *
 * Degradation rules (match plan-guard.requirePlanFeature):
 *   null plan         → fail-open (community not yet provisioned)
 *   unknown plan      → fail-open (legacy / unrecognized plan string)
 *
 * AUTHZ: Reads `communities.subscriptionPlan` via createUnscopedClient because
 * communities is the root tenant table and has no community_id column.
 * Routes calling these helpers MUST have already verified the actor's
 * community membership + role + plan-feature gate (hasSiteEditor) before
 * invoking — this file does no auth checks itself.
 */
import { eq, sql } from '@propertypro/db/filters';
import { communities } from '@propertypro/db';
// PR #2 quota lookup. communities is the root tenant table (no communityId
// column); plan resolution requires unscoped read. Routes calling these
// helpers MUST have already verified caller's management-tier
// (property_manager / root_manager) membership.
// AUTHZ: PR #2 site-assets quota lookup against communities root tenant table; callers verify management-tier (property_manager / root_manager) membership before invoking.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { PLAN_FEATURES } from '@propertypro/shared';
import { AppError } from '@/lib/api/errors/AppError';
import { getBrandingForCommunity } from '@/lib/api/branding';
import { resolvePlanIdWithTelemetry } from '@/lib/telemetry/plan-resolution';

export class QuotaExceededError extends AppError {
  constructor(message: string) {
    super(message, 413, 'SITE_ASSETS_QUOTA_EXCEEDED');
  }
}

export async function getCommunitySiteAssetsUsage(communityId: number): Promise<number> {
  const branding = await getBrandingForCommunity(communityId);
  return typeof branding?.assetsBytesUsed === 'number' ? branding.assetsBytesUsed : 0;
}

async function getSiteAssetsQuotaBytes(communityId: number): Promise<number | null> {
  const db = createUnscopedClient();
  const rows = await db
    .select({ subscriptionPlan: communities.subscriptionPlan })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);
  const rawPlan = rows[0]?.subscriptionPlan ?? null;
  if (rawPlan === null) return null;
  const planId = resolvePlanIdWithTelemetry(rawPlan, {
    site: 'site-assets/quota',
    communityId,
    featureKey: 'siteAssetsQuotaBytes',
  });
  if (planId === null) return null;
  return PLAN_FEATURES[planId].siteAssetsQuotaBytes;
}

export async function assertWithinQuota(communityId: number, addBytes: number): Promise<void> {
  const quota = await getSiteAssetsQuotaBytes(communityId);
  if (quota === null) return;  // Fail-open per plan-guard precedent
  const current = await getCommunitySiteAssetsUsage(communityId);
  if (current + addBytes > quota) {
    throw new QuotaExceededError(
      `Site assets would exceed plan quota (${quota} bytes). Current usage: ${current}. Requested: ${addBytes}.`,
    );
  }
}

/**
 * Atomically add `bytes` to `branding.assetsBytesUsed`. Negative `bytes`
 * decrements; the result is clamped to a non-negative floor.
 *
 * Previously this was a JS-side read-modify-write (`getCommunitySiteAssetsUsage`
 * → `updateBrandingForCommunity`), which leaked increments under concurrent
 * finalize calls (two requests reading the same baseline, last write wins,
 * the earlier increment lost). The quota gate would then under-count actual
 * stored bytes and let uploads slip past the plan ceiling.
 *
 * Use a single SQL statement so Postgres serializes the update at the row
 * level. `jsonb_set` + `(branding->>'assetsBytesUsed')::bigint` reads and
 * writes the JSONB field in one expression; `COALESCE(..., 0)` handles the
 * never-set case; `GREATEST(0, ...)` enforces the non-negative floor.
 */
async function applyAssetsUsageDelta(communityId: number, deltaBytes: number): Promise<void> {
  const db = createUnscopedClient();
  await db.execute(sql`
    UPDATE communities
       SET branding = jsonb_set(
         COALESCE(branding, '{}'::jsonb),
         '{assetsBytesUsed}',
         to_jsonb(
           GREATEST(
             0,
             COALESCE((branding ->> 'assetsBytesUsed')::bigint, 0) + ${deltaBytes}
           )
         )
       )
     WHERE id = ${communityId}
  `);
}

export async function incrementAssetsUsage(communityId: number, bytes: number): Promise<void> {
  await applyAssetsUsageDelta(communityId, bytes);
}

export async function decrementAssetsUsage(communityId: number, bytes: number): Promise<void> {
  await applyAssetsUsageDelta(communityId, -bytes);
}
