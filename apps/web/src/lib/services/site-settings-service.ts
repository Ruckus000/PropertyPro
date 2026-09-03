/**
 * Website editor v3, Phase 8 — site settings + footer service.
 *
 * Reads and writes the `siteSettings` / `siteFooter` keys inside
 * `communities.branding`. Both are unstaged: the publish flow promotes
 * `site_blocks` rows only, so whatever this writes is on the community's
 * public site by the next request.
 *
 * ## Why the write is one SQL statement
 *
 * The obvious implementation — read branding, merge in JS, write it back
 * through `updateBrandingForCommunity` — has a lost-update race: two managers
 * saving different fields read the same baseline and the second write erases
 * the first. That is not hypothetical here. `applyAssetsUsageDelta`
 * (`apps/web/src/lib/site-assets/quota.ts`) was rewritten for exactly this
 * reason after concurrent finalize calls leaked quota increments, and this
 * phase adds a second, much more active writer to the same jsonb blob.
 *
 * So the merge happens in Postgres, in a single UPDATE, which the row lock
 * serialises for free. The `jsonb_typeof` guard means a row whose
 * `siteSettings` is a string or a number gets repaired rather than erroring on
 * the `||` operator — see `resolveSiteSettings` for the same defensiveness on
 * the read side, and why an untyped jsonb column earns it.
 *
 * ## Where the length caps are enforced
 *
 * Twice, not three times. The Zod schema rejects at the API boundary and
 * `normalizeSettingText` re-checks here after trimming, in code points. Unlike
 * the urgent notice there is no DB CHECK backstop available, because these
 * values live inside a jsonb blob rather than in columns of their own. This
 * module is therefore the authoritative layer.
 */
import { captureMessage } from '@sentry/nextjs';
import { eq, sql } from '@propertypro/db/filters';
import { communities, logAuditEvent } from '@propertypro/db';
// Phase 8 site settings — communities is the ROOT tenant table: it has no
// community_id column to scope by (it IS the community_id), so
// createScopedClient cannot address it and `branding` can only be reached by
// primary key. Callers are gated by `ensurePmAccess` in the route — PM role +
// membership in the TARGET community + hasSiteEditor, the same gate publish
// uses — before reaching here.
//
// AUTHZ: Phase 8 site settings — communities is the root tenant table (no community_id column); the branding jsonb is readable/writable only by primary key. Route-layer ensurePmAccess verifies management-tier membership in the target community plus the hasSiteEditor plan feature.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { ValidationError } from '@/lib/api/errors';
import { getSiteAssetsQuotaBytes, resolveAssetsBytesUsed } from '@/lib/site-assets/quota';
import {
  FOOTER_ASSOCIATION_NAME_MAX_LENGTH,
  FOOTER_NOTE_MAX_LENGTH,
  SEO_DESCRIPTION_MAX_LENGTH,
  SEO_TITLE_MAX_LENGTH,
  normalizeSettingText,
  resolveFooterSettings,
  resolveSiteSettings,
  type SiteFaviconPaths,
  type SiteFooterSettings,
  type SiteSettings,
  type SiteStorage,
} from '@/lib/site-editor/site-settings';

export interface SiteSettingsRecord {
  settings: SiteSettings;
  footer: SiteFooterSettings;
  /**
   * Read-only. Present on every record this module returns — GET and PATCH
   * alike — because the client caches the PATCH response as the record. See
   * the contract's `siteStorageSchema` for why it is required rather than
   * optional.
   */
  storage: SiteStorage;
}

/** The two halves that live in `branding` and that a patch can change. */
type SiteSettingsFields = Pick<SiteSettingsRecord, 'settings' | 'footer'>;

/**
 * A patch field. `undefined` (absent) means unchanged; `null` clears.
 *
 * The distinction matters — "leave the title alone" and "remove the title" are
 * different requests and a single nullable type cannot express both.
 */
type Patchable<T> = T | null | undefined;

export interface UpdateSiteSettingsParams {
  communityId: number;
  actorUserId: string;
  seoTitle?: Patchable<string>;
  seoDescription?: Patchable<string>;
  searchIndexing?: boolean;
  associationName?: Patchable<string>;
  note?: Patchable<string>;
  showStatutoryLine?: boolean;
}

/** Read the raw branding blob by primary key. Returns `null` for a missing row. */
async function readBranding(communityId: number): Promise<unknown> {
  const db = createUnscopedClient();
  const rows = await db
    .select({ branding: communities.branding })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);
  return rows[0]?.branding ?? null;
}

/** Settings + footer, resolved from one branding blob. Total, like the resolvers. */
function resolveFields(rawBranding: unknown): SiteSettingsFields {
  return {
    settings: resolveSiteSettings(rawBranding),
    footer: resolveFooterSettings(rawBranding),
  };
}

/**
 * Settings + footer only, from one branding read. Used for the before
 * snapshot the audit log needs, which has no use for the storage numbers and
 * should not pay for the plan lookup that produces them.
 */
