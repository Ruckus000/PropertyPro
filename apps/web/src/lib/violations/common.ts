import type { CommunityRole } from '@propertypro/shared';
import { getFeaturesForCommunity } from '@propertypro/shared';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { requireBoardDesignation } from '@/lib/db/access-control';

// Re-export from canonical source (M1 deduplication)
export { getActorUnitIds, requireActorUnitId } from '@/lib/units/actor-units';

// RBAC permission checks ('violations' / 'arc_submissions', read/write) are
// performed via requirePermission() from @/lib/db/access-control directly at
// call sites. The helpers below cover non-RBAC concerns: feature flags, plan
// gating, the isAdmin role flag, and resident-role checks — none of which
// belong in the RBAC matrix.

export async function requireViolationsEnabled(membership: CommunityMembership): Promise<void> {
  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasViolations) {
    throw new ForbiddenError('Violations features are not enabled for this community type');
  }
  await requirePlanFeature(membership.communityId, 'hasViolations');
}

export async function requireArcEnabled(membership: CommunityMembership): Promise<void> {
  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasARC) {
    throw new ForbiddenError('ARC features are not enabled for this community type');
  }
  await requirePlanFeature(membership.communityId, 'hasARC');
}

export function requireViolationAdminWrite(membership: CommunityMembership): void {
  requireBoardDesignation(membership);
}

// ── Legal gates ─────────────────────────────────────────────────────────────
//
// These are SYNCHRONOUS on purpose. The flags ride on `membership`, which
// `requireCommunityMembership` already hydrates from the communities row it
// fetches anyway — so unlike `requirePlanFeature` above, these cost no query
// AND cannot fail open on a null plan.
//
// Both check the underlying feature FIRST (so a community type that never had
// the feature gets the accurate error) and the legal gate SECOND, mirroring
// `requireElectionsEnabled` in @/lib/elections/common.
//
// See docs/audits/2026-08-09-legal-risk-audit.md F-04, F-05.

/**
 * Gate on imposing a violation fine.
 *
 * Disabled because the fine route enforces no statutory cap ($100 per violation /
 * $1,000 aggregate under §718.303(3) / §720.305(2) absent authorizing documents)
 * and records no fining-committee approval, which those statutes require. Blocks
 * WRITES only — existing fine records stay readable and payable, because they are
 * association financial records.
 */
export function requireViolationFinesEnabled(membership: CommunityMembership): void {
  if (!membership.violationFinesEnabled) {
    throw new ForbiddenError('Fines are not available for this community');
  }
}

/**
 * Gate on generating a violation / hearing notice PDF.
 *
 * Disabled because the generated notice states legal conclusions (it computes and
 * asserts whether the 14-day notice period was satisfied), enumerates the owner's
 * rights, and names the *Board* as imposing the fine where the statute requires a
 * fining committee.
 */
export function requireNoticePdfEnabled(membership: CommunityMembership): void {
  if (!membership.noticePdfGenerationEnabled) {
    throw new ForbiddenError('Generated notices are not available for this community');
  }
}

export function requireArcReviewPermission(membership: CommunityMembership): void {
  if (!membership.isAdmin) {
    throw new ForbiddenError('Only ARC reviewers can perform this action');
  }
}

export function requireArcSubmitterRole(membership: CommunityMembership): void {
  if (membership.role !== 'resident') {
    throw new ForbiddenError('Only residents can submit ARC applications');
  }
}

export function isResidentRole(role: CommunityRole): boolean {
  return role === 'resident';
}

