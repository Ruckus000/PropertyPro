/**
 * Escape `\`, `%` and `_` so a LIKE/ILIKE pattern matches the text literally.
 * Backslash is Postgres' default LIKE escape character, so no ESCAPE clause is
 * needed. The pattern must still go through a bound parameter (drizzle's
 * `ilike`), never be spliced into SQL text.
 *
 * packages/db's copy of apps/web's `escapeLikePattern` (lib/utils/escape-like.ts),
 * which this package cannot import.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
