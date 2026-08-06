/**
 * `auth.admin.listUsers()` with no arguments returns the FIRST PAGE ONLY (50 by
 * default) and reports neither an error nor a truncation flag. Four admin call
 * sites used it to build an id → email map, so past user 50 a real admin
 * rendered as 'unknown' and the add-admin duplicate check could not see an
 * existing account. Production already holds ~1,660 users.
 */
import { describe, expect, it, vi } from 'vitest';
import { buildAuthUserMap, listAllAuthUsers } from '@/lib/auth/list-all-auth-users';

/** A fake auth admin holding `total` users, served in pages. */
function fakeDb(total: number) {
  const listUsers = vi.fn(async ({ page, perPage }: { page: number; perPage: number }) => {
    const start = (page - 1) * perPage;
    return {
      data: {
        users: Array.from({ length: Math.max(0, Math.min(perPage, total - start)) }, (_, i) => ({
          id: `user-${start + i}`,
          email: `user${start + i}@example.test`,
        })),
      },
      error: null,
    };
  });
  return { db: { auth: { admin: { listUsers } } } as never, listUsers };
}

describe('listAllAuthUsers', () => {
  it('returns every user, not just the first page', async () => {
    const { db, listUsers } = fakeDb(475);

    const users = await listAllAuthUsers(db, { perPage: 200 });

    expect(users).toHaveLength(475);
    expect(users[474]!.id).toBe('user-474');
    expect(listUsers).toHaveBeenCalledTimes(3);
  });

  it('stops on the first short page rather than polling to the cap', async () => {
    const { db, listUsers } = fakeDb(10);

    await listAllAuthUsers(db, { perPage: 200 });

    expect(listUsers).toHaveBeenCalledTimes(1);
  });

  // An exact multiple of perPage is the off-by-one case: the last full page
  // looks like "there may be more", so one extra empty page is expected.
  it('handles a total that is an exact multiple of the page size', async () => {
    const { db } = fakeDb(400);

    const users = await listAllAuthUsers(db, { perPage: 200 });

    expect(users).toHaveLength(400);
  });

  it('throws instead of silently returning a partial list when a page fails', async () => {
    const db = {
      auth: {
        admin: {
          listUsers: vi.fn(async () => ({ data: null, error: { message: 'upstream 503' } })),
        },
      },
    } as never;

    await expect(listAllAuthUsers(db)).rejects.toThrow(/page 1/);
  });

  it('builds an id → user map covering users beyond the first page', async () => {
    const { db } = fakeDb(250);

    const map = await buildAuthUserMap(db, { perPage: 200 });

    expect(map.size).toBe(250);
    // The one that used to render as 'unknown'.
    expect(map.get('user-240')?.email).toBe('user240@example.test');
  });

  it('logs rather than silently truncating when the page cap is reached', async () => {
    const { db } = fakeDb(10_000);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const users = await listAllAuthUsers(db, { perPage: 100, maxPages: 2 });

    expect(users).toHaveLength(200);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('truncated'));
    spy.mockRestore();
  });
});
