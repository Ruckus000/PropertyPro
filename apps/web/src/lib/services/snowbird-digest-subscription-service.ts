/**
 * Snowbird digest subscription service — self-service cadence + opt-out.
 *
 * Default-on model: the ABSENCE of a row means "subscribed at the default
 * weekly cadence" once the board has enabled the digest for the community. A
 * row exists only when the user changed their cadence (including opting out
 * with 'off') or once the cron sent to them (carrying the last_sent_at
 * watermark). So `resolveEffectiveCadence` treats a missing row as 'weekly'.
 *
 * The scoped helpers here back the self-service preferences API. The cron reads
 * cross-tenant through the unscoped client (see the orchestration service).
 */
import type { createScopedClient } from '@propertypro/db';
import { communities, snowbirdDigestSubscriptions } from '@propertypro/db';
import { and, eq, isNull } from '@propertypro/db/filters';
import type { SnowbirdDigestCadence } from '@propertypro/db';

type ScopedClient = ReturnType<typeof createScopedClient>;

export const DEFAULT_SNOWBIRD_CADENCE: SnowbirdDigestCadence = 'weekly';

type Row = Record<string, unknown>;

/**
 * Resolve the effective cadence from a (possibly absent) subscription row.
 * Missing row → the weekly default. This is the single source of truth shared
 * by the preferences API and the cron.
 */
export function resolveEffectiveCadence(row: { cadence?: unknown } | null): SnowbirdDigestCadence {
  const cadence = row?.cadence;
  if (cadence === 'weekly' || cadence === 'monthly' || cadence === 'off') return cadence;
  return DEFAULT_SNOWBIRD_CADENCE;
}

/** Fetch the caller's own subscription row, or null if they've never changed it. */
export async function getOwnSubscription(
  scoped: ScopedClient,
  userId: string,
): Promise<Row | null> {
  const rows = await scoped.selectFrom(
    snowbirdDigestSubscriptions,
    {},
    and(eq(snowbirdDigestSubscriptions.userId, userId), isNull(snowbirdDigestSubscriptions.deletedAt)),
  );
  return ((rows as unknown as Row[])[0]) ?? null;
}

/**
 * Set the caller's cadence, creating the row on first change. Idempotent upsert
 * keyed by the partial unique index (community_id, user_id) where not deleted.
 */
export async function setOwnCadence(
  scoped: ScopedClient,
  communityId: number,
  userId: string,
  cadence: SnowbirdDigestCadence,
): Promise<Row | undefined> {
  const existing = await getOwnSubscription(scoped, userId);
  if (existing) {
    const rows = await scoped.update(
      snowbirdDigestSubscriptions,
      { cadence },
      eq(snowbirdDigestSubscriptions.id, existing.id as number),
    );
    return (rows as unknown as Row[])[0];
  }
  const rows = await scoped.insert(snowbirdDigestSubscriptions, {
    communityId,
    userId,
    cadence,
  });
  return (rows as unknown as Row[])[0];
}

/** Whether the board has enabled the digest for this (scoped) community. */
export async function getCommunitySnowbirdEnabled(scoped: ScopedClient): Promise<boolean> {
  const rows = (await scoped.query(communities)) as Row[];
  return rows[0]?.snowbirdDigestEnabled === true;
}

/** Board toggle: enable/disable the digest for this (scoped) community. */
export async function setCommunitySnowbirdEnabled(
  scoped: ScopedClient,
  enabled: boolean,
): Promise<void> {
  // Scoped update on the root communities row (filtered by id = communityId).
  await scoped.update(communities, { snowbirdDigestEnabled: enabled });
}
