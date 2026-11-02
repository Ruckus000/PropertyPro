/**
 * Build-time switch for the top tab navigation (D23). ON by default: only the exact
 * value 'false' turns the tabs off and brings the desktop rail back (a kill switch).
 *
 * A module of its own so a page that needs the flag (the Directory's split view)
 * can read it without importing the client shell. Inlined at build time (next.config.ts
 * always defines it): changing it takes a rebuild. The shell does NOT read this
 * constant: it repeats the env check inline at each `next/dynamic` site, because an
 * imported constant does not fold across modules and the flag-off build must drop
 * those imports.
 *
 * ponytail: two desktop navs while the kill switch exists. Trigger: two weeks on production with
 * the tabs on and no rollback to 'false' (or any ask to roll back); then delete the flag, the
 * rail branch in app-shell.tsx and its duplicated AppSidebar JSX.
 */
export const TOP_NAV_ENABLED = process.env.NEXT_PUBLIC_TOP_NAV_ENABLED !== 'false';
