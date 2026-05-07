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
import { createAdminClient } from '@propertypro/db';
import {
  linkCommunityToBillingGroup,
  recalculateVolumeTier,
} from '@/lib/billing/billing-group-service';
import { createCommunityForPm } from '@/lib/pm/create-community';
import { WelcomeEmail, sendEmail } from '@propertypro/email';
import { getComplianceTemplate } from '@propertypro/shared';
import { calculatePostingDeadline } from '@/lib/utils/compliance-calculator';
import { resolvePendingSignupAddress } from './provisioning-address';

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
// Default document categories
// ---------------------------------------------------------------------------

type CategoryTemplate = { name: string; description: string };

const CONDO_HOA_CATEGORIES: CategoryTemplate[] = [
  { name: 'Governing Documents', description: 'Articles, bylaws, declarations, and rules' },
  { name: 'Financial Records', description: 'Budgets, financial reports, and audits' },
  { name: 'Meeting Records', description: 'Notices, agendas, and minutes' },
  { name: 'Correspondence', description: 'Owner communications and notices' },
  { name: 'Contracts', description: 'Vendor and service contracts' },
];

const APARTMENT_CATEGORIES: CategoryTemplate[] = [
  { name: 'Lease Agreements', description: 'Signed lease agreements and addenda' },
  { name: 'Maintenance Records', description: 'Work orders and inspection reports' },
  { name: 'Communications', description: 'Tenant notices and correspondence' },
  { name: 'Financials', description: 'Rent rolls and financial summaries' },
  { name: 'Compliance', description: 'Inspections, certifications, and permits' },
];

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
  payload: Record<string, unknown>;
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
  const stripeCustomerId = (ctx.signup.payload as Record<string, unknown>)?.stripeCustomerId as string | null ?? null;
  const stripeSubscriptionId = (ctx.signup.payload as Record<string, unknown>)?.stripeSubscriptionId as string | null ?? null;

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

  // The founding user who signs up and pays gets pm_admin — the highest community-scoped
  // role — so they can access the PM portfolio dashboard and cross-community management
  // from day one. pm_admin has blanket access and doesn't need presets or granular permissions.
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
      })
      .onConflictDoNothing();
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
      })
      .onConflictDoNothing();
  }

  // Insert role — onConflictDoNothing satisfies ADR-001 one-role-per-community on retry.
  await db
    .insert(userRoles)
    .values({ userId, communityId, role: 'pm_admin', presetKey: null, displayTitle, permissions: null })
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

  const templates =
    ctx.signup.communityType === 'apartment' ? APARTMENT_CATEGORIES : CONDO_HOA_CATEGORIES;

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
    .where(and(eq(userRoles.communityId, communityId), eq(userRoles.role, 'pm_admin')))
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
    .where(and(eq(userRoles.communityId, ctx.communityId), eq(userRoles.role, 'pm_admin')))
    .limit(1);

  if (!adminRole) {
    throw new Error(
      `[provisioning] completed: no pm_admin user_role found for community ${ctx.communityId} — `
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
      payload: pendingSignups.payload,
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

export const _testInternals = {
  resolvePendingSignupAddress,
} as const;
