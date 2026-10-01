import { getDocumentWithAccessCheck } from '@propertypro/db';
import { isCommunityRole } from '@propertypro/shared';
import { listCommunitiesForUser } from '@/lib/api/user-communities';
import { narrowToSupportScope, type SupportScope } from '@/lib/support/support-scope';

interface ResolveDocumentCommunityInput {
  userId: string;
  documentId: number;
  /** The request's community (middleware's `x-community-id`), tried first. */
  preferredCommunityId: number | null;
  /** A support session may only reach its consented community. */
  supportScope: SupportScope | null;
}

export interface DocumentCommunity {
  communityId: number;
  slug: string;
}

/**
 * Which of the caller's communities holds `documentId` AND lets the caller
 * read it — or null.
 *
 * `/documents/<id>` links come from emails, notifications, search, the PM
 * activity feed and authored-document links. The request's community is the
 * likely answer, but not a reliable one: middleware sends a link with no
 * community through `/select-community`, where a multi-community user can pick
 * any of theirs. So the request's community is tried first, then the caller's
 * other memberships.
 *
 * Every probe is the scoped, per-role read the library applies
 * (`getDocumentWithAccessCheck`: category access, drafts, source type), so a
 * document the caller cannot open is indistinguishable from one that does not
 * exist — both resolve to null.
 *
 * Probes run one at a time on purpose: concurrent queries on the small pool
 * pipeline behind Supavisor, which can hang.
 */
export async function resolveDocumentCommunity({
  userId,
  documentId,
  preferredCommunityId,
  supportScope,
}: ResolveDocumentCommunityInput): Promise<DocumentCommunity | null> {
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
    const document = await getDocumentWithAccessCheck(
      {
        communityId: membership.communityId,
        role: membership.role,
        communityType: membership.communityType,
        isUnitOwner: membership.isUnitOwner,
      },
      documentId,
    );
    if (document) return { communityId: membership.communityId, slug: membership.slug };
  }

  return null;
}
