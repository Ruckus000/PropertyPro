/**
 * Frontmatter validation patterns shared by every authored-content corpus.
 *
 * Two corpora use these today — help articles (`src/content/help`, role-gated
 * and behind auth) and marketing resources (`src/content/resources`, public).
 * They are single-sourced here because `STATUTE_REGEX` in particular encodes a
 * domain rule from `.claude/rules/florida-compliance.md`; two copies would
 * quietly disagree about what a valid citation looks like.
 */

/** Leading `YYYY-MM-DD`. Deliberately a prefix match so full ISO timestamps pass. */
export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}/;

/** Lowercase kebab-case, e.g. `welcome-to-propertypro`. */
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Florida statute references (`§718.111(12)(g)`) and bill references
 * (`HB 1203`, `SB 4-D`). Both forms appear in real frontmatter and are
 * documented in `.claude/rules/florida-compliance.md`.
 */
export const STATUTE_REGEX = /^(§\d+\.\d+|(?:HB|SB)\s*\d+)/;
