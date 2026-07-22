/**
 * Snowbird digest processor — the hourly cron's send orchestration.
 *
 * AUTHZ: like the notification-digest processor, this drains across every
 * community in one pass — a by-design cross-tenant job. The enabled-community
 * scan uses the unscoped client; per-community recipient/activity reads use a
 * scoped client (same posture as announcement-delivery).
 *
 * Flow per run (called hourly; self-gates on 8 AM community-local):
 *   scan communities with snowbird_digest_enabled
 *     → 8 AM local gate; weekly fires Mon, monthly fires on the 1st
 *     → resolve owner recipients (minus opt-outs), per-user cadence
 *     → compile the trailing window; skip empty digests
 *     → send with a signed no-login unsubscribe URL
 *     → advance the per-user last_sent_at watermark
 */
import { createElement } from 'react';
import {
  createScopedClient,
  communities,
  snowbirdDigestSubscriptions,
  userRoles,
  users,
} from '@propertypro/db';
import { and, eq, isNull } from '@propertypro/db/filters';
// AUTHZ: cron job, no session — scans digest-enabled communities cross-tenant, then reads each with a scoped client.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { SnowbirdDigestEmail, sendEmail } from '@propertypro/email';
import { compileSnowbirdDigest, isDigestEmpty } from './snowbird-digest-service';
import { resolveEffectiveCadence } from './snowbird-digest-subscription-service';
import { signSnowbirdUnsubscribeToken } from './snowbird-digest-token';
import { getBaseUrl } from '@/lib/utils/url';

const DEFAULT_TIMEZONE = 'America/New_York';
const DEFAULT_EMAILS_PER_TICK = 500;
const SEND_HOUR_LOCAL = 8;

export interface SnowbirdDigestRunResult {
  communitiesProcessed: number;
  emailsSent: number;
  emailsSkippedEmpty: number;
}

export interface LocalParts {
  hour: number;
  weekday: string; // 'Mon' | 'Tue' | ...
  day: number; // day of month
}

export function toLocalParts(date: Date, timezone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return {
    hour: Number(get('hour') ?? '0'),
    weekday: (get('weekday') ?? 'Mon').slice(0, 3),
    day: Number(get('day') ?? '1'),
  };
}

/** Cadences that fire on this local tick (8 AM already asserted by the caller). */
export function dueCadences(parts: LocalParts): Set<'weekly' | 'monthly'> {
  const due = new Set<'weekly' | 'monthly'>();
  if (parts.weekday === 'Mon') due.add('weekly');
  if (parts.day === 1) due.add('monthly');
  return due;
}

