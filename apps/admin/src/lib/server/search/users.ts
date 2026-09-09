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
import { sanitizeSearchTerm } from './sanitize';

export const userSearcher: Searcher = {
  key: 'people',
  label: 'People',
  async search(q, limit) {
    const db = createAdminTypedClient();
    // See sanitizeSearchTerm's docblock: this strips (not escapes) `_`, `%`
    // and PostgREST's `or()` delimiters before they reach the ilike filter.
    const term = sanitizeSearchTerm(q);
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
