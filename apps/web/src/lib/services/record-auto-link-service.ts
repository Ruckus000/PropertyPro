/**
 * Automatic linking of posted documents to the Florida records they are (D12).
 *
 * A condominium or HOA checklist item (the budget, the bylaws, the minutes...)
 * is satisfied by `compliance_checklist_items.document_id`. Until now only a
 * person wrote that link. This service writes it when the evidence is
 * unambiguous, so a board volunteer only has to deal with what is missing.
 *
 * A wrong link is the worst outcome here: the item would read as posted when it
 * isn't. So a document links to an item only when ALL of these hold:
 *
 * 1. Among the community's open items (applicable, unlinked, in its statute's
 *    template, with a matching rule), the rules (`matchingTemplateKeys`, which
 *    applies each rule's veto) return exactly ONE key for the document.
 * 2. That item has exactly ONE candidate: one eligible, unlinked, posted
 *    document that matches its rule. A 2025 and a 2026 budget are two
 *    candidates, and choosing between them is for a person.
 * 3. The guarded UPDATE lands: it only writes a row whose `document_id` is
 *    still NULL, so a link a person (or another request) made in the meantime
 *    is never replaced, and only while the document is still eligible, so a
 *    document taken back to a draft or deleted in the meantime is never linked.
 *
 * Otherwise nothing is written, and every eligible match is offered to a person
 * by `listRecordCandidates`.
 *
 * Eligible documents (plan Global Constraints): posted (`posted_at` set), not
 * deleted, `source_type` `library` or `authored`. Violation evidence never
 * fills a record, and a draft is not posted. Linking never posts a draft, never
 * sets `public_access` and never changes a category.
 *
 * The automatic link is recorded in `auto_linked_document_id`, set in the same
 * statement as `document_id`, and audited as `link_document` with
 * `metadata: { linkedBy: 'auto_match', templateKey }`.
 *
 * `document_posted_at` is the document's own `posted_at`, read in the same
 * statement, not the time of linking: a set of minutes posted two years ago
 * must not read as current.
 *
 * The callers (document upload, posting a draft, publishing an authored
 * document, PM bulk upload) wrap every call in try/catch: linking is
 * bookkeeping, and a failure here must never fail the user's request. Each
 * links only the documents it posted: linking the documents a community
 * already had is a backfill, and a person reviews its dry run first.
 */
import {
  communities,
  complianceChecklistItems,
  createScopedClient,
  documents,
  logAuditEvent,
} from '@propertypro/db';
import { and, eq, inArray, isNotNull, isNull, sql } from '@propertypro/db/filters';
import {
  RECORD_MATCH_RULES,
  getComplianceTemplate,
  matchingTemplateKeys,
  normalizeCategoryName,
  type CommunityType,
  type DocumentCategoryKey,
} from '@propertypro/shared';
import { getDocumentCategoryNames } from '@/lib/services/document-category-service';

/** The document source types that can fill a record. Violation evidence never does. */
const ELIGIBLE_SOURCE_TYPES = ['library', 'authored'] as const;

export type AutoLinkOutcome = 'linked' | 'ambiguous' | 'no_match' | 'not_eligible';

export interface PlannedRecordLink {
  itemId: number;
  templateKey: string;
  documentId: number;
}

export interface AmbiguousRecordItem {
  itemId: number;
  templateKey: string;
  documentIds: number[];
}

interface DocumentRow {
  id: number;
  title: string;
  fileName: string;
  categoryId: number | null;
  postedAt: Date | null;
  sourceType: string;
  deletedAt: Date | null;
}

interface CandidateDocument {
  id: number;
  title: string;
  fileName: string;
  categoryKey: DocumentCategoryKey;
}

interface OpenItem {
  id: number;
  templateKey: string;
}

/** The checklist half of a decision: one read of the community's items. */
interface OpenItems {
  /** Whether the community keeps these records at all: a condominium or an HOA. */
  keepsRecords: boolean;
  items: OpenItem[];
  /** documents already linked to some item, so neither a candidate nor linkable */
  linkedDocumentIds: Set<number>;
}

/**
 * Everything one decision needs: the open items, the eligible unlinked
 * documents, which keys each document matches and which documents each item
 * matches. Read once; every public function decides from it.
 */
interface LinkingState extends OpenItems {
  /** document id → the open-item keys it matches */
  keysByDocument: Map<number, string[]>;
  /** item id → the eligible, unlinked documents matching it */
  candidatesByItem: Map<number, CandidateDocument[]>;
}

