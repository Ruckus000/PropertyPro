/**
 * Provisioning service — P2-35
 *
 * Implements the resumable state machine that creates a complete community
 * on successful Stripe checkout. Triggered fire-and-forget from the webhook
 * handler after a provisioning_jobs stub is inserted at status='initiated'.
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
import { and, eq, sql } from '@propertypro/db/filters';
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
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { createAdminClient } from '@propertypro/db';
import { WelcomeEmail, sendEmail } from '@propertypro/email';

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
// Static compliance checklist templates
// ---------------------------------------------------------------------------

type ChecklistTemplate = {
  templateKey: string;
  title: string;
  description: string;
  category: string;
  statuteReference: string;
};

const CONDO_718_CHECKLIST: ChecklistTemplate[] = [
  {
    templateKey: '718_articles_of_incorporation',
    title: 'Articles of Incorporation',
    description: 'Association articles of incorporation must be posted on the website.',
    category: 'governing_documents',
    statuteReference: '§718.111(12)(a)1',
  },
  {
    templateKey: '718_bylaws',
    title: 'Bylaws',
    description: 'Association bylaws must be posted on the website.',
    category: 'governing_documents',
    statuteReference: '§718.111(12)(a)2',
  },
  {
    templateKey: '718_rules',
    title: 'Rules and Regulations',
    description: 'Current rules and regulations must be posted on the website.',
    category: 'governing_documents',
    statuteReference: '§718.111(12)(a)3',
  },
  {
    templateKey: '718_declaration',
    title: 'Declaration of Condominium',
    description: 'Declaration of condominium must be posted on the website.',
    category: 'governing_documents',
    statuteReference: '§718.111(12)(a)4',
  },
  {
    templateKey: '718_budget_current',
    title: 'Current Year Budget',
    description: 'Current year adopted budget must be posted within 30 days of adoption.',
    category: 'financial_records',
    statuteReference: '§718.111(12)(a)5',
  },
  {
    templateKey: '718_financial_report',
    title: 'Annual Financial Report',
    description: 'Most recent annual financial report or financial statement.',
    category: 'financial_records',
    statuteReference: '§718.111(12)(a)6',
  },
  {
    templateKey: '718_meeting_minutes',
    title: 'Board Meeting Minutes',
    description: 'Minutes of all board meetings for the past 12 months.',
    category: 'meeting_records',
    statuteReference: '§718.111(12)(a)7',
  },
  {
    templateKey: '718_notice_annual',
    title: 'Annual Meeting Notice',
    description: '14-day advance notice required for annual owner meetings.',
    category: 'meeting_records',
    statuteReference: '§718.112(2)(d)',
  },
];

const HOA_720_CHECKLIST: ChecklistTemplate[] = [
  {
    templateKey: '720_articles_of_incorporation',
    title: 'Articles of Incorporation',
    description: 'Association articles of incorporation must be posted on the website.',
    category: 'governing_documents',
    statuteReference: '§720.303(5)(a)1',
  },
  {
    templateKey: '720_bylaws',
    title: 'Bylaws',
    description: 'Association bylaws must be posted on the website.',
    category: 'governing_documents',
    statuteReference: '§720.303(5)(a)2',
  },
  {
    templateKey: '720_declaration',
    title: 'Declaration of Covenants',
    description: 'Declaration of covenants, conditions, and restrictions.',
    category: 'governing_documents',
    statuteReference: '§720.303(5)(a)3',
  },
  {
    templateKey: '720_rules',
    title: 'Rules and Regulations',
    description: 'Current rules and regulations must be posted.',
    category: 'governing_documents',
    statuteReference: '§720.303(5)(a)4',
  },
  {
    templateKey: '720_budget_current',
    title: 'Current Year Budget',
    description: 'Current year adopted budget must be posted within 30 days of adoption.',
    category: 'financial_records',
    statuteReference: '§720.303(5)(a)5',
  },
  {
    templateKey: '720_meeting_minutes',
    title: 'Board Meeting Minutes',
    description: 'Minutes of all board meetings for the past 12 months.',
    category: 'meeting_records',
    statuteReference: '§720.303(5)(b)',
  },
];

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
  candidateSlug: string;
};

type JobContext = {
  jobId: number;
  communityId: number | null;
  signup: PendingSignupRow;
  lastSuccessfulStatus: string | null;
};

async function stepCommunityCreated(ctx: JobContext): Promise<void> {
  const db = createUnscopedClient();

  // Insert the community — slug unique constraint prevents duplicates on retry.
  // Use onConflictDoNothing to tolerate exact-duplicate retries.
  const [inserted] = await db
    .insert(communities)
    .values({
      name: ctx.signup.communityName,
      slug: ctx.signup.candidateSlug,
      communityType: ctx.signup.communityType,
      addressLine1: ctx.signup.address,
      timezone: 'America/New_York',
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

  const role =
    ctx.signup.communityType === 'condo_718' || ctx.signup.communityType === 'hoa_720'
      ? 'board_president'
      : 'site_manager';

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
    .values({ userId, communityId, role })
    .onConflictDoNothing();
}

async function stepChecklistGenerated(ctx: JobContext): Promise<void> {
  // Apartments get no checklist items. Step runs but inserts nothing so state machine
  // stays uniform (no conditional branching in the loop).
  if (ctx.signup.communityType === 'apartment') return;

  const db = createUnscopedClient();
  const communityId = ctx.communityId;
  if (!communityId) throw new Error('[provisioning] checklist_generated: communityId not set');

  const templates =
    ctx.signup.communityType === 'condo_718' ? CONDO_718_CHECKLIST : HOA_720_CHECKLIST;

  const rows = templates.map((t) => ({
    communityId,
    templateKey: t.templateKey,
    title: t.title,
    description: t.description,
    category: t.category,
    statuteReference: t.statuteReference,
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
  const role =
    ctx.signup.communityType === 'condo_718' || ctx.signup.communityType === 'hoa_720'
      ? 'board_president'
      : 'site_manager';

  const [roleRow] = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(and(eq(userRoles.communityId, communityId), eq(userRoles.role, role)))
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
  const loginUrl = `${baseUrl}/login`;

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
      candidateSlug: pendingSignups.candidateSlug,
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
