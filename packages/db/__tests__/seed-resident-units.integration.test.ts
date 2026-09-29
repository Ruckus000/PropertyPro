/**
 * Every seeded resident must have a unit, and a reseed must never unlink it.
 *
 * The product rule (`UNIT_REQUIRED_ROLES`, apps/web role-validator) is that a
 * `resident` role carries a unit, and ~40 features resolve that unit through
 * `listActorUnitIds` (`user_roles.unit_id` ∪ `units.owner_user_id`). The seed
 * used to insert `unit_id = NULL` for every role and upsert with
 * `unit_id = excluded.unit_id`, so:
 *   - every admin-console sales demo's resident persona had no unit;
 *   - every apartment tenant had a lease but no role unit;
 *   - a reseed wiped any link seed-demo.ts had written afterwards.
 *
 * Pinned here, against a real Postgres:
 *   1. seedCommunity links an apartment tenant to its ACTIVE lease's unit;
 *   2. seedCommunity links a condo owner (the admin demo's `role: 'owner'`
 *      persona) to a unit it owns, setting `units.owner_user_id` too;
 *   3. managers stay unit-less (control);
 *   4. calling seedRoles again WITHOUT unitId keeps every link (the wipe
 *      regression). Revert `coalesce(excluded.unit_id, user_roles.unit_id)` to
 *      `excluded.unit_id` and case 4 goes red while 1-3 stay green.
 *
 * The seed uploads document PDFs through Supabase storage and looks up auth
 * users; those go to a small in-process HTTP double of the Supabase API (the
 * pattern from seed-community-isolation.integration.test.ts), so no module is
 * mocked. It lives here rather than in apps/web/__tests__/integration because
 * that suite's setup file replaces `createAdminClient` with a double that has
 * no `listUsers` or storage upload/list/download, which seedCommunity needs.
 *
 * Run against the local disposable DB (never prod):
 *   DATABASE_URL="$(scripts/local-test-db.sh url)" pnpm --filter @propertypro/db \
 *     exec vitest run --config vitest.integration.config.ts \
 *     __tests__/seed-resident-units.integration.test.ts
 */
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

