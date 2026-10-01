import { isCommunityRole, type CommunityRole } from '@propertypro/shared';
import { listCommunitiesForUser, type UserCommunityRow } from '@/lib/api/user-communities';
import { narrowToSupportScope, type SupportScope } from '@/lib/support/support-scope';

/** One of the caller's memberships, with a role the access rules know. */
export type ProbeMembership = UserCommunityRow & { role: CommunityRole };

interface ResolveAccessibleCommunityInput {
  userId: string;
  /** The request's community (middleware's `x-community-id`), tried first. */
  preferredCommunityId: number | null;
  /** A support session may only reach its consented community. */
  supportScope: SupportScope | null;
  /**
   * Whether the caller, as this membership, may open the thing being linked
   * to. It must apply the same per-role read the destination page applies, so
   * a thing the caller cannot open is indistinguishable from a missing one.
   */
  canOpenIn: (membership: ProbeMembership) => Promise<boolean>;
}

export interface AccessibleCommunity {
  communityId: number;
  slug: string;
}

/**
 * Which of the caller's communities holds a linked record the caller may
 * open — or null.
 *
 * Bare `/documents/<id>` and `/meetings/<id>` links come from emails,
 * notifications, search and the PM overview. The request's community is the
 * likely answer, but not a reliable one: middleware sends a link with no
 * community through `/select-community`, where a multi-community user can pick
 * any of theirs. So the request's community is tried first, then the caller's
 * other memberships.
 *
 * Probes run one at a time on purpose: concurrent queries on the small pool
 * pipeline behind Supavisor, which can hang.
 */
export async function resolveAccessibleCommunity({
  userId,
  preferredCommunityId,
  supportScope,
  canOpenIn,
}: ResolveAccessibleCommunityInput): Promise<AccessibleCommunity | null> {
  const memberships = narrowToSupportScope(
    await listCommunitiesForUser(userId),
    supportScope,
    (membership) => membership.communityId,
  );
  const candidates = [...memberships].sort(
    (a, b) =>
      Number(b.communityId === preferredCommunityId) -
      Number(a.communityId === preferredCommunityId),
  );

  for (const membership of candidates) {
    // The row's role is a bare string; one the access rules do not know grants nothing.
    if (!isCommunityRole(membership.role)) continue;
    if (await canOpenIn({ ...membership, role: membership.role })) {
      return { communityId: membership.communityId, slug: membership.slug };
    }
  }

  return null;
}
