import { communities, createScopedClient, userRoles } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { ForbiddenError } from '@/lib/api/errors';
import type { CommunityType, TransitionRole, BoardDesignation } from '@propertypro/shared';
import { ADMIN_TIER_DB_ROLES, BOARD_DESIGNATIONS } from '@propertypro/shared';
import { requireCommunityType, requireNewCommunityRole } from '@/lib/utils/community-validators';

export interface CommunityMembership {
  userId: string;
  communityId: number;
  communityName: string;
  role: TransitionRole;
  communityType: CommunityType;
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
  freeAccessExpiresAt: Date | null;
  timezone: string;
  /** True if this resident is a unit owner (only meaningful when role = 'resident'). */
  isUnitOwner: boolean;
  /** True if role is a management-tier role (property_manager or root_manager). */
  isAdmin: boolean;
  /** Human-readable role title. */
  displayTitle: string;
  /** Board designation (role-v3 §3.2) — statutory marker, independent of role. Null when not a board member. */
  designation: BoardDesignation | null;
  /** Community city for location display. */
  city: string | null;
  /** Community state abbreviation for location display. */
  state: string | null;
  /** Whether this community is a demo instance. */
  isDemo: boolean;
  /** When the demo trial period ends. Null for non-demo communities. */
  trialEndsAt: Date | null;
  /** When the demo expires (hard lockout). Null for non-demo communities. */
  demoExpiresAt: Date | null;
  /** Whether attorney review has cleared board elections for this community. */
  electionsAttorneyReviewed: boolean;
}

/**
 * Enforce that the authenticated actor belongs to the target community.
 * Throws 403 when the actor has no role assignment in that community.
 * Returns the membership details including the user's role.
 *
 * Uses WHERE-filtered selectFrom for performance — fetches only the
 * actor's role row instead of all community role rows.
 */
export async function requireCommunityMembership(
  communityId: number,
  userId: string,
): Promise<CommunityMembership> {
  const scoped = createScopedClient(communityId);
  const [roleRows, communityRows] = await Promise.all([
    scoped.selectFrom(userRoles, {}, eq(userRoles.userId, userId)),
    scoped.selectFrom(communities, {}, eq(communities.id, communityId)),
  ]);
  const roleResult = roleRows as unknown as Record<string, unknown>[];
  const communityResult = communityRows as unknown as Record<string, unknown>[];
  const membership = roleResult[0];
  const community = communityResult[0];

  if (!community) {
    // eslint-disable-next-line no-console
    console.warn('[requireCommunityMembership] community not found or soft-deleted', {
      communityId,
      userId,
      communityRowCount: communityResult.length,
    });
    throw new ForbiddenError('Community not found');
  }

  if (!membership) {
    // eslint-disable-next-line no-console
    console.warn('[requireCommunityMembership] no role assignment for user', {
      communityId,
      userId,
      roleRowCount: roleResult.length,
    });
    throw new ForbiddenError('User is not a member of this community');
  }

  const role = requireNewCommunityRole(
    membership['role'],
    `requireCommunityMembership(communityId=${communityId}, userId=${userId}) role`,
  );

  const isUnitOwner = membership['isUnitOwner'] === true;
  const isAdmin = (ADMIN_TIER_DB_ROLES as readonly string[]).includes(role);
  const displayTitle = typeof membership['displayTitle'] === 'string'
    ? membership['displayTitle']
    : role;

  const rawDesignation = membership['designation'];
  const designation = (BOARD_DESIGNATIONS as readonly string[]).includes(rawDesignation as string)
    ? (rawDesignation as BoardDesignation)
    : null;

  const communityType = requireCommunityType(
    community['communityType'],
    `requireCommunityMembership(communityId=${communityId}) community`,
  );
  const communitySettings = community['communitySettings'];
  const electionsAttorneyReviewed =
    typeof communitySettings === 'object'
    && communitySettings !== null
    && (communitySettings as Record<string, unknown>).electionsAttorneyReviewed === true;

  return {
    userId,
    communityId,
    communityName: typeof community['name'] === 'string' ? community['name'] : '',
    role,
    communityType,
    subscriptionPlan:
      typeof community['subscriptionPlan'] === 'string' ? community['subscriptionPlan'] : null,
    subscriptionStatus:
      typeof community['subscriptionStatus'] === 'string'
        ? community['subscriptionStatus']
        : null,
    freeAccessExpiresAt:
      community['freeAccessExpiresAt'] instanceof Date ? community['freeAccessExpiresAt'] : null,
    timezone: typeof community['timezone'] === 'string' ? community['timezone'] : 'America/New_York',
    isUnitOwner,
    isAdmin,
    displayTitle,
    designation,
    city: typeof community['city'] === 'string' ? community['city'] : null,
    state: typeof community['state'] === 'string' ? community['state'] : null,
    isDemo: community['isDemo'] === true,
    trialEndsAt: community['trialEndsAt'] instanceof Date ? community['trialEndsAt'] : null,
    demoExpiresAt: community['demoExpiresAt'] instanceof Date ? community['demoExpiresAt'] : null,
    electionsAttorneyReviewed,
  };
}
