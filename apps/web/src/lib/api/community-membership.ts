import { communities, createScopedClient, userRoles } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { ForbiddenError } from '@/lib/api/errors';
import type { CommunityType, CommunityRole, BoardDesignation } from '@propertypro/shared';
import { ADMIN_TIER_DB_ROLES, BOARD_DESIGNATIONS, resolveFineCaps } from '@propertypro/shared';
import { requireCommunityType, requireCommunityRole } from '@/lib/utils/community-validators';

export interface CommunityMembership {
  userId: string;
  communityId: number;
  communityName: string;
  role: CommunityRole;
  communityType: CommunityType;
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
  subscriptionCanceledAt: Date | null;
  /** Stripe current_period_end — trial end or next renewal. */
  subscriptionCurrentPeriodEndAt: Date | null;
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
  /**
   * Per-community legal gates. All default to `false` for any community whose
   * `community_settings` lacks the key — which is every community until a
   * platform admin turns one on. See the block comment on
   * `communities.communitySettings` for why these are settings keys rather than
   * `CommunityFeatures` flags.
   */
  violationFinesEnabled: boolean;
  assessmentPaymentsEnabled: boolean;
  smsDispatchEnabled: boolean;
  noticePdfGenerationEnabled: boolean;
  /**
   * §718.303(3)/§720.305(2) fine ceilings, already resolved.
   *
   * Resolved here rather than exposing the raw `community_settings` blob, for
   * the same reason the gates above are booleans and not the blob: a caller
   * that receives the whole object can read (or leak) settings it has no
   * business with, and every consumer would re-implement the
   * "absent means statutory default" rule. `resolveFineCaps` owns it once.
   */
  fineCaps: { perFineCents: number; aggregateCents: number };
}

/**
 * Read a boolean flag out of the `community_settings` JSONB blob.
 *
 * The `=== true` comparison is load-bearing, not defensive style. `community_settings`
 * is untyped JSONB written by an admin API; a value of `"true"` (string), `1`, or a
 * stray truthy object must all read as DISABLED. Anything looser would turn a
 * malformed write into a silently-enabled legal gate.
 */
function readSettingsFlag(settings: unknown, key: string): boolean {
  return (
    typeof settings === 'object'
    && settings !== null
    && (settings as Record<string, unknown>)[key] === true
  );
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

  const role = requireCommunityRole(
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
    subscriptionCanceledAt:
      community['subscriptionCanceledAt'] instanceof Date
        ? community['subscriptionCanceledAt']
        : null,
    subscriptionCurrentPeriodEndAt:
      community['subscriptionCurrentPeriodEndAt'] instanceof Date
        ? community['subscriptionCurrentPeriodEndAt']
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
    electionsAttorneyReviewed: readSettingsFlag(communitySettings, 'electionsAttorneyReviewed'),
    violationFinesEnabled: readSettingsFlag(communitySettings, 'violationFinesEnabled'),
    assessmentPaymentsEnabled: readSettingsFlag(communitySettings, 'assessmentPaymentsEnabled'),
    smsDispatchEnabled: readSettingsFlag(communitySettings, 'smsDispatchEnabled'),
    noticePdfGenerationEnabled: readSettingsFlag(communitySettings, 'noticePdfGenerationEnabled'),
    fineCaps: resolveFineCaps(communitySettings),
  };
}
