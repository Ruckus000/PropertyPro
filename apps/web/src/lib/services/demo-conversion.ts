/**
 * Demo-to-customer conversion service.
 *
 * Handles the webhook-side logic when a prospect completes Stripe checkout
 * to convert their demo community into a paid subscription. Two independently
 * idempotent operations:
 *
 * 1. Community conversion: flip is_demo, set subscription fields
 * 2. Founding user creation: create Supabase auth user + user_roles row
 *
 * Called from the Stripe webhook handler when `metadata.demoId` is present
 * on a checkout.session.completed event.
 */
import type Stripe from 'stripe';
import { and, eq, gt, inArray, isNull, lt, sql } from '@propertypro/db/filters';
import {
  accessRequests,
  communities,
  demoInstances,
  users,
  userRoles,
} from '@propertypro/db';
// AUTHZ: Demo→paid conversion: atomic write across communities, users, user_roles, demo_instances. Operates on the root tenant table (communities) which has no community_id to scope by; runs from the Stripe webhook handler with no logged-in user context.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { getPresetPermissions } from '@propertypro/shared';
import type { CommunityType } from '@propertypro/shared';
import { emitConversionEvent } from './conversion-events';

// ---------------------------------------------------------------------------
// Main entry point — called from webhook handler
// ---------------------------------------------------------------------------

export async function handleDemoConversion(
  session: Stripe.Checkout.Session,
  stripeEventId: string,
  eventCreatedEpoch: number,
): Promise<void> {
  const { demoId, communityId, planId, customerEmail, customerName } =
    extractMetadata(session);

  // Step 1: Convert community (idempotent — only updates rows where is_demo=true)
  const converted = await convertCommunity({
    communityId: Number(communityId),
    planId,
    stripeCustomerId:
      typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id ?? null,
    stripeSubscriptionId:
      typeof session.subscription === 'string'
        ? session.subscription
        : (session.subscription as { id: string } | null)?.id ?? null,
  });

  // Step 2: Emit checkout_completed event (awaited best-effort)
  await emitConversionEvent({
    demoId: Number(demoId),
    communityId: Number(communityId),
    eventType: 'checkout_completed',
    source: 'stripe_webhook',
    dedupeKey: `stripe:${stripeEventId}`,
    occurredAt: new Date(eventCreatedEpoch * 1000),
    stripeEventId,
    metadata: { planId },
  });

  // Step 3: If this was the first conversion, ban demo auth users
  if (converted) {
    await banDemoUsers(Number(demoId));
  }

  // Step 4: Create founding user (independently idempotent)
  const communityType = await fetchCommunityType(Number(communityId));
  await ensureFoundingUser(Number(demoId), Number(communityId), customerEmail, customerName, communityType);

  console.info(
    `[demo-conversion] completed for demo=${demoId} community=${communityId} converted=${converted}`,
  );
}

// ---------------------------------------------------------------------------
// Metadata extraction
// ---------------------------------------------------------------------------

interface DemoConversionMetadata {
  demoId: string;
  communityId: string;
  planId: string;
  customerEmail: string;
  customerName: string;
}

function extractMetadata(session: Stripe.Checkout.Session): DemoConversionMetadata {
  const meta = session.metadata ?? {};
  const demoId = meta.demoId;
  const communityId = meta.communityId;
  const planId = meta.planId;
  const customerEmail = meta.customerEmail ?? session.customer_email ?? '';
  const customerName = meta.customerName ?? '';

  if (!demoId || !communityId || !planId || !customerEmail) {
    throw new Error(
      `[demo-conversion] missing required metadata: demoId=${demoId} communityId=${communityId} planId=${planId} email=${customerEmail}`,
    );
  }

  return { demoId, communityId, planId, customerEmail, customerName };
}

// ---------------------------------------------------------------------------
// Community type lookup
// ---------------------------------------------------------------------------

async function fetchCommunityType(communityId: number): Promise<CommunityType> {
  const db = createUnscopedClient();
  const [row] = await db
    .select({ communityType: communities.communityType })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);
  if (!row) {
    throw new Error(`[demo-conversion] community ${communityId} not found`);
  }
  return row.communityType;
}

// ---------------------------------------------------------------------------
// Community conversion (idempotent)
// ---------------------------------------------------------------------------

