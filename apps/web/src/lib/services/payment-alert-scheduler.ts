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
 *   Cancel — webhook fires sendSubscriptionCanceledEmail() directly, sets Day 5 reminder
 *   Day 5  — processPaymentReminders() sends final 2-day lock warning, clears schedule
 *
 * Uses createUnscopedClient() because the cron scans across all communities.
 */
import { createElement } from 'react';
import { and, eq, inArray, isNull, lte } from '@propertypro/db/filters';
// AUTHZ: P2-34a: Payment reminders + subscription guard — cross-community cron + mutation guard
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { communities, users, userRoles } from '@propertypro/db';
import {
  AuthenticateCardEmail,
  PaymentFailedEmail,
  SubscriptionCanceledEmail,
  SubscriptionExpiryWarningEmail,
  SubscriptionLapsedEmail,
  sendEmail,
} from '@propertypro/email';
import {
  ADMIN_TIER_DB_ROLES,
  formatBillingDateUTC,
  GRACE_EXPIRY_WARNING_OFFSET_DAYS,
  isWithinPaidGrace,
  MANAGER_TIER_DB_ROLES,
  PAID_GRACE_DAYS,
  paidGraceEndsAt,
  type CommunityRole,
} from '@propertypro/shared';
import { getBaseUrl } from '@/lib/utils/url';

const MS_PER_DAY = 86_400_000;

/** Community types that follow the condo/HOA admin role model. */
const CONDO_HOA_TYPES = new Set(['condo_718', 'hoa_720']);

/** Roles that receive billing alerts for condo/HOA communities. */
// BILINGUAL (role-v3): collapse to v3-only at Phase 4 cleanup
const CONDO_HOA_ADMIN_ROLES: readonly CommunityRole[] = MANAGER_TIER_DB_ROLES;

/** Roles that receive billing alerts for apartment communities. */
// BILINGUAL (role-v3): collapse to v3-only at Phase 4 cleanup
const APARTMENT_ADMIN_ROLES: readonly CommunityRole[] = ADMIN_TIER_DB_ROLES;

function daysDiff(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

// Billing dates are rendered UTC via the shared formatter so the email and the
// in-app banner (which uses the same helper) never disagree by a day.
const formatDate = formatBillingDateUTC;

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
  const adminRoles: readonly CommunityRole[] = CONDO_HOA_TYPES.has(communityType)
    ? CONDO_HOA_ADMIN_ROLES
    : APARTMENT_ADMIN_ROLES;

  const rows = await db
    .select({ email: users.email, fullName: users.fullName })
    .from(userRoles)
    .innerJoin(users, eq(userRoles.userId, users.id))
    .where(
      and(
        eq(userRoles.communityId, communityId),
        inArray(userRoles.role, [...adminRoles]),
        // Soft-deleted users are NOT ex-members as far as this query is
        // concerned. `executeUserSoftDelete` stamps `users.deleted_at` and bans
        // the Supabase auth identity, but deliberately leaves `user_roles`
        // alone — the row is needed to restore the account inside the 6-month
        // window. Without this predicate every billing alert kept reaching
        // people who can no longer log in.
        //
        // That was survivable while the alerts carried only login-walled app
        // URLs. It stopped being survivable with the SCA email, whose CTA is
        // Stripe's `hosted_invoice_url` — a bearer capability needing no
        // session, which lets the holder read the association's invoice and pay
        // it. Ordinary role removal is unaffected: `user_roles` rows are
        // hard-deleted, so only the soft-delete path leaked.
        isNull(users.deletedAt),
      ),
    );

  return rows;
}

// ---------------------------------------------------------------------------
// Internal send helpers
// ---------------------------------------------------------------------------

interface SendResult {
  sent: number;
  failed: number;
}

