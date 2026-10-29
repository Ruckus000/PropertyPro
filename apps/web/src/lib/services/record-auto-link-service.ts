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
 *    is never replaced.
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
 * `document_posted_at` is the document's own `posted_at`, not the time of
 * linking: a set of minutes posted two years ago must not read as current.
 *
 * The callers (document upload, posting a draft, publishing an authored
 * document, PM bulk upload) wrap every call in try/catch: linking is
 * bookkeeping, and a failure here must never fail the user's request.
 */
import {
  communities,
  complianceChecklistItems,
  createScopedClient,
  documents,
  logAuditEvent,
} from '@propertypro/db';
import { and, eq, inArray, isNotNull, isNull } from '@propertypro/db/filters';
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
  postedAt: Date;
}

interface OpenItem {
  id: number;
  templateKey: string;
}

/**
 * Everything one decision needs: the open items, the eligible unlinked
 * documents, which keys each document matches and which documents each item
 * matches. Read once; every public function decides from it.
 */
interface LinkingState {
  /** Whether the community keeps these records at all: a condominium or an HOA. */
  keepsRecords: boolean;
  items: OpenItem[];
  documentsById: Map<number, CandidateDocument>;
  /** document id → the open-item keys it matches */
  keysByDocument: Map<number, string[]>;
  /** item id → the eligible, unlinked documents matching it */
  candidatesByItem: Map<number, CandidateDocument[]>;
  /** documents already linked to some item, so neither a candidate nor linkable */
  linkedDocumentIds: Set<number>;
}

const EMPTY_STATE: LinkingState = {
  keepsRecords: false,
  items: [],
  documentsById: new Map(),
  keysByDocument: new Map(),
  candidatesByItem: new Map(),
  linkedDocumentIds: new Set(),
};

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

async function readLinkingState(communityId: number): Promise<LinkingState> {
  const communityType = await readCommunityType(communityId);
  // Only condominiums and HOAs keep these records: an item counts only when its key
  // is in its community's statute template, and an apartment's template is empty.
  const template = communityType ? getComplianceTemplate(communityType) : [];
  const keepsRecords = template.length > 0;
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
  // Nothing to fill (every apartment, or every record already linked): skip the documents.
  if (items.length === 0) return { ...EMPTY_STATE, keepsRecords, linkedDocumentIds };

  // Filtered in SQL for size, and again in JS (`isEligibleDocument`) so the
  // eligibility rule is one readable predicate that holds whatever the query.
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

  const categoryIds = [
    ...new Set(eligibleRows.map((row) => row.categoryId).filter((id): id is number => id != null)),
  ];
  const categoryNames = await getDocumentCategoryNames(communityId, categoryIds);

  const documentsById = new Map<number, CandidateDocument>();
  const keysByDocument = new Map<number, string[]>();
  const candidatesByItem = new Map<number, CandidateDocument[]>();
  const itemByKey = new Map(items.map((item) => [item.templateKey, item]));
  const openKeys = items.map((item) => item.templateKey);

  for (const row of eligibleRows) {
    const doc: CandidateDocument = {
      id: row.id,
      title: row.title,
      fileName: row.fileName,
      categoryKey: normalizeCategoryName(
        row.categoryId == null ? null : categoryNames.get(row.categoryId),
      ),
      postedAt: row.postedAt as Date,
    };
    documentsById.set(doc.id, doc);
    const keys = matchingTemplateKeys(doc, openKeys);
    keysByDocument.set(doc.id, keys);
    for (const key of keys) {
      const item = itemByKey.get(key);
      if (!item) continue;
      const list = candidatesByItem.get(item.id) ?? [];
      list.push(doc);
      candidatesByItem.set(item.id, list);
    }
  }

  return { keepsRecords, items, documentsById, keysByDocument, candidatesByItem, linkedDocumentIds };
}

interface InternalPlan {
  links: Array<PlannedRecordLink & { postedAt: Date }>;
  ambiguous: AmbiguousRecordItem[];
}