function hasRule(templateKey: string): boolean {
  // Own keys only: an inherited name such as `constructor` is not a rule.
  return Object.prototype.hasOwnProperty.call(RECORD_MATCH_RULES, templateKey);
}

/** Posted, not deleted, and a library upload or an authored document. */
function isEligibleDocument(row: DocumentRow): boolean {
  return (
    row.postedAt != null &&
    row.deletedAt == null &&
    (ELIGIBLE_SOURCE_TYPES as readonly string[]).includes(row.sourceType)
  );
}

/** A function, not a constant: this module reads no table at import time. */
function documentColumns() {
  return {
    id: documents.id,
    title: documents.title,
    fileName: documents.fileName,
    categoryId: documents.categoryId,
    postedAt: documents.postedAt,
    sourceType: documents.sourceType,
    deletedAt: documents.deletedAt,
  };
}

function toDocumentRow(row: Record<string, unknown>): DocumentRow {
  const postedAt = row['postedAt'];
  const deletedAt = row['deletedAt'];
  return {
    id: Number(row['id']),
    title: String(row['title'] ?? ''),
    fileName: String(row['fileName'] ?? ''),
    categoryId: row['categoryId'] == null ? null : Number(row['categoryId']),
    postedAt: postedAt == null ? null : new Date(postedAt as string | Date),
    sourceType: String(row['sourceType'] ?? ''),
    deletedAt: deletedAt == null ? null : new Date(deletedAt as string | Date),
  };
}

async function readCommunityType(communityId: number): Promise<CommunityType | null> {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.selectFrom(
    communities,
    { communityType: communities.communityType },
    eq(communities.id, communityId),
  )) as unknown as Array<{ communityType: CommunityType }>;
  return rows[0]?.communityType ?? null;
}

async function readOpenItems(communityId: number): Promise<OpenItems> {
  const communityType = await readCommunityType(communityId);
  // Only condominiums and HOAs keep these records: an item counts only when its key
  // is in its community's statute template, and an apartment's template is empty.
  const template = communityType ? getComplianceTemplate(communityType) : [];
  const templateKeys = new Set(template.map((t) => t.templateKey));

  const scoped = createScopedClient(communityId);
  const itemRows = (await scoped.selectFrom(complianceChecklistItems, {
    id: complianceChecklistItems.id,
    templateKey: complianceChecklistItems.templateKey,
    documentId: complianceChecklistItems.documentId,
    isApplicable: complianceChecklistItems.isApplicable,
  })) as unknown as Array<Record<string, unknown>>;

  const linkedDocumentIds = new Set<number>();
  const items: OpenItem[] = [];
  for (const row of itemRows) {
    const templateKey = String(row['templateKey'] ?? '');
    if (row['documentId'] != null) {
      linkedDocumentIds.add(Number(row['documentId']));
      continue;
    }
    if (row['isApplicable'] !== true) continue;
    if (!templateKeys.has(templateKey) || !hasRule(templateKey)) continue;
    items.push({ id: Number(row['id']), templateKey });
  }
  return { keepsRecords: template.length > 0, items, linkedDocumentIds };
}

/** The documents as the rules read them, their category names resolved in one read. */
async function toCandidates(communityId: number, rows: DocumentRow[]): Promise<CandidateDocument[]> {
  const categoryIds = [
    ...new Set(rows.map((row) => row.categoryId).filter((id): id is number => id != null)),
  ];
  const categoryNames = await getDocumentCategoryNames(communityId, categoryIds);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    fileName: row.fileName,
    categoryKey: normalizeCategoryName(
      row.categoryId == null ? null : categoryNames.get(row.categoryId),
    ),
  }));
}

