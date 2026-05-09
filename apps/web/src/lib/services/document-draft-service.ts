/**
 * Document Draft Service
 *
 * Tenant-scoped lookups for the `document_drafts` table. Future drains of
 * `apps/web/src/app/api/v1/documents/drafts/...` routes will collect their
 * helpers here.
 */
import {
  createScopedClient,
  documentDrafts,
  documents,
  meetings,
} from '@propertypro/db';
import { and, eq, isNull } from '@propertypro/db/filters';

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

/**
 * List the actor's own non-deleted drafts in the community, sorted
 * newest-edited first. Sort happens in JS — these lists are typically
 * small (<20 rows per author) so a dynamic `orderBy` builder isn't
 * worth the complexity.
 *
 * AUTHZ: tenant-scoped — caller MUST have already verified the actor's
 * community membership and `requirePermission('documents', 'write')`.
 */
export async function listMyActiveDocumentDrafts(
  communityId: number,
  authorId: string,
): Promise<Record<string, unknown>[]> {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.selectFrom(
    documentDrafts,
    {},
    and(eq(documentDrafts.authorId, authorId), isNull(documentDrafts.deletedAt)),
  )) as unknown as Array<Record<string, unknown>>;

  rows.sort((a, b) => {
    const av = new Date(String(a['lastEditedAt'] ?? a['updatedAt'] ?? 0)).getTime();
    const bv = new Date(String(b['lastEditedAt'] ?? b['updatedAt'] ?? 0)).getTime();
    return bv - av;
  });
  return rows;
}

export interface CreateDocumentDraftInput {
  authorId: string;
  title: string;
  bodyHtml: string;
  targetCategoryId: number | null;
  targetMeetingId: number | null;
  sourceDocumentId: number | null;
  /** lastEditedAt; caller passes a fixed Date so it matches insert-time semantics. */
  lastEditedAt: Date;
}

/**
 * Insert a new draft row. Caller is responsible for sanitizing
 * `bodyHtml` and validating any `targetMeetingId` / `sourceDocumentId`
 * cross-references against the same community BEFORE invoking.
 */
export async function createDocumentDraft(
  communityId: number,
  input: CreateDocumentDraftInput,
): Promise<Record<string, unknown> | null> {
  const scoped = createScopedClient(communityId);
  const inserted = (await scoped.insert(documentDrafts, {
    authorId: input.authorId,
    title: input.title,
    bodyHtml: input.bodyHtml,
    targetCategoryId: input.targetCategoryId,
    targetMeetingId: input.targetMeetingId,
    sourceDocumentId: input.sourceDocumentId,
    lastEditorId: input.authorId,
    lastEditedAt: input.lastEditedAt,
  })) as unknown as Array<Record<string, unknown>>;
  return inserted[0] ?? null;
}

export interface MeetingForDraftSeed {
  title: string | null;
  startsAt: Date | string | null;
}

/**
 * Fetch the minimal meeting projection needed to seed a draft (default
 * title from meeting + date label). Returns `null` if no row matches.
 */
export async function getMeetingForDraftSeed(
  communityId: number,
  meetingId: number,
): Promise<MeetingForDraftSeed | null> {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.selectFrom(
    meetings,
    { title: meetings.title, startsAt: meetings.startsAt },
    eq(meetings.id, meetingId),
  )) as unknown as Array<MeetingForDraftSeed>;
  return rows[0] ?? null;
}

export interface AuthoredDocumentForReedit {
  title: string | null;
  sourceType: string | null;
}

/**
 * Fetch the minimal document projection needed to validate the
 * re-edit-from-published flow (`sourceType === 'authored'`) and seed
 * the draft title. Returns `null` if no row matches.
 */
export async function getAuthoredDocumentForReedit(
  communityId: number,
  documentId: number,
): Promise<AuthoredDocumentForReedit | null> {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.selectFrom(
    documents,
    { title: documents.title, sourceType: documents.sourceType },
    eq(documents.id, documentId),
  )) as unknown as Array<AuthoredDocumentForReedit>;
  return rows[0] ?? null;
}
