/**
 * The three account-deletion emails: initiated (user asked), cancelled (the
 * request was stopped during the cooling period) and executed (the cron
 * soft-deleted the account). The admin console sends the fourth, "restored",
 * from its own recover route.
 *
 * Every send here is BEST EFFORT. The state change it reports has already
 * committed, so a lookup or delivery failure is logged and swallowed: it must
 * never fail the user's request, and must never stop a later phase of the
 * lifecycle cron. Each send carries a provider idempotency key derived from the
 * deletion request id, so a retried request or a re-run cron cannot mail twice.
 *
 * No email is ever sent to a purged address (`deleted-<id>@redacted`, or the
 * `@redacted.invalid` form auth.users gets).
 */
import { createElement } from 'react';
import {
  AccountDeletionExecutedEmail,
  AccountDeletionInitiatedEmail,
  AccountRecoveredEmail,
  sendEmail,
} from '@propertypro/email';
import type { DeletionEmailRecipient } from '@/lib/services/account-lifecycle-service';
import { getUserProfileSnapshot } from '@/lib/services/user-profile-service';
import { formatErrorForLog } from '@propertypro/shared/observability';
import { getBaseUrl } from '@/lib/utils/url';
import { deletionPurgeAt } from './deletion-timeline';

/** Platform mail: PropertyPro speaks, never a community. */
const PLATFORM_BRANDING = { communityName: 'PropertyPro' } as const;

/** Account deletion is not community-scoped, so dates are in Florida time. */
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'America/New_York',
});

function formatDate(date: Date): string {
  return DATE_FORMAT.format(date);
}

/** False for an empty address and for any address the purge wrote. */
export function isDeliverableDeletionAddress(email: string | null | undefined): email is string {
  if (!email || !email.includes('@')) return false;
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
  return domain !== 'redacted' && !domain.startsWith('redacted.');
}

function greetingName(recipient: DeletionEmailRecipient): string {
  return recipient.fullName?.trim() || 'there';
}

type DeletionEmailKind = 'initiated' | 'cancelled' | 'executed';

/** Never throws. Resolves true only when the provider accepted the message. */
async function deliver(
  kind: DeletionEmailKind,
  requestId: number,
  recipient: DeletionEmailRecipient | null,
  build: (recipient: DeletionEmailRecipient) => { subject: string; react: ReturnType<typeof createElement> },
): Promise<boolean> {
  if (!recipient || !isDeliverableDeletionAddress(recipient.email)) return false;
  try {
    const { subject, react } = build(recipient);
    await sendEmail({
      to: recipient.email,
      subject,
      category: 'transactional',
      react,
      idempotencyKey: `account-deletion/${kind}/${requestId}`,
    });
    return true;
  } catch (err) {
    // The address is deliberately not logged; the request id identifies it.
    console.error(`[account-deletion] ${kind} email for request ${requestId} failed`, {
      err: formatErrorForLog(err),
    });
    return false;
  }
}

/** Never throws; a failed lookup is logged and treated as "no recipient". */
async function lookupRecipient(
  kind: DeletionEmailKind,
  requestId: number,
  userId: string,
): Promise<DeletionEmailRecipient | null> {
  try {
    const { email, fullName } = await getUserProfileSnapshot(userId);
    return email ? { email, fullName } : null;
  } catch (err) {
    console.error(`[account-deletion] ${kind} email for request ${requestId}: recipient lookup failed`, {
      err: formatErrorForLog(err),
    });
    return null;
  }
}

/** After `POST /api/v1/account/delete` created a cooling request. */
export async function sendDeletionInitiatedEmail(params: {
  requestId: number;
  userId: string;
  coolingEndsAt: Date;
}): Promise<boolean> {
  const recipient = await lookupRecipient('initiated', params.requestId, params.userId);
  const coolingEndDate = formatDate(params.coolingEndsAt);
  // The cron soft-deletes on its first run after coolingEndsAt and schedules
  // the purge from that moment, so this date can be early by up to a day.
  const purgeDate = formatDate(deletionPurgeAt(params.coolingEndsAt));
  return deliver('initiated', params.requestId, recipient, (r) => ({
    subject: 'Your PropertyPro account will be deleted',
    react: createElement(AccountDeletionInitiatedEmail, {
      branding: PLATFORM_BRANDING,
      recipientName: greetingName(r),
      coolingEndDate,
      purgeDate,
      cancelUrl: `${getBaseUrl()}/settings/account`,
    }),
  }));
}

/**
 * After a cooling request was cancelled (`DELETE /api/v1/account/delete`).
 * The account was never turned off. The copy does not say who cancelled it: a
 * support session can make the same call.
 */
export async function sendDeletionCancelledEmail(params: {
  requestId: number;
  userId: string;
}): Promise<boolean> {
  const recipient = await lookupRecipient('cancelled', params.requestId, params.userId);
  return deliver('cancelled', params.requestId, recipient, (r) => ({
    subject: 'Your PropertyPro account will not be deleted',
    react: createElement(AccountRecoveredEmail, {
      branding: PLATFORM_BRANDING,
      recipientName: greetingName(r),
      wasDeactivated: false,
    }),
  }));
}

export interface SoftDeletedUserRow {
  id: number;
  scheduledPurgeAt: Date | null;
  recipient: DeletionEmailRecipient | null;
}

/**
 * After the lifecycle cron soft-deleted users. Sends to the address captured
 * in the soft-delete statement itself (`executeUserSoftDelete`). Settles every
 * send before returning and never rejects, so one failure cannot stop the
 * others or any later cron phase.
 */
export async function sendDeletionExecutedEmails(
  rows: SoftDeletedUserRow[],
): Promise<{ sent: number; notSent: number }> {
  // ponytail: every send goes out at once, with no pacing against Resend's
  // per-second rate limit; a day's soft deletes are a handful of accounts.
  // Trigger: a cron run logs an executed-email failure that is a 429.
  const outcomes = await Promise.allSettled(
    rows.map((row) =>
      deliver('executed', row.id, row.recipient, (r) => ({
        subject: 'Your PropertyPro account has been deleted',
        react: createElement(AccountDeletionExecutedEmail, {
          branding: PLATFORM_BRANDING,
          recipientName: greetingName(r),
          purgeDate: formatDate(row.scheduledPurgeAt ?? deletionPurgeAt(new Date())),
        }),
      })),
    ),
  );
  const sent = outcomes.filter((o) => o.status === 'fulfilled' && o.value).length;
  return { sent, notSent: rows.length - sent };
}
