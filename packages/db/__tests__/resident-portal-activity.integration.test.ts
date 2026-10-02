import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/schema';
import { accessRequests } from '../src/schema/access-requests';
import { communities } from '../src/schema/communities';
import { invitations } from '../src/schema/invitations';
import { userRoles } from '../src/schema/user-roles';
import { users } from '../src/schema/users';
import type { findCommunityResidentPortalActivity as FindActivity } from '../src/unsafe';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const SLUG_A = '__test_portal_activity_a__';
const SLUG_B = '__test_portal_activity_b__';

describeDb('findCommunityResidentPortalActivity (integration)', () => {
  let sqlClient: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let findActivity: typeof FindActivity;
  let communityA: number;
  let communityB: number;

  const signedIn = randomUUID();
  const invitedOnly = randomUUID();
  const approvedOnly = randomUUID();
  const neverInvited = randomUUID();
  const invitedElsewhere = randomUUID();
  const memberOfBOnly = randomUUID();
  const inviter = randomUUID();
  const allUsers = [signedIn, invitedOnly, approvedOnly, neverInvited, invitedElsewhere, memberOfBOnly, inviter];

  const SIGN_IN_AT = new Date('2026-09-02T10:00:00.000Z');
  const APPROVED_AT = new Date('2026-08-20T10:00:00.000Z');

  async function cleanup() {
    await db.delete(communities).where(inArray(communities.slug, [SLUG_A, SLUG_B]));
    await db.delete(users).where(inArray(users.id, allUsers));
    await db.execute(sql`DELETE FROM auth.users WHERE id = ANY(${sql.raw(`ARRAY['${allUsers.join("','")}']::uuid[]`)})`);
  }

  beforeAll(async () => {
    ({ findCommunityResidentPortalActivity: findActivity } = await import('../src/unsafe'));
    sqlClient = postgres(process.env.DATABASE_URL!, { prepare: false });
    db = drizzle(sqlClient, { schema });
    await cleanup();

    await db.insert(users).values(
      allUsers.map((id, i) => ({ id, email: `portal-${i}+${SLUG_A}@example.com`, fullName: `User ${i}` })),
    );
    // Supabase mirrors every user into auth.users; only one has ever signed in.
    for (const id of allUsers) {
      await db.execute(sql`
        INSERT INTO auth.users (id, email, last_sign_in_at)
        VALUES (${id}, ${`auth-${id}@example.com`}, ${id === signedIn ? SIGN_IN_AT.toISOString() : null})
      `);
    }

    const inserted = await db
      .insert(communities)
      .values([
        { name: 'Portal A', slug: SLUG_A, communityType: 'condo_718' },
        { name: 'Portal B', slug: SLUG_B, communityType: 'condo_718' },
      ])
      .returning({ id: communities.id, slug: communities.slug });
    communityA = inserted.find((c) => c.slug === SLUG_A)!.id;
    communityB = inserted.find((c) => c.slug === SLUG_B)!.id;

    await db.insert(userRoles).values([
      ...[signedIn, invitedOnly, approvedOnly, neverInvited, invitedElsewhere].map((userId) => ({
        userId,
        communityId: communityA,
        role: 'resident' as const,
      })),
      { userId: memberOfBOnly, communityId: communityB, role: 'resident' as const },
      { userId: invitedElsewhere, communityId: communityB, role: 'resident' as const },
    ]);

    const expiresAt = new Date('2027-01-01T00:00:00.000Z');
    await db.insert(invitations).values([
      { communityId: communityA, userId: signedIn, invitedBy: inviter, token: randomUUID(), expiresAt },
      { communityId: communityA, userId: invitedOnly, invitedBy: inviter, token: randomUUID(), expiresAt },
      // Invited by B only — must not count as invited when A is asking.
      { communityId: communityB, userId: invitedElsewhere, invitedBy: inviter, token: randomUUID(), expiresAt },
      // Soft-deleted invitation — ignored.
      { communityId: communityA, userId: neverInvited, invitedBy: inviter, token: randomUUID(), expiresAt, deletedAt: new Date() },
    ]);

    await db.insert(accessRequests).values([
      // Case differs from users.email on purpose: the join is case-insensitive.
      { communityId: communityA, email: `PORTAL-2+${SLUG_A}@EXAMPLE.COM`, fullName: 'User 2', status: 'approved', reviewedAt: APPROVED_AT },
      // A denied request is not an invitation.
      { communityId: communityA, email: `portal-3+${SLUG_A}@example.com`, fullName: 'User 3', status: 'denied', reviewedAt: APPROVED_AT },
    ]);
  });

  afterAll(async () => {
    await cleanup();
    await sqlClient.end();
  });

  it('reports sign-in, invitation and approval facts for the community only', async () => {
    const activity = await findActivity(communityA);

    expect([...activity.keys()].sort()).toEqual(
      [signedIn, invitedOnly, approvedOnly, neverInvited, invitedElsewhere].sort(),
    );
    expect(activity.has(memberOfBOnly)).toBe(false);

    expect(activity.get(signedIn)).toMatchObject({ lastSignInAt: SIGN_IN_AT });
    expect(activity.get(signedIn)!.lastInvitedAt).toBeInstanceOf(Date);

    expect(activity.get(invitedOnly)).toMatchObject({ lastSignInAt: null, accessApprovedAt: null });
    expect(activity.get(invitedOnly)!.lastInvitedAt).toBeInstanceOf(Date);

    expect(activity.get(approvedOnly)).toMatchObject({
      lastSignInAt: null,
      lastInvitedAt: null,
      accessApprovedAt: APPROVED_AT,
    });

    expect(activity.get(neverInvited)).toMatchObject({
      lastSignInAt: null,
      lastInvitedAt: null,
      accessApprovedAt: null,
    });
    expect(activity.get(invitedElsewhere)).toMatchObject({ lastInvitedAt: null });
  });

  it('returns an empty map for a community with no members', async () => {
    const empty = await findActivity(2_147_000_000);
    expect(empty.size).toBe(0);
  });
});