async function readLinkingState(communityId: number, open?: OpenItems): Promise<LinkingState> {
  const { keepsRecords, items, linkedDocumentIds } = open ?? (await readOpenItems(communityId));
  const state: LinkingState = {
    keepsRecords,
    items,
    linkedDocumentIds,
    keysByDocument: new Map(),
    candidatesByItem: new Map(),
  };
  // Nothing to fill (every apartment, or every record already linked): skip the documents.
  if (items.length === 0) return state;

  // Filtered in SQL for size, and again in JS (`isEligibleDocument`) so the
  // eligibility rule is one readable predicate that holds whatever the query.
  const scoped = createScopedClient(communityId);
  const documentRows = (
    (await scoped.selectFrom(
      documents,
      documentColumns(),
      and(
        isNotNull(documents.postedAt),
        inArray(documents.sourceType, [...ELIGIBLE_SOURCE_TYPES]),
        isNotNull(documents.categoryId),
      ),
    )) as unknown as Array<Record<string, unknown>>
  ).map(toDocumentRow);

  const eligibleRows = documentRows.filter(
    (row) => isEligibleDocument(row) && !linkedDocumentIds.has(row.id),
  );

  const itemByKey = new Map(items.map((item) => [item.templateKey, item]));
  const openKeys = items.map((item) => item.templateKey);
  for (const doc of await toCandidates(communityId, eligibleRows)) {
    const keys = matchingTemplateKeys(doc, openKeys);
    state.keysByDocument.set(doc.id, keys);
    for (const key of keys) {
      const item = itemByKey.get(key);
      if (!item) continue;
      const list = state.candidatesByItem.get(item.id) ?? [];
      list.push(doc);
      state.candidatesByItem.set(item.id, list);
    }
  }
  return state;
}

interface Plan {
  links: PlannedRecordLink[];
  ambiguous: AmbiguousRecordItem[];
}

/** Rules 1 and 2: the item's only candidate matches only this item. */
function planFromState(state: LinkingState): Plan {
  const links: PlannedRecordLink[] = [];
  const ambiguous: AmbiguousRecordItem[] = [];
  for (const item of state.items) {
    const candidates = state.candidatesByItem.get(item.id) ?? [];
    if (candidates.length === 0) continue;
    const only = candidates.length === 1 ? candidates[0] : undefined;
    if (only && state.keysByDocument.get(only.id)?.length === 1) {
      links.push({ itemId: item.id, templateKey: item.templateKey, documentId: only.id });
    } else {
      ambiguous.push({
        itemId: item.id,
        templateKey: item.templateKey,
        documentIds: candidates.map((doc) => doc.id),
      });
    }
  }
  return { links, ambiguous };
}

/**
 * Rule 3: write the link only while the item is still unlinked AND the document
 * is still eligible (same community, posted, not deleted, a library upload or an
 * authored document), and record it as automatic in the same statement. Zero
 * rows means something changed after the read; that is not an error, and
 * nothing is audited.
 */
async function applyLink(
  communityId: number,
  link: PlannedRecordLink,
  actorUserId: string | null,
  auditMetadata: Readonly<Record<string, string>> = {},
): Promise<boolean> {
  const scoped = createScopedClient(communityId);
  // The document's own posting date, read by the statement that writes the link.
  const documentPostedAt = sql`(select d.posted_at from documents d where d.id = ${link.documentId} and d.community_id = ${communityId})`;
  // ELIGIBLE_SOURCE_TYPES, spelled out: an enum list cannot be a bound parameter here.
  const documentStillEligible = sql`exists (select 1 from documents d where d.id = ${link.documentId} and d.community_id = ${communityId} and d.posted_at is not null and d.deleted_at is null and d.source_type in ('library', 'authored'))`;
  // The scoped client adds `community_id = $community AND deleted_at IS NULL`.
  const updated = (await scoped.update(
    complianceChecklistItems,
    {
      documentId: link.documentId,
      documentPostedAt,
      autoLinkedDocumentId: link.documentId,
      lastModifiedBy: actorUserId,
    },
    and(
      eq(complianceChecklistItems.id, link.itemId),
      isNull(complianceChecklistItems.documentId),
      documentStillEligible,
    ),
  )) as Array<Record<string, unknown>>;
  if (updated.length === 0) return false;

  await logAuditEvent({
    userId: actorUserId,
    action: 'link_document',
    resourceType: 'compliance_checklist_item',
    resourceId: String(link.itemId),
    communityId,
    newValues: { documentId: link.documentId },
    // The caller's extras come first so they can never replace the two keys that
    // every automatic link carries.
    metadata: { ...auditMetadata, linkedBy: 'auto_match', templateKey: link.templateKey },
  });
  return true;
}

/**
 * Link one document, just posted, to the record it is, when the evidence is
 * unambiguous. Writes at most one row.
 *
 * - `linked`: written and audited.
 * - `ambiguous`: the document fits several items, or its item has several
 *   candidates. Nothing written; a person chooses (`listRecordCandidates`).
 * - `no_match`: it fits no open item.
 * - `not_eligible`: not a condo or HOA, the document is missing, a draft,
 *   deleted, violation evidence or already linked, or the guarded update found
 *   the item already linked or the document no longer eligible.
 *
 * Most uploads fit no open item, so that is decided from the checklist and this
 * one document before the community's other documents are read.
 */
