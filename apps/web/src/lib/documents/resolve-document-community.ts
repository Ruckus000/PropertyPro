import { getDocumentWithAccessCheck } from '@propertypro/db';
import {
  resolveAccessibleCommunity,
  type AccessibleCommunity,
} from '@/lib/communities/resolve-accessible-community';
import type { SupportScope } from '@/lib/support/support-scope';

interface ResolveDocumentCommunityInput {
  userId: string;
  documentId: number;
  /** The request's community (middleware's `x-community-id`), tried first. */
  preferredCommunityId: number | null;
  /** A support session may only reach its consented community. */
  supportScope: SupportScope | null;
}

export type DocumentCommunity = AccessibleCommunity;

/**
 * Which of the caller's communities holds `documentId` AND lets the caller
 * read it — or null.
 *
 * Every probe is the scoped, per-role read the library applies
 * (`getDocumentWithAccessCheck`: category access, drafts, source type), so a
 * document the caller cannot open is indistinguishable from one that does not
 * exist — both resolve to null.
 */
export async function resolveDocumentCommunity({
  documentId,
  ...input
}: ResolveDocumentCommunityInput): Promise<DocumentCommunity | null> {
  return resolveAccessibleCommunity({
    ...input,
    canOpenIn: async (membership) =>
      (await getDocumentWithAccessCheck(
        {
          communityId: membership.communityId,
          role: membership.role,
          communityType: membership.communityType,
          isUnitOwner: membership.isUnitOwner,
        },
        documentId,
      )) !== null,
  });
}
