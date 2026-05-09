import { createScopedClient, faqs } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { DEFAULT_FAQS } from '@propertypro/shared';

export interface VisibleFaq {
  id: number;
  question: string;
  answer: string;
  sortOrder: number;
  category: string | null;
  roleVisibility: string[] | null;
}

type FaqLike = Record<string, unknown>;

export function buildDefaultFaqRows() {
  return DEFAULT_FAQS.map((faq, index) => ({
    question: faq.question,
    answer: faq.answer,
    sortOrder: index,
    category: faq.category,
    roleVisibility: faq.roleVisibility ? [...faq.roleVisibility] : null,
  }));
}

export function isFaqVisibleToRole(
  faq: Pick<VisibleFaq, 'roleVisibility'> | FaqLike,
  role: string | null | undefined,
): boolean {
  const allowedRoles = (
    'roleVisibility' in faq ? faq.roleVisibility : faq['roleVisibility']
  ) as string[] | null | undefined;

  if (!allowedRoles || allowedRoles.length === 0) {
    return true;
  }

  if (!role) {
    return false;
  }

  return allowedRoles.includes(role);
}

export function sortFaqs<T extends FaqLike>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const left = (a['sortOrder'] as number | null | undefined) ?? 0;
    const right = (b['sortOrder'] as number | null | undefined) ?? 0;
    return left - right;
  });
}

export function toVisibleFaq(faq: FaqLike): VisibleFaq {
  return {
    id: faq['id'] as number,
    question: faq['question'] as string,
    answer: faq['answer'] as string,
    sortOrder: (faq['sortOrder'] as number | null | undefined) ?? 0,
    category: (faq['category'] as string | null | undefined) ?? null,
    roleVisibility: (faq['roleVisibility'] as string[] | null | undefined) ?? null,
  };
}

export function filterFaqsForRole(
  faqRows: readonly FaqLike[],
  role: string | null | undefined,
): VisibleFaq[] {
  return sortFaqs(faqRows)
    .filter((faq) => isFaqVisibleToRole(faq, role))
    .map(toVisibleFaq);
}

export async function ensureFaqsExist(communityId: number): Promise<void> {
  const scoped = createScopedClient(communityId);
  const existing = await scoped.query(faqs);

  if (existing.length > 0) {
    return;
  }

  await scoped.insert(faqs, buildDefaultFaqRows());
}

/**
 * Return all FAQ rows for the community as raw rows. Caller decides on
 * role-filtering / shaping (see `filterFaqsForRole`).
 */
export async function listFaqs(
  communityId: number,
): Promise<Record<string, unknown>[]> {
  const scoped = createScopedClient(communityId);
  return await scoped.query(faqs);
}

export interface CreateFaqInput {
  question: string;
  answer: string;
}

export interface CreatedFaqRecord {
  /** The inserted row (RETURNING *). Shape matches the faqs table. */
  row: unknown;
  /** The sortOrder assigned to the new row (max existing + 1, or 0 if none). */
  sortOrder: number;
}

/**
 * Insert a new FAQ row, computing the next sortOrder as `max(existing) + 1`.
 *
 * NOTE: the max-sort calculation is a read-then-write in app code, so two
 * concurrent inserts in the same community could race to the same sortOrder.
 * Acceptable per the original route's behavior — admin-driven, very low
 * concurrency, and ties just produce a stable but arbitrary order until the
 * next reorder. Not changed here.
 */
export async function createFaq(
  communityId: number,
  input: CreateFaqInput,
): Promise<CreatedFaqRecord> {
  const scoped = createScopedClient(communityId);
  const existing = await scoped.query(faqs);
  const maxSort = existing.reduce(
    (max, row) => Math.max(max, (row['sortOrder'] as number) ?? 0),
    -1,
  );
  const sortOrder = maxSort + 1;
  const inserted = await scoped.insert(faqs, {
    question: input.question,
    answer: input.answer,
    sortOrder,
  });
  return { row: inserted[0], sortOrder };
}

export interface UpdateFaqPatch {
  question?: string;
  answer?: string;
}

/**
 * Partial update of question/answer. Always bumps `updatedAt`. Returns the
 * updated row, or `null` if no row matched the id (so callers can throw the
 * appropriate NotFoundError).
 */
export async function updateFaq(
  communityId: number,
  id: number,
  patch: UpdateFaqPatch,
): Promise<{ row: unknown; updateData: Record<string, unknown> } | null> {
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.question !== undefined) updateData['question'] = patch.question;
  if (patch.answer !== undefined) updateData['answer'] = patch.answer;

  const scoped = createScopedClient(communityId);
  const updated = await scoped.update(faqs, updateData, eq(faqs.id, id));
  if (!updated.length) return null;
  return { row: updated[0], updateData };
}

/**
 * Soft-delete a FAQ. Returns true on success, false if no row matched (so
 * callers can throw NotFoundError).
 */
export async function softDeleteFaq(
  communityId: number,
  id: number,
): Promise<boolean> {
  const scoped = createScopedClient(communityId);
  const deleted = await scoped.update(
    faqs,
    { deletedAt: new Date() },
    eq(faqs.id, id),
  );
  return deleted.length > 0;
}

/**
 * Reorder a community's FAQs by mapping `ids` → 0..N. Validates that every
 * id exists in the active set; throws via the supplied `onUnknownId` when an
 * id is missing (so the route can map to a ValidationError with the same
 * message the prior route produced).
 *
 * Caller is responsible for de-duping `ids` before calling.
 */
export async function reorderFaqs(
  communityId: number,
  ids: readonly number[],
  onUnknownId: (id: number) => never,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  const activeFaqs = await scoped.query(faqs);
  const activeIds = new Set(activeFaqs.map((f) => f['id'] as number));

  for (const id of ids) {
    if (!activeIds.has(id)) onUnknownId(id);
  }

  for (let i = 0; i < ids.length; i++) {
    await scoped.update(
      faqs,
      { sortOrder: i, updatedAt: new Date() },
      eq(faqs.id, ids[i]!),
    );
  }
}

export interface FaqSearchHit {
  id: number;
  question: string;
  answer: string;
}

export interface SearchCommunityFaqsResult {
  /** Hits, capped at `limit`. */
  hits: FaqSearchHit[];
  /** Total FAQ row count for this community (pre-filter). Useful for telemetry. */
  totalRowCount: number;
}

/**
 * Substring search over a community's FAQs. JS-side because per-community FAQ
 * corpora are small (<100 rows); pushing the predicate into SQL would not
 * materially change perf and would lose the existing case-insensitive
 * `includes()` semantics.
 *
 * Returns `totalRowCount` so callers (e.g. the help search route's zero-result
 * Sentry telemetry) can report context without re-querying.
 */
export async function searchCommunityFaqs(
  communityId: number,
  query: string,
  limit = 10,
): Promise<SearchCommunityFaqsResult> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.query(faqs);
  const qLower = query.toLowerCase();
  const hits = rows
    .filter((f) => {
      const question = String(f['question'] ?? '').toLowerCase();
      const answer = String(f['answer'] ?? '').toLowerCase();
      return question.includes(qLower) || answer.includes(qLower);
    })
    .slice(0, limit)
    .map((f) => ({
      id: f['id'] as number,
      question: f['question'] as string,
      answer: f['answer'] as string,
    }));
  return { hits, totalRowCount: rows.length };
}
