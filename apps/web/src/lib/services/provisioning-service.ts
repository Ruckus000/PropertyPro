/**
 * Provisioning service — P2-35
 *
 * Implements the resumable state machine that creates a complete community
 * on successful Stripe checkout. The Stripe webhook inserts a
 * provisioning_jobs stub at status='initiated', then awaits this state machine
 * so Stripe can retry if provisioning fails before completion.
 *
 * State machine contract (PHASE2_EXECUTION_PLAN.md):
 *   community_created → user_linked → checklist_generated →
 *   categories_created → preferences_set → email_sent → completed
 *
 * Idempotency:
 *   - Business key: signupRequestId (prevents duplicate tenant creation)
 *   - Transport key: stripeEventId (handled upstream by webhook dedup)
 *   - Each step is safe to re-run (INSERT … onConflictDoNothing / upsert)
 *   - Retry resumes from lastSuccessfulStatus — never restarts from scratch
 */
import { createElement } from 'react';
import type Stripe from 'stripe';
import { and, asc, eq, inArray, isNull, lt, or, sql } from '@propertypro/db/filters';
import {
  communities,
  complianceChecklistItems,
  documentCategories,
  notificationPreferences,
  pendingSignups,
  provisioningJobs,
  userRoles,
  users,
} from '@propertypro/db';
// AUTHZ: P2-35: Provisioning pipeline — cross-tenant bootstrap, no communityId at start
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import {
  linkCommunityToBillingGroup,
  recalculateVolumeTier,
} from '@/lib/billing/billing-group-service';
import { createCommunityForPm } from '@/lib/pm/create-community';
import { WelcomeEmail, sendEmail } from '@propertypro/email';
import {
  getComplianceTemplate,
  getDefaultDocumentCategories,
  PM_SCOPE_DB_ROLES,
  resolvePlanId,
} from '@propertypro/shared';
import { calculatePostingDeadline } from '@/lib/utils/compliance-calculator';
import { resolvePendingSignupAddress } from './provisioning-address';
import {
  resolveSubscriptionPeriodEndAt,
  retrieveCheckoutSession,
} from '@/lib/services/stripe-service';
import {
  getProvisioningJobIdBySignupRequestId,
  insertProvisioningJobFence,
  markPendingSignupPaymentCompleted,
} from '@/lib/services/stripe-webhook-service';

// ---------------------------------------------------------------------------
// State machine constants — must match PHASE2_EXECUTION_PLAN.md exactly
// ---------------------------------------------------------------------------

const STEP_SEQUENCE = [
  'community_created',
  'user_linked',
  'checklist_generated',
  'categories_created',
  'preferences_set',
  'email_sent',
  'completed',
] as const;

type ProvisioningStepSuccess = typeof STEP_SEQUENCE[number];

const RECOVERABLE_JOB_STATUSES = [
  'initiated',
  'community_created',
  'user_linked',
  'checklist_generated',
  'categories_created',
  'preferences_set',
  'email_sent',
  'failed',
] as const;

const RECOVERABLE_SIGNUP_STATUSES = ['payment_completed', 'provisioning'] as const;

const DEFAULT_STALE_AFTER_MS = 5 * 60 * 1000;
const DEFAULT_MAX_JOBS = 10;
const DEFAULT_MAX_RETRY_COUNT = 5;

// A1: how long a signup may sit at `checkout_started` before the reconciler
// treats its webhook as lost. Longer than the webhook's own retry window so we
// never race a normally-delivered `checkout.session.completed`.
const RECONCILE_STALE_AFTER_MS = 15 * 60 * 1000;

function nextStep(last: string | null): ProvisioningStepSuccess {
  if (!last) return STEP_SEQUENCE[0];
  const idx = STEP_SEQUENCE.indexOf(last as ProvisioningStepSuccess);
  if (idx === -1) return STEP_SEQUENCE[0];
  if (idx === STEP_SEQUENCE.length - 1) {
    throw new Error('[provisioning] nextStep called past terminal state: completed');
  }
  return STEP_SEQUENCE[idx + 1] as ProvisioningStepSuccess;
}

// ---------------------------------------------------------------------------
// Step implementations
// ---------------------------------------------------------------------------

type PendingSignupRow = {
  signupRequestId: string;
  authUserId: string | null;
  primaryContactName: string;
  email: string;
  communityName: string;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
  address: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  candidateSlug: string;
  planKey: string | null;
  payload: Record<string, unknown>;
  /** When the signup accepted the Terms, and which version. Carried to `users`. */
  termsAcceptedAt: Date;
  termsVersion: string | null;
};

type JobContext = {
  jobId: number;
  communityId: number | null;
  signup: PendingSignupRow;
  lastSuccessfulStatus: string | null;
};

