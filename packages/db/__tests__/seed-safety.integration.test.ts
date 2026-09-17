/**
 * Integration tests for the seed/reset backstops against a real Postgres
 * (DATABASE_URL — `pnpm db:test-local:setup`). Skipped when DATABASE_URL is unset.
 *
 * The nightly reset runs against production, where real (is_demo=false)
 * associations live beside the demo ones. The backstops must therefore:
 *  - NOT refuse merely because a real community exists (that blocked every
 *    nightly run once one did);
 *  - refuse when a demo user is attached to a real community, because the seed
 *    rewrites demo users (name, phone, password, id re-key) and the pm.admin
 *    billing group;
 *  - never hand the reset a real community to delete, even one holding a demo slug.
 *
 * Every row is tagged, and demo emails / slugs are passed explicitly, so the tests
 * hold regardless of what else is in the database.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '../src/schema';
import { billingGroups, communities, userRoles, users } from '../src/schema';
import {
  SeedSafetyError,
  assertDemoUsersNotAttachedToRealCommunities,
  resolveDemoCommunityIds,
} from '../../../scripts/lib/seed-safety';

const describeDb = process.env.DATABASE_URL ? describe.sequential : describe.skip;

describeDb('seed-safety backstops (integration)', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  const tag = `safety-${randomUUID().slice(0, 8)}`;
  const demoEmail = `pm.admin@${tag}.local`;
  const communityIds: number[] = [];
  const userIds: string[] = [];
  const billingGroupIds: number[] = [];

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 2 });
    db = drizzle(sql, { schema });
  });

  afterAll(async () => {
    if (communityIds.length > 0) await db.delete(communities).where(inArray(communities.id, communityIds));
    if (billingGroupIds.length > 0) await db.delete(billingGroups).where(inArray(billingGroups.id, billingGroupIds));
    if (userIds.length > 0) await db.delete(users).where(inArray(users.id, userIds));
    await sql.end();
  });

  async function createCommunity(slug: string, isDemo: boolean): Promise<number> {
    const [row] = await db
      .insert(communities)
      .values({ name: `Safety ${slug}`, slug, communityType: 'condo_718', timezone: 'America/New_York', isDemo })
      .returning({ id: communities.id });
    communityIds.push(row!.id);
    return row!.id;
  }

  async function createUser(email: string): Promise<string> {
    const id = randomUUID();
    await db.insert(users).values({ id, email, fullName: 'Safety User' });
    userIds.push(id);
    return id;
  }

  it('passes when a real community exists but no demo user touches it', async () => {
    await createCommunity(`real-${tag}`, false);
    await createUser(demoEmail);

    await expect(assertDemoUsersNotAttachedToRealCommunities(db, [demoEmail])).resolves.toBeUndefined();
  });

  it('refuses when a demo user holds a role in a real community', async () => {
    const realId = await createCommunity(`real-role-${tag}`, false);
    const [demoUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, demoEmail));
    await db.insert(userRoles).values({ userId: demoUser!.id, communityId: realId, role: 'resident' });

    const run = assertDemoUsersNotAttachedToRealCommunities(db, [demoEmail.toUpperCase()]);
    await expect(run).rejects.toThrow(SeedSafetyError);
    await expect(assertDemoUsersNotAttachedToRealCommunities(db, [demoEmail])).rejects.toThrow(
      new RegExp(`real-role-${tag} \\(id=${String(realId)}\\) via ${demoEmail.replace(/\./g, '\\.')}`),
    );

    await db.delete(userRoles).where(eq(userRoles.communityId, realId));
  });

  it("refuses when a real community is billed through a demo user's billing group", async () => {
    const [demoUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, demoEmail));
    const [group] = await db
      .insert(billingGroups)
      .values({ name: `Safety ${tag}`, stripeCustomerId: `cus_${tag}`, ownerUserId: demoUser!.id })
      .returning({ id: billingGroups.id });
    billingGroupIds.push(group!.id);
    const realId = await createCommunity(`real-billed-${tag}`, false);
    await db.update(communities).set({ billingGroupId: group!.id }).where(eq(communities.id, realId));

    await expect(assertDemoUsersNotAttachedToRealCommunities(db, [demoEmail])).rejects.toThrow(
      `real-billed-${tag} (id=${String(realId)})`,
    );

    await db.update(communities).set({ billingGroupId: null }).where(eq(communities.id, realId));
  });

  it('never resolves a real community that holds a demo slug as a reset target', async () => {
    const slug = `demo-slug-${tag}`;
    const id = await createCommunity(slug, false);

    expect(await resolveDemoCommunityIds(db, [slug])).toEqual([]);

    await db.update(communities).set({ isDemo: true }).where(eq(communities.id, id));
    expect(await resolveDemoCommunityIds(db, [slug])).toEqual([id]);
  });
});
