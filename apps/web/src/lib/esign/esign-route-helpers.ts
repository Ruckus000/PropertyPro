/**
 * Route-level helpers for e-sign API endpoints.
 *
 * Mirrors the pattern used by violations (requireViolationsEnabled, etc.)
 */
import { getFeaturesForCommunity } from '@propertypro/shared';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { requirePermission } from '@/lib/db/access-control';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';

export function requireEsignEnabled(membership: CommunityMembership): void {
  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasEsign) {
    throw new ForbiddenError('E-Sign is not enabled for this community type');
  }
}

export async function requireEsignReadPermission(membership: CommunityMembership): Promise<void> {
  requireEsignEnabled(membership);
  await requirePlanFeature(membership.communityId, 'hasEsign');
  requirePermission(membership, 'esign', 'read');
}

/**
 * Management-facing reads — the E-Sign screen, the submission detail, the signed
 * document, the template library.
 *
 * `esign:read` is NOT an admin gate. The RBAC matrix grants it to owner and tenant
 * so a resident can see what awaits their own signature, and six admin-facing read
 * routes used it as though it meant management. That handed every resident each
 * signer's `slug` — with the submission's `externalId`, a complete credential for
 * the public, session-less signing page, which authorizes on possession alone —
 * plus presigned URLs for any signed PDF and the whole template library.
 *
 * So these routes require what their own pages already require: `isAdminRole`
 * resolves to the `manager` matrix row, and so does `esign:write`.
 *
 * The two routes that genuinely serve residents — `my-pending`, which is
 * actor-scoped, and `consent`, which is the caller's own record — keep
 * `requireEsignReadPermission`.
 */
export async function requireEsignManagementRead(
  membership: CommunityMembership,
): Promise<void> {
  requireEsignEnabled(membership);
  await requirePlanFeature(membership.communityId, 'hasEsign');
  requirePermission(membership, 'esign', 'write');
}

export async function requireEsignWritePermission(membership: CommunityMembership): Promise<void> {
  requireEsignEnabled(membership);
  await requirePlanFeature(membership.communityId, 'hasEsign');
  requirePermission(membership, 'esign', 'write');
}