async function stepCommunityCreated(ctx: JobContext): Promise<void> {
  const db = createUnscopedClient();
  const normalizedAddress = resolvePendingSignupAddress(ctx.signup);

  // Extract Stripe billing IDs from the provisioning payload (set by webhook handler).
  const payload = (ctx.signup.payload as Record<string, unknown>) ?? {};
  const stripeCustomerId = (payload.stripeCustomerId as string | null) ?? null;
  const stripeSubscriptionId = (payload.stripeSubscriptionId as string | null) ?? null;
  // A2: stamp the trial status + period end captured at checkout so the trialing
  // banner shows immediately, without waiting for a later subscription.updated.
  const subscriptionStatus = (payload.subscriptionStatus as string | null) ?? null;
  const periodEndRaw = payload.subscriptionCurrentPeriodEndAt as string | null | undefined;
  const subscriptionCurrentPeriodEndAt = periodEndRaw ? new Date(periodEndRaw) : null;

  // Stamp the purchased plan from the signup itself, at creation time.
  //
  // This is the ONLY moment at which the plan is knowable without a race. The
  // plan is otherwise written exclusively by `customer.subscription.*`, which
  // resolves its community through `stripe_subscription_id` — a link that does
  // not exist until the INSERT below lands. Stripe does not order
  // `checkout.session.completed` against `customer.subscription.created`, so
  // whenever the subscription event wins the race it finds no community and is
  // dropped silently, leaving `subscription_plan = null` until some later
  // subscription update happens to arrive (for a trialing subscription, that is
  // the end of the trial — or never).
  //
  // The watchdog/reconciler paths make this certain rather than merely likely:
  // they run minutes-to-hours after checkout, by which time every subscription
  // event for that signup has already been dropped. Communities 2358/2359
  // (2026-08-09) were recovered exactly this way and both landed with a null
  // plan despite `plan_key = 'professional'`, which leaves a paying customer in
  // the gated/lapsed state.
  //
  // `resolvePlanId` normalises legacy aliases and rejects junk: an unresolvable
  // key is left unset rather than written verbatim, because downstream gating
  // runs the same resolver and would treat a bogus value as no plan anyway —
  // better an absent value than one that lies about being canonical.
  const subscriptionPlan = resolvePlanId(ctx.signup.planKey ?? null);

  // Insert the community — slug unique constraint prevents duplicates on retry.
  // Use onConflictDoNothing to tolerate exact-duplicate retries.
  const [inserted] = await db
    .insert(communities)
    .values({
      name: ctx.signup.communityName,
      slug: ctx.signup.candidateSlug,
      communityType: ctx.signup.communityType,
      addressLine1: normalizedAddress.addressLine1,
      city: normalizedAddress.city,
      state: normalizedAddress.state,
      zipCode: normalizedAddress.zipCode,
      timezone: 'America/New_York',
      stripeCustomerId,
      stripeSubscriptionId,
      ...(subscriptionStatus ? { subscriptionStatus } : {}),
      ...(subscriptionPlan ? { subscriptionPlan } : {}),
      ...(subscriptionCurrentPeriodEndAt ? { subscriptionCurrentPeriodEndAt } : {}),
    })
    .onConflictDoNothing()
    .returning({ id: communities.id });

  // If insert was a no-op (retry), look up the existing community by slug.
  let communityId: number;
  if (inserted) {
    communityId = inserted.id;
  } else {
    const [existing] = await db
      .select({ id: communities.id })
      .from(communities)
      .where(eq(communities.slug, ctx.signup.candidateSlug))
      .limit(1);
    if (!existing) {
      throw new Error(`[provisioning] community_created: slug ${ctx.signup.candidateSlug} not found after conflict`);
    }
    communityId = existing.id;

    // Backfill the plan onto a community created by an earlier run that didn't
    // stamp it. Without this, a retry/watchdog pass over a community created
    // before this write existed can never repair it — the INSERT is a no-op and
    // no other code path knows the plan. Guarded on IS NULL so a deliberate
    // later plan change (upgrade/downgrade via subscription.updated) is never
    // reverted to the originally-purchased plan.
    if (subscriptionPlan) {
      await db
        .update(communities)
        .set({ subscriptionPlan, updatedAt: new Date() })
        .where(and(eq(communities.id, communityId), isNull(communities.subscriptionPlan)));
    }
  }

  // Update the job row with the resolved communityId.
  await db
    .update(provisioningJobs)
    .set({ communityId })
    .where(eq(provisioningJobs.id, ctx.jobId));

  ctx.communityId = communityId;
}

async function stepUserLinked(ctx: JobContext): Promise<void> {
  const db = createUnscopedClient();
  const communityId = ctx.communityId;
  if (!communityId) throw new Error('[provisioning] user_linked: communityId not set');

  // The founding user who signs up and pays gets root_manager — the highest
  // community-scoped role under role-v3/ADR-006 (creator-is-root, spec §3.5(a)) —
  // so they can manage the community and (for PM plans) the portfolio from day one.
  // root_manager has blanket access and doesn't need presets or granular permissions.
  const displayTitle = 'Administrator';

  let userId: string;

  if (ctx.signup.authUserId) {
    // User already has a Supabase auth account from signup flow.
    userId = ctx.signup.authUserId;

    // Upsert the public users row (may not exist yet if this step is the first to run).
    await db
      .insert(users)
      .values({
        id: userId,
        email: ctx.signup.email,
        fullName: ctx.signup.primaryContactName,
        termsAcceptedAt: ctx.signup.termsAcceptedAt,
        termsVersion: ctx.signup.termsVersion,
      })
      // NOT onConflictDoNothing. Provisioning is retried, and this step can run
      // after the users row already exists — with DoNothing the terms columns
      // would be silently skipped on every retry, leaving a signup that DID
      // accept the terms with no record of it.
      //
      // The `set` is deliberately NARROW: only the terms columns. Including
      // email/fullName would let a retry overwrite values a user may have since
      // changed in their profile.
      //
      // Values come from the pending_signups row, never `new Date()` — the
      // acceptance happened at signup, possibly days earlier.
      // See docs/audits/2026-08-09-legal-risk-audit.md F-18.
      .onConflictDoUpdate({
        target: users.id,
        set: {
          termsAcceptedAt: ctx.signup.termsAcceptedAt,
          termsVersion: ctx.signup.termsVersion,
        },
      });
  } else {
    // Create a Supabase auth user. email_confirm: true skips verification since
    // the user already verified their email during the signup flow.
    const adminClient = createAdminClient();
    const { data, error } = await adminClient.auth.admin.createUser({
      email: ctx.signup.email,
      email_confirm: true,
      user_metadata: { full_name: ctx.signup.primaryContactName },
    });
    if (error || !data.user) {
      throw new Error(`[provisioning] Supabase auth.admin.createUser failed: ${error?.message ?? 'no user returned'}`);
    }
    userId = data.user.id;

    // Store the new auth UUID on the pending signup for future idempotency.
    await db
      .update(pendingSignups)
      .set({ authUserId: userId, updatedAt: new Date() })
      .where(eq(pendingSignups.signupRequestId, ctx.signup.signupRequestId));

    // Insert the public users mirror row.
    await db
      .insert(users)
      .values({
        id: userId,
        email: ctx.signup.email,
        fullName: ctx.signup.primaryContactName,
        termsAcceptedAt: ctx.signup.termsAcceptedAt,
        termsVersion: ctx.signup.termsVersion,
      })
      // NOT onConflictDoNothing. Provisioning is retried, and this step can run
      // after the users row already exists — with DoNothing the terms columns
      // would be silently skipped on every retry, leaving a signup that DID
      // accept the terms with no record of it.
      //
      // The `set` is deliberately NARROW: only the terms columns. Including
      // email/fullName would let a retry overwrite values a user may have since
      // changed in their profile.
      //
      // Values come from the pending_signups row, never `new Date()` — the
      // acceptance happened at signup, possibly days earlier.
      // See docs/audits/2026-08-09-legal-risk-audit.md F-18.
      .onConflictDoUpdate({
        target: users.id,
        set: {
          termsAcceptedAt: ctx.signup.termsAcceptedAt,
          termsVersion: ctx.signup.termsVersion,
        },
      });
  }

  // Insert role — onConflictDoNothing satisfies ADR-001 one-role-per-community on retry.
  await db
    .insert(userRoles)
    // creator-is-root (v3). Spec §3.5(a).
    .values({ userId, communityId, role: 'root_manager', displayTitle })
    .onConflictDoNothing();
}