interface ConvertCommunityParams {
  communityId: number;
  planId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

/**
 * Converts a demo community to a paid subscription.
 * Returns true if the row was updated (first conversion), false if already converted.
 */
async function convertCommunity(params: ConvertCommunityParams): Promise<boolean> {
  const { communityId, planId, stripeCustomerId, stripeSubscriptionId } = params;
  const db = createUnscopedClient();

  const rows = await db
    .update(communities)
    .set({
      isDemo: false,
      subscriptionPlan: planId,
      subscriptionStatus: 'active',
      stripeCustomerId,
      stripeSubscriptionId,
      demoExpiresAt: null,
      trialEndsAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(communities.id, communityId),
        eq(communities.isDemo, true),
      ),
    )
    .returning({ id: communities.id });

  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Ban demo auth users
// ---------------------------------------------------------------------------

/**
 * Bans both demo auth users (resident + board) so they can no longer log in.
 * Uses a far-future ban duration (100 years) to effectively disable the accounts.
 */
async function banDemoUsers(demoId: number): Promise<void> {
  const db = createUnscopedClient();

  const [demo] = await db
    .select({
      demoResidentUserId: demoInstances.demoResidentUserId,
      demoBoardUserId: demoInstances.demoBoardUserId,
    })
    .from(demoInstances)
    .where(eq(demoInstances.id, demoId))
    .limit(1);

  if (!demo) {
    console.warn(`[demo-conversion] demo instance ${demoId} not found for banning`);
    return;
  }

  const admin = createAdminClient();
  const userIds = [demo.demoResidentUserId, demo.demoBoardUserId].filter(Boolean);

  for (const userId of userIds) {
    try {
      await admin.auth.admin.updateUserById(userId!, { ban_duration: '876600h' });
      console.info(`[demo-conversion] banned demo user ${userId}`);
    } catch (err) {
      // Non-fatal: demo user may have already been deleted or banned
      console.warn(`[demo-conversion] failed to ban demo user ${userId}:`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// Founding user creation (independently idempotent)
// ---------------------------------------------------------------------------

/**
 * Creates the founding user for a converted community.
 * Assigns board_president + pm_admin roles (community + platform access).
 *
 * Idempotency: checks if a board_president role row already exists for this
 * community before creating anything. If the auth user already exists (e.g.,
 * from a previous partial run), reuses it.
 */
async function ensureFoundingUser(
  demoId: number,
  communityId: number,
  email: string,
  name: string,
  communityType: CommunityType,
): Promise<void> {
  const db = createUnscopedClient();

  // Check if a board_president (manager) role already exists for this community
  const [existingRole] = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.communityId, communityId),
        eq(userRoles.role, 'manager'),
        eq(userRoles.presetKey, 'board_president'),
      ),
    )
    .limit(1);

  if (existingRole) {
    console.info(
      `[demo-conversion] founding user already exists for community ${communityId}`,
    );
    return;
  }

  // Create (or find existing) Supabase auth user + users table row
  const admin = createAdminClient();
  const fullName = name || email.split('@')[0] || email;
  let userId: string;

  // Check if user already exists in our users table (from a prior partial run)
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser) {
    userId = existingUser.id;
  } else {
    // Create new Supabase auth user — they'll use magic link to set credentials
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (error || !data.user) {
      throw new Error(
        `[demo-conversion] failed to create auth user: ${error?.message ?? 'no user returned'}`,
      );
    }

    userId = data.user.id;

    // Insert the public users mirror row
    await db
      .insert(users)
      .values({
        id: data.user.id,
        email,
        fullName,
      })
      .onConflictDoNothing();
  }

  // Create board_president (manager) + pm_admin roles for the founding user.
  // manager+board_president: community management authority (V2 role model)
  // pm_admin: PM portfolio dashboard access (fixes PM-03 audit gap)
  const permissions = getPresetPermissions('board_president', communityType);
  await db
    .insert(userRoles)
    .values([
      {
        userId,
        communityId,
        role: 'manager',
        presetKey: 'board_president',
        displayTitle: 'Board President',
        isUnitOwner: false,
        permissions,
      },
      {
        userId,
        communityId,
        role: 'pm_admin',
        displayTitle: 'Administrator',
        isUnitOwner: false,
      },
    ])
    .onConflictDoNothing();

  // Emit founding_user_created event (awaited best-effort)
  await emitConversionEvent({
    demoId,
    communityId,
    eventType: 'founding_user_created',
    source: 'stripe_webhook',
    dedupeKey: `demo:${demoId}:founding_user`,
    userId,
  });

  // Send magic link so the founding user can set their password
  try {
    await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: '/dashboard' },
    });
    console.info(`[demo-conversion] magic link sent to founding user ${email}`);
  } catch (err) {
    // Non-fatal: user can always use "forgot password" flow
    console.warn(`[demo-conversion] failed to send magic link to ${email}:`, err);
  }

  console.info(
    `[demo-conversion] founding user created: ${userId} for community ${communityId}`,
  );
}

// ---------------------------------------------------------------------------
// Demo auto-login helpers (used by /api/v1/auth/demo-login)
// ---------------------------------------------------------------------------

export interface DemoInstanceForLogin {
  id: number;
  authTokenSecret: string | null;
  seededCommunityId: number | null;
  demoResidentEmail: string | null;
  demoBoardEmail: string | null;
}

