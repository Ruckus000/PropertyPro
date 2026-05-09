/**
 * Help article feedback service.
 *
 * Wraps the `help_article_feedback` table so route handlers don't import the
 * table directly (Plan A3 third-boundary-guard compliance — see
 * `docs/audits/a3-third-boundary-guard-survey-2026-05-08.md`).
 *
 * Invariants:
 * - One active feedback row per (user, article). The upsert is atomic at
 *   the SQL layer: try INSERT, on Postgres unique_violation (23505) fall
 *   back to UPDATE. This eliminates the SELECT-then-write race that was in
 *   the pre-A3 implementation.
 * - No audit logging — feedback is not compliance-critical.
 *
 * Companion to:
 *   - apps/web/src/app/api/v1/help/feedback/route.ts (GET reader / POST writer)
 */
import { createScopedClient, helpArticleFeedback } from '@propertypro/db';
import { and, eq } from '@propertypro/db/filters';

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  if (candidate.code === UNIQUE_VIOLATION) return true;
  if (
    candidate.cause &&
    typeof candidate.cause === 'object' &&
    candidate.cause.code === UNIQUE_VIOLATION
  ) {
    return true;
  }
  return false;
}

export interface ArticleFeedbackRecord {
  rating: number;
  comment: string | null;
  updatedAt: Date;
}

/**
 * Return the current user's feedback for an article, or `null` if none.
 */
export async function getMyArticleFeedback(
  communityId: number,
  userId: string,
  articleSlug: string,
): Promise<ArticleFeedbackRecord | null> {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.selectFrom(
    helpArticleFeedback,
    {
      rating: helpArticleFeedback.rating,
      comment: helpArticleFeedback.comment,
      updatedAt: helpArticleFeedback.updatedAt,
    },
    and(
      eq(helpArticleFeedback.userId, userId),
      eq(helpArticleFeedback.articleSlug, articleSlug),
    ),
  )) as unknown as ArticleFeedbackRecord[];
  return rows[0] ?? null;
}

export interface UpsertArticleFeedbackInput {
  communityId: number;
  userId: string;
  articleSlug: string;
  articleCategory: string;
  rating: 1 | -1;
  comment: string | null;
}

export interface UpsertArticleFeedbackResult {
  /** The row returned by INSERT or UPDATE (RETURNING *). */
  row: unknown;
  /** True when the row was newly inserted; false when an existing row was updated. */
  created: boolean;
}

/**
 * Insert a feedback row for (user, article); on unique-violation update the
 * existing row instead. Atomic at the SQL layer — no SELECT-then-write race.
 */
export async function upsertArticleFeedback(
  input: UpsertArticleFeedbackInput,
): Promise<UpsertArticleFeedbackResult> {
  const scoped = createScopedClient(input.communityId);

  try {
    const inserted = await scoped.insert(helpArticleFeedback, {
      userId: input.userId,
      articleSlug: input.articleSlug,
      articleCategory: input.articleCategory,
      rating: input.rating,
      comment: input.comment,
    });
    return { row: inserted[0], created: true };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    const updated = await scoped.update(
      helpArticleFeedback,
      {
        rating: input.rating,
        comment: input.comment,
        updatedAt: new Date(),
      },
      and(
        eq(helpArticleFeedback.userId, input.userId),
        eq(helpArticleFeedback.articleSlug, input.articleSlug),
      ),
    );
    return { row: updated[0], created: false };
  }
}
