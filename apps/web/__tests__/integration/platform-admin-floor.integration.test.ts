/**
 * Migration 0056 — `platform_admin_users` must never reach zero rows.
 *
 * Granting platform admin requires an admin session, so an empty table is an
 * unrecoverable lockout whose only remedy is manual SQL against production.
 *
 * The application floor in `apps/admin/.../platform-admins/[userId]/route.ts`
 * counts and then deletes in two statements. apps/admin reaches Postgres
 * through PostgREST, where each call is its own transaction, so it cannot span
 * them — two admins removing each other concurrently both read one remaining
 * and both deletes land. The `pp_enforce_platform_admin_floor` BEFORE DELETE
 * trigger is what actually closes that, by taking a transaction-scoped advisory
 * lock BEFORE counting.
 *
 * THIS FILE IS THE ONLY THING THAT PROVES ANY OF THAT. The admin unit tests
 * mock PostgREST and never reach a database, so they would stay green if the
 * advisory lock were deleted, if the count reverted to `count(*) - 1`, or if
 * the trigger were dropped entirely. Specifically pinned here:
 *
 *   1. the race — the second transaction, unblocked after the first commits,
 *      sees the committed delete and refuses;
 *   2. a multi-row `DELETE FROM` aborts (this is what `count(*) - 1` would let
 *      through, since each row's BEFORE trigger still sees the rows the
 *      statement has yet to remove);
 *   3. the guard does not over-block a legitimate removal.
 */
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeEach, expect, it, describe } from 'vitest';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const TRIGGER = 'pp_enforce_platform_admin_floor';
/** Postgres check_violation — what the trigger raises. */
const FLOOR_ERRCODE = '23514';

describeDb('platform_admin_users floor trigger (0056)', () => {
  const url = process.env.DATABASE_URL!;
  // Separate connections, because the whole point is two concurrent
  // transactions. A single pooled client would serialise them and prove nothing.
  const setup = postgres(url, { max: 1 });
  const c1 = postgres(url, { max: 1 });
  const c2 = postgres(url, { max: 1 });

  const adminA = randomUUID();
  const adminB = randomUUID();

  afterAll(async () => {
    await setup.unsafe(`ALTER TABLE platform_admin_users DISABLE TRIGGER ${TRIGGER}`);
    await setup`DELETE FROM platform_admin_users`;
    await setup.unsafe(`ALTER TABLE platform_admin_users ENABLE TRIGGER ${TRIGGER}`);
    await Promise.all([setup.end(), c1.end(), c2.end()]);
  });

  /**
   * Clears the table and installs exactly two admins.
   *
   * It clears ALL rows, not just the two fixtures, because the trigger counts
   * the whole table — leaving a stray third admin behind would make the
   * last-one-refused assertions silently pass for the wrong reason. Safe here:
   * `pnpm seed:demo` deliberately leaves this table at zero rows, so a test
   * database has no real admins to lose.
   *
   * The trigger is disabled for the reset only (it would otherwise refuse to
   * empty the table) — the same escape hatch the seed uses for the compliance
   * append-only guard.
   */
  async function seedTwoAdmins() {
    await setup.unsafe(`ALTER TABLE platform_admin_users DISABLE TRIGGER ${TRIGGER}`);
    await setup`DELETE FROM platform_admin_users`;
    await setup`INSERT INTO platform_admin_users (user_id, role) VALUES (${adminA}, 'super_admin'), (${adminB}, 'super_admin')`;
    await setup.unsafe(`ALTER TABLE platform_admin_users ENABLE TRIGGER ${TRIGGER}`);
  }

  async function countAdmins(): Promise<number> {
    const [row] = await setup<{ count: number }[]>`
      SELECT count(*)::int AS count FROM platform_admin_users
    `;
    return row!.count;
  }

  beforeEach(seedTwoAdmins);

  it('refuses the second of two concurrent removals', async () => {
    let secondError: { code?: string } | null = null;

    // Both transactions issue their DELETE before either commits — without
    // that overlap this test would pass even with the trigger removed.
    const first = (async () => {
      await c1`BEGIN`;
      await c1`DELETE FROM platform_admin_users WHERE user_id = ${adminA}`;
      // Hold the advisory lock long enough that the second is definitely
      // waiting on it rather than merely running afterwards.
      await new Promise((r) => setTimeout(r, 600));
      await c1`COMMIT`;
    })();

    const second = (async () => {
      await new Promise((r) => setTimeout(r, 150));
      await c2`BEGIN`;
      try {
        await c2`DELETE FROM platform_admin_users WHERE user_id = ${adminB}`;
        await c2`COMMIT`;
      } catch (e) {
        secondError = e as { code?: string };
        await c2`ROLLBACK`;
      }
    })();

    await Promise.all([first, second]);

    expect(secondError).not.toBeNull();
    expect(secondError!.code).toBe(FLOOR_ERRCODE);
    expect(await countAdmins()).toBe(1);
  });

  it('aborts a multi-row delete instead of emptying the table', async () => {
    await expect(
      setup`DELETE FROM platform_admin_users WHERE user_id IN (${adminA}, ${adminB})`,
    ).rejects.toMatchObject({ code: FLOOR_ERRCODE });

    expect(await countAdmins()).toBe(2);
  });

  it('still allows a legitimate removal, and refuses only the last one', async () => {
    await setup`DELETE FROM platform_admin_users WHERE user_id = ${adminA}`;
    expect(await countAdmins()).toBe(1);

    await expect(
      setup`DELETE FROM platform_admin_users WHERE user_id = ${adminB}`,
    ).rejects.toMatchObject({ code: FLOOR_ERRCODE });

    expect(await countAdmins()).toBe(1);
  });
});
