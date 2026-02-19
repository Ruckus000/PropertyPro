/**
 * Payment alert scheduler — P2-34a
 *
 * Processes payment reminder emails for communities with a pending
 * next_reminder_at. Called hourly by the Vercel Cron at
 * /api/v1/internal/payment-reminders.
 *
 * Reminder ladder:
 *   Day 0  — webhook fires sendPaymentFailedEmail() directly
 *   Day 3  — processPaymentReminders() sends Day 3 reminder, advances to Day 7
 *   Day 7  — processPaymentReminders() sends Day 7 escalation, clears pre-cancel schedule
 *   Cancel — webhook fires sendSubscriptionCanceledEmail() directly, sets Day 23 reminder
 *   Day 23 — processPaymentReminders() sends 7-day final expiry warning, clears schedule
 *
 * Uses createUnscopedClient() because the cron scans across all communities.
 */
import { createElement } from 'react';
import { and, eq, inArray, isNull, lte } from '@propertypro/db/filters';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { communities, users, userRoles } from '@propertypro/db';
import {
  PaymentFailedEmail,
  SubscriptionCanceledEmail,
  SubscriptionExpiryWarningEmail,
  sendEmail,
} from '@propertypro/email';

type UserRoleValue =
  | 'owner'
  | 'tenant'
  | 'board_member'
  | 'board_president'
  | 'cam'
  | 'site_manager'
  | 'property_manager_admin';

const MS_PER_DAY = 86_400_000;

/** Community types that follow the condo/HOA admin role model. */
const CONDO_HOA_TYPES = new Set(['condo_718', 'hoa_720']);

/** Roles that receive billing alerts for condo/HOA communities. */
const CONDO_HOA_ADMIN_ROLES: UserRoleValue[] = ['board_president', 'cam'];

/** Roles that receive billing alerts for apartment communities. */
const APARTMENT_ADMIN_ROLES: UserRoleValue[] = ['site_manager', 'property_manager_admin'];

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

