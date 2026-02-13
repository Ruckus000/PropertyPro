/**
 * Invitation flow integration smoke test.
 *
 * Tests the invitation data flow against real DB and optionally Supabase Auth.
 * Skips gracefully when required environment variables are not set.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, eq, sql } from 'drizzle-orm';
import * as schema from '../src/schema';
import { communities, users, invitations } from '../src/schema';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

// Check for Supabase auth env vars (optional - auth tests skip if missing)
const hasSupabaseAuth =
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

describeDb('Invitation flow (integration)', () => {
  const testPrefix = `g2c-inv-${randomUUID().slice(0, 8)}`;
  const testEmail = `${testPrefix}@test.propertypro.local`;
  const testPassword = 'G2cSmoke!2026';

  let sqlClient: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;

  // Track test data for cleanup
  let testCommunityId: number | null = null;
  let testUserId: string | null = null;
  let testInvitationId: number | null = null;
  let supabaseAuthUserId: string | null = null;

  beforeAll(async () => {
    sqlClient = postgres(process.env.DATABASE_URL!, { prepare: false });
    db = drizzle(sqlClient, { schema });
  });

  afterAll(async () => {
    // Clean up: Delete Supabase auth user if created
    if (supabaseAuthUserId && hasSupabaseAuth) {
      try {
        const { createAdminClient } = await import('../src/supabase/admin');
        const supabaseAdmin = createAdminClient();
        await supabaseAdmin.auth.admin.deleteUser(supabaseAuthUserId);
      } catch {
        // Swallow cleanup errors
      }
    }

    // Clean up: Delete test records in reverse dependency order
    try {
      if (testInvitationId != null) {
        await db.delete(invitations).where(eq(invitations.id, testInvitationId));
      }

      if (testUserId && testCommunityId != null) {
        await db.execute(sql`
          DELETE FROM user_roles
          WHERE user_id = ${testUserId} AND community_id = ${testCommunityId}
        `);
      }

      if (testUserId) {
        await db.delete(users).where(eq(users.id, testUserId));
      }

      if (testCommunityId != null) {
        await db.delete(communities).where(eq(communities.id, testCommunityId));
      }
    } catch {
      // Swallow cleanup errors
    }

    await sqlClient.end();
  });

  it('creates invitation and marks it consumed correctly', async () => {
    // Step 1: Create test community
    const [community] = await db
      .insert(communities)
      .values({
        name: `${testPrefix} Test Community`,
        slug: testPrefix,
        communityType: 'condo_718',
        timezone: 'America/New_York',
        addressLine1: '123 Test St',
        city: 'Miami',
        state: 'FL',
        zipCode: '33101',
      })
      .returning();
    testCommunityId = community!.id;

    // Step 2: Create test user (DB record only, no Supabase auth yet)
    const userId = randomUUID();
    await db.insert(users).values({
      id: userId,
      email: testEmail,
      fullName: `${testPrefix} Test User`,
      phone: '+15551234567',
    });
    testUserId = userId;

    // Step 3: Create invitation (skipping role assignment as it's not core to invitation flow)
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const [invitation] = await db
      .insert(invitations)
      .values({
        communityId: testCommunityId,
        userId,
        token,
        expiresAt,
        invitedBy: userId, // self-invite for test simplicity
      })
      .returning();
    testInvitationId = invitation!.id;

    // Step 5: Verify invitation exists and is not consumed
    const freshInvitation = await db
      .select()
      .from(invitations)
      .where(eq(invitations.id, testInvitationId))
      .limit(1);
    expect(freshInvitation[0]?.consumedAt).toBeNull();
    expect(freshInvitation[0]?.token).toBe(token);

    // Step 6: Simulate consumption (mark as consumed)
    await db
      .update(invitations)
      .set({ consumedAt: new Date() })
      .where(eq(invitations.id, testInvitationId));

    // Step 7: Verify invitation is now consumed
    const consumedInvitation = await db
      .select()
      .from(invitations)
      .where(eq(invitations.id, testInvitationId))
      .limit(1);
    expect(consumedInvitation[0]?.consumedAt).not.toBeNull();
  }, 30_000);

  it.skipIf(!hasSupabaseAuth)('creates Supabase auth user and verifies login', async () => {
    // This test only runs if Supabase auth env vars are available
    const { createAdminClient } = await import('../src/supabase/admin');
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseAdmin = createAdminClient();

    // Create a unique test email for this test
    const authTestEmail = `${testPrefix}-auth@test.propertypro.local`;

    // Create auth user
    const createResult = await supabaseAdmin.auth.admin.createUser({
      email: authTestEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: { full_name: `${testPrefix} Auth Test User` },
    });

    expect(createResult.error).toBeNull();
    expect(createResult.data.user).toBeTruthy();
    supabaseAuthUserId = createResult.data.user!.id;

    // Verify login works
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const { error: signInError } = await anonClient.auth.signInWithPassword({
      email: authTestEmail,
      password: testPassword,
    });
    expect(signInError).toBeNull();
  }, 30_000);
});