/**
 * Fetch the demo instance row needed to authenticate a demo-login token:
 * the encrypted HMAC secret + the seeded community + the demo user emails.
 * Returns `null` when the demo id doesn't match a row.
 *
 * AUTHZ: pre-tenant token-authenticated endpoint — caller validates the
 * HMAC token signature against the returned secret BEFORE trusting the
 * row's contents.
 */
export async function getDemoInstanceForLogin(
  demoId: number,
): Promise<DemoInstanceForLogin | null> {
  const db = createUnscopedClient();
  const [row] = await db
    .select({
      id: demoInstances.id,
      authTokenSecret: demoInstances.authTokenSecret,
      seededCommunityId: demoInstances.seededCommunityId,
      demoResidentEmail: demoInstances.demoResidentEmail,
      demoBoardEmail: demoInstances.demoBoardEmail,
    })
    .from(demoInstances)
    .where(eq(demoInstances.id, demoId))
    .limit(1);
  return row ?? null;
}

/**
 * Look up `communities.demoExpiresAt` for the seeded demo community. Returns
 * the expiry timestamp, `null` when no row matches, or `undefined` when the
 * row exists but has no expiry set (treated as "never expires" by the
 * caller).
 *
 * AUTHZ: cross-tenant unscoped read — caller MUST have already validated
 * the demo HMAC token + resolved the community id from the verified demo
 * instance row.
 */
export async function getDemoCommunityExpiry(
  communityId: number,
): Promise<Date | null | undefined> {
  const db = createUnscopedClient();
  const [row] = await db
    .select({ demoExpiresAt: communities.demoExpiresAt })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);
  if (!row) return null;
  return row.demoExpiresAt ?? undefined;
}

// ---------------------------------------------------------------------------
// Demo expiry cron helpers (used by /api/v1/internal/expire-demos)
// ---------------------------------------------------------------------------

export interface DemoEnteringGraceRow {
  communityId: number;
  demoInstanceId: number;
  trialEndsAt: Date | null;
}

/**
 * Find demos whose trial period has ended but whose demo grace window has
 * not yet elapsed — these need a one-shot `grace_started` conversion event.
 *
 * AUTHZ: cron-only — caller MUST validate the cron secret BEFORE invoking.
 */
export async function findDemosEnteringGrace(
  now: Date,
): Promise<DemoEnteringGraceRow[]> {
  const db = createUnscopedClient();
  return await db
    .select({
      communityId: communities.id,
      demoInstanceId: demoInstances.id,
      trialEndsAt: communities.trialEndsAt,
    })
    .from(communities)
    .innerJoin(demoInstances, eq(demoInstances.seededCommunityId, communities.id))
    .where(
      and(
        eq(communities.isDemo, true),
        lt(communities.trialEndsAt, now),
        gt(communities.demoExpiresAt, now),
        isNull(communities.deletedAt),
        isNull(demoInstances.deletedAt),
      ),
    );
}

export interface ExpiredDemoRow {
  communityId: number;
  demoInstanceId: number;
  demoResidentUserId: string | null;
  demoBoardUserId: string | null;
}

/**
 * Find demos whose grace window has fully elapsed — these need to be
 * soft-deleted and their auth users banned.
 *
 * AUTHZ: cron-only — caller MUST validate the cron secret BEFORE invoking.
 */
export async function findExpiredDemos(now: Date): Promise<ExpiredDemoRow[]> {
  const db = createUnscopedClient();
  return await db
    .select({
      communityId: communities.id,
      demoInstanceId: demoInstances.id,
      demoResidentUserId: demoInstances.demoResidentUserId,
      demoBoardUserId: demoInstances.demoBoardUserId,
    })
    .from(communities)
    .innerJoin(demoInstances, eq(demoInstances.seededCommunityId, communities.id))
    .where(
      and(
        eq(communities.isDemo, true),
        lt(communities.demoExpiresAt, now),
        isNull(communities.deletedAt),
        isNull(demoInstances.deletedAt),
      ),
    );
}

/**
 * Soft-delete a community + its demo instance in one logical step. Both
 * updates are guarded against double-soft-delete via `isNull(deletedAt)`.
 *
 * AUTHZ: cron-only — caller MUST validate the cron secret BEFORE invoking.
 */
export async function softDeleteExpiredDemo(params: {
  communityId: number;
  demoInstanceId: number;
  now: Date;
}): Promise<void> {
  const { communityId, demoInstanceId, now } = params;
  const db = createUnscopedClient();
  await db
    .update(communities)
    .set({ deletedAt: now })
    .where(and(eq(communities.id, communityId), isNull(communities.deletedAt)));
  await db
    .update(demoInstances)
    .set({ deletedAt: now })
    .where(and(eq(demoInstances.id, demoInstanceId), isNull(demoInstances.deletedAt)));
}

