/**
 * Command-palette searcher over `communities` — the "Clients" group.
 *
 * Soft-deleted communities are excluded (`.is('deleted_at', null)`): their
 * workspace really is gone — `(console)/clients/[id]/page.tsx` filters
 * `deleted_at` and calls `notFound()` — so a hit there is a guaranteed dead end,
 * which is worse than no hit. The `users` searcher excludes them for the same
 * reason.
 *
 * Demo instances are deliberately INCLUDED, and labelled instead.
 *
 * An earlier revision of this file excluded them, reasoning that every other
 * site meaning "real community" filters `is_demo` and that a demo's workspace
 * 404s. Half of that was wrong, and the half that was right does not justify
 * hiding the row:
 *
 *  - The workspace does NOT 404. `clients/[id]/page.tsx` selects `is_demo` and
 *    never gates on it, so the page renders. Only the Compliance TAB fails —
 *    `/api/admin/communities/[id]/compliance` returns 404 for a demo. One broken
 *    tab is not a dead end.
 *  - The palette is a global navigator, not the Clients grid. The grid excludes
 *    demos because Demos is a separate LIST; there is no demo searcher, so
 *    excluding them here made demo communities unreachable by search entirely.
 *  - In every seeded environment — CI, and every developer's machine — `seed:demo`
 *    marks all three communities `isDemo: true`, and `scripts/lib/seed-safety.ts`
 *    treats a non-demo seeded row as a danger signal. So the exclusion left the
 *    "Clients" group permanently empty everywhere except production, and it broke
 *    `admin-shell.spec.ts`'s "⌘K finds a seeded community", which pins the
 *    intended behaviour.
 *
 * The real concern behind that revision — an operator mistaking a demo for a
 * paying client — is addressed by putting "Demo" in the hit's `meta` line, which
 * costs one column in the select and keeps the row reachable.
 */
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import type { Searcher } from '../search';
import { COMMUNITY_TYPE_LABELS } from '@/lib/constants/community-labels';

function communityTypeLabel(type: string): string {
  return COMMUNITY_TYPE_LABELS[type as keyof typeof COMMUNITY_TYPE_LABELS]?.label ?? type;
}

export const communitySearcher: Searcher = {
  key: 'clients',
  label: 'Clients',
  async search(q, limit) {
    const db = createAdminTypedClient();
    // `q` arrives already sanitized by `searchAdmin` — see `Searcher.search`'s
    // docblock in `../search.ts`. Do not sanitize again here.
    const { data, error } = await db
      .from('communities')
      // admin-community-scope:exempt — the palette is a global navigator, not the Clients grid: a demo's workspace renders, so it is labelled (see `meta` below) rather than hidden. `deleted_at` stays because that destination really 404s.
      .select('id, name, slug, community_type, is_demo')
      .is('deleted_at', null)
      .or(`name.ilike.%${q}%,slug.ilike.%${q}%`)
      .limit(limit);
    if (error) throw new Error(`community search: ${error.message}`);
    return (data ?? []).map((c) => ({
      id: `community-${c.id}`,
      label: c.name,
      meta: c.is_demo ? `Demo · ${communityTypeLabel(c.community_type)}` : communityTypeLabel(c.community_type),
      href: `/clients/${c.id}`,
      icon: 'building' as const,
    }));
  },
};
