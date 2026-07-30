/**
 * The site change model — types.
 *
 * Lives in `packages/shared` because publish-time validation must run
 * server-side too: a client-only gate is a suggestion, not a gate. Everything
 * here is sync and pure, and the only permitted import in this directory is
 * `zod` plus the sibling block schemas. No `apps/web`, no `node:` built-ins
 * (this ships to the client bundle), no database access, no React.
 *
 * See docs/redesign/website-page/website-editor-v3-phase4-change-model-design.md
 * for the algorithm and the decisions behind the key space.
 */

export const SITE_DIFF_SCHEMA_VERSION = 1;

/**
 * One section as stored in `site_blocks`.
 *
 * Deliberately has NO `id` field. Row ids are not stable across edits — every
 * write soft-deletes the old row and INSERTs a fresh one — so a diff that
 * could see an id would inevitably come to depend on an identity the data
 * model does not actually provide. Omitting it makes that mistake unavailable.
 */
export interface SiteSectionSnapshot {
  /** `site_blocks.block_order`. Slot 1 is the hero; content blocks are 2..99. */
  slot: number;
  /** Widened past `BlockType` on purpose: an older deploy may meet a newer type. */
  blockType: string;
  /** Raw jsonb, unparsed. `diffSite` parses through the block schema registry. */
  content: unknown;
}

export interface SiteSnapshot {
  /** Forward-compat for Phase 11 multi-page. `'home'` today. */
  pageId?: string;
  /** Slot 1. Null when the hero has never been authored. */
  hero: SiteSectionSnapshot | null;
  /** Slots 2..99, in any order — `diffSite` sorts. */
  sections: SiteSectionSnapshot[];
  /** Slots staged for deletion (tombstone drafts). Meaningful on `next` only. */
  tombstonedSlots?: number[];
  /**
   * `communities.branding`, unparsed. Always equal on both sides today.
   *
   * Branding is unstaged: it has no draft layer, so every field on it — the
   * colours, the tagline, and the Phase 8 site settings and footer — reaches
   * the live public site immediately and there is nothing to diff. Phase 8 was
   * once expected to change that and did not; giving branding a draft side
   * means draft storage, promotion inside `publishCommunitySite`'s transaction,
   * and inclusion in `site_publish_snapshots` so revert covers it. That work is
   * still unbuilt and unassigned to a phase.
   */
  branding?: unknown;
}

/** Closed set. Unlike `ChangeKey`, this genuinely will not grow. */
export type ChangeKind = 'added' | 'edited' | 'removed' | 'reordered';

/**
 * A section's identity within one diff: `p<slot>` for a section that exists on
 * the published side, `d<slot>` for one that only exists in the draft.
 *
 * This replaces the `block:<id>` key the roadmap originally imagined. Row ids
 * are unstable and draft/published rows correlate only by slot, so identity
 * has to be derived by matching content rather than read off the row. The
 * `p`/`d` prefix keeps the two namespaces from colliding: a section removed
 * from slot 5 (`p5`) and a new one added at slot 5 (`d5`) are distinct keys in
 * the same diff.
 */
export type SectionRef = `p${number}` | `d${number}`;

/**
 * Revert-targeting and dedupe only.
 *
 * **No consumer may `switch` on this type.** Adding a member to a string
 * literal union is a breaking change for exhaustive switches, and Phases 8/9/11
 * will add `site`, `footer`, `page:<id>` and `pageorder`. Render from `kind`,
 * `group` and `title` instead — those are stable.
 *
 * `style` is declared but has no producer: branding is unstaged, so both sides
 * of the diff always carry the same value. Phase 8 was expected to turn it on
 * and did not — it shipped site settings and the footer as live-immediate
 * fields on `communities.branding`, which is the same unstaged storage. The key
 * stays declared so the grouping code is written once, and so turning it on
 * later is not a breaking change.
 */
export type ChangeKey = 'hero' | 'style' | 'order' | `block:${SectionRef}`;

export interface Change {
  key: ChangeKey;
  kind: ChangeKind;
  /** `'site'` today; a page id in Phase 11. The review sheet groups by this. */
  group: string;
  /** Human label, e.g. "FAQ section", "Welcome", "Section order". */
  title: string;
  blockType: string | null;
  /** Null for `added`. */
  fromSlot: number | null;
  /** Null for `removed`. */
  toSlot: number | null;
  /** Present only when `kind === 'reordered'`. */
  order?: { from: SectionRef[]; to: SectionRef[] };
  /** True when an edited section also changed position. */
  alsoMoved?: boolean;
  /**
   * True when either side failed to parse against its block schema — typically
   * a row written before a schema tightened. The comparison falls back to a raw
   * value compare, which can read as an edit the PM never made, so the review
   * sheet must be able to say so.
   */
  degraded?: boolean;
}

export interface DiffResult {
  schemaVersion: number;
  changes: Change[];
  /** Array rather than Set so the result survives a JSON round-trip. */
  keys: ChangeKey[];
  /** True when there is no published side at all — everything reads as added. */
  firstPublish: boolean;
}

export type IssueSeverity = 'error' | 'warning';

export interface Issue {
  /**
   * Dotted path, matching the API's `{ error: { message, fields } }` envelope.
   *
   * NOTE the grammar: `sections.<i>` indexes the `sections` ARRAY, not the
   * `block_order` slot. Do not parse this to find the offending section — use
   * `slot` below.
   */
  field: string;
  message: string;
  severity: IssueSeverity;
  /**
   * `block_order` of the section this issue is about, when it is about one.
   *
   * Emitted so a consumer can offer "fix this" without reverse-engineering the
   * `field` grammar. Parsing `field` for an array index and treating it as a
   * slot is wrong (they diverge the moment slots are sparse), and it is wrong
   * *silently* — no type error, and no test in this package would catch a
   * consumer getting it backwards.
   */
  slot?: number;
  /** Block type of the offending section, for labelling the fix affordance. */
  blockType?: string;
  /**
   * The page this issue belongs to (Phase 11b multi-page), as a string for the
   * same reason `SiteSnapshot.pageId` is one.
   *
   * Emitted for exactly the reason `slot` is: the review sheet groups by page, and
   * the alternative is parsing it back out of `field` — which is silently wrong
   * the first time a page id contains something the grammar did not anticipate.
   */
  pageId?: string;
}
