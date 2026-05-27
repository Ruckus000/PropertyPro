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
import { eq } from '@propertypro/db/filters';
import { communities } from '@propertypro/db';
// PR #2 quota lookup. communities is the root tenant table (no communityId
// column); plan resolution requires unscoped read. Routes calling these
// helpers MUST have already verified caller's pm_admin membership.
// AUTHZ: PR #2 site-assets quota lookup against communities root tenant table; callers verify pm_admin membership before invoking.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { PLAN_FEATURES } from '@propertypro/shared';
import { AppError } from '@/lib/api/errors/AppError';
import { getBrandingForCommunity, updateBrandingForCommunity } from '@/lib/api/branding';
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

export async function incrementAssetsUsage(communityId: number, bytes: number): Promise<void> {
  const current = await getCommunitySiteAssetsUsage(communityId);
  await updateBrandingForCommunity(communityId, { assetsBytesUsed: current + bytes });
}

export async function decrementAssetsUsage(communityId: number, bytes: number): Promise<void> {
  const current = await getCommunitySiteAssetsUsage(communityId);
  const next = Math.max(0, current - bytes);
  await updateBrandingForCommunity(communityId, { assetsBytesUsed: next });
}
