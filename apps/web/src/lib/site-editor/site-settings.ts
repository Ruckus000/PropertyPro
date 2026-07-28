/**
 * Website editor v3, Phase 8 — site settings + footer pure logic.
 *
 * Shared by the API contract, the service, the public-site metadata export,
 * the public footer and the editor panel, so this module must stay
 * dependency-free. In particular it must never reach
 * `@/lib/site-assets/storage-paths`, which imports `node:crypto`: pulling that
 * into a client tree fails the production build only — typecheck and the unit
 * suite both stay green.
 *
 * ## The resolvers here are TOTAL. That is the point of the file.
 *
 * `communities.branding` is declared `jsonb('branding')` with no `.$type<>()`,
 * and `getBrandingForCommunity` hands it back as `raw as CommunityBranding` —
 * a cast, not a parse. Any shape at all can be in that column: a string, a
 * number, an object whose `siteSettings` is `"on"`. Nothing on the public
 * render path indexed into a nested branding object before this phase; this
 * phase adds four such reads, on a Florida statutory entry point that is behind
 * no feature flag and has no preview environment.
 *
 * So every reader below type-checks each field and falls back to the default
 * rather than trusting the cast. A malformed row must render the default site,
 * never a 500.
 */

/**
 * Caps, in code points.
 *
 * 60 and 160 are the conventional truncation points for Google's title and
 * description; they are advisory for SEO but enforced here, because a cap the
 * server does not enforce is a suggestion.
 *
 * Enforced twice, not three times. The Zod schema rejects at the API boundary
 * and `normalizeSettingText` re-checks after trimming — but unlike the urgent
 * notice (migration 0042) there is no DB CHECK backstop available, because
 * these values live inside a jsonb blob rather than in columns of their own.
 * The service is therefore the authoritative layer, and it is the one that
 * decides what a "character" means.
 */
export const SEO_TITLE_MAX_LENGTH = 60;
export const SEO_DESCRIPTION_MAX_LENGTH = 160;
export const FOOTER_ASSOCIATION_NAME_MAX_LENGTH = 120;
export const FOOTER_NOTE_MAX_LENGTH = 300;

/**
 * The opt-in statutory records line.
 *
 * Wording is fixed and is NOT PM-editable — the PM chooses whether it appears,
 * not what it says. See the gap analysis §5 and
 * `.claude/rules/florida-compliance.md`: PropertyPro presents factual data and
 * does not assess compliance adequacy. "Records maintained under" is a
 * statement the association makes about itself. Anything closer to "complies
 * with" would read as the platform certifying the association's statutory
 * compliance, which is exactly the claim to avoid. Do not "clean this up".
 */
export const STATUTORY_FOOTER_LINE =
  'Records maintained under Fla. Stat. §718.111(12)(g)';

/** Processed favicon variants, as written by the favicon finalize route. */
export interface SiteFaviconPaths {
  /** 32×32 PNG — the browser tab icon. */
  icon32Path: string;
  /** 180×180 PNG — iOS home-screen icon. */
  appleTouch180Path: string;
}

export interface SiteSettings {
  seoTitle: string | null;
  seoDescription: string | null;
  /**
   * Whether search engines may index this community's public pages.
   *
   * Defaults to TRUE, and only an explicit `false` turns it off. This default
   * is load-bearing: an inverted or missing default de-indexes every community
   * at once, nobody notices for weeks, and recovery takes months of recrawl.
   * Absent, `undefined`, `null` and garbage all resolve to indexable.
   */
  searchIndexing: boolean;
  favicon: SiteFaviconPaths | null;
}

export interface SiteFooterSettings {
  /** Overrides the community name in the copyright line when set. */
  associationName: string | null;
  /** A free-text line under the copyright. Rendered as text, never as HTML. */
  note: string | null;
  /** OPT-IN, defaults false. See STATUTORY_FOOTER_LINE. */
  showStatutoryLine: boolean;
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  seoTitle: null,
  seoDescription: null,
  searchIndexing: true,
  favicon: null,
};

export const DEFAULT_FOOTER_SETTINGS: SiteFooterSettings = {
  associationName: null,
  note: null,
  showStatutoryLine: false,
};

