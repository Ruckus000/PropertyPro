/**
 * Onboarding audit F2 — a resident import row is all or nothing.
 *
 * Against a real Postgres: a statement that fails part-way through one row
 * (forced with a temporary trigger) must leave NOTHING of that row — no
 * platform `users` row, no membership, no notification preferences, no audit
 * entry — while the rows around it import completely, each with its audit
 * entry. Then the same file, re-checked, shows exactly what is left.
 *
 * Before F2 the row's writes were separate statements and every audit entry
 * was written after the whole file, so the failing row left an orphan `users`
 * row and a request that died part-way left imported residents unaudited.
 */
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, inArray, sql } from '@propertypro/db/filters';
import {
  getDescribeDb,
  initTestKit,
  requireDatabaseUrlInCI,
  setActorById,
  teardownTestKit,
  trackCommunityForCleanup,
  trackUserForCleanup,
  type TestKitState,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('import-residents-atomicity');
const describeDb = getDescribeDb();

/**
 * This file creates triggers; never against anything but a local database.
 * No CI exemption: CI's own DATABASE_URL is localhost too, and an exemption
 * keyed on a `CI` variable would let `CI=1` plus a production URL through.
 */
function assertLoopbackDatabaseOrCI(): void {
  let host: string;
  try {
    host = new URL(process.env.DATABASE_URL ?? '').hostname;
  } catch {
    throw new Error('import-residents-atomicity: DATABASE_URL is not a parseable URL; refusing to run');
  }
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    throw new Error(
      `import-residents-atomicity: refusing to run against non-local database host '${host}'. `
        + 'It creates triggers; use pnpm test:integration:local.',
    );
  }
}

// Own prefix: provisioning-idempotency sweeps `pp_test_fault_%`, and files run
// in parallel, so sharing it could drop a trigger this file is still using.
const FAULT_PREFIX = 'pp_test_rowfault_';

type ImportJson = {
  data: {
    importedCount: number;
    skippedCount: number;
    errors: Array<{ rowNumber: number; column: string | null; message: string }>;
  };
};
type PreviewJson = {
  data: {
    preview: Array<{ email: string; rowNumber: number }>;
    errors: Array<{ rowNumber: number; message: string }>;
  };
};

