/**
 * Document Draft Service
 *
 * Tenant-scoped lookups for the `document_drafts` table. Future drains of
 * `apps/web/src/app/api/v1/documents/drafts/...` routes will collect their
 * helpers here.
 */
import { createScopedClient, documentDrafts } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';

export interface DocumentDraftAuthorship {
  authorId: string | null;
  deletedAt: Date | null;
}

/**
 * Fetch the minimum projection needed to authorize a draft action: the
 * draft's author id and soft-delete timestamp. Returns `null` when no
 * row matches the (community, draft id) pair.
 *
 * AUTHZ: tenant-scoped — caller MUST have already verified the actor's
 * community membership and any role-based gating (e.g.
 * `requirePermission('documents', 'write')`). The author check is the
 * caller's responsibility once the row is loaded.
 */
export async function getDocumentDraftAuthorship(
  communityId: number,
  draftId: number,
): Promise<DocumentDraftAuthorship | null> {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.selectFrom(
    documentDrafts,
    { authorId: documentDrafts.authorId, deletedAt: documentDrafts.deletedAt },
    eq(documentDrafts.id, draftId),
  )) as unknown as Array<{ authorId: string | null; deletedAt: Date | null }>;
  return rows[0] ?? null;
}