export function windowStartFor(cadence: 'weekly' | 'monthly', lastSentAt: Date | null, now: Date): Date {
  if (lastSentAt) return lastSentAt;
  const days = cadence === 'weekly' ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

type Row = Record<string, unknown>;

/** A community member who is a unit owner with a deliverable email. */
interface OwnerRecipient {
  userId: string;
  email: string;
  fullName: string;
}

/**
 * Resolve owner recipients for a community: role 'resident' with isUnitOwner,
 * plus the legacy 'owner' role, that have an email and aren't deleted.
 */
async function resolveOwnerRecipients(communityId: number): Promise<OwnerRecipient[]> {
  const scoped = createScopedClient(communityId);
  const [roleRows, userRows] = await Promise.all([
    scoped.query(userRoles) as Promise<Row[]>,
    scoped.query(users) as Promise<Row[]>,
  ]);

  const usersById = new Map<string, Row>();
  for (const u of userRows) {
    if (typeof u.id === 'string') usersById.set(u.id, u);
  }

  const recipients: OwnerRecipient[] = [];
  const seen = new Set<string>();
  for (const r of roleRows) {
    const userId = r.userId;
    const role = r.role;
    if (typeof userId !== 'string' || typeof role !== 'string') continue;
    const isOwner = (role === 'resident' && r.isUnitOwner === true) || role === 'owner';
    if (!isOwner || seen.has(userId)) continue;

    const u = usersById.get(userId);
    const email = u?.email;
    if (!u || typeof email !== 'string' || email.length === 0) continue;

    seen.add(userId);
    recipients.push({
      userId,
      email,
      fullName: typeof u.fullName === 'string' && u.fullName.length > 0 ? u.fullName : 'Neighbor',
    });
  }
  return recipients;
}

/**
 * Process one hourly tick. `now` is injectable for tests.
 */
export async function processSnowbirdDigests(
  now: Date = new Date(),
  options: { emailsPerTick?: number } = {},
): Promise<SnowbirdDigestRunResult> {
  const budget = options.emailsPerTick ?? DEFAULT_EMAILS_PER_TICK;
  const unscoped = createUnscopedClient();
  const baseUrl = getBaseUrl();

  const enabled = (await unscoped
    .select({ id: communities.id, timezone: communities.timezone, name: communities.name })
    .from(communities)
    .where(and(eq(communities.snowbirdDigestEnabled, true), isNull(communities.deletedAt)))) as Array<{
    id: number;
    timezone: string | null;
    name: string;
  }>;

  const result: SnowbirdDigestRunResult = {
    communitiesProcessed: 0,
    emailsSent: 0,
    emailsSkippedEmpty: 0,
  };

  for (const community of enabled) {
    if (result.emailsSent >= budget) break;

    const parts = toLocalParts(now, community.timezone ?? DEFAULT_TIMEZONE);
    if (parts.hour !== SEND_HOUR_LOCAL) continue;
    const due = dueCadences(parts);
    if (due.size === 0) continue;

    result.communitiesProcessed += 1;
    const communityId = community.id;
    const scoped = createScopedClient(communityId);

    // Existing subscription rows carry opt-outs + watermarks; missing row = default.
    const subRows = (await scoped.query(snowbirdDigestSubscriptions)) as Row[];
    const subByUser = new Map<string, Row>();
    for (const s of subRows) {
      if (typeof s.userId === 'string') subByUser.set(s.userId, s);
    }

    const recipients = await resolveOwnerRecipients(communityId);

    for (const recipient of recipients) {
      if (result.emailsSent >= budget) break;

      const subRow = subByUser.get(recipient.userId) ?? null;
      const cadence = resolveEffectiveCadence(subRow);
      if (cadence === 'off' || !due.has(cadence)) continue;

      const lastSentAt =
        subRow?.lastSentAt instanceof Date
          ? subRow.lastSentAt
          : typeof subRow?.lastSentAt === 'string'
            ? new Date(subRow.lastSentAt)
            : null;
      const windowStart = windowStartFor(cadence, lastSentAt, now);

      const sections = await compileSnowbirdDigest(scoped, communityId, windowStart, now, false);
      if (isDigestEmpty(sections)) {
        // Never send "nothing happened"; leave the watermark so the window
        // keeps accumulating until there is something to report.
        result.emailsSkippedEmpty += 1;
        continue;
      }

      const token = signSnowbirdUnsubscribeToken({ communityId, userId: recipient.userId });
      const unsubscribeUrl = `${baseUrl}/api/v1/snowbird-digest/unsubscribe?token=${encodeURIComponent(token)}`;

      await sendEmail({
        to: recipient.email,
        subject: `${community.name} — your ${cadence} in review`,
        react: createElement(SnowbirdDigestEmail, {
          branding: { communityName: community.name },
          recipientName: recipient.fullName,
          cadenceLabel: cadence,
          boardDecisions: sections.boardDecisions,
          newDocuments: sections.newDocuments,
          upcoming: sections.upcoming,
          complianceNote: sections.complianceNote,
          portalUrl: `${baseUrl}/communities/${communityId}/dashboard`,
          unsubscribeUrl,
        }),
        category: 'non-transactional',
        unsubscribeUrl,
      });
      result.emailsSent += 1;

      // Advance the watermark, lazily creating the row on first send.
      if (subRow) {
        await scoped.update(
          snowbirdDigestSubscriptions,
          { lastSentAt: now },
          eq(snowbirdDigestSubscriptions.id, subRow.id as number),
        );
      } else {
        await scoped.insert(snowbirdDigestSubscriptions, {
          communityId,
          userId: recipient.userId,
          cadence,
          lastSentAt: now,
        });
      }
    }
  }

  return result;
}