describeDb('resident import rows are atomic (integration, audit F2)', () => {
  let state: TestKitState;
  let communityId = 0;
  let POST: (req: NextRequest) => Promise<Response>;
  const manager = randomUUID();
  let seq = 0;

  const call = async <T,>(csv: string, dryRun: boolean): Promise<T> => {
    const res = await POST(
      new NextRequest('http://localhost:3000/api/v1/import-residents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, csv, dryRun }),
      }),
    );
    expect(res.status).toBe(200);
    return (await res.json()) as T;
  };

  const email = (tag: string) => `atom-${tag}+${state.runSuffix}@example.com`;
  const csvOf = (...tags: string[]) =>
    ['name,email,role,unit_number', ...tags.map((t) => `Resident ${t},${email(t)},owner,101`)].join('\n');

  /** Everything a row writes, for one email. */
  async function footprint(tag: string) {
    const m = state.dbModule;
    const [user] = await state.db.select({ id: m.users.id }).from(m.users).where(eq(m.users.email, email(tag)));
    if (!user) return { user: false, role: 0, prefs: 0, audit: 0 };
    trackUserForCleanup(state, user.id);
    const role = await state.db
      .select({ id: m.userRoles.id })
      .from(m.userRoles)
      .where(and(eq(m.userRoles.communityId, communityId), eq(m.userRoles.userId, user.id)));
    const prefs = await state.db
      .select({ id: m.notificationPreferences.id })
      .from(m.notificationPreferences)
      .where(and(eq(m.notificationPreferences.communityId, communityId), eq(m.notificationPreferences.userId, user.id)));
    const audit = await state.db
      .select({ id: m.complianceAuditLog.id })
      .from(m.complianceAuditLog)
      .where(
        and(
          eq(m.complianceAuditLog.communityId, communityId),
          eq(m.complianceAuditLog.action, 'user_invited'),
          eq(m.complianceAuditLog.resourceId, user.id),
        ),
      );
    return { user: true, role: role.length, prefs: prefs.length, audit: audit.length };
  }

  /**
   * Run `fn` with one BEFORE INSERT trigger on `table` raising for the row
   * that `condition` (plpgsql, over NEW) matches. Dropped in `finally`.
   */
  async function withRowFault<T>(table: string, condition: string, fn: () => Promise<T>): Promise<T> {
    const name = `${FAULT_PREFIX}${state.runSuffix.replace(/[^a-z0-9]/g, '')}_${++seq}`;
    await state.db.execute(
      sql.raw(`
        CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF ${condition} THEN
            RAISE EXCEPTION 'injected fault: insert into ${table}';
          END IF;
          RETURN NEW;
        END $$;
        CREATE TRIGGER ${name} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION ${name}();
      `),
    );
    try {
      return await fn();
    } finally {
      await state.db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${name} ON ${table}; DROP FUNCTION IF EXISTS ${name}();`));
    }
  }

  /** `NEW.user_id` belongs to this email — the row's user was inserted earlier in the same transaction. */
  const userIs = (tag: string) => {
    const e = email(tag);
    if (!/^[a-z0-9+@.-]+$/.test(e)) throw new Error(`unsafe email ${e}`);
    return `NEW.user_id = (SELECT id FROM users WHERE email = '${e}')`;
  };

  beforeAll(async () => {
    assertLoopbackDatabaseOrCI();
    state = await initTestKit();
    const m = state.dbModule;

    // Leftovers from a crashed run of THIS file only.
    const triggers = (await state.db.execute(sql`
      SELECT t.tgname AS name, c.relname AS "table"
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal AND t.tgname LIKE 'pp\\_test\\_rowfault\\_%'
    `)) as unknown as Array<{ name: string; table: string }>;
    for (const t of triggers) await state.db.execute(sql.raw(`DROP TRIGGER IF EXISTS "${t.name}" ON "${t.table}"`));
    const fns = (await state.db.execute(sql`
      SELECT proname AS name FROM pg_proc WHERE proname LIKE 'pp\\_test\\_rowfault\\_%'
    `)) as unknown as Array<{ name: string }>;
    for (const f of fns) await state.db.execute(sql.raw(`DROP FUNCTION IF EXISTS "${f.name}"()`));

    const [community] = await state.db
      .insert(m.communities)
      .values({
        name: `Import atomic ${state.runSuffix}`,
        slug: `import-atomic-${randomUUID().slice(0, 8)}`,
        communityType: 'condo_718',
      })
      .returning({ id: m.communities.id });
    communityId = community!.id;
    trackCommunityForCleanup(state, communityId);

    trackUserForCleanup(state, manager);
    await state.db.insert(m.users).values({ id: manager, email: `atom-manager+${state.runSuffix}@example.com`, fullName: 'Manager' });
    const scoped = m.createScopedClient(communityId);
    await scoped.insert(m.userRoles, { userId: manager, role: 'property_manager', isUnitOwner: false, displayTitle: 'Manager' });
    await scoped.insert(m.units, { unitNumber: '101' });

    ({ POST } = await import('../../src/app/api/v1/import-residents/route'));
  });

  afterAll(async () => {
    if (!state) return;
    // Users the import created have no community_id, so the community teardown
    // does not reach them. Find them by this run's emails, so a run that fails
    // before `footprint()` sees a row still cleans it up.
    const m = state.dbModule;
    const created = await state.db
      .select({ id: m.users.id })
      .from(m.users)
      .where(sql`${m.users.email} like ${`atom-%+${state.runSuffix}@example.com`}`);
    for (const u of created) trackUserForCleanup(state, u.id);
    await teardownTestKit(state);
  });

  beforeEach(() => {
    setActorById(state, manager);
  });

  it('a failure inside one row leaves nothing of it, and the rows around it import whole', async () => {
    // Lines 2, 3, 4. Line 3's notification-preferences insert fails — the third
    // of its four writes, after its users row and membership already went in.
    const csv = csvOf('a', 'b', 'c');

    const result = await withRowFault('notification_preferences', userIs('b'), () => call<ImportJson>(csv, false));

    expect(result.data.importedCount).toBe(2);
    expect(result.data.skippedCount).toBe(1);
    expect(result.data.errors).toEqual([
      {
        rowNumber: 3,
        column: null,
        message: "We couldn't import this row, and nothing was saved for it. Please try it again.",
      },
    ]);

    expect(await footprint('a')).toEqual({ user: true, role: 1, prefs: 1, audit: 1 });
    expect(await footprint('c')).toEqual({ user: true, role: 1, prefs: 1, audit: 1 });
    // The failing row: not even the platform users row it inserted first.
    expect(await footprint('b')).toEqual({ user: false, role: 0, prefs: 0, audit: 0 });

    // The same file, checked again: the saved rows are members, the failed one is ready.
    const again = await call<PreviewJson>(csv, true);
    expect(again.data.preview.map((r) => [r.rowNumber, r.email])).toEqual([[3, email('b')]]);
    expect(again.data.errors.map((e) => e.rowNumber)).toEqual([2, 4]);

    // …and importing it again finishes the job.
    const finish = await call<ImportJson>(csv, false);
    expect(finish.data.importedCount).toBe(1);
    expect(await footprint('b')).toEqual({ user: true, role: 1, prefs: 1, audit: 1 });
  });

  it("the audit entry is part of the row: if it can't be written, the row is not imported", async () => {
    const csv = csvOf('d', 'e');
    const eEmail = email('e');
    if (!/^[a-z0-9+@.-]+$/.test(eEmail)) throw new Error(`unsafe email ${eEmail}`);

    const result = await withRowFault(
      'compliance_audit_log',
      `NEW.new_values->>'email' = '${eEmail}'`,
      () => call<ImportJson>(csv, false),
    );

    expect(result.data.importedCount).toBe(1);
    expect(result.data.errors.map((e) => e.rowNumber)).toEqual([3]);
    expect(await footprint('d')).toEqual({ user: true, role: 1, prefs: 1, audit: 1 });
    // An unaudited import is not allowed to exist.
    expect(await footprint('e')).toEqual({ user: false, role: 0, prefs: 0, audit: 0 });
  });

  it('re-imports a removed resident: their kept preferences row does not fail the row', async () => {
    const m = state.dbModule;
    // Import, then remove them the way the app does (resident-service
    // deleteResidentRole: the membership is hard-deleted, preferences stay).
    const first = await call<ImportJson>(csvOf('g'), false);
    expect(first.data.importedCount).toBe(1);
    const [user] = await state.db.select({ id: m.users.id }).from(m.users).where(eq(m.users.email, email('g')));
    trackUserForCleanup(state, user!.id);
    await m.createScopedClient(communityId).hardDelete(m.userRoles, eq(m.userRoles.userId, user!.id));
    expect(await footprint('g')).toEqual({ user: true, role: 0, prefs: 1, audit: 1 });

    // Keep them visible to this manager through a second community the manager
    // also runs. Otherwise, belonging to no community, the attach guard asks
    // Supabase Auth whether they ever signed in — absent here, so it refuses —
    // and the re-import would never reach the preferences write under test.
    const [other] = await state.db
      .insert(m.communities)
      .values({
        name: `Import atomic g ${state.runSuffix}`,
        slug: `import-atomic-g-${randomUUID().slice(0, 8)}`,
        communityType: 'condo_718',
      })
      .returning({ id: m.communities.id });
    trackCommunityForCleanup(state, other!.id);
    const scopedOther = m.createScopedClient(other!.id);
    await scopedOther.insert(m.userRoles, { userId: manager, role: 'property_manager', isUnitOwner: false, displayTitle: 'Manager' });
    const [otherUnit] = await scopedOther.insert(m.units, { unitNumber: 'G-1' });
    await scopedOther.insert(m.userRoles, {
      userId: user!.id,
      role: 'resident',
      unitId: otherUnit!['id'] as number,
      isUnitOwner: true,
      displayTitle: 'Owner',
    });

    // Before: the plain preferences insert hit the (user, community) unique key,
    // the whole row rolled back, and every re-upload failed the same way.
    const again = await call<ImportJson>(csvOf('g'), false);

    expect(again.data.errors).toEqual([]);
    expect(again.data.importedCount).toBe(1);
    expect(await footprint('g')).toEqual({ user: true, role: 1, prefs: 1, audit: 2 });
  });

  it('attaching an existing account is atomic too: a failing row leaves no membership', async () => {
    const m = state.dbModule;
    // A resident of a second community this manager also runs, so the
    // cross-tenant attach guard ALLOWS the attach (the manager can already
    // see them). Otherwise the row would be refused by the guard and this
    // test would pass without ever reaching the write.
    const [other] = await state.db
      .insert(m.communities)
      .values({
        name: `Import atomic other ${state.runSuffix}`,
        slug: `import-atomic-o-${randomUUID().slice(0, 8)}`,
        communityType: 'condo_718',
      })
      .returning({ id: m.communities.id });
    trackCommunityForCleanup(state, other!.id);
    const returning = randomUUID();
    trackUserForCleanup(state, returning);
    await state.db.insert(m.users).values({ id: returning, email: email('f'), fullName: 'Returning' });
    const scopedOther = m.createScopedClient(other!.id);
    await scopedOther.insert(m.userRoles, { userId: manager, role: 'property_manager', isUnitOwner: false, displayTitle: 'Manager' });
    const [otherUnit] = await scopedOther.insert(m.units, { unitNumber: 'O-1' });
    await scopedOther.insert(m.userRoles, {
      userId: returning,
      role: 'resident',
      unitId: otherUnit!['id'] as number,
      isUnitOwner: true,
      displayTitle: 'Owner',
    });

    // The preview agrees it is an attachable existing account.
    const preview = await call<PreviewJson & { data: { preview: Array<{ existingAccount: boolean }> } }>(csvOf('f'), true);
    expect(preview.data.preview).toEqual([expect.objectContaining({ email: email('f'), existingAccount: true })]);

    const result = await withRowFault('notification_preferences', userIs('f'), () =>
      call<ImportJson>(csvOf('f'), false),
    );

    // Refused by the injected write failure, not by the guard.
    expect(result.data.importedCount).toBe(0);
    expect(result.data.errors).toEqual([
      {
        rowNumber: 2,
        column: null,
        message: "We couldn't import this row, and nothing was saved for it. Please try it again.",
      },
    ]);
    const roles = await state.db
      .select({ id: m.userRoles.id })
      .from(m.userRoles)
      .where(and(eq(m.userRoles.communityId, communityId), inArray(m.userRoles.userId, [returning])));
    expect(roles).toHaveLength(0);
    // The account and its other membership are untouched.
    const [still] = await state.db.select({ id: m.users.id }).from(m.users).where(eq(m.users.id, returning));
    expect(still?.id).toBe(returning);
    const otherRoles = await state.db
      .select({ id: m.userRoles.id })
      .from(m.userRoles)
      .where(and(eq(m.userRoles.communityId, other!.id), eq(m.userRoles.userId, returning)));
    expect(otherRoles).toHaveLength(1);
  });
});

describe('import-residents-atomicity guard', () => {
  it('this file refuses a non-local DATABASE_URL outside CI', () => {
    const prev = { url: process.env.DATABASE_URL, ci: process.env.CI };
    try {
      delete process.env.CI;
      process.env.DATABASE_URL = 'postgres://u:p@db.example.com:5432/x';
      expect(assertLoopbackDatabaseOrCI).toThrow(/refusing to run/);
    } finally {
      process.env.DATABASE_URL = prev.url;
      if (prev.ci === undefined) delete process.env.CI;
      else process.env.CI = prev.ci;
    }
  });
});
