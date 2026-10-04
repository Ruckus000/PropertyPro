import { sql } from 'drizzle-orm';
import { liveLookKeysToStrip, type CommunityBranding } from '@propertypro/shared';
import { db } from '../drizzle';

export interface LiveBrandingWriteResult {
  /** `communities.branding` as it was immediately before this write. */
  before: CommunityBranding | null;
  /** `communities.branding` as this write left it. */
  after: CommunityBranding | null;
}

/**
 * Write top-level `communities.branding` keys LIVE, in ONE statement, and
 * remove any pending draft of the look fields written.
 *
 * Two defects this replaces, both of the read → spread in JS → write the whole
 * object back shape that every live branding writer used:
 *
 * 1. **Lost writes.** A whole-object write from an earlier read erases
 *    anything written in between: the manager's draft (`draftLook`, saved
 *    atomically by the web app's `mergeBranding`), site settings, the asset
 *    quota. Here the merge happens inside Postgres against the current row.
 * 2. **Stale drafts undoing live writes.** Since website builder v4 a look
 *    field also has a draft value, and Publish promotes every draft field that
 *    differs from live. A live write that leaves an older draft of the same
 *    field in place is reverted by the next Publish. The keys to remove come
 *    from `liveLookKeysToStrip` (packages/shared), which owns that rule.
 *
 * ## Shape of the expression
 *
 * `merged = COALESCE(branding, '{}') || patch` is the live write. When look
 * keys must be stripped, a CASE then edits `draftLook`:
 *
 * - `draftLook` is not an object (absent, JSON null, malformed) → `merged`
 *   unchanged. The test is `IS DISTINCT FROM 'object'`, NOT `<> 'object'`:
 *   on a NULL branding or an absent key the `<>` form is NULL, falls through
 *   to the ELSE, and `jsonb_set` — which is STRICT — returns NULL, wiping the
 *   community's entire branding.
 * - stripping empties the draft → the `draftLook` key is dropped.
 * - otherwise → `draftLook` is replaced by itself minus the keys.
 *
 * The keys are bound as ONE JSON string and expanded in SQL. Binding a JS array
 * would expand to a row `($1, $2)`, not an array.
 *
 * `before` comes from a `FOR UPDATE` sub-select on the same row, so it is the
 * exact value this statement replaced even when a concurrent writer committed
 * first (the lock makes the second writer wait and re-read).
 *
 * `undefined` values are dropped before binding, and a `draftLook` key in the
 * patch is ignored: drafts are written only by the editor's design save.
 *
 * `options.remove` deletes top-level keys in the same statement (a removed
 * logo). It is applied after the merge, so a key both patched and removed ends
 * up removed. `draftLook` cannot be removed this way, for the same reason it
 * cannot be patched.
 *
 * Returns `{ before: null, after: null }` when no community has this id.
 */
export async function applyLiveBrandingPatchUnscoped(
  communityId: number,
  patch: Partial<CommunityBranding>,
  options: { touchUpdatedAt?: boolean; remove?: readonly (keyof CommunityBranding)[] } = {},
): Promise<LiveBrandingWriteResult> {
  const clean = Object.fromEntries(
    Object.entries(patch).filter(([key, value]) => value !== undefined && key !== 'draftLook'),
  );
  const strip = liveLookKeysToStrip(clean);
  const remove = (options.remove ?? []).filter((key) => key !== 'draftLook');

  const patched = sql`(COALESCE(c.branding, '{}'::jsonb) || ${JSON.stringify(clean)}::jsonb)`;
  const merged =
    remove.length === 0
      ? patched
      : sql`(${patched} - ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(remove)}::jsonb)))`;
  const keys = sql`ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(strip)}::jsonb))`;
  const next =
    strip.length === 0
      ? merged
      : sql`CASE
          WHEN jsonb_typeof(c.branding -> 'draftLook') IS DISTINCT FROM 'object' THEN ${merged}
          WHEN (c.branding -> 'draftLook') - ${keys} = '{}'::jsonb THEN ${merged} - 'draftLook'
          ELSE jsonb_set(${merged}, '{draftLook}', (c.branding -> 'draftLook') - ${keys}, true)
        END`;
  const touch = options.touchUpdatedAt ? sql`, updated_at = now()` : sql``;

  const rows = (await db.execute(sql`
    UPDATE communities c
       SET branding = ${next}${touch}
      FROM (SELECT id, branding AS prev FROM communities WHERE id = ${communityId} FOR UPDATE) o
     WHERE c.id = o.id
 RETURNING o.prev AS before, c.branding AS after
  `)) as unknown as { before: CommunityBranding | null; after: CommunityBranding | null }[];

  const row = rows[0];
  return row ? { before: row.before, after: row.after } : { before: null, after: null };
}
