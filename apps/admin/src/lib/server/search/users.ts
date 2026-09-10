/**
 * Command-palette searcher over `users` — the "People" group.
 *
 * The `users` table is not tenant-scoped and is readable by the service role;
 * it exposes only name and email to a platform admin who can already see both.
 *
 * Soft-deleted users are excluded (`.is('deleted_at', null)`), by deliberate
 * choice rather than by omission: a palette result that navigates to a dead
 * end for a deleted user is worse than no result, and excluding matches the
 * `communities` searcher for consistency. This does trade away the one case
 * where a deleted user is exactly who an operator wants — investigating a
 * deletion request needs to find that person by name or email — but that flow
 * goes through the deletion-requests list, not this palette, so it does not
 * need this searcher to surface soft-deleted rows.
 *
 * The hit links to `/clients/{communityId}?tab=members` — the Members tab of
 * the user's community workspace, resolved via `resolveMemberDestinations`
 * below. It used to link to `/clients?q=<email>` — that put a raw email
 * address in the URL (a PII sink: Vercel access logs, browser history, and
 * Sentry's client-side navigation breadcrumbs, none of which redact a bare
 * `q=<email>` param) for a destination that matched nothing besides, since
 * the clients grid filters community *names*. It was parked on `/clients`
 * because the Members tab did not exist yet and tabs were not deep-linkable
 * — both are now true (task 17a's `?tab=` reader) and task 17b's Members
 * panel is this searcher's real destination.
 */
import { createAdminClient, createAdminTypedClient } from '@propertypro/db/supabase/admin';
import type { Searcher } from '../search';

/**
 * Resolves each matched user id to the community whose Members tab the
 * palette hit should open, via the untyped admin client.
 *
 * `user_roles` is deliberately absent from the hand-maintained `AdminDatabase`
 * shim (`packages/db/src/supabase/admin-types.ts`) — every table there has a
 * uniform `Relationships: []`, so there is no typed embed to build a
 * `users(...)`-style nested select against. `(console)/clients/[id]/page.tsx`
 * already reaches `user_roles` the same way, via the untyped
 * `createAdminClient()`, rather than extending the shim.
 *
 * Tiebreak for a user who belongs to more than one community (a multi-community
 * PM or unit owner): link to the community from their MOST RECENTLY CREATED
 * `user_roles` row (`id desc` — `id` is a monotonic `bigserial`, so ordering by
 * it is stable under concurrent inserts, unlike ordering communities by NAME,
 * which silently reorders whenever a community is seeded or renamed — see the
 * `?as=` role table's "lands in without a pin" trap documented in
 * `.claude/rules/agent-testing.md`, which is exactly that footgun). Newest
 * membership best matches an operator's likely intent when searching for a
 * person by name from the palette: "where is this person NOW", which skews
 * toward a recent addition rather than an alphabetically arbitrary community
 * that may be years stale for them.
 *
 * A user with no `user_roles` row (e.g. invited but never accepted) resolves
 * to `undefined`; the caller falls back to the PII-free `/clients` link
 * rather than a broken deep link.
 */
async function resolveMemberDestinations(userIds: string[]): Promise<Map<string, number>> {
  const destinations = new Map<string, number>();
  if (userIds.length === 0) return destinations;

  const db = createAdminClient();
  const { data, error } = await db
    .from('user_roles')
    .select('user_id, community_id')
    .in('user_id', userIds)
    .order('id', { ascending: false });
  if (error) throw new Error(`user search: member lookup: ${error.message}`);

  // Rows arrive newest-first (`id desc`); keep only the first row seen per
  // user — i.e. their most recently created membership.
  for (const row of (data ?? []) as Array<{ user_id: string; community_id: number }>) {
    if (!destinations.has(row.user_id)) {
      destinations.set(row.user_id, row.community_id);
    }
  }
  return destinations;
}

export const userSearcher: Searcher = {
  key: 'people',
  label: 'People',
  async search(q, limit) {
    const db = createAdminTypedClient();
    // `q` arrives already sanitized by `searchAdmin` — see `Searcher.search`'s
    // docblock in `../search.ts`. Do not sanitize again here.
    const { data, error } = await db
      .from('users')
      .select('id, email, full_name')
      .is('deleted_at', null)
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(limit);
    if (error) throw new Error(`user search: ${error.message}`);

    const users = data ?? [];
    const destinations = await resolveMemberDestinations(users.map((u) => u.id));

    return users.map((u) => {
      const communityId = destinations.get(u.id);
      return {
        id: `user-${u.id}`,
        label: u.full_name,
        meta: u.email,
        href: communityId !== undefined ? `/clients/${communityId}?tab=members` : '/clients',
        icon: 'user' as const,
      };
    });
  },
};