export async function autoLinkDocument(
  communityId: number,
  documentId: number,
  actorUserId: string | null,
): Promise<{ templateKey: string | null; outcome: AutoLinkOutcome }> {
  const scoped = createScopedClient(communityId);
  const [rawDoc] = (await scoped.selectFrom(
    documents,
    documentColumns(),
    eq(documents.id, documentId),
  )) as unknown as Array<Record<string, unknown>>;
  const row = rawDoc ? toDocumentRow(rawDoc) : null;
  if (!row || !isEligibleDocument(row)) return { templateKey: null, outcome: 'not_eligible' };

  const open = await readOpenItems(communityId);
  if (!open.keepsRecords || open.linkedDocumentIds.has(documentId)) {
    return { templateKey: null, outcome: 'not_eligible' };
  }
  const [doc] = await toCandidates(communityId, [row]);
  const keys = matchingTemplateKeys(doc as CandidateDocument, open.items.map((item) => item.templateKey));
  if (keys.length === 0) return { templateKey: null, outcome: 'no_match' };
  if (keys.length > 1) return { templateKey: null, outcome: 'ambiguous' };

  const templateKey = keys[0] as string;
  const state = await readLinkingState(communityId, open);
  const link = planFromState(state).links.find((l) => l.documentId === documentId);
  if (!link) return { templateKey, outcome: 'ambiguous' };

  const linked = await applyLink(communityId, link, actorUserId);
  return { templateKey, outcome: linked ? 'linked' : 'not_eligible' };
}

/**
 * The links `autoLinkCommunityRecords` would write, and the items it would
 * leave to a person, without writing anything. A dry run reads this, and
 * `applyRecordLinks` writes what it approves.
 */
export async function planCommunityRecordLinks(communityId: number): Promise<Plan> {
  return planFromState(await readLinkingState(communityId));
}

/**
 * Write planned links, each through the guarded UPDATE: a link whose item was
 * linked, or whose document stopped being eligible, since the plan was read is
 * skipped. Returns how many landed.
 *
 * `auditMetadata` is merged into each audit row's `metadata`, beside
 * `linkedBy` and `templateKey`. The backfill script uses it to name the operator
 * (`{ operator, source: 'backfill' }`); the request-time callers pass nothing.
 */
export async function applyRecordLinks(
  communityId: number,
  links: readonly PlannedRecordLink[],
  actorUserId: string | null,
  auditMetadata?: Readonly<Record<string, string>>,
): Promise<number> {
  let linked = 0;
  for (const link of links) {
    if (await applyLink(communityId, link, actorUserId, auditMetadata)) linked++;
  }
  return linked;
}

/**
 * Link the open items whose evidence is unambiguous, after a bulk upload.
 *
 * `documentIds` limits the writes to links that use those documents (the ones
 * the upload created). The decision still weighs every eligible document, so a
 * new budget beside an older unlinked one is ambiguous, and the older one is
 * never linked by an upload that did not post it. Without `documentIds` every
 * unambiguous link is written: a backfill.
 *
 * Returns how many links landed, and how many items those documents left to a
 * person.
 */
export async function autoLinkCommunityRecords(
  communityId: number,
  actorUserId: string | null,
  options: { documentIds?: readonly number[] } = {},
): Promise<{ linked: number; ambiguous: number }> {
  const plan = planFromState(await readLinkingState(communityId));
  const only = options.documentIds ? new Set(options.documentIds) : null;
  const links = only ? plan.links.filter((link) => only.has(link.documentId)) : plan.links;
  const ambiguous = only
    ? plan.ambiguous.filter((item) => item.documentIds.some((id) => only.has(id)))
    : plan.ambiguous;
  return { linked: await applyRecordLinks(communityId, links, actorUserId), ambiguous: ambiguous.length };
}

/**
 * For each open item, every eligible, unlinked posted document matching its
 * rule: what a person chooses from when the rules would not choose alone.
 * Keyed by checklist item id; items with no candidate are absent. Newest
 * document first.
 */
export async function listRecordCandidates(
  communityId: number,
): Promise<Record<number, Array<{ documentId: number; title: string }>>> {
  const state = await readLinkingState(communityId);
  const result: Record<number, Array<{ documentId: number; title: string }>> = {};
  for (const [itemId, candidates] of state.candidatesByItem) {
    result[itemId] = [...candidates]
      .sort((a, b) => b.id - a.id)
      .map((doc) => ({ documentId: doc.id, title: doc.title }));
  }
  return result;
}
