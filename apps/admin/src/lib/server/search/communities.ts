/**
 * Command-palette searcher over `communities` — the "Clients" group.
 *
 * Soft-deleted communities are excluded (`.is('deleted_at', null)`): a palette
 * result that navigates to a deleted client's page is worse than no result at
 * all, and this keeps the searcher consistent with the `users` searcher, which
 * excludes soft-deleted rows for the same reason (see `users.ts`).
 */
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import type { Searcher } from '../search';
import { COMMUNITY_TYPE_LABELS } from '@/lib/constants/community-labels';

export const communitySearcher: Searcher = {
  key: 'clients',
  label: 'Clients',
  async search(q, limit) {
    const db = createAdminTypedClient();
    // `q` arrives already sanitized by `searchAdmin` — see `Searcher.search`'s
    // docblock in `../search.ts`. Do not sanitize again here.
    const { data, error } = await db
      .from('communities')
      .select('id, name, slug, community_type')
      .is('deleted_at', null)
      .or(`name.ilike.%${q}%,slug.ilike.%${q}%`)
      .limit(limit);
    if (error) throw new Error(`community search: ${error.message}`);
    return (data ?? []).map((c) => ({
      id: `community-${c.id}`,
      label: c.name,
      meta: COMMUNITY_TYPE_LABELS[c.community_type]?.label ?? c.community_type,
      href: `/clients/${c.id}`,
      icon: 'building' as const,
    }));
  },
};
