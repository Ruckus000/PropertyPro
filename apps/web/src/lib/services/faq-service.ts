/**
 * FAQ Service — lazy-seed default FAQs for a community.
 *
 * Called by GET /api/v1/faqs before returning results.
 * If no active FAQs exist for the community, inserts DEFAULT_FAQS.
 * Uses count-check-then-insert (no unique index on sort_order).
 */
import { createScopedClient, faqs } from '@propertypro/db';
import { DEFAULT_FAQS } from '@propertypro/shared';

export async function ensureFaqsExist(communityId: number): Promise<void> {
  const scoped = createScopedClient(communityId);
  const existing = await scoped.query(faqs);

  if (existing.length > 0) return;

  // No active FAQs — seed defaults
  const rows = DEFAULT_FAQS.map((faq, index) => ({
    question: faq.question,
    answer: faq.answer,
    sortOrder: index,
  }));

  await scoped.insert(faqs, rows);
}