function daysDiff(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Admin recipient lookup
// ---------------------------------------------------------------------------

interface AdminRecipient {
  email: string;
  fullName: string;
}

async function lookupAdminRecipients(
  communityId: number,
  communityType: string,
): Promise<AdminRecipient[]> {
  const db = createUnscopedClient();
  const adminRoles: UserRoleValue[] = CONDO_HOA_TYPES.has(communityType)
    ? CONDO_HOA_ADMIN_ROLES
    : APARTMENT_ADMIN_ROLES;

  const rows = await db
    .select({ email: users.email, fullName: users.fullName })
    .from(userRoles)
    .innerJoin(users, eq(userRoles.userId, users.id))
    .where(
      and(
        eq(userRoles.communityId, communityId),
        inArray(userRoles.role, adminRoles),
      ),
    );

  return rows;
}

// ---------------------------------------------------------------------------
// Internal send helpers
// ---------------------------------------------------------------------------

async function sendToAll(
  recipients: AdminRecipient[],
  subject: string,
  buildElement: (r: AdminRecipient) => ReturnType<typeof createElement>,
): Promise<void> {
  if (recipients.length === 0) return;
  await Promise.allSettled(
    recipients.map((r) =>
      sendEmail({ to: r.email, subject, category: 'transactional', react: buildElement(r) }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Public API: sendPaymentFailedEmail (Day 0 — called directly from webhook)
// ---------------------------------------------------------------------------

export interface SendPaymentFailedEmailOpts {
  amountDue: string;
  lastFourDigits: string | null;
  communityName: string;
}

/**
 * Sends a Day 0 PaymentFailedEmail. Called directly by the Stripe webhook handler.
 */
export async function sendPaymentFailedEmail(
  communityId: number,
  opts: SendPaymentFailedEmailOpts,
): Promise<void> {
  const db = createUnscopedClient();
  const communityRows = await db
    .select({ communityType: communities.communityType })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);

  const communityType = communityRows[0]?.communityType ?? 'condo_718';
  const recipients = await lookupAdminRecipients(communityId, communityType);
  if (recipients.length === 0) return;

  const billingPortalUrl = `${getBaseUrl()}/billing/portal?communityId=${communityId}`;

  await sendToAll(
    recipients,
    `Action required: Payment of ${opts.amountDue} failed for ${opts.communityName}`,
    (r) =>
      createElement(PaymentFailedEmail, {
        branding: { communityName: opts.communityName },
        recipientName: r.fullName,
        amountDue: opts.amountDue,
        lastFourDigits: opts.lastFourDigits,
        billingPortalUrl,
      }),
  );
}

// ---------------------------------------------------------------------------
// Public API: sendSubscriptionCanceledEmail (called directly from webhook)
// ---------------------------------------------------------------------------

export interface SendSubscriptionCanceledEmailOpts {
  communityName: string;
  communityType: string;
  canceledAt: Date;
}

/**
 * Sends a cancellation email immediately on subscription deletion.
 * Also schedules the Day 23 reminder via next_reminder_at (done in webhook handler).
 */
export async function sendSubscriptionCanceledEmail(
  communityId: number,
  opts: SendSubscriptionCanceledEmailOpts,
): Promise<void> {
  const recipients = await lookupAdminRecipients(communityId, opts.communityType);
  if (recipients.length === 0) return;

  const billingPortalUrl = `${getBaseUrl()}/billing/portal?communityId=${communityId}`;
  const gracePeriodEnd = addDays(opts.canceledAt, 30);

  await sendToAll(
    recipients,
    `${opts.communityName} subscription canceled — 30-day grace period begins`,
    (r) =>
      createElement(SubscriptionCanceledEmail, {
        branding: { communityName: opts.communityName },
        recipientName: r.fullName,
        canceledAt: formatDate(opts.canceledAt),
        gracePeriodEndDate: formatDate(gracePeriodEnd),
        billingPortalUrl,
      }),
  );
}

// ---------------------------------------------------------------------------
// Public API: processPaymentReminders (hourly cron)
// ---------------------------------------------------------------------------

export interface PaymentReminderSummary {
  communitiesScanned: number;
  emailsSent: number;
  errors: number;
}

/**
 * Process all communities with a due payment reminder (next_reminder_at <= now).
 * The partial index on next_reminder_at (migration 0011) keeps this query cheap.
 */
export async function processPaymentReminders(
  now: Date = new Date(),
): Promise<PaymentReminderSummary> {
  const db = createUnscopedClient();

  const dueCommunities = await db
    .select({
      id: communities.id,
      name: communities.name,
      communityType: communities.communityType,
      paymentFailedAt: communities.paymentFailedAt,
      subscriptionCanceledAt: communities.subscriptionCanceledAt,
    })
    .from(communities)
    .where(and(isNull(communities.deletedAt), lte(communities.nextReminderAt, now)));

  const summary: PaymentReminderSummary = {
    communitiesScanned: dueCommunities.length,
    emailsSent: 0,
    errors: 0,
  };

  for (const community of dueCommunities) {
    try {
      await processCommunityReminder(community, now, db);
      summary.emailsSent += 1;
    } catch (err) {
      console.error(
        `[payment-scheduler] Failed to process community ${community.id}:`,
        err instanceof Error ? err.message : String(err),
      );
      summary.errors += 1;
    }
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Internal: process a single community's pending reminder
// ---------------------------------------------------------------------------

type CommunityReminderRow = {
  id: number;
  name: string;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
  paymentFailedAt: Date | null;
  subscriptionCanceledAt: Date | null;
};

async function processCommunityReminder(
  community: CommunityReminderRow,
  now: Date,
  db: ReturnType<typeof createUnscopedClient>,
): Promise<void> {
  const billingPortalUrl = `${getBaseUrl()}/billing/portal?communityId=${community.id}`;
  const recipients = await lookupAdminRecipients(community.id, community.communityType);

  if (community.subscriptionCanceledAt != null) {
    // Post-cancellation: send the Day 23 expiry warning
    const canceledAt = community.subscriptionCanceledAt;
    const expiryDate = addDays(canceledAt, 30);

    await sendToAll(
      recipients,
      `Final warning: ${community.name} portal access expires ${formatDate(expiryDate)}`,
      (r) =>
        createElement(SubscriptionExpiryWarningEmail, {
          branding: { communityName: community.name },
          recipientName: r.fullName,
          expiryDate: formatDate(expiryDate),
          billingPortalUrl,
        }),
    );
    // Clear reminder — no further scheduled reminders after Day 23
    await db
      .update(communities)
      .set({ nextReminderAt: null, updatedAt: now })
      .where(eq(communities.id, community.id));
  } else if (community.paymentFailedAt != null) {
    // Pre-cancellation: Day 3 → Day 7 reminder ladder
    const dayElapsed = daysDiff(community.paymentFailedAt, now);

    await sendToAll(
      recipients,
      dayElapsed < 7
        ? `Reminder: Payment failed for ${community.name}`
        : `Urgent: Payment overdue for ${community.name}`,
      (r) =>
        createElement(PaymentFailedEmail, {
          branding: { communityName: community.name },
          recipientName: r.fullName,
          amountDue: 'your overdue amount',
          lastFourDigits: null,
          billingPortalUrl,
        }),
    );

    // Advance schedule or clear
    const nextReminderAt =
      dayElapsed < 7
        ? addDays(community.paymentFailedAt, 7) // Day 3 → Day 7
        : null; // Day 7+ → clear (wait for cancellation to set Day 23)

    await db
      .update(communities)
      .set({ nextReminderAt, updatedAt: now })
      .where(eq(communities.id, community.id));
  } else {
    // Stale reminder with no relevant state — clear it
    await db
      .update(communities)
      .set({ nextReminderAt: null, updatedAt: now })
      .where(eq(communities.id, community.id));
  }
}
