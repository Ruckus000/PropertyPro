/**
 * Build-time switch for the top tab navigation (D23). Off by default everywhere.
 *
 * A module of its own so a page that needs the flag (the Directory's split view)
 * can read it without importing the client shell. Inlined at build time (next.config.ts
 * always defines it): changing it takes a rebuild. The shell does NOT read this
 * constant: it repeats the env check inline at each `next/dynamic` site, because an
 * imported constant does not fold across modules and the flag-off build must drop
 * those imports.
 *
 * ponytail: two desktop navs while the flag exists. Trigger: the flag is on in production; the flip PR removes the off branch and the flag.
 */
export const TOP_NAV_ENABLED = process.env.NEXT_PUBLIC_TOP_NAV_ENABLED === 'true';