async function stepChecklistGenerated(ctx: JobContext): Promise<void> {
  // Apartments get no checklist items. Step runs but inserts nothing so state machine
  // stays uniform (no conditional branching in the loop).
  if (ctx.signup.communityType === 'apartment') return;

  const db = createUnscopedClient();
  const communityId = ctx.communityId;
  if (!communityId) throw new Error('[provisioning] checklist_generated: communityId not set');

  const templates = getComplianceTemplate(ctx.signup.communityType);
  const now = new Date();

  const rows = templates.map((t) => ({
    communityId,
    templateKey: t.templateKey,
    title: t.title,
    description: t.description,
    category: t.category,
    statuteReference: t.statuteReference,
    deadline: t.deadlineDays ? calculatePostingDeadline(now, t.deadlineDays) : null,
    rollingWindow: t.rollingMonths ? { months: t.rollingMonths } : null,
    isConditional: t.isConditional ?? false,
  }));

  await db
    .insert(complianceChecklistItems)
    .values(rows)
    .onConflictDoNothing();
}

async function stepCategoriesCreated(ctx: JobContext): Promise<void> {
  const db = createUnscopedClient();
  const communityId = ctx.communityId;
  if (!communityId) throw new Error('[provisioning] categories_created: communityId not set');

  const templates = getDefaultDocumentCategories(ctx.signup.communityType);

  const rows = templates.map((t) => ({
    communityId,
    name: t.name,
    description: t.description,
    isSystem: true,
  }));

  await db
    .insert(documentCategories)
    .values(rows)
    .onConflictDoNothing();
}

async function stepPreferencesSet(ctx: JobContext): Promise<void> {
  const db = createUnscopedClient();
  const communityId = ctx.communityId;
  if (!communityId) throw new Error('[provisioning] preferences_set: communityId not set');

  // Look up the admin userId from user_roles (set in user_linked step).
  const [roleRow] = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    // BILINGUAL (role-v3): collapse to v3-only at Phase 4 cleanup
    .where(and(eq(userRoles.communityId, communityId), inArray(userRoles.role, [...PM_SCOPE_DB_ROLES])))
    .limit(1);

  if (!roleRow) {
    throw new Error('[provisioning] preferences_set: no user_role found for community');
  }

  await db
    .insert(notificationPreferences)
    .values({
      userId: roleRow.userId,
      communityId,
      emailFrequency: 'immediate',
      emailAnnouncements: true,
      emailMeetings: true,
      inAppEnabled: true,
    })
    .onConflictDoNothing();
}

async function stepEmailSent(ctx: JobContext): Promise<void> {
  // Idempotency: if this step already succeeded on a prior run, skip re-send.
  if (ctx.lastSuccessfulStatus === 'email_sent' || ctx.lastSuccessfulStatus === 'completed') return;

  const communityId = ctx.communityId;
  if (!communityId) throw new Error('[provisioning] email_sent: communityId not set');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) {
    throw new Error('[provisioning] NEXT_PUBLIC_APP_URL env var not set');
  }
  const loginUrl = `${baseUrl}/auth/login`;

  await sendEmail({
    to: ctx.signup.email,
    subject: `Welcome to PropertyPro — ${ctx.signup.communityName} is ready`,
    category: 'transactional',
    react: createElement(WelcomeEmail, {
      branding: { communityName: ctx.signup.communityName },
      primaryContactName: ctx.signup.primaryContactName,
      communityName: ctx.signup.communityName,
      loginUrl,
    }),
  });
}

async function stepCompleted(ctx: JobContext): Promise<void> {
  const db = createUnscopedClient();

  // Guard: never mark a signup terminal without an admin role wired up. A
  // surprising number of orphans surfaced (communities 281/474, recovered
  // 2026-04-24) had active Stripe subs but no user_roles row — the user_linked
  // step had silently no-op'd or its insert had been wiped. Failing loudly here
  // keeps the job recoverable instead of masking the gap with status='completed'.
  if (!ctx.communityId) {
    throw new Error('[provisioning] completed: communityId not set — refusing to mark signup terminal');
  }

  const [adminRole] = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    // BILINGUAL (role-v3): collapse to v3-only at Phase 4 cleanup
    .where(and(eq(userRoles.communityId, ctx.communityId), inArray(userRoles.role, [...PM_SCOPE_DB_ROLES])))
    .limit(1);

  if (!adminRole) {
    throw new Error(
      `[provisioning] completed: no admin user_role found for community ${ctx.communityId} — `
        + 'refusing to mark signup terminal (would leave an orphaned community)',
    );
  }

  const now = new Date();

  await db
    .update(pendingSignups)
    .set({ status: 'completed', updatedAt: now })
    .where(eq(pendingSignups.signupRequestId, ctx.signup.signupRequestId));
}

// ---------------------------------------------------------------------------
// Step dispatcher
// ---------------------------------------------------------------------------

