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
 * Runs against a real Postgres (DATABASE_URL — use `pnpm db:test-local:setup`);
 * only Supabase storage/auth are faked, since the seed's document PDFs and auth
 * lookups are not what is under test.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/supabase/admin', () => {
  const stored = new Map<string, Uint8Array>();
  const bucket = {
    upload: async (path: string, bytes: Uint8Array) => {
      stored.set(path, bytes);
      return { data: { path }, error: null };
    },
    list: async (_folder: string, opts: { search: string }) => ({
      data: [...stored.keys()]
        .map((p) => p.slice(p.lastIndexOf('/') + 1))
        .filter((name) => name === opts.search)
        .map((name) => ({ name })),
      error: null,
    }),
    download: async (path: string) => ({ data: stored.get(path) ?? null, error: null }),
  };
  return {
    createAdminClient: () => ({
      storage: { from: () => bucket },
      auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: null }) } },
    }),
  };
});

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

  beforeAll(async () => {
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
});