async function readSiteSettingsFields(communityId: number): Promise<SiteSettingsFields> {
  return resolveFields(await readBranding(communityId));
}

/**
 * The plan's storage quota for the meter, or null when it cannot be read.
 *
 * This is the ONE read on the settings path that touches something other than
 * the branding row — the plan string — and it is purely informational: it
 * draws a bar. A transient failure here must not 500 the settings read, turn
 * a committed save into a false "save failed", or (through the editor page's
 * seed) take down the whole editor for a manager who came to move a block. So
 * it degrades to null, which the schema, the type and the meter already treat
 * as "no limit — show usage only". Same shape as `loadInitialPages` on the
 * editor page: degraded, but never silently — Sentry gets a warning.
 *
 * Contrast `assertWithinQuota` on the UPLOAD path, which fails closed. That
 * one enforces the limit; this one only reports it.
 *
 * Exported for the editor page, so the seed and the route degrade at the same
 * single point.
 */
export async function loadSiteQuotaBytes(communityId: number): Promise<number | null> {
  try {
    return await getSiteAssetsQuotaBytes(communityId);
  } catch (error) {
    captureMessage('site_settings_storage_quota_failure', {
      level: 'warning',
      extra: {
        communityId,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    return null;
  }
}

/**
 * The full record, storage included.
 *
 * Usage is resolved from the SAME branding read as the settings — never a
 * second read of the row — so it has no failure mode of its own: if that read
 * fails, nothing on the panel can render anyway, and propagating is right. The
 * quota is the only extra read, and it degrades (above). The two run in
 * parallel.
 */
export async function getSiteSettings(communityId: number): Promise<SiteSettingsRecord> {
  const [branding, quotaBytes] = await Promise.all([
    readBranding(communityId),
    loadSiteQuotaBytes(communityId),
  ]);
  const storage: SiteStorage = { assetsBytesUsed: resolveAssetsBytesUsed(branding), quotaBytes };
  return { ...resolveFields(branding), storage };
}

type BrandingKey = 'siteSettings' | 'siteFooter';

/**
 * Apply one or both patches in a SINGLE UPDATE.
 *
 * Two sequential statements would let a failure between them persist half a
 * save — the SEO fields written, the footer not — while the audit log claims
 * both. Composing the `jsonb_set` calls makes that state unreachable without
 * reaching for a transaction.
 *
 * `COALESCE` handles a NULL branding column. The `CASE` handles a key whose
 * current value is not an object (a string, a number, an array), which the `||`
 * operator would otherwise reject outright — a reachable state for an untyped
 * jsonb column, and one that must not take a community's public site down. The
 * malformed key is replaced rather than merged into.
 *
 * Every interpolation is a bound parameter, including the key name; the casts
 * are there because Postgres cannot infer a parameter's type from `->` or
 * `ARRAY[…]` on its own.
 */
async function mergeBranding(
  communityId: number,
  patches: Partial<Record<BrandingKey, object>>,
): Promise<void> {
  const entries = (Object.entries(patches) as [BrandingKey, object][]).filter(
    ([, patch]) => Object.keys(patch).length > 0,
  );
  if (entries.length === 0) return;

  let expr = sql`COALESCE(branding, '{}'::jsonb)`;
  for (const [key, patch] of entries) {
    expr = sql`jsonb_set(
      ${expr},
      ARRAY[${key}::text],
      (
        CASE WHEN jsonb_typeof(branding -> ${key}::text) = 'object'
             THEN branding -> ${key}::text
             ELSE '{}'::jsonb
        END
      ) || ${JSON.stringify(patch)}::jsonb,
      true
    )`;
  }

  const db = createUnscopedClient();
  await db.execute(sql`UPDATE communities SET branding = ${expr} WHERE id = ${communityId}`);
}

/** Trim + cap, translating the pure layer's Error into a 400 with a field path. */
function normalizeOrThrow(
  raw: string,
  maxLength: number,
  field: string,
  label: string,
): string | null {
  try {
    return normalizeSettingText(raw, maxLength, label);
  } catch (err) {
    throw new ValidationError(err instanceof Error ? err.message : 'Invalid value', {
      fields: [{ field, message: err instanceof Error ? err.message : 'Invalid value' }],
    });
  }
}

/**
 * Resolve one text field into its persisted value.
 *
 * Returns `undefined` when the caller did not mention the field, so it is
 * omitted from the patch entirely rather than written as null.
 */
function patchText(
  value: Patchable<string>,
  maxLength: number,
  field: string,
  label: string,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return normalizeOrThrow(value, maxLength, field, label);
}

export async function updateSiteSettings(
  params: UpdateSiteSettingsParams,
): Promise<SiteSettingsRecord> {
  const { communityId, actorUserId } = params;
  const before = await readSiteSettingsFields(communityId);

  // Typed as partial records rather than loose maps so the audit's `newValues`
  // below can be built from them and still BE a SiteSettings / SiteFooterSettings.
  const settingsPatch: Partial<SiteSettings> = {};
  const seoTitle = patchText(params.seoTitle, SEO_TITLE_MAX_LENGTH, 'seoTitle', 'A site title');
  if (seoTitle !== undefined) settingsPatch.seoTitle = seoTitle;

  const seoDescription = patchText(
    params.seoDescription,
    SEO_DESCRIPTION_MAX_LENGTH,
    'seoDescription',
    'A site description',
  );
  if (seoDescription !== undefined) settingsPatch.seoDescription = seoDescription;

  if (params.searchIndexing !== undefined) settingsPatch.searchIndexing = params.searchIndexing;

  const footerPatch: Partial<SiteFooterSettings> = {};
  const associationName = patchText(
    params.associationName,
    FOOTER_ASSOCIATION_NAME_MAX_LENGTH,
    'associationName',
    'An association name',
  );
  if (associationName !== undefined) footerPatch.associationName = associationName;

  const note = patchText(params.note, FOOTER_NOTE_MAX_LENGTH, 'note', 'A footer note');
  if (note !== undefined) footerPatch.note = note;

  if (params.showStatutoryLine !== undefined) {
    footerPatch.showStatutoryLine = params.showStatutoryLine;
  }

  await mergeBranding(communityId, { siteSettings: settingsPatch, siteFooter: footerPatch });

  // The write is committed — `mergeBranding` is a standalone statement, not a
  // transaction. Audit it NOW, from the snapshot and the patch already in hand,
  // never from a read that could fail after the write has landed: that would
  // leave a committed, public-facing change with no trail (and hand the
  // manager a false "save failed" on top). The merged values ARE `before`
  // overlaid with the normalised patch — the merge is a jsonb `||` on exactly
  // these keys, and the resolver hands normalised text back unchanged — so
  // this is byte-identical to reading them back, minus the read.
  //
  // Two audit actions rather than one, because these are two different
  // decisions with different reviewers: SEO is a marketing choice, the footer's
  // statutory line is one the association's counsel may need to see.
  if (Object.keys(settingsPatch).length > 0) {
    const afterSettings: SiteSettings = { ...before.settings, ...settingsPatch };
    await logAuditEvent({
      userId: actorUserId,
      communityId,
      action: 'site_settings_updated',
      resourceType: 'community',
      resourceId: String(communityId),
      oldValues: { siteSettings: before.settings },
      newValues: { siteSettings: afterSettings },
    });
  }

  if (Object.keys(footerPatch).length > 0) {
    const afterFooter: SiteFooterSettings = { ...before.footer, ...footerPatch };
    await logAuditEvent({
      userId: actorUserId,
      communityId,
      action: 'site_footer_updated',
      resourceType: 'community',
      resourceId: String(communityId),
      oldValues: { siteFooter: before.footer },
      newValues: { siteFooter: afterFooter },
    });
  }

  // The response is a fresh read — the record as stored, storage included,
  // which the client caches in place of the GET result. A failure here 500s
  // the response; it cannot un-audit the write above.
  return getSiteSettings(communityId);
}

/**
 * Record processed favicon variants. Called by the favicon finalize route,
 * which has already written the bytes and incremented the quota.
 *
 * Returns the paths it replaced, if any, so the caller can delete them and
 * release the quota. Reporting rather than deleting keeps this module free of
 * storage concerns.
 */
export async function setSiteFavicon(params: {
  communityId: number;
  actorUserId: string;
  favicon: SiteFaviconPaths;
}): Promise<{ previous: SiteFaviconPaths | null }> {
  const before = await readSiteSettingsFields(params.communityId);
  await mergeBranding(params.communityId, { siteSettings: { favicon: params.favicon } });

  await logAuditEvent({
    userId: params.actorUserId,
    communityId: params.communityId,
    action: 'site_settings_updated',
    resourceType: 'community',
    resourceId: String(params.communityId),
    oldValues: { favicon: before.settings.favicon },
    newValues: { favicon: params.favicon },
  });

  return { previous: before.settings.favicon };
}

/** Clear the favicon. Returns the paths to delete, or null if there were none. */
export async function clearSiteFavicon(params: {
  communityId: number;
  actorUserId: string;
}): Promise<{ previous: SiteFaviconPaths | null }> {
  const before = await readSiteSettingsFields(params.communityId);
  if (before.settings.favicon === null) return { previous: null };

  await mergeBranding(params.communityId, { siteSettings: { favicon: null } });

  await logAuditEvent({
    userId: params.actorUserId,
    communityId: params.communityId,
    action: 'site_settings_updated',
    resourceType: 'community',
    resourceId: String(params.communityId),
    oldValues: { favicon: before.settings.favicon },
    newValues: { favicon: null },
  });

  return { previous: before.settings.favicon };
}
