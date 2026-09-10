/**
 * Shared sanitizer for the command-palette DB searchers (`communities.ts`,
 * `threads.ts`, `users.ts`), each of which interpolates a user-typed term
 * into a PostgREST `.or('col.ilike.%<term>%,...')` filter string.
 *
 * This is character-STRIPPING, not escaping: a stripped character is
 * replaced with a space, not backslash-escaped, so `john_doe` becomes the
 * search `"john doe"` rather than a literal-underscore search. Three
 * characters this strips beyond PostgREST's own `,`/`(`/`)` filter-list
 * delimiters:
 *
 * - `%` — Postgres ILIKE's multi-character wildcard.
 * - `_` — Postgres ILIKE's single-character wildcard. Left unstripped, a
 *   query for `john_doe` would also match `johnXdoe`, silently returning
 *   rows the literal term never asked for.
 * - `*` — PostgREST maps `*` to `%` unconditionally for `like`/`ilike`
 *   filters (with no way to escape it), so an unstripped `*` is just `%`
 *   under a different spelling — the same multi-character wildcard this
 *   function exists to remove.
 *
 * Returns `''` when the input is nothing but stripped characters (e.g.
 * `"%%"`, `"()"`, `",,"`). Callers must never build an `ilike` pattern from
 * an empty term — `%<empty>%` is just `%%`, which matches every row up to
 * the query's limit. `searchAdmin` in `../search.ts` gates on this centrally
 * so no searcher is ever invoked with such a term; see its docblock.
 */
/**
 * A search term that has been through `sanitizeSearchTerm`.
 *
 * This is a branded type, not an alias: `Searcher.search` requires one, so a
 * searcher CANNOT be called with a raw string. That turns the "sanitize once,
 * centrally" rule from a docblock a future author may skip into a compile
 * error — which matters because `search.ts` invites exactly that author
 * ("Wave 3 appends `ticketSearcher` here — one import + one array entry"),
 * and the filter it would build reaches a PostgREST `.or()` that takes a
 * comma-separated string with no structural escaping.
 *
 * Searcher IMPLEMENTATIONS may still declare their parameter as `string` —
 * the constraint is on callers, which is where the mistake happens.
 */
export type SanitizedTerm = string & { readonly __sanitizedSearchTerm: unique symbol };

export function sanitizeSearchTerm(raw: string): SanitizedTerm {
  return raw.replace(/[%_,()*]/g, ' ').trim() as SanitizedTerm;
}
