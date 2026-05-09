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

/**
 * Load the full draft row by id (all columns). Returns `null` when no row
 * matches. Result is loosely typed as `Record<string, unknown>` because
 * `selectFrom`'s row shape is not statically known.
 *
 * AUTHZ: tenant-scoped — caller MUST verify community membership AND check
 * `authorId === actor` (or admin override) before exposing the row.
 */
export async function getDocumentDraftById(
  communityId: number,
  draftId: number,
): Promise<Record<string, unknown> | null> {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.selectFrom(
    documentDrafts,
    {},
    eq(documentDrafts.id, draftId),
  )) as unknown as Array<Record<string, unknown>>;
  return rows[0] ?? null;
}

/**
 * Apply a partial update to a draft. Returns the updated row(s) for the
 * caller to echo back; callers that only need fire-and-forget can ignore.
 *
 * AUTHZ: tenant-scoped — caller MUST have already loaded the draft via
 * `getDocumentDraftById` (or `getDocumentDraftAuthorship`) and confirmed
 * the actor is the author OR a community admin BEFORE invoking.
 */
export async function updateDocumentDraft(
  communityId: number,
  draftId: number,
  update: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const scoped = createScopedClient(communityId);
  return (await scoped.update(
    documentDrafts,
    update,
    eq(documentDrafts.id, draftId),
  )) as unknown as Array<Record<string, unknown>>;
}

/**
 * Soft-delete a draft by setting `deletedAt = now`. Idempotent (no row
 * existence check) — callers that need a 404-on-missing should call
 * `getDocumentDraftById` first.
 *
 * AUTHZ: tenant-scoped — caller MUST have verified the actor is the
 * author OR a community admin BEFORE invoking.
 */
export async function softDeleteDocumentDraft(
  communityId: number,
  draftId: number,
  now: Date = new Date(),
): Promise<void> {
  await updateDocumentDraft(communityId, draftId, { deletedAt: now });
}
