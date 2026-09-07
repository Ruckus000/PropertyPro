/**
 * Migration 0071 — a demo-seeded identity must never hold platform admin.
 *
 * CLAUDE.md has asserted this since the admin app shipped, but nothing enforced
 * it and production violated it for ~6 months: `pm.admin@sunset.local` held
 * super_admin from 2026-03-12. Every demo persona shares one
 * DEMO_DEFAULT_PASSWORD, printed in .env.example, so that single row made the
 * operator console reachable with a published credential.
 *
 * THIS FILE IS THE ONLY THING THAT PROVES THE GUARD WORKS. The admin unit tests
 * mock PostgREST and never reach a database, so they stay green if the trigger
 * is dropped, if SECURITY DEFINER is downgraded to INVOKER, or if the LIKE
 * pattern is "simplified". Specifically pinned here:
 *
 *   1. a seeded `.local` persona is refused;
 *   2. a demo-instance user is refused;
 *   3. the UPDATE arm is covered, not just INSERT;
 *   4. `e2e.platform.admin@local` is STILL ALLOWED — the dev e2e route grants
 *      it on every run and cannot reach a single admin page without it. This is
 *      the case that a broadened `%local%` pattern would break, and it would
 *      break silently, because nothing else in CI grants that identity;
 *   5. a real operator address is allowed;
 *   6. a user_id with no auth.users row is allowed, deferring to the FK.
 *
 * Cases 4-6 are controls: they must stay GREEN under the revert-check, or the
 * suite is merely globally broken rather than actually detecting the defect.
 */
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const DEMO_GUARD_TRIGGER = 'pp_reject_demo_platform_admin';
const FLOOR_TRIGGER = 'pp_enforce_platform_admin_floor';
/** Postgres check_violation — what both platform_admin_users triggers raise. */
const CHECK_VIOLATION = '23514';

describeDb('platform_admin_users demo-identity guard (0071)', () => {
  const url = process.env.DATABASE_URL!;
  const db = postgres(url, { max: 1 });

  /** Every probe identity: [uuid, email, mustBeBlocked]. */
  const seedPersona = { id: randomUUID(), email: 'guard.probe@sunset.local' };
  const demoInstance = {
    id: randomUUID(),
    email: 'demo-resident@demo-test-condo-abc123.propertyprofl.com',
  };
  const e2eAdmin = { id: randomUUID(), email: 'e2e.platform.admin@local' };
  const realOperator = { id: randomUUID(), email: 'guard.probe@getpropertypro.com' };
  /** Deliberately has NO auth.users row. */
  const orphan = { id: randomUUID(), email: null };

  const withAuthUser = [seedPersona, demoInstance, e2eAdmin, realOperator];

  async function resetTable() {
    // The floor trigger refuses to empty the table; disable it for the reset
    // only, the same escape hatch platform-admin-floor.integration.test.ts uses.
    // The guard under test is left ENABLED — disabling it here would be the
    // classic way to make this whole file vacuous.
    await db.unsafe(`ALTER TABLE platform_admin_users DISABLE TRIGGER ${FLOOR_TRIGGER}`);
    await db`DELETE FROM platform_admin_users`;
    await db.unsafe(`ALTER TABLE platform_admin_users ENABLE TRIGGER ${FLOOR_TRIGGER}`);
  }

  beforeEach(async () => {
    for (const u of withAuthUser) {
      await db`
        INSERT INTO auth.users (id, email) VALUES (${u.id}::uuid, ${u.email})
        ON CONFLICT (id) DO NOTHING
      `;
    }
    await resetTable();
  });

  afterAll(async () => {
    await resetTable();
    for (const u of withAuthUser) {
      await db`DELETE FROM auth.users WHERE id = ${u.id}::uuid`;
    }
    await db.end();
  });

  async function grant(userId: string) {
    return db`INSERT INTO platform_admin_users (user_id, role) VALUES (${userId}, 'super_admin')`;
  }

  async function isAdmin(userId: string): Promise<boolean> {
    const [row] = await db<{ n: number }[]>`
      SELECT count(*)::int AS n FROM platform_admin_users WHERE user_id = ${userId}
    `;
    return row!.n === 1;
  }

  // ---- the defect this migration exists to prevent -------------------------

  it('refuses a seeded .local persona', async () => {
    await expect(grant(seedPersona.id)).rejects.toMatchObject({ code: CHECK_VIOLATION });
    expect(await isAdmin(seedPersona.id)).toBe(false);
  });

  it('names the offending address in the error, so the cause is not guesswork', async () => {
    // The message is the whole reason an operator can act on this. A bare
    // "check_violation" would send them reading migrations.
    await expect(grant(seedPersona.id)).rejects.toMatchObject({
      message: expect.stringContaining('guard.probe@sunset.local'),
    });
  });

  it('refuses a per-instance demo user', async () => {
    await expect(grant(demoInstance.id)).rejects.toMatchObject({ code: CHECK_VIOLATION });
    expect(await isAdmin(demoInstance.id)).toBe(false);
  });

  it('refuses an UPDATE that repoints an existing grant at a demo identity', async () => {
    // INSERT-only enforcement would leave this arm wide open: grant a real
    // account, then repoint the row. The trigger is BEFORE INSERT OR UPDATE.
    await grant(realOperator.id);
    await expect(
      db`UPDATE platform_admin_users SET user_id = ${seedPersona.id} WHERE user_id = ${realOperator.id}`,
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });

    expect(await isAdmin(realOperator.id)).toBe(true);
    expect(await isAdmin(seedPersona.id)).toBe(false);
  });

  // ---- controls: these MUST stay green under the revert-check --------------

  it('CONTROL: still allows e2e.platform.admin@local (bare `local`, no dot)', async () => {
    // apps/admin/src/app/dev/agent-login/route.ts upserts this grant on every
    // local e2e run. A `%local%` pattern would block it and take out the whole
    // admin e2e suite.
    await expect(grant(e2eAdmin.id)).resolves.toBeDefined();
    expect(await isAdmin(e2eAdmin.id)).toBe(true);
  });

  it('CONTROL: allows a real operator address', async () => {
    await expect(grant(realOperator.id)).resolves.toBeDefined();
    expect(await isAdmin(realOperator.id)).toBe(true);
  });

  it('CONTROL: allows a user_id with no auth.users row, deferring to the FK', async () => {
    // Raising here would report a missing account as a demo-identity violation,
    // which is a misleading error for a genuinely different bug.
    await expect(grant(orphan.id)).resolves.toBeDefined();
    expect(await isAdmin(orphan.id)).toBe(true);
  });

  // ---- anti-vacuity --------------------------------------------------------

  it('the trigger under test is actually installed and enabled', async () => {
    // Without this, every rejection above could be produced by some unrelated
    // constraint, and every control could pass because nothing fires at all.
    const [row] = await db<{ enabled: string }[]>`
      SELECT t.tgenabled AS enabled
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      WHERE c.relname = 'platform_admin_users' AND t.tgname = ${DEMO_GUARD_TRIGGER}
    `;
    expect(row, `${DEMO_GUARD_TRIGGER} is not installed — run the migrations`).toBeDefined();
    expect(row!.enabled).toBe('O');
  });
});
