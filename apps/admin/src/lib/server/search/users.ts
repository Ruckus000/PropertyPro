/**
 * Command-palette searcher over `users` — the "People" group.
 *
 * The `users` table is not tenant-scoped and is readable by the service role;
 * it exposes only name and email to a platform admin who can already see both.
 *
 * Soft-deleted users are excluded (`.is('deleted_at', null)`), by deliberate
 * choice rather than by omission: a palette result that navigates to
 * `/clients?q=<email>` for a deleted user is a dead end, and excluding matches
 * the `communities` searcher for consistency. This does trade away the one
 * case where a deleted user is exactly who an operator wants — investigating a
 * deletion request needs to find that person by name or email — but that flow
 * goes through the deletion-requests list, not this palette, so it does not
 * need this searcher to surface soft-deleted rows.
 */
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import type { Searcher } from '../search';

export const userSearcher: Searcher = {
  key: 'people',
  label: 'People',
  async search(q, limit) {
    const db = createAdminTypedClient();
    // PostgREST `or` filter; `%` is the LIKE wildcard, the term is escaped of `,` and `%` below.
    const term = q.replace(/[%,()]/g, ' ').trim();
    const { data, error } = await db
      .from('users')
      .select('id, email, full_name')
      .is('deleted_at', null)
      .or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
      .limit(limit);
    if (error) throw new Error(`user search: ${error.message}`);
    return (data ?? []).map((u) => ({
      id: `user-${u.id}`,
      label: u.full_name,
      meta: u.email,
      href: `/clients?q=${encodeURIComponent(u.email)}`,
      icon: 'user' as const,
    }));
  },
};
