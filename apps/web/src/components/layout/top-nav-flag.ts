/**
 * Build-time switch for the top tab navigation (D23). OFF by default: the desktop rail is
 * the navigation, and only the exact value 'true' turns the tabs on in its place.
 *
 * A module of its own so a page that needs the flag (the Directory's split view)
 * can read it without importing the client shell. Inlined at build time (next.config.ts
 * always defines it): changing it takes a rebuild. The shell does NOT read this
 * constant: it repeats the env check inline at each `next/dynamic` site, because an
 * imported constant does not fold across modules and the default build must drop
 * those imports.
 *
 * ponytail: two desktop navs while the opt-in exists. Trigger: two weeks on production with
 * the rail as the default and no ask to bring the tabs back; then delete the flag, the tab
 * row (top-nav*.tsx, use-nav-badges.ts's tab consumers) and the DesktopNavSlot branch in
 * app-shell.tsx.
 */
export const TOP_NAV_ENABLED = process.env.NEXT_PUBLIC_TOP_NAV_ENABLED === 'true';