/**
 * Permanently ban a demo Supabase auth user (876600h ≈ 100 years). Returns
 * a discriminated union so the caller can log the error context without
 * aborting the rest of the cron loop.
 *
 * AUTHZ: cron-only — caller MUST validate the cron secret BEFORE invoking.
 */
export async function banDemoAuthUser(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const admin = createAdminClient();
    await admin.auth.admin.updateUserById(userId, { ban_duration: '876600h' });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/**
 * Bulk-expire access requests still in `pending`/`pending_verification`
 * after 30 days. Returns the affected ids.
 *
 * AUTHZ: cron-only — caller MUST validate the cron secret BEFORE invoking.
 */
export async function expireStaleAccessRequests(
  now: Date,
): Promise<{ id: number }[]> {
  const db = createUnscopedClient();
  return await db
    .update(accessRequests)
    .set({ status: 'expired', updatedAt: now })
    .where(
      and(
        inArray(accessRequests.status, ['pending_verification', 'pending']),
        lt(accessRequests.createdAt, sql`now() - interval '30 days'`),
        isNull(accessRequests.deletedAt),
      ),
    )
    .returning({ id: accessRequests.id });
}

// ---------------------------------------------------------------------------
// Demo entry helpers (used by /api/v1/demo/[slug]/enter)
// ---------------------------------------------------------------------------

export interface DemoInstanceForEntry {
  id: number;
  seededCommunityId: number | null;
  demoResidentEmail: string | null;
  demoBoardEmail: string | null;
  demoResidentUserId: string | null;
  demoBoardUserId: string | null;
  isDemo: boolean | null;
  demoExpiresAt: Date | null;
}

/**
 * Look up the demo instance + its seeded community by slug, projecting only
 * the columns the entry route consumes (auth emails, target user ids,
 * is-demo flag, expiry timestamp). Soft-deleted demos and soft-deleted
 * communities are excluded. Returns `null` if no row matches.
 *
 * AUTHZ: pre-tenant token-authenticated endpoint — slug knowledge is the
 * auth credential. Caller is responsible for rate-limiting (handled by
 * middleware in production).
 */
export async function getDemoInstanceForEntry(
  slug: string,
): Promise<DemoInstanceForEntry | null> {
  const db = createUnscopedClient();
  const rows = await db
    .select({
      id: demoInstances.id,
      seededCommunityId: demoInstances.seededCommunityId,
      demoResidentEmail: demoInstances.demoResidentEmail,
      demoBoardEmail: demoInstances.demoBoardEmail,
      demoResidentUserId: demoInstances.demoResidentUserId,
      demoBoardUserId: demoInstances.demoBoardUserId,
      isDemo: communities.isDemo,
      demoExpiresAt: communities.demoExpiresAt,
    })
    .from(demoInstances)
    .innerJoin(communities, eq(communities.id, demoInstances.seededCommunityId))
    .where(
      and(
        eq(demoInstances.slug, slug),
        isNull(demoInstances.deletedAt),
        isNull(communities.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export interface DemoInstanceForUpgrade {
  id: number;
  communityId: number | null;
  communityName: string | null;
  communityType: CommunityType;
  isDemo: boolean | null;
  trialEndsAt: Date | null;
  demoExpiresAt: Date | null;
  deletedAt: Date | null;
  demoResidentUserId: string | null;
  demoBoardUserId: string | null;
}

/**
 * Look up the demo instance + community for the self-service-upgrade flow.
 * Excludes soft-deleted demos but NOT soft-deleted communities — the route
 * uses the `deletedAt` field as a status input to `computeDemoStatus`.
 *
 * AUTHZ: caller MUST validate the requesting user is one of the demo's
 * board/resident user ids before exposing the row's downstream fields.
 */
export async function getDemoInstanceForUpgrade(
  slug: string,
): Promise<DemoInstanceForUpgrade | null> {
  const db = createUnscopedClient();
  const rows = await db
    .select({
      id: demoInstances.id,
      communityId: demoInstances.seededCommunityId,
      communityName: communities.name,
      communityType: communities.communityType,
      isDemo: communities.isDemo,
      trialEndsAt: communities.trialEndsAt,
      demoExpiresAt: communities.demoExpiresAt,
      deletedAt: communities.deletedAt,
      demoResidentUserId: demoInstances.demoResidentUserId,
      demoBoardUserId: demoInstances.demoBoardUserId,
    })
    .from(demoInstances)
    .innerJoin(communities, eq(demoInstances.seededCommunityId, communities.id))
    .where(
      and(
        eq(demoInstances.slug, slug),
        isNull(demoInstances.deletedAt),
      ),
    )
    .limit(1);
  return (rows[0] as DemoInstanceForUpgrade | undefined) ?? null;
}