/** Rules 1 and 2: the item's only candidate matches only this item. */
function planFromState(state: LinkingState): InternalPlan {
  const links: InternalPlan['links'] = [];
  const ambiguous: AmbiguousRecordItem[] = [];
  for (const item of state.items) {
    const candidates = state.candidatesByItem.get(item.id) ?? [];
    if (candidates.length === 0) continue;
    const only = candidates.length === 1 ? candidates[0] : undefined;
    if (only && state.keysByDocument.get(only.id)?.length === 1) {
      links.push({
        itemId: item.id,
        templateKey: item.templateKey,
        documentId: only.id,
        postedAt: only.postedAt,
      });
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
 * Rule 3: write the link only while the item is still unlinked, and record it
 * as automatic in the same statement. Zero rows means someone got there first;
 * that is not an error, and nothing is audited.
 */
async function applyLink(
  communityId: number,
  link: PlannedRecordLink & { postedAt: Date },
  actorUserId: string | null,
): Promise<boolean> {
  const scoped = createScopedClient(communityId);
  // The scoped client adds `community_id = $community AND deleted_at IS NULL`.
  const updated = (await scoped.update(
    complianceChecklistItems,
    {
      documentId: link.documentId,
      documentPostedAt: link.postedAt,
      autoLinkedDocumentId: link.documentId,
      lastModifiedBy: actorUserId,
    },
    and(eq(complianceChecklistItems.id, link.itemId), isNull(complianceChecklistItems.documentId)),
  )) as Array<Record<string, unknown>>;
  if (updated.length === 0) return false;

  await logAuditEvent({
    userId: actorUserId,
    action: 'link_document',
    resourceType: 'compliance_checklist_item',
    resourceId: String(link.itemId),
    communityId,
    newValues: { documentId: link.documentId },
    metadata: { linkedBy: 'auto_match', templateKey: link.templateKey },
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
 *   the item already linked.
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
  if (!rawDoc || !isEligibleDocument(toDocumentRow(rawDoc))) {
    return { templateKey: null, outcome: 'not_eligible' };
  }

  const state = await readLinkingState(communityId);
  const doc = state.documentsById.get(documentId);
  if (!doc) {
    // Not a condominium or HOA, or the document already fills an item: not
    // eligible. Otherwise no open item can take it (none is open, or it has no
    // category).
    const notEligible = !state.keepsRecords || state.linkedDocumentIds.has(documentId);
    return { templateKey: null, outcome: notEligible ? 'not_eligible' : 'no_match' };
  }

  const keys = state.keysByDocument.get(documentId) ?? [];
  if (keys.length === 0) return { templateKey: null, outcome: 'no_match' };
  if (keys.length > 1) return { templateKey: null, outcome: 'ambiguous' };

  const templateKey = keys[0] as string;
  const link = planFromState(state).links.find((l) => l.documentId === documentId);
  if (!link) return { templateKey, outcome: 'ambiguous' };

  const linked = await applyLink(communityId, link, actorUserId);
  return { templateKey, outcome: linked ? 'linked' : 'not_eligible' };
}

/**
 * The links `autoLinkCommunityRecords` would write, and the items it would
 * leave to a person, without writing anything. A dry run reads this.
 */
export async function planCommunityRecordLinks(communityId: number): Promise<{
  links: PlannedRecordLink[];
  ambiguous: AmbiguousRecordItem[];
}> {
  const plan = planFromState(await readLinkingState(communityId));
  return {
    links: plan.links.map(({ itemId, templateKey, documentId }) => ({ itemId, templateKey, documentId })),
    ambiguous: plan.ambiguous,
  };
}

/**
 * Link every open item in the community whose evidence is unambiguous, e.g.
 * after a bulk upload. Returns how many links landed and how many items were
 * left to a person.
 */
export async function autoLinkCommunityRecords(
  communityId: number,
  actorUserId: string | null,
): Promise<{ linked: number; ambiguous: number }> {
  const plan = planFromState(await readLinkingState(communityId));
  let linked = 0;
  for (const link of plan.links) {
    if (await applyLink(communityId, link, actorUserId)) linked++;
  }
  return { linked, ambiguous: plan.ambiguous.length };
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