function startSupabaseDouble(): Promise<{ server: Server; url: string; unexpected: string[] }> {
  const objects = new Map<string, Buffer>();
  const unexpected: string[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://double');
      const path = decodeURIComponent(url.pathname);
      const body = Buffer.concat(chunks);
      const json = (status: number, payload: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
      };

      if (req.method === 'GET' && path === '/auth/v1/admin/users') {
        return json(200, { users: [], aud: 'authenticated' });
      }

      const list = path.match(/^\/storage\/v1\/object\/list\/([^/]+)$/);
      if (req.method === 'POST' && list) {
        const { prefix = '', search = '' } = JSON.parse(body.toString() || '{}') as {
          prefix?: string;
          search?: string;
        };
        const names = [...objects.keys()]
          .filter((key) => key.startsWith(`${list[1]}/${prefix}${prefix ? '/' : ''}`))
          .map((key) => key.slice(key.lastIndexOf('/') + 1))
          .filter((name) => name.includes(search));
        return json(200, names.map((name) => ({ name, id: name, metadata: {} })));
      }

      const object = path.match(/^\/storage\/v1\/object\/(?:authenticated\/)?([^/]+)\/(.+)$/);
      if (object && (req.method === 'POST' || req.method === 'PUT')) {
        objects.set(`${object[1]}/${object[2]}`, body);
        return json(200, { Key: `${object[1]}/${object[2]}`, Id: randomUUID() });
      }
      if (object && req.method === 'GET' && objects.has(`${object[1]}/${object[2]}`)) {
        res.writeHead(200, { 'content-type': 'application/pdf' });
        return res.end(objects.get(`${object[1]}/${object[2]}`));
      }

      unexpected.push(`${req.method ?? '?'} ${path}`);
      return json(404, { message: 'not in the double' });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${String(port)}`, unexpected });
    });
  });
}

const describeDb = process.env.DATABASE_URL ? describe.sequential : describe.skip;

describeDb('seeded residents are linked to a unit (integration)', () => {
  const tag = randomUUID().slice(0, 8);
  const aptSlug = `demo-resunits-apt-${tag}`;
  const condoSlug = `demo-resunits-condo-${tag}`;
  const emailDomain = `${tag}@resunits.test`;
  const aptUsers = [
    { email: `pm.apt.${emailDomain}`, fullName: 'Pat Manager', role: 'property_manager' as const },
    { email: `tenant.apt.${emailDomain}`, fullName: 'Tia Tenant', role: 'tenant' as const },
  ];
  // Mirrors apps/admin/src/app/api/admin/demos/route.ts: an owner resident
  // plus a board-designated manager.
  const condoUsers = [
    { email: `owner.condo.${emailDomain}`, fullName: 'Demo Resident', role: 'owner' as const },
    { email: `board.condo.${emailDomain}`, fullName: 'Demo Board Member', role: 'property_manager' as const },
  ];

  let seed: typeof import('../src/seed/seed-community');
  let db: ReturnType<typeof import('../src/unsafe').createUnscopedClient>;
  let schema: typeof import('../src/schema');
  let filters: typeof import('../src/filters');
  let double: Awaited<ReturnType<typeof startSupabaseDouble>>;
  let apt: Awaited<ReturnType<typeof import('../src/seed/seed-community').seedCommunity>>;
  let condo: Awaited<ReturnType<typeof import('../src/seed/seed-community').seedCommunity>>;
  const savedEnv = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    pw: process.env.DEMO_DEFAULT_PASSWORD,
  };

  async function rolesOf(communityId: number) {
    const { eq } = filters;
    return db
      .select({
        userId: schema.userRoles.userId,
        role: schema.userRoles.role,
        unitId: schema.userRoles.unitId,
      })
      .from(schema.userRoles)
      .where(eq(schema.userRoles.communityId, communityId));
  }

  function userIdOf(result: typeof apt, email: string): string {
    const found = result.users.find((u) => u.email === email);
    if (!found) throw new Error(`seeded user ${email} missing`);
    return found.userId;
  }

  beforeAll(async () => {
    double = await startSupabaseDouble();
    process.env.NEXT_PUBLIC_SUPABASE_URL = double.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'resident-units-test-service-role';
    process.env.DEMO_DEFAULT_PASSWORD ??= 'resident-units-test-password';
    seed = await import('../src/seed/seed-community');
    schema = await import('../src/schema');
    filters = await import('../src/filters');
    db = (await import('../src/unsafe')).createUnscopedClient();

    apt = await seed.seedCommunity(
      { name: 'Resident Units Apartments', slug: aptSlug, communityType: 'apartment', isDemo: true },
      aptUsers,
      { syncAuthUsers: false },
    );
    condo = await seed.seedCommunity(
      { name: 'Resident Units Condo', slug: condoSlug, communityType: 'condo_718', isDemo: true },
      condoUsers,
      { syncAuthUsers: false },
    );
  }, 300_000);

  afterAll(async () => {
    const { inArray, like } = filters;
    const rows = await db
      .select({ id: schema.communities.id })
      .from(schema.communities)
      .where(inArray(schema.communities.slug, [aptSlug, condoSlug]));
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      await db.delete(schema.demoSeedRegistry).where(inArray(schema.demoSeedRegistry.communityId, ids));
      await db.delete(schema.communities).where(inArray(schema.communities.id, ids));
    }
    await db.delete(schema.users).where(like(schema.users.email, `%.${emailDomain}`));
    await new Promise((resolve) => double.server.close(resolve));
    for (const [name, value] of [
      ['NEXT_PUBLIC_SUPABASE_URL', savedEnv.url],
      ['SUPABASE_SERVICE_ROLE_KEY', savedEnv.key],
      ['DEMO_DEFAULT_PASSWORD', savedEnv.pw],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }, 120_000);

  it("links the apartment tenant to its active lease's unit", async () => {
    const { and, eq } = filters;
    const tenantId = userIdOf(apt, `tenant.apt.${emailDomain}`);
    const activeLeases = await db
      .select({ unitId: schema.leases.unitId })
      .from(schema.leases)
      .where(
        and(
          eq(schema.leases.communityId, apt.communityId),
          eq(schema.leases.residentId, tenantId),
          eq(schema.leases.status, 'active'),
        ),
      );
    expect(activeLeases.length).toBeGreaterThan(0);

    const tenantRole = (await rolesOf(apt.communityId)).find((r) => r.userId === tenantId);
    expect(tenantRole?.role).toBe('resident');
    expect(tenantRole?.unitId).not.toBeNull();
    expect(activeLeases.map((l) => l.unitId)).toContain(tenantRole?.unitId);
  }, 60_000);

  it('links the condo owner persona to a unit it owns', async () => {
    const { eq } = filters;
    const ownerId = userIdOf(condo, `owner.condo.${emailDomain}`);
    const ownerRole = (await rolesOf(condo.communityId)).find((r) => r.userId === ownerId);
    expect(ownerRole?.role).toBe('resident');
    expect(ownerRole?.unitId).not.toBeNull();

    const [unit] = await db
      .select({ ownerUserId: schema.units.ownerUserId, communityId: schema.units.communityId })
      .from(schema.units)
      .where(eq(schema.units.id, ownerRole!.unitId!));
    expect(unit).toEqual({ ownerUserId: ownerId, communityId: condo.communityId });
  }, 60_000);

  it('every resident role in both communities has a unit; managers stay unit-less', async () => {
    for (const communityId of [apt.communityId, condo.communityId]) {
      const roles = await rolesOf(communityId);
      const residents = roles.filter((r) => r.role === 'resident');
      expect(residents.length).toBeGreaterThan(0);
      for (const resident of residents) {
        expect(resident.unitId, `resident ${resident.userId} in ${communityId}`).not.toBeNull();
      }
      for (const manager of roles.filter((r) => r.role !== 'resident')) {
        expect(manager.unitId).toBeNull();
      }
    }
  }, 60_000);

  it('a reseed through seedRoles WITHOUT unitId keeps every existing link', async () => {
    const before = [...(await rolesOf(apt.communityId)), ...(await rolesOf(condo.communityId))];
    const linkedBefore = before.filter((r) => r.unitId !== null);
    expect(linkedBefore.length).toBe(2);

    await seed.seedRoles([
      ...aptUsers.map((u) => ({ communityId: apt.communityId, userId: userIdOf(apt, u.email), role: u.role })),
      ...condoUsers.map((u) => ({ communityId: condo.communityId, userId: userIdOf(condo, u.email), role: u.role })),
    ]);

    const after = [...(await rolesOf(apt.communityId)), ...(await rolesOf(condo.communityId))];
    for (const row of linkedBefore) {
      expect(after.find((r) => r.userId === row.userId && r.role === row.role)?.unitId).toBe(row.unitId);
    }
  }, 60_000);

  // Last, so it covers every request the seeds above made.
  it('only used the Supabase endpoints the double implements', () => {
    expect(double.unexpected).toEqual([]);
  });
});