async function sendToAll(
  recipients: AdminRecipient[],
  subject: string,
  buildElement: (r: AdminRecipient) => ReturnType<typeof createElement>,
): Promise<SendResult> {
  if (recipients.length === 0) return { sent: 0, failed: 0 };
  const results = await Promise.allSettled(
    recipients.map((r) =>
      sendEmail({ to: r.email, subject, category: 'transactional', react: buildElement(r) }),
    ),
  );
  let sent = 0;
  let failed = 0;
  for (const result of results) {
    if (result.status === 'fulfilled') sent += 1;
    else failed += 1;
  }
  return { sent, failed };
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
// Public API: sendPaymentActionRequiredEmail (SCA — called directly from webhook)
// ---------------------------------------------------------------------------

export interface SendPaymentActionRequiredEmailOpts {
  amountDue: string;
  communityName: string;
  /**
   * Stripe's `invoice.hosted_invoice_url`, or `null` when Stripe did not
   * provide one — in which case the billing portal is used instead.
   *
   * Bearer-ish — it authorises viewing and paying the invoice with no further
   * check, and with no session. Application code puts it in the email body and
   * nowhere else: not a log line, not an audit-log payload, not an error
   * message. `compliance_audit_log` matters most, being board-readable and
   * append-only, so a leak there would be permanent.
   *
   * Known residual, outside this code's control: `@sentry/nextjs` buffers
   * incoming request bodies (`maxRequestBodySize` defaults to 'medium') and
   * `beforeSend` in `sentry.server.config.ts` strips headers but not
   * `event.request.data`, so an exception raised inside the Stripe webhook
   * request may still carry the raw invoice JSON. Tracked in issue 951 — do not
   * read this docblock as a guarantee that extends to Sentry.
   */
  authenticateUrl: string | null;
}

/**
 * Sends the SCA "confirm this payment" email on `invoice.payment_action_required`.
 *
 * Shares `lookupAdminRecipients` and `sendToAll` with the other billing alerts —
 * recipient resolution is genuinely the same job, and duplicating the role-tier
 * branching is how one copy silently stops matching the role model. Only the
 * template and the subject differ, which is the whole reason those two helpers
 * were factored out in the first place.
 */
export async function sendPaymentActionRequiredEmail(
  communityId: number,
  opts: SendPaymentActionRequiredEmailOpts,
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
    // Deliberately not the word "failed". Stripe fires this BEFORE the payment
    // gives up, and a subject claiming failure would make a recipient replace a
    // perfectly good card instead of completing the bank's check.
    `Confirm your payment of ${opts.amountDue} for ${opts.communityName}`,
    (r) =>
      createElement(AuthenticateCardEmail, {
        branding: { communityName: opts.communityName },
        recipientName: r.fullName,
        amountDue: opts.amountDue,
        // Falling back to the portal keeps the email useful rather than
        // dropping it: the message is still correct, and a payment started from
        // the portal is on-session, so the bank's check can be completed there.
        authenticateUrl: opts.authenticateUrl ?? billingPortalUrl,
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
 * Also schedules the Day 5 reminder via next_reminder_at (done in webhook handler).
 */
export async function sendSubscriptionCanceledEmail(
  communityId: number,
  opts: SendSubscriptionCanceledEmailOpts,
): Promise<void> {
  const recipients = await lookupAdminRecipients(communityId, opts.communityType);
  if (recipients.length === 0) return;

  const billingPortalUrl = `${getBaseUrl()}/billing/portal?communityId=${communityId}`;
  const gracePeriodEnd = addDays(opts.canceledAt, PAID_GRACE_DAYS);

  await sendToAll(
    recipients,
    `${opts.communityName} subscription canceled — ${PAID_GRACE_DAYS}-day grace period begins`,
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
  emailsFailed: number;
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
    emailsFailed: 0,
    errors: 0,
  };

  for (const community of dueCommunities) {
    try {
      const result = await processCommunityReminder(community, now, db);
      summary.emailsSent += result.sent;
      summary.emailsFailed += result.failed;
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
): Promise<SendResult> {
  const billingPortalUrl = `${getBaseUrl()}/billing/portal?communityId=${community.id}`;
  const recipients = await lookupAdminRecipients(community.id, community.communityType);

  // A5: only advance/clear the schedule once we've confirmed the reminder went
  // out. If recipients exist but every send failed, we leave next_reminder_at at
  // its due value so the next cron run retries — otherwise a transient email
  // outage would silently drop the (day-5) lock warning. When there are no
  // recipients at all, there is nothing to retry, so we clear to avoid scanning
  // the row forever.
  const shouldPersistSchedule = (result: SendResult): boolean =>
    result.sent > 0 || recipients.length === 0;

  if (community.subscriptionCanceledAt != null) {
    const canceledAt = community.subscriptionCanceledAt;
    const expiryDate = addDays(canceledAt, PAID_GRACE_DAYS);

    // Grace has already run out: this is the lapse notice, not the warning.
    // Scheduled by setting next_reminder_at to the grace end at cancellation.
    if (!isWithinPaidGrace(canceledAt, now)) {
      const lapsedResult = await sendToAll(
        recipients,
        `${community.name}: admin access paused`,
        (r) =>
          // NOT SubscriptionExpiryWarningEmail: that template is future-tense
          // throughout ("will be locked in N days, on {date}", "update payment
          // before {date}"), and by this point {date} has passed and access is
          // already suspended — it would urge a churned customer to beat a
          // deadline that is gone. `expiryDate` is the same value, restated as
          // a past fact.
          createElement(SubscriptionLapsedEmail, {
            branding: { communityName: community.name },
            recipientName: r.fullName,
            lockedSinceDate: formatDate(expiryDate),
            billingPortalUrl,
          }),
      );

      if (shouldPersistSchedule(lapsedResult)) {
        // Terminal — nothing further is scheduled for a lapsed community.
        await db
          .update(communities)
          .set({ nextReminderAt: null, updatedAt: now })
          .where(eq(communities.id, community.id));
      }
      return lapsedResult;
    }

    // Still inside the window: the Day 5, two-day lock warning.

    const result = await sendToAll(
      recipients,
      `Final warning: ${community.name} access locked in ${GRACE_EXPIRY_WARNING_OFFSET_DAYS} days`,
      (r) =>
        createElement(SubscriptionExpiryWarningEmail, {
          branding: { communityName: community.name },
          recipientName: r.fullName,
          expiryDate: formatDate(expiryDate),
          billingPortalUrl,
        }),
    );

    if (shouldPersistSchedule(result)) {
      // Arm the lapse notice for the moment grace actually ends, rather than
      // clearing. The branch above then fires once and clears for good.
      await db
        .update(communities)
        .set({ nextReminderAt: paidGraceEndsAt(canceledAt), updatedAt: now })
        .where(eq(communities.id, community.id));
    }
    return result;
  }

  if (community.paymentFailedAt != null) {
    // Pre-cancellation: Day 3 → Day 7 reminder ladder
    const dayElapsed = daysDiff(community.paymentFailedAt, now);

    const result = await sendToAll(
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

    if (shouldPersistSchedule(result)) {
      // Advance schedule or clear
      const nextReminderAt =
        dayElapsed < 7
          ? addDays(community.paymentFailedAt, 7) // Day 3 → Day 7
          : null; // Day 7+ → clear (wait for cancellation to set Day 5)

      await db
        .update(communities)
        .set({ nextReminderAt, updatedAt: now })
        .where(eq(communities.id, community.id));
    }
    return result;
  }

  // Stale reminder with no relevant state — clear it (nothing was sent).
  await db
    .update(communities)
    .set({ nextReminderAt: null, updatedAt: now })
    .where(eq(communities.id, community.id));
  return { sent: 0, failed: 0 };
}
