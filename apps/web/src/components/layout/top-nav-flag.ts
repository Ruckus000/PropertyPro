/**
 * Build-time switch for the top tab navigation (D23). Off by default everywhere.
 *
 * A module of its own so a page that needs the flag (the Directory's split view)
 * can read it without importing the client shell. Inlined by Next at build time,
 * like NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED: changing it takes a rebuild.
 *
 * ponytail: two desktop navs while the flag exists. Trigger: the flag is on in production; the flip PR removes the off branch and the flag.
 */
export const TOP_NAV_ENABLED = process.env.NEXT_PUBLIC_TOP_NAV_ENABLED === 'true';
