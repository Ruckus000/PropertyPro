/**
 * Row caps for admin list endpoints.
 *
 * ## Why a cap and not cursor pagination
 *
 * Fifteen admin GET handlers returned whole tables with no `limit`. The console
 * is a single-operator tool with no paging UI, and every one of these lists is
 * scoped to something naturally small (one community's members, one community's
 * access plans, the starter packs for one community type). A cursor contract
 * across all of them would be a large change for a case the UI cannot express.
 *
 * A hard cap fixes the actual risk — one request materialising an unbounded
 * result set — without inventing an API the client does not consume. The number
 * is set well above any plausible real value, so hitting it means something is
 * wrong, and `wasTruncated` lets the caller say so rather than quietly showing
 * a short list.
 *
 * If a surface genuinely outgrows its cap, that is the signal to give *that*
 * endpoint a real cursor, not to raise the number.
 */

/** Per-community lists: members, access plans, deletion requests. */
export const COMMUNITY_LIST_LIMIT = 1000;

/** Platform-wide lists: demos, starter packs, layouts, theme presets, rootless report. */
export const PLATFORM_LIST_LIMIT = 500;

/**
 * True when a result came back exactly at its cap, i.e. there may be more rows
 * that were not returned.
 *
 * Deliberately `>=` rather than `===`: a caller that post-filters could arrive
 * with fewer rows than the cap it requested, and reporting "complete" in that
 * case would be a lie in the one direction that matters.
 */
export function wasTruncated(rowCount: number, limit: number): boolean {
  return rowCount >= limit;
}
