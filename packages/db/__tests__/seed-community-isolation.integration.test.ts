/**
 * The demo seed must never rewrite a REAL (is_demo=false) community's data.
 *
 * The nightly reset runs `seedCommunity` against production, where real
 * associations live next to the demo ones. Two paths used to reach them:
 *  - `lookupRegistry` matched (entity_type, seed_key) globally, and the apartment
 *    maintenance keys (`apt-maint-1..9`) are not slug-prefixed, so seeding a demo
 *    apartment re-homed another community's registered requests into the demo;
 *  - `ensureCommunity` matched by slug alone and stamped `is_demo=true` on a
 *    real community that held the slug.
 *
 * Runs against a real Postgres (DATABASE_URL — use `pnpm db:test-local:setup`).
 * The seed also uploads document PDFs through Supabase storage and looks up auth
 * users; those go to a small in-process HTTP double of the Supabase API, so the
 * real supabase-js client path runs and no module is mocked (integration tests
 * may not mock — scripts/verify-no-mocks-in-integration.ts).
 */
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Just enough of the Supabase REST surface for the seed: storage upload / list /
 * download and auth admin listUsers. Anything else is recorded and answered 404,
 * and the suite asserts nothing unexpected was called.
 */
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

      if (req.method === 'GET' && path === '/auth/v1/admin/users') return json(200, { users: [], aud: 'authenticated' });

      const list = path.match(/^\/storage\/v1\/object\/list\/([^/]+)$/);
      if (req.method === 'POST' && list) {
        const { prefix = '', search = '' } = JSON.parse(body.toString() || '{}') as { prefix?: string; search?: string };
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

describeDb('seedCommunity never rewrites a real community (integration)', () => {
  const tag = randomUUID().slice(0, 8);
  const realSlug = `real-apartments-${tag}`;
  const demoSlug = `demo-apartments-${tag}`;
  const users = (label: string) => [
    { email: `pm.${label}.${tag}@isolation.test`, fullName: 'Pat Manager', role: 'property_manager' as const },
    { email: `res.${label}.${tag}@isolation.test`, fullName: 'Rae Resident', role: 'tenant' as const },
  ];

  let seedCommunity: typeof import('../src/seed/seed-community').seedCommunity;
  let db: ReturnType<typeof import('../src/unsafe').createUnscopedClient>;
  let schema: typeof import('../src/schema');
  let realCommunityId = 0;
  let realRequestsBefore: Array<{ id: number; communityId: number; title: string }> = [];
  let double: Awaited<ReturnType<typeof startSupabaseDouble>>;
  const savedEnv = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  beforeAll(async () => {
    double = await startSupabaseDouble();
    process.env.NEXT_PUBLIC_SUPABASE_URL = double.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'isolation-test-service-role';
    process.env.DEMO_DEFAULT_PASSWORD ??= 'isolation-test-password';
    ({ seedCommunity } = await import('../src/seed/seed-community'));
    schema = await import('../src/schema');
    db = (await import('../src/unsafe')).createUnscopedClient();

    // A real apartment community whose maintenance requests hold the
    // registry keys first, as a converted admin demo's would.
    const real = await seedCommunity(
      { name: 'Real Apartments', slug: realSlug, communityType: 'apartment', isDemo: false },
      users('real'),
      { syncAuthUsers: false },
    );
    realCommunityId = real.communityId;
    realRequestsBefore = await requestsOf(realCommunityId);
  }, 300_000);

  afterAll(async () => {
    const { inArray, like } = await import('drizzle-orm');
    const rows = await db
      .select({ id: schema.communities.id })
      .from(schema.communities)
      .where(inArray(schema.communities.slug, [realSlug, demoSlug]));
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      await db.delete(schema.demoSeedRegistry).where(inArray(schema.demoSeedRegistry.communityId, ids));
      await db.delete(schema.communities).where(inArray(schema.communities.id, ids));
    }
    await db.delete(schema.users).where(like(schema.users.email, `%.${tag}@isolation.test`));
    await new Promise((resolve) => double.server.close(resolve));
    for (const [name, value] of [['NEXT_PUBLIC_SUPABASE_URL', savedEnv.url], ['SUPABASE_SERVICE_ROLE_KEY', savedEnv.key]] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }, 120_000);


  async function requestsOf(communityId: number) {
    const { eq } = await import('drizzle-orm');
    return db
      .select({
        id: schema.maintenanceRequests.id,
        communityId: schema.maintenanceRequests.communityId,
        title: schema.maintenanceRequests.title,
      })
      .from(schema.maintenanceRequests)
      .where(eq(schema.maintenanceRequests.communityId, communityId))
      .orderBy(schema.maintenanceRequests.id);
  }

  it("seeding a demo apartment leaves the real community's maintenance requests where they are", async () => {
    expect(realRequestsBefore.length).toBeGreaterThan(0);

    const demo = await seedCommunity(
      { name: 'Demo Apartments', slug: demoSlug, communityType: 'apartment', isDemo: true },
      users('demo'),
      { syncAuthUsers: false },
    );

    expect(await requestsOf(realCommunityId)).toEqual(realRequestsBefore);
    // The demo still gets its own full set rather than none.
    expect((await requestsOf(demo.communityId)).length).toBe(realRequestsBefore.length);
  }, 300_000);

  it('refuses to turn a real community holding the slug into a demo', async () => {
    const { eq } = await import('drizzle-orm');

    await expect(
      seedCommunity(
        { name: 'Hijack', slug: realSlug, communityType: 'apartment', isDemo: true },
        users('real'),
        { syncAuthUsers: false },
      ),
    ).rejects.toThrow(`Refusing to convert non-demo community "${realSlug}"`);

    const [row] = await db
      .select({ isDemo: schema.communities.isDemo, name: schema.communities.name })
      .from(schema.communities)
      .where(eq(schema.communities.id, realCommunityId));
    expect(row).toEqual({ isDemo: false, name: 'Real Apartments' });
  }, 300_000);

  // Last, so it covers every request the seeds above made.
  it('only used the Supabase endpoints the double implements', () => {
    expect(double.unexpected).toEqual([]);
  });
});
