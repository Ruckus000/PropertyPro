/**
 * Legal document versioning.
 *
 * ToS §11 makes continued use acceptance of revised terms. Without a version
 * stamped alongside each acceptance we can prove WHEN a user agreed but not
 * WHAT they agreed to — which is exactly the fact in dispute if the terms are
 * ever revised and then relied on. See docs/audits/2026-08-09-legal-risk-audit.md F-18.
 *
 * ── Why this is a declared constant, not parsed from the markdown ──
 *
 * The source documents live at `apps/web/src/content/legal/*.md`. `packages/shared`
 * cannot reach into an app, and `apps/admin` would need a runtime file read to
 * display the value. So the constant is authoritative for CODE, the markdown is
 * authoritative for HUMANS, and a drift test asserts they agree — see
 * `apps/web/__tests__/legal/legal-version-drift.test.ts`. That test is the whole
 * safety mechanism here: the realistic failure is editing the markdown and
 * forgetting this file, and it catches exactly that at CI time.
 *
 * ── When you bump this ──
 *
 * 1. Update the `**Version:**` line in terms.md, privacy.md AND accessibility.md.
 * 2. Update this constant to match.
 * 3. Note the superseded version in each document's header.
 *
 * Do NOT bump for a typo fix. A new version means "the agreement changed", and
 * every bump widens the set of users whose accepted version differs from current.
 */
export const CURRENT_TERMS_VERSION = '2026-08-10.1';

/**
 * The legal documents that carry a `**Version:**` header and must stay in lockstep
 * with `CURRENT_TERMS_VERSION`. Consumed by the drift test.
 */
export const VERSIONED_LEGAL_DOCS = ['terms', 'privacy', 'accessibility'] as const;

export type VersionedLegalDoc = (typeof VERSIONED_LEGAL_DOCS)[number];
