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
import { and, eq, isNull } from '@propertypro/db/filters';
import { communities, demoInstances, users, userRoles } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { createAdminClient } from '@propertypro/db/supabase/admin';
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
  await ensureFoundingUser(Number(demoId), Number(communityId), customerEmail, customerName);

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