/** True for a plain object — not null, not an array. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A non-empty trimmed string, or null for anything else (including a number). */
function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Trim, collapse internal whitespace, and enforce a code-point cap.
 *
 * Returns null for input that is empty after trimming — for these fields
 * "cleared" is a legitimate value, unlike the urgent notice where empty is an
 * error.
 *
 * **Length is measured in code points, not UTF-16 units.** `'🌀'.length` is 2,
 * so a plain `.length` check would reject a 60-character title that reads as 60
 * characters to every human who sees it — and the matching `maxLength` on the
 * input would freeze the field at half the stated allowance.
 *
 * Markup is left intact. Sanitising here would be the wrong layer: these values
 * render as React text children, which escape on output, and that is the
 * defence being relied on. Stripping tags here would hide a future renderer
 * regression rather than prevent one.
 */
export function normalizeSettingText(
  raw: string,
  maxLength: number,
  fieldLabel: string,
): string | null {
  const normalized = raw.replace(/\s+/gu, ' ').trim();
  if (normalized.length === 0) return null;

  const codePoints = [...normalized].length;
  if (codePoints > maxLength) {
    throw new Error(`${fieldLabel} must be ${maxLength} characters or fewer.`);
  }

  return normalized;
}

/** Total: never throws, whatever is in the branding column. */
export function resolveSiteSettings(rawBranding: unknown): SiteSettings {
  if (!isRecord(rawBranding)) return DEFAULT_SITE_SETTINGS;
  const raw = rawBranding.siteSettings;
  if (!isRecord(raw)) return DEFAULT_SITE_SETTINGS;

  return {
    seoTitle: asText(raw.seoTitle),
    seoDescription: asText(raw.seoDescription),
    // Only an explicit boolean false disables. See SiteSettings.searchIndexing.
    searchIndexing: raw.searchIndexing !== false,
    favicon: resolveFavicon(raw.favicon),
  };
}

/** Both variant paths must be present — a half-written favicon is no favicon. */
function resolveFavicon(raw: unknown): SiteFaviconPaths | null {
  if (!isRecord(raw)) return null;
  const icon32Path = asText(raw.icon32Path);
  const appleTouch180Path = asText(raw.appleTouch180Path);
  if (!icon32Path || !appleTouch180Path) return null;
  return { icon32Path, appleTouch180Path };
}

/** Total: never throws, whatever is in the branding column. */
export function resolveFooterSettings(rawBranding: unknown): SiteFooterSettings {
  if (!isRecord(rawBranding)) return DEFAULT_FOOTER_SETTINGS;
  const raw = rawBranding.siteFooter;
  if (!isRecord(raw)) return DEFAULT_FOOTER_SETTINGS;

  return {
    associationName: asText(raw.associationName),
    note: asText(raw.note),
    // Opt-in: anything other than an explicit `true` leaves the line off.
    showStatutoryLine: raw.showStatutoryLine === true,
  };
}

/** Whether the public pages may be indexed. Convenience over `resolveSiteSettings`. */
export function isSearchIndexingEnabled(rawBranding: unknown): boolean {
  return resolveSiteSettings(rawBranding).searchIndexing;
}

export interface SeoFallbackCommunity {
  name: string;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
  city?: string | null;
}

/**
 * The noun phrase, article included.
 *
 * The article is baked in rather than templated as `a ${noun}` — which is what
 * the previous `buildCommunityMetadata` did, and why every apartment community
 * has been shipping "a apartment community" in its public meta description.
 * Storing the article with the noun makes that class of mistake unavailable.
 */
const TYPE_TO_NOUN_PHRASE: Record<SeoFallbackCommunity['communityType'], string> = {
  condo_718: 'a condominium association',
  hoa_720: 'a homeowners association',
  apartment: 'an apartment community',
};

/**
 * The title that will actually ship.
 *
 * Shared by `buildCommunityMetadata` and the editor's SERP preview so the
 * preview shows what the page emits rather than a second implementation of the
 * same fallback rules — the failure mode where a preview quietly disagrees with
 * reality is worse than having no preview.
 */
export function resolveSeoTitle(
  settings: SiteSettings,
  community: SeoFallbackCommunity,
): string {
  return settings.seoTitle ?? `${community.name} — Community Portal`;
}

/** The description that will actually ship. `tagline` is the legacy middle rung. */
export function resolveSeoDescription(
  settings: SiteSettings,
  community: SeoFallbackCommunity,
  tagline?: string | null,
): string {
  if (settings.seoDescription) return settings.seoDescription;

  const fromTagline = asText(tagline);
  if (fromTagline) return fromTagline;

  const nounPhrase = TYPE_TO_NOUN_PHRASE[community.communityType];
  const where = community.city ? `${community.city}, Florida` : 'Florida';
  return `Official site of ${community.name}, ${nounPhrase} in ${where}.`;
}
