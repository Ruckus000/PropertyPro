import { userRoles, type ScopedClient } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import type { CommunityRole } from '@propertypro/shared';
import { getFeaturesForCommunity } from '@propertypro/shared';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { requirePermission } from '@/lib/db/access-control';

const VIOLATIONS_ADMIN_ROLES = new Set<CommunityRole>([
  'board_president',
  'cam',
  'site_manager',
  'property_manager_admin',
]);

const ARC_REVIEW_ROLES = new Set<CommunityRole>([
  'board_president',
  'cam',
  'site_manager',
  'property_manager_admin',
]);

const ARC_SUBMITTER_ROLES = new Set<CommunityRole>(['owner', 'tenant']);

const RESIDENT_ROLES = new Set<CommunityRole>(['owner', 'tenant']);

export function requireViolationsEnabled(membership: CommunityMembership): void {
  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasViolations) {
    throw new ForbiddenError('Violations features are not enabled for this community type');
  }
}

export function requireArcEnabled(membership: CommunityMembership): void {
  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasARC) {
    throw new ForbiddenError('ARC features are not enabled for this community type');
  }
}

export function requireViolationsReadPermission(membership: CommunityMembership): void {
  requirePermission(membership.role, membership.communityType, 'violations', 'read');
}

export function requireViolationsWritePermission(membership: CommunityMembership): void {
  requirePermission(membership.role, membership.communityType, 'violations', 'write');
}

export function requireViolationAdminWrite(membership: CommunityMembership): void {
  if (!VIOLATIONS_ADMIN_ROLES.has(membership.role)) {
    throw new ForbiddenError('Only violation administrators can perform this action');
  }
}

export function requireArcReadPermission(membership: CommunityMembership): void {
  requirePermission(membership.role, membership.communityType, 'arc_submissions', 'read');
}

export function requireArcWritePermission(membership: CommunityMembership): void {
  requirePermission(membership.role, membership.communityType, 'arc_submissions', 'write');
}

export function requireArcReviewPermission(membership: CommunityMembership): void {
  if (!ARC_REVIEW_ROLES.has(membership.role)) {
    throw new ForbiddenError('Only ARC reviewers can perform this action');
  }
}

export function requireArcSubmitterRole(membership: CommunityMembership): void {
  if (!ARC_SUBMITTER_ROLES.has(membership.role)) {
    throw new ForbiddenError('Only residents can submit ARC applications');
  }
}

export function isResidentRole(role: CommunityRole): boolean {
  return RESIDENT_ROLES.has(role);
}

export async function getActorUnitIds(
  scopedClient: ScopedClient,
  actorUserId: string,
): Promise<number[]> {
  const membershipRows = await scopedClient.selectFrom<{ unitId: number | null }>(
    userRoles,
    { unitId: userRoles.unitId },
    eq(userRoles.userId, actorUserId),
  );

  return membershipRows
    .map((row) => row.unitId)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

export async function requireActorUnitId(
  scopedClient: ScopedClient,
  actorUserId: string,
): Promise<number> {
  const unitIds = await getActorUnitIds(scopedClient, actorUserId);
  const firstUnitId = unitIds[0];
  if (firstUnitId === undefined) {
    throw new ForbiddenError('No unit association found for this user in the selected community');
  }
  return firstUnitId;
}
