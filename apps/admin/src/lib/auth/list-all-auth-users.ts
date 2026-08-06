/**
 * Page through the whole Supabase auth user list.
 *
 * ## Why this exists
 *
 * `auth.admin.listUsers()` with no arguments returns **the first page only** —
 * 50 users by default — and reports no error and no truncation flag. Four admin
 * call sites relied on it to build an id → email map:
 *
 * - the platform-admins list and its add-admin duplicate check
 * - the community members list
 * - the settings page's admin roster
 *
 * Past user 50 the map simply had no entry, so the UI rendered `'unknown'` for
 * a real, present admin — and the add-admin duplicate check could not see an
 * existing user, so it would attempt an insert that the unique constraint then
 * rejected with an opaque error. That is a correctness bug today, not a scale
 * concern for later: production already holds ~1,660 users.
 *
 * ## Bound
 *
 * Pages until a short page comes back, capped by `maxPages`. The cap is a
 * runaway guard, not a policy: at the default 200/page it covers 20,000 users.
 * If it is ever hit, that is logged rather than silently truncated — the whole
 * point of this helper is that silent truncation is what went wrong.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';

const PER_PAGE = 200;
const MAX_PAGES = 100;

/* eslint-disable @typescript-eslint/no-explicit-any */
type AdminAuthClient = Pick<SupabaseClient<any, any, any>, 'auth'>;
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function listAllAuthUsers(
  db: AdminAuthClient,
  { perPage = PER_PAGE, maxPages = MAX_PAGES }: { perPage?: number; maxPages?: number } = {},
): Promise<User[]> {
  const users: User[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Failed to list auth users (page ${page}): ${error.message}`);
    }

    const batch = data?.users ?? [];
    users.push(...batch);

    // A short page is the end of the list. Supabase reports no total, so this
    // is the only termination signal available.
    if (batch.length < perPage) return users;

    if (page === maxPages) {
      console.error(
        `[admin] listAllAuthUsers hit the ${maxPages}-page cap (${users.length} users); ` +
          'the result is truncated. Raise maxPages or add a server-side filter.',
      );
    }
  }

  return users;
}

/**
 * id → user map. Callers need more than the email (the members list also reads
 * `last_sign_in_at`), so this keeps the whole record.
 */
export async function buildAuthUserMap(
  db: AdminAuthClient,
  options?: { perPage?: number; maxPages?: number },
): Promise<Map<string, User>> {
  const users = await listAllAuthUsers(db, options);
  return new Map(users.map((user) => [user.id, user]));
}
