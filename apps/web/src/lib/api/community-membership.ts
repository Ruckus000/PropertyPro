import { communities, createScopedClient, userRoles } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { ForbiddenError } from '@/lib/api/errors';
import type { CommunityType, NewCommunityRole, ManagerPermissions } from '@propertypro/shared';
import { normalizeManagerPermissions, getPresetPermissions, isPresetKey } from '@propertypro/shared';
import { requireCommunityType, requireNewCommunityRole } from '@/lib/utils/community-validators';

export interface CommunityMembership {
  userId: string;
  communityId: number;
  communityName: string;
  role: NewCommunityRole;
  communityType: CommunityType;
  timezone: string;
  /** True if this resident is a unit owner (only meaningful when role = 'resident'). */
  isUnitOwner: boolean;
  /** True if role is 'manager' or 'pm_admin'. */
  isAdmin: boolean;
  /** Manager permissions (only present when role = 'manager'). */
  permissions?: ManagerPermissions;
  /** Human-readable role title. */
  displayTitle: string;
  /** Preset key for managers (e.g. 'board_president', 'cam'). */
  presetKey?: string;
  /** Community city for location display. */
  city: string | null;
  /** Community state abbreviation for location display. */
  state: string | null;
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
  const isAdmin = role === 'manager' || role === 'pm_admin';
  const displayTitle = typeof membership['displayTitle'] === 'string'
    ? membership['displayTitle']
    : role;
  const presetKey = typeof membership['presetKey'] === 'string'
    ? membership['presetKey']
    : undefined;

  const communityType = requireCommunityType(
    community['communityType'],
    `requireCommunityMembership(communityId=${communityId}) community`,
  );

  // Normalize manager permissions from JSONB on every read.
  // For preset-based managers, fall back to RBAC matrix defaults for resources
  // missing from stored JSONB (e.g. newly-added resources like emergency_broadcasts).
  let permissions: ManagerPermissions | undefined;
  if (role === 'manager') {
    const fallback = presetKey && isPresetKey(presetKey)
      ? getPresetPermissions(presetKey, communityType).resources
      : undefined;
    permissions = normalizeManagerPermissions(membership['permissions'], fallback);
  }

  return {
    userId,
    communityId,
    communityName: typeof community['name'] === 'string' ? community['name'] : '',
    role,
    communityType,
    timezone: typeof community['timezone'] === 'string' ? community['timezone'] : 'America/New_York',
    isUnitOwner,
    isAdmin,
    permissions,
    displayTitle,
    presetKey,
    city: typeof community['city'] === 'string' ? community['city'] : null,
    state: typeof community['state'] === 'string' ? community['state'] : null,
  };
}