async function runStep(step: ProvisioningStepSuccess, ctx: JobContext): Promise<void> {
  switch (step) {
    case 'community_created':  return stepCommunityCreated(ctx);
    case 'user_linked':        return stepUserLinked(ctx);
    case 'checklist_generated': return stepChecklistGenerated(ctx);
    case 'categories_created': return stepCategoriesCreated(ctx);
    case 'preferences_set':    return stepPreferencesSet(ctx);
    case 'email_sent':         return stepEmailSent(ctx);
    case 'completed':          return stepCompleted(ctx);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run (or resume) the provisioning state machine for the given job.
 *
 * Idempotent: safe to call multiple times for the same jobId.
 * If the job is already completed, returns immediately with no mutations.
 * If the job failed previously, resumes from lastSuccessfulStatus.
 */
export async function runProvisioning(jobId: number): Promise<void> {
  const db = createUnscopedClient();

  // Load the job.
  const [job] = await db
    .select()
    .from(provisioningJobs)
    .where(eq(provisioningJobs.id, jobId))
    .limit(1);

  if (!job) {
    throw new Error(`[provisioning] job ${jobId} not found`);
  }

  // Already done — no-op.
  if (job.status === 'completed') return;

  // Business idempotency is enforced by the UNIQUE INDEX on provisioning_jobs.signup_request_id.
  // Only one row per signupRequestId can ever exist, so there can never be a "different completed
  // sibling" job for the same request. The job-level guard above (status === 'completed') is the
  // only check needed here.

  // Load the pending signup.
  if (!job.signupRequestId) {
    throw new Error(`[provisioning] job ${jobId} has no signupRequestId`);
  }

  const [signup] = await db
    .select({
      signupRequestId: pendingSignups.signupRequestId,
      authUserId: pendingSignups.authUserId,
      primaryContactName: pendingSignups.primaryContactName,
      email: pendingSignups.email,
      communityName: pendingSignups.communityName,
      communityType: pendingSignups.communityType,
      address: pendingSignups.address,
      addressLine1: pendingSignups.addressLine1,
      city: pendingSignups.city,
      state: pendingSignups.state,
      zipCode: pendingSignups.zipCode,
      candidateSlug: pendingSignups.candidateSlug,
      planKey: pendingSignups.planKey,
      payload: pendingSignups.payload,
      termsAcceptedAt: pendingSignups.termsAcceptedAt,
      termsVersion: pendingSignups.termsVersion,
    })
    .from(pendingSignups)
    .where(eq(pendingSignups.signupRequestId, job.signupRequestId))
    .limit(1);

  if (!signup) {
    throw new Error(`[provisioning] pending signup not found for signupRequestId ${job.signupRequestId}`);
  }

  const ctx: JobContext = {
    jobId,
    communityId: job.communityId ?? null,
    signup: signup as PendingSignupRow,
    lastSuccessfulStatus: job.lastSuccessfulStatus ?? null,
  };

  // Mark started_at on first run.
  if (!job.startedAt) {
    await db
      .update(provisioningJobs)
      .set({ startedAt: new Date() })
      .where(eq(provisioningJobs.id, jobId));
  }

  // Mark provisioning in-progress on pending_signups (no-op on resume).
  await db
    .update(pendingSignups)
    .set({ status: 'provisioning', updatedAt: new Date() })
    .where(
      and(
        eq(pendingSignups.signupRequestId, ctx.signup.signupRequestId),
        eq(pendingSignups.status, 'payment_completed'),
      ),
    );

  // State machine loop.
  let step = nextStep(job.lastSuccessfulStatus ?? null);

  while (true) {
    try {
      await runStep(step, ctx);

      // Persist step success.
      const isTerminal = step === 'completed';
      await db
        .update(provisioningJobs)
        .set({
          status: step,
          lastSuccessfulStatus: step,
          ...(isTerminal ? { completedAt: new Date() } : {}),
        })
        .where(eq(provisioningJobs.id, jobId));

      if (isTerminal) break;
      step = nextStep(step);
    } catch (err) {
      // Persist failure — do NOT overwrite lastSuccessfulStatus.
      await db
        .update(provisioningJobs)
        .set({
          status: 'failed',
          retryCount: sql`${provisioningJobs.retryCount} + 1`,
          errorMessage: err instanceof Error ? err.message : String(err),
        })
        .where(eq(provisioningJobs.id, jobId));

      throw err; // re-throw so caller can capture to Sentry
    }
  }
}

export interface ProvisioningWatchdogOptions {
  now?: Date;
  staleAfterMs?: number;
  maxJobs?: number;
  maxRetryCount?: number;
}

export interface ProvisioningWatchdogSummary {
  scanned: number;
  attempted: number;
  completed: number;
  failed: number;
  failures: Array<{
    jobId: number;
    signupRequestId: string | null;
    errorMessage: string;
  }>;
  /**
   * Communities with live Stripe subscriptions but no `user_roles` rows.
   * The watchdog cannot auto-repair these (we don't know who the rightful
   * owner should be), so it surfaces them for manual triage. Empty in the
   * happy case.
   */
  orphans: Array<{
    communityId: number;
    slug: string;
    subscriptionStatus: string | null;
    stripeCustomerId: string | null;
  }>;
}

/**
 * Finds paid signups whose provisioning job is stuck and resumes them through
 * the same idempotent state machine used by the Stripe webhook/manual retry.
 *
 * This is the durable safety net for non-terminal jobs: if a webhook retry,
 * deployment interruption, timeout, or historical fire-and-forget loss leaves
 * payment completed but provisioning unfinished, this watchdog can finish it.
 */
export async function recoverStuckProvisioningJobs(
  options: ProvisioningWatchdogOptions = {},
): Promise<ProvisioningWatchdogSummary> {
  const db = createUnscopedClient();
  const now = options.now ?? new Date();
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const maxJobs = options.maxJobs ?? DEFAULT_MAX_JOBS;
  const maxRetryCount = options.maxRetryCount ?? DEFAULT_MAX_RETRY_COUNT;
  const staleBefore = new Date(now.getTime() - staleAfterMs);

  const rows = await db
    .select({
      id: provisioningJobs.id,
      signupRequestId: provisioningJobs.signupRequestId,
      status: provisioningJobs.status,
      startedAt: provisioningJobs.startedAt,
      signupUpdatedAt: pendingSignups.updatedAt,
    })
    .from(provisioningJobs)
    .innerJoin(
      pendingSignups,
      eq(provisioningJobs.signupRequestId, pendingSignups.signupRequestId),
    )
    .where(
      and(
        inArray(provisioningJobs.status, [...RECOVERABLE_JOB_STATUSES]),
        inArray(pendingSignups.status, [...RECOVERABLE_SIGNUP_STATUSES]),
        sql`coalesce(${provisioningJobs.retryCount}, 0) < ${maxRetryCount}`,
        or(
          // Webhook inserted the job but the background promise never reached runProvisioning().
          and(
            eq(provisioningJobs.status, 'initiated'),
            isNull(provisioningJobs.startedAt),
            lt(pendingSignups.updatedAt, staleBefore),
          ),
          // Provisioning started but the process died before a terminal checkpoint.
          and(
            lt(provisioningJobs.startedAt, staleBefore),
            sql`${provisioningJobs.status} <> 'completed'`,
          ),
          // Explicit failures are safe to retry because runProvisioning resumes
          // after lastSuccessfulStatus and each step is idempotent.
          eq(provisioningJobs.status, 'failed'),
        ),
      ),
    )
    .orderBy(asc(pendingSignups.updatedAt))
    .limit(maxJobs);

  const summary: ProvisioningWatchdogSummary = {
    scanned: rows.length,
    attempted: 0,
    completed: 0,
    failed: 0,
    failures: [],
    orphans: [],
  };

  for (const row of rows) {
    summary.attempted += 1;
    try {
      await runProvisioning(row.id);
      summary.completed += 1;
    } catch (err) {
      summary.failed += 1;
      summary.failures.push({
        jobId: row.id,
        signupRequestId: row.signupRequestId ?? null,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Surface true orphans — communities with active billing but no admin role,
  // outside the provisioning_jobs/pending_signups path entirely. These are
  // historical or otherwise off-machine (community 281 was created via an old
  // signup flow with no audit trail; community 474 was a slug-collision retry
  // detritus — both recovered 2026-04-24). The watchdog can't safely guess an
  // owner, so it just lists them for the cron handler to log and alert.
  summary.orphans = await findOrphanCommunities();

  return summary;
}

export interface ReconcileLostCheckoutSummary {
  /** checkout_started signups older than the stale window with no job row. */
  scanned: number;
  /** Paid-and-complete sessions that were driven back into provisioning. */
  recovered: number;
  /** Sessions that were not yet complete (genuinely abandoned) — left alone. */
  skippedNotComplete: number;
  /** Recovery attempts that threw (Stripe/DB error) — row left for next run. */
  failed: number;
  failures: Array<{ signupRequestId: string; errorMessage: string }>;
}

/**
 * A1: durable recovery for a charged customer whose `checkout.session.completed`
 * webhook was permanently lost.
 *
 * `recoverStuckProvisioningJobs` cannot see these — it INNER JOINs
 * `provisioning_jobs`, and a lost webhook means no job row was ever created; the
 * signup is stuck at `checkout_started`. This pass scans those stale signups,
 * asks Stripe whether the session actually completed (trials complete with
 * `no_payment_required`, so we gate on `status === 'complete'`, same as the
 * webhook), and if so drives the exact idempotent helpers the webhook uses.
 *
 * Idempotent: the business-key uniqueness (signup_request_id, slug) means a
 * delayed real webhook landing mid-reconcile creates no duplicate community.
 */
export async function reconcileLostCheckoutSignups(
  options: ProvisioningWatchdogOptions = {},
): Promise<ReconcileLostCheckoutSummary> {
  const db = createUnscopedClient();
  const now = options.now ?? new Date();
  const staleAfterMs = options.staleAfterMs ?? RECONCILE_STALE_AFTER_MS;
  const maxJobs = options.maxJobs ?? DEFAULT_MAX_JOBS;
  const staleBefore = new Date(now.getTime() - staleAfterMs);

  const rows = await db
    .select({
      signupRequestId: pendingSignups.signupRequestId,
      payload: pendingSignups.payload,
    })
    .from(pendingSignups)
    .where(
      and(
        // `checkout_started` is the lost-webhook case. `payment_completed` /
        // `provisioning` WITHOUT a job row can only arise if a prior reconcile
        // marked the signup paid but then failed before/while inserting the job
        // fence — recoverStuckProvisioningJobs INNER-JOINs jobs so it can't see
        // those. Re-scanning them here makes the reconciler self-healing across
        // its own partial failures (the steps below are all idempotent).
        inArray(pendingSignups.status, ['checkout_started', 'payment_completed', 'provisioning']),
        lt(pendingSignups.updatedAt, staleBefore),
        // The whole point: NO provisioning_jobs row exists (webhook never ran, or
        // the fence insert failed). A signup that already has a job is handled by
        // recoverStuckProvisioningJobs, so NOT EXISTS keeps the two passes disjoint.
        sql`NOT EXISTS (SELECT 1 FROM ${provisioningJobs} WHERE ${provisioningJobs.signupRequestId} = ${pendingSignups.signupRequestId})`,
      ),
    )
    .orderBy(asc(pendingSignups.updatedAt))
    .limit(maxJobs);

  const summary: ReconcileLostCheckoutSummary = {
    scanned: rows.length,
    recovered: 0,
    skippedNotComplete: 0,
    failed: 0,
    failures: [],
  };

  for (const row of rows) {
    const sessionId = (row.payload as Record<string, unknown> | null)?.stripeCheckoutSessionId as
      | string
      | undefined;
    if (!sessionId) {
      // No stored session id — can't reconcile from Stripe deterministically.
      summary.skippedNotComplete += 1;
      continue;
    }

    try {
      const session = await retrieveCheckoutSession(sessionId);
      if (session.status !== 'complete') {
        // Abandoned checkout — leave it for the normal expiry/cleanup path.
        summary.skippedNotComplete += 1;
        continue;
      }

      const stripeCustomerId =
        typeof session.customer === 'string'
          ? session.customer
          : (session.customer as { id: string } | null)?.id ?? null;
      const stripeSubscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : (session.subscription as { id: string } | null)?.id ?? null;
      const subscriptionObject =
        session.subscription && typeof session.subscription !== 'string'
          ? (session.subscription as Stripe.Subscription)
          : null;

      await markPendingSignupPaymentCompleted({
        signupRequestId: row.signupRequestId,
        stripeCustomerId,
        stripeSubscriptionId,
        subscriptionStatus: subscriptionObject?.status ?? null,
        subscriptionCurrentPeriodEndAt: subscriptionObject
          ? resolveSubscriptionPeriodEndAt(subscriptionObject)
          : null,
      });
      await insertProvisioningJobFence({
        signupRequestId: row.signupRequestId,
        stripeEventId: `reconcile:${sessionId}`,
      });
      const jobId = await getProvisioningJobIdBySignupRequestId(row.signupRequestId);
      if (jobId !== null) {
        await runProvisioning(jobId);
      }
      summary.recovered += 1;
    } catch (err) {
      summary.failed += 1;
      summary.failures.push({
        signupRequestId: row.signupRequestId,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}

const ORPHAN_GRACE_MS = 30 * 60 * 1000;

/**
 * Live communities with billing but no admin user_role. Excludes:
 *   - demos and soft-deleted rows
 *   - communities younger than ORPHAN_GRACE_MS (still in the provisioning race
 *     window — the Stripe webhook can stamp `subscription_status='active'`
 *     between `stepCommunityCreated` and `stepUserLinked`, so a freshly-paid
 *     signup briefly looks like an orphan)
 *   - communities with an in-flight provisioning_jobs row (will be retried
 *     through the normal recovery loop)
 * Used by the watchdog to surface manual-triage candidates only.
 */
export async function findOrphanCommunities(
  options: { now?: Date; graceMs?: number } = {},
): Promise<ProvisioningWatchdogSummary['orphans']> {
  const db = createUnscopedClient();
  const now = options.now ?? new Date();
  const graceMs = options.graceMs ?? ORPHAN_GRACE_MS;
  const cutoff = new Date(now.getTime() - graceMs);

  const rows = await db
    .select({
      id: communities.id,
      slug: communities.slug,
      subscriptionStatus: communities.subscriptionStatus,
      stripeCustomerId: communities.stripeCustomerId,
    })
    .from(communities)
    .where(
      and(
        isNull(communities.deletedAt),
        eq(communities.isDemo, false),
        inArray(communities.subscriptionStatus, ['active', 'past_due', 'trialing']),
        lt(communities.createdAt, cutoff),
        sql`NOT EXISTS (SELECT 1 FROM ${userRoles} WHERE ${userRoles.communityId} = ${communities.id})`,
        sql`NOT EXISTS (SELECT 1 FROM ${provisioningJobs} WHERE ${provisioningJobs.communityId} = ${communities.id} AND ${provisioningJobs.status} NOT IN ('completed', 'failed'))`,
      ),
    )
    .limit(50);

  return rows.map((r) => ({
    communityId: r.id,
    slug: r.slug,
    subscriptionStatus: r.subscriptionStatus,
    stripeCustomerId: r.stripeCustomerId,
  }));
}

// ---------------------------------------------------------------------------
// add_to_group provisioning path
// ---------------------------------------------------------------------------

export interface AddToGroupInput {
  pendingSignupId: number;
  billingGroupId: number;
  stripeSubscriptionId: string;
  stripeCustomerId: string | undefined;
}

/**
 * Provisions a new community for an existing PM adding to their billing group.
 *
 * Unlike the main provisioning state machine (which uses provisioningJobs rows),
 * this path is a single async function triggered fire-and-forget from the webhook.
 * It delegates community creation to createCommunityForPm(), then links the
 * community to the billing group and stamps the Stripe billing IDs.
 */
export async function runAddToGroupProvisioning(input: AddToGroupInput): Promise<void> {
  const db = createUnscopedClient();

  // Load pending signup row to get the community input and auth user.
  // pendingSignups.id is bigserial — must compare with BigInt.
  const [signup] = await db
    .select()
    .from(pendingSignups)
    .where(eq(pendingSignups.id, BigInt(input.pendingSignupId)))
    .limit(1);

  if (!signup) {
    throw new Error(`[add_to_group] pending_signup ${input.pendingSignupId} not found`);
  }
  if (!signup.authUserId) {
    throw new Error(`[add_to_group] pending_signup ${input.pendingSignupId} has no authUserId`);
  }

  const payload = signup.payload as {
    kind: 'add_to_group';
    billingGroupId: number;
    fullInput: {
      name: string;
      communityType: 'condo_718' | 'hoa_720' | 'apartment';
      addressLine1: string;
      addressLine2?: string;
      city: string;
      state: string;
      zipCode: string;
      subdomain: string;
      timezone: string;
      unitCount: number;
    };
  };

  // 1. Create the community (inserts community, user role, doc categories, notification prefs,
  //    checklist items, and audit log entry).
  const { communityId } = await createCommunityForPm({
    userId: signup.authUserId,
    ...payload.fullInput,
  });

  // 2. Link to billing group.
  await linkCommunityToBillingGroup(communityId, input.billingGroupId);

  // 3. Stamp Stripe billing IDs on the new community.
  await db
    .update(communities)
    .set({
      stripeSubscriptionId: input.stripeSubscriptionId,
      stripeCustomerId: input.stripeCustomerId ?? null,
      subscriptionStatus: 'active',
      subscriptionPlan: signup.planKey,
      updatedAt: new Date(),
    })
    .where(eq(communities.id, communityId));

  // 4. Mark signup completed.
  // pendingSignups.id is bigserial — must compare with BigInt.
  await db
    .update(pendingSignups)
    .set({ status: 'completed', updatedAt: new Date() })
    .where(eq(pendingSignups.id, BigInt(input.pendingSignupId)));

  // 5. Recalculate volume tier — may upgrade the whole group's Stripe discount.
  await recalculateVolumeTier(input.billingGroupId);
}

// ---------------------------------------------------------------------------
// Provisioning status polling helpers (used by /api/v1/auth/provisioning-status)
// ---------------------------------------------------------------------------

export interface ProvisioningJobStatusRow {
  id: number;
  signupRequestId: string | null;
  communityId: number | null;
  status: string;
  lastSuccessfulStatus: string | null;
}

/**
 * Fetch the status-polling projection of a provisioning_jobs row by signup
 * request id. Returns `null` when no job has been created yet (normal during
 * the first few polls after checkout, before the Stripe webhook fires).
 *
 * AUTHZ: pre-auth public endpoint — secured by the unguessable
 * `signupRequestId` UUID. Caller MUST validate the param shape before
 * invoking.
 */
export async function getProvisioningJobBySignupRequestId(
  signupRequestId: string,
): Promise<ProvisioningJobStatusRow | null> {
  const db = createUnscopedClient();
  const [row] = await db
    .select({
      id: provisioningJobs.id,
      signupRequestId: provisioningJobs.signupRequestId,
      communityId: provisioningJobs.communityId,
      status: provisioningJobs.status,
      lastSuccessfulStatus: provisioningJobs.lastSuccessfulStatus,
    })
    .from(provisioningJobs)
    .where(eq(provisioningJobs.signupRequestId, signupRequestId))
    .limit(1);
  return row ?? null;
}

export interface PendingSignupTokenRow {
  email: string;
  payload: Record<string, unknown> | null;
  signupRequestId: string;
  loginTokenConsumedAt: Date | null;
}

/** Result of an attempt to issue a single-use magic-link login token. */
export type IssueLoginTokenResult =
  | { status: 'issued'; token: string }
  | { status: 'consumed' }
  | { status: 'error' };

const LOGIN_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch the email + token lifecycle state for a pending signup, used by the
 * post-completion magic-link path in the status poller. Returns `null` when no
 * pending_signups row matches.
 *
 * AUTHZ: same pre-auth endpoint as `getProvisioningJobBySignupRequestId`.
 */
export async function getPendingSignupBySignupRequestId(
  signupRequestId: string,
): Promise<PendingSignupTokenRow | null> {
  const db = createUnscopedClient();
  const [row] = await db
    .select({
      email: pendingSignups.email,
      payload: pendingSignups.payload,
      signupRequestId: pendingSignups.signupRequestId,
      loginTokenConsumedAt: pendingSignups.loginTokenConsumedAt,
    })
    .from(pendingSignups)
    .where(eq(pendingSignups.signupRequestId, signupRequestId))
    .limit(1);
  if (!row) return null;
  return {
    email: row.email,
    payload: (row.payload ?? null) as Record<string, unknown> | null,
    signupRequestId: row.signupRequestId,
    loginTokenConsumedAt: row.loginTokenConsumedAt ?? null,
  };
}

/**
 * Issue a SINGLE-USE magic-link login token for a completed provisioning
 * signup. Generates a fresh Supabase magic link, then atomically claims it by
 * stamping login_token_issued_at + login_token_consumed_at guarded by
 * `WHERE login_token_consumed_at IS NULL OR login_token_issued_at < ttlCutoff`.
 *
 * - `issued` — this caller won the claim; return the token to the browser.
 * - `consumed` — a concurrent poll (or an earlier poll / leaked-id replay)
 *   already claimed the token; return NO token.
 * - `error` — Supabase failed to generate a link (caller responds 500).
 *
 * The TTL lets a fresh token be minted if the genuine browser closed before
 * consuming the previous one (stale unused window), without ever re-serving a
 * previously-consumed token.
 */
export async function issueSingleUseLoginToken(
  signupRequestId: string,
  email: string,
): Promise<IssueLoginTokenResult> {
  const admin = createAdminClient();
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    console.error(
      '[provisioning-service] Failed to generate magic link:',
      linkError?.message,
    );
    return { status: 'error' };
  }

  const token: string = linkData.properties.hashed_token;
  const now = new Date();
  const ttlCutoff = new Date(now.getTime() - LOGIN_TOKEN_TTL_MS);

  const db = createUnscopedClient();
  // Atomic single-use claim: only stamp the token if not already consumed
  // (or the prior issuance is older than the TTL). A concurrent poll that
  // already claimed leaves 0 rows here, so we surface 'consumed' rather than
  // double-issuing.
  const [claimed] = await db
    .update(pendingSignups)
    .set({
      loginTokenIssuedAt: now,
      loginTokenConsumedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(pendingSignups.signupRequestId, signupRequestId),
        or(
          isNull(pendingSignups.loginTokenConsumedAt),
          lt(pendingSignups.loginTokenIssuedAt, ttlCutoff),
        ),
      ),
    )
    .returning({ id: pendingSignups.id });

  if (!claimed) {
    return { status: 'consumed' };
  }

  return { status: 'issued', token };
}

// ---------------------------------------------------------------------------
// Email verification confirmation helpers (used by /api/v1/auth/confirm-verification)
// ---------------------------------------------------------------------------

export interface PendingSignupForVerification {
  id: bigint;
  signupRequestId: string;
  authUserId: string | null;
  status: string;
  expiresAt: Date | null;
}

/**
 * Fetch the projection needed by the email-verification confirmation flow.
 * Returns `null` when the signup request id doesn't match a row.
 *
 * AUTHZ: pre-tenant pre-auth public endpoint — secured by the unguessable
 * `signupRequestId`. Caller validates payload shape before invoking.
 */
export async function getPendingSignupForVerification(
  signupRequestId: string,
): Promise<PendingSignupForVerification | null> {
  const db = createUnscopedClient();
  const [row] = await db
    .select({
      id: pendingSignups.id,
      signupRequestId: pendingSignups.signupRequestId,
      authUserId: pendingSignups.authUserId,
      status: pendingSignups.status,
      expiresAt: pendingSignups.expiresAt,
    })
    .from(pendingSignups)
    .where(eq(pendingSignups.signupRequestId, signupRequestId))
    .limit(1);
  return row ?? null;
}

export type SupabaseEmailVerificationResult =
  | { ok: true; emailConfirmedAt: string | null }
  | { ok: false; error: string };

/**
 * Look up the Supabase auth user by id and return whether their email is
 * confirmed. Wraps the auth-admin call so the route doesn't need to import
 * `@propertypro/db/supabase/admin` directly.
 */
export async function getSupabaseEmailVerificationStatus(
  authUserId: string,
): Promise<SupabaseEmailVerificationResult> {
  const admin = createAdminClient();
  const { data: authUser, error: authError } = await admin.auth.admin.getUserById(
    authUserId,
  );
  if (authError || !authUser?.user) {
    return { ok: false, error: authError?.message ?? 'User not found' };
  }
  return {
    ok: true,
    emailConfirmedAt: (authUser.user.email_confirmed_at as string | null) ?? null,
  };
}

export interface MarkEmailVerifiedResult {
  /** True when this call performed the transition (1 row updated). */
  updated: boolean;
  /**
   * Current status after the attempted transition. When `updated=true`, this
   * is `'email_verified'`. When `updated=false`, this is whatever the row
   * currently holds (or `null` if it disappeared, which would be a bug).
   */
  currentStatus: string | null;
}

/**
 * Attempt to transition a pending_signups row from `pending_verification` to
 * `email_verified`. Uses a CAS-style WHERE predicate to prevent TOCTOU
 * races: only updates when the row is currently `pending_verification`.
 *
 * On race (0 rows updated), re-reads the row's status so the caller can
 * decide whether the loser branch is still a successful idempotent outcome
 * (`email_verified` / `checkout_started`) or a hard error (any other status).
 */
export async function markPendingSignupEmailVerifiedIfPending(
  signupRequestId: string,
): Promise<MarkEmailVerifiedResult> {
  const db = createUnscopedClient();
  const updatedRows = await db
    .update(pendingSignups)
    .set({
      status: 'email_verified',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(pendingSignups.signupRequestId, signupRequestId),
        eq(pendingSignups.status, 'pending_verification'),
      ),
    )
    .returning({ id: pendingSignups.id });

  if (updatedRows.length > 0) {
    return { updated: true, currentStatus: 'email_verified' };
  }

  // Race: re-read the row's status so the caller can branch on it.
  const recheck = await db
    .select({ status: pendingSignups.status })
    .from(pendingSignups)
    .where(eq(pendingSignups.signupRequestId, signupRequestId))
    .limit(1);
  return { updated: false, currentStatus: recheck[0]?.status ?? null };
}

// ---------------------------------------------------------------------------
// Resend verification email helpers (used by /api/v1/auth/resend-verification)
// ---------------------------------------------------------------------------

export interface PendingSignupForResend {
  id: bigint;
  signupRequestId: string;
  authUserId: string | null;
  email: string;
  primaryContactName: string | null;
  communityName: string | null;
  status: string;
  expiresAt: Date | null;
  verificationEmailSentAt: Date | null;
}

/**
 * Fetch the projection needed by the resend-verification flow. Returns
 * `null` when no row matches the signup request id.
 *
 * AUTHZ: pre-tenant pre-auth public endpoint — secured by the unguessable
 * `signupRequestId` UUID. Caller validates payload shape before invoking.
 */
export async function getPendingSignupForResend(
  signupRequestId: string,
): Promise<PendingSignupForResend | null> {
  const db = createUnscopedClient();
  const [row] = await db
    .select({
      id: pendingSignups.id,
      signupRequestId: pendingSignups.signupRequestId,
      authUserId: pendingSignups.authUserId,
      email: pendingSignups.email,
      primaryContactName: pendingSignups.primaryContactName,
      communityName: pendingSignups.communityName,
      status: pendingSignups.status,
      expiresAt: pendingSignups.expiresAt,
      verificationEmailSentAt: pendingSignups.verificationEmailSentAt,
    })
    .from(pendingSignups)
    .where(eq(pendingSignups.signupRequestId, signupRequestId))
    .limit(1);
  return row ?? null;
}

export type SupabaseVerificationLinkResult =
  | { ok: true; actionLink: string }
  | { ok: false; error: string };

/**
 * Generate a Supabase magic-link "action_link" suitable for embedding into a
 * verification email body. Returns the URL string on success or an error
 * message on failure (caller should respond with 500 + log).
 *
 * Wraps the auth-admin client so the route doesn't need to import
 * `@propertypro/db/supabase/admin` directly.
 */
export async function generateVerificationActionLink(params: {
  signupRequestId: string;
  email: string;
  redirectTo: string;
}): Promise<SupabaseVerificationLinkResult> {
  const admin = createAdminClient();
  const linkResult = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: params.email,
    options: {
      redirectTo: params.redirectTo,
      data: { signup_request_id: params.signupRequestId },
    },
  });
  const actionLink = linkResult.data?.properties?.action_link;
  if (linkResult.error || !actionLink) {
    return {
      ok: false,
      error: linkResult.error?.message ?? 'No action link returned',
    };
  }
  return { ok: true, actionLink };
}

/**
 * Persist the verification-email send metadata
 * (`verificationEmailSentAt = now`, `verificationEmailId = messageId`,
 * `updatedAt = now`) for cooldown tracking and observability.
 */
export async function markVerificationEmailSent(
  pendingSignupId: bigint,
  messageId: string,
): Promise<void> {
  const now = new Date();
  const db = createUnscopedClient();
  await db
    .update(pendingSignups)
    .set({
      verificationEmailSentAt: now,
      verificationEmailId: messageId,
      updatedAt: now,
    })
    .where(eq(pendingSignups.id, pendingSignupId));
}

// ---------------------------------------------------------------------------
// Provisioning retry helpers (used by /api/v1/internal/provision)
// ---------------------------------------------------------------------------

export interface ProvisioningJobSummary {
  id: number;
  status: string;
  lastSuccessfulStatus: string | null;
  retryCount: number | null;
}

/**
 * Look up a provisioning job by its `signupRequestId`. Returns the minimal
 * summary projection used by the internal retry endpoint, or `null` when no
 * row matches.
 *
 * AUTHZ: cron/admin-only — caller MUST validate the provisioning-retry
 * secret BEFORE invoking.
 */
export async function findProvisioningJobBySignupRequestId(
  signupRequestId: string,
): Promise<ProvisioningJobSummary | null> {
  const db = createUnscopedClient();
  const [row] = await db
    .select({
      id: provisioningJobs.id,
      status: provisioningJobs.status,
      lastSuccessfulStatus: provisioningJobs.lastSuccessfulStatus,
      retryCount: provisioningJobs.retryCount,
    })
    .from(provisioningJobs)
    .where(eq(provisioningJobs.signupRequestId, signupRequestId))
    .limit(1);
  return row ?? null;
}

/**
 * Re-fetch the same minimal summary projection by primary key. Used after
 * `runProvisioning` so the caller can return the post-run state.
 *
 * AUTHZ: cron/admin-only — caller MUST validate the provisioning-retry
 * secret BEFORE invoking.
 */
export async function getProvisioningJobSummaryById(
  jobId: number,
): Promise<ProvisioningJobSummary | null> {
  const db = createUnscopedClient();
  const [row] = await db
    .select({
      id: provisioningJobs.id,
      status: provisioningJobs.status,
      lastSuccessfulStatus: provisioningJobs.lastSuccessfulStatus,
      retryCount: provisioningJobs.retryCount,
    })
    .from(provisioningJobs)
    .where(eq(provisioningJobs.id, jobId))
    .limit(1);
  return row ?? null;
}

export const _testInternals = {
  resolvePendingSignupAddress,
} as const;
