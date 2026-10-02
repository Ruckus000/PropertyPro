/**
 * The one writer for `communities.community_settings` in the web app.
 *
 * The column is a JSONB blob shared by unrelated features (fee policy, visitor
 * revoke, write levels, legal gates, …). Writers MERGE in SQL —
 * `coalesce(col, '{}') || patch` — so a write can only ever touch the keys it
 * names, and two concurrent writers of different keys cannot erase each
 * other (a read-modify-write in JS could).
 */
import { communities, createScopedClient } from '@propertypro/db';
import { eq, sql } from '@propertypro/db/filters';

/**
 * AUTHZ: caller MUST have verified the actor may change these settings for
 * `communityId` (each key has its own gate — e.g. finance admin for the fee policy).
 */
export async function mergeCommunitySettings(
  communityId: number,
  patch: Record<string, unknown>,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  await scoped.update(
    communities,
    {
      communitySettings: sql`coalesce(${communities.communitySettings}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
    },
    eq(communities.id, communityId),
  );
}

export interface PastDueRule {
  /** Overdue amount must EXCEED this (cents). 0 = any overdue amount. */
  minCents: number;
  /** Oldest unpaid charge must be MORE than this many days late. */
  minDays: number;
}

/** Default: any overdue charge counts, which is what the Directory showed before a rule existed. */
export const DEFAULT_PAST_DUE_RULE: PastDueRule = { minCents: 0, minDays: 0 };

function nonNegativeInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback;
}

/** AUTHZ: caller MUST have verified finance read access for `communityId`. */
export async function getPastDueRule(communityId: number): Promise<PastDueRule> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<{ communitySettings: Record<string, unknown> | null }>(
    communities,
    { communitySettings: communities.communitySettings },
    eq(communities.id, communityId),
  );
  const settings = rows[0]?.communitySettings ?? {};
  return {
    minCents: nonNegativeInt(settings['pastDueMinCents'], DEFAULT_PAST_DUE_RULE.minCents),
    minDays: nonNegativeInt(settings['pastDueMinDays'], DEFAULT_PAST_DUE_RULE.minDays),
  };
}

/** AUTHZ: caller MUST have verified finance admin write for `communityId`. Returns the previous rule for audit. */
export async function setPastDueRule(communityId: number, rule: PastDueRule): Promise<PastDueRule> {
  const previous = await getPastDueRule(communityId);
  await mergeCommunitySettings(communityId, { pastDueMinCents: rule.minCents, pastDueMinDays: rule.minDays });
  return previous;
}
