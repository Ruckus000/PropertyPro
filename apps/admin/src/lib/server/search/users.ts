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
 * The hit links to `/clients` with no query string. It used to link to
 * `/clients?q=<email>` — that put a raw email address in the URL (a PII sink:
 * Vercel access logs, browser history, and Sentry's client-side navigation
 * breadcrumbs, none of which redact a bare `q=<email>` param) for a
 * destination nothing reads besides. The natural fix is a same-query nested
 * select (`user_roles(community_id)`) to link straight to the user's
 * community, but that is not expressible against `createAdminTypedClient()`'s
 * schema today: `AdminDatabase` (`packages/db/src/supabase/admin-types.ts`)
 * is a hand-maintained shim with no `user_roles` entry and `Relationships: []`
 * on every table by design, so there is no typed embed to build against, and
 * this task's constraints forbid reaching a database to verify one
 * empirically. `/clients` is the documented fallback: no PII, and a landing
 * page that exists and works, rather than a guaranteed-empty destination.
 */
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import type { Searcher } from '../search';

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
    return (data ?? []).map((u) => ({
      id: `user-${u.id}`,
      label: u.full_name,
      meta: u.email,
      href: '/clients',
      icon: 'user' as const,
    }));
  },
};
