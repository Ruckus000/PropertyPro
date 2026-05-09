import { createScopedClient, faqs } from '@propertypro/db';
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
