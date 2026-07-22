/**
 * Insurance-alert processor — the daily cron's send orchestration.
 *
 * Emails the BOARD (admin-tier members) when the association's wind-mitigation
 * report or master-policy summary is nearing expiry, so a re-inspection /
 * renewal / summary update happens before owners are looking at stale data.
 *
 * AUTHZ: like the snowbird + notification-digest processors, this drains across
 * every insurance-hub community in one pass — a by-design cross-tenant job. The
 * community scan uses the unscoped client; per-community recipient/report reads
 * use a scoped client.
 *
 * Compliance posture (legal-review gate before enablement):
 *  - EMAIL ONLY. This job never reads the SMS/TCPA preference fields and never
 *    dispatches SMS — insurance alerts must not go over text.
 *  - CAN-SPAM: each email is `non-transactional`, carrying a one-click
 *    List-Unsubscribe (token → notification_preferences.email_insurance_alerts)
 *    AND the association's physical postal address. A community whose address is
 *    incomplete is SKIPPED (never sent without a valid postal address).
 *  - Opt-out is honored per recipient via notification_preferences.
 *  - Dedupe: each report/policy row carries `lastAlertBand`; an alert fires once
 *    per band transition (see the two expiry classifiers).
 */
import { createElement } from 'react';
import {
  communities,
  createScopedClient,
  insurancePolicies,
  logAuditEvent,
  notificationPreferences,
  userRoles,
  users,
  windMitigationReports,
} from '@propertypro/db';
import { and, eq, inArray, isNull } from '@propertypro/db/filters';
// AUTHZ: cron job, no session — scans insurance-hub communities cross-tenant, then reads each with a scoped client.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { isAdminRole, type CommunityRole } from '@propertypro/shared';
import { InsuranceAlertEmail, sendEmail } from '@propertypro/email';
import { captureMessage } from '@sentry/nextjs';
import { format, parseISO } from 'date-fns';
import {
  buildInsuranceAlertEmail,
  type InsuranceAlertKind,
} from '@/lib/constants/insurance-disclaimers';
import { signInsuranceAlertUnsubscribeToken } from './insurance-alert-unsubscribe-token';
import {
  classifyWindMitigationExpiry,
  shouldSendWindMitigationAlert,
} from './wind-mitigation-expiry';
import {
  classifyInsurancePolicyExpiry,
  shouldSendInsurancePolicyAlert,
} from './insurance-policy-expiry';
import { getBaseUrl } from '@/lib/utils/url';

/** Community types the insurance hub is available for (mirrors hasInsuranceHub). */
const INSURANCE_HUB_TYPES = ['condo_718', 'hoa_720'] as const;
const DEFAULT_EMAILS_PER_TICK = 500;

const WIND_FORM_LABELS: Record<string, string> = {
  oir_b1_1802: 'OIR-B1-1802',
  mit_bt_ii: 'MIT-BT II',
  mit_bt_iii: 'MIT-BT III',
};

export interface InsuranceAlertRunResult {
  communitiesProcessed: number;
  emailsSent: number;
  communitiesSkippedNoAddress: number;
  itemsAlerted: number;
}

type Row = Record<string, unknown>;
type ScopedClient = ReturnType<typeof createScopedClient>;

/**
 * Who counts as the "board/admin" audience for these alerts under ADR-006:
 * staff roles (property_manager / root_manager) via isAdminRole, PLUS elected
 * board members — which are `resident` rows carrying an orthogonal `designation`
 * (board_president / board_member), NOT a distinct `role`. Filtering on role
 * alone silently drops every self-managed board (the feature's core audience).
 */
function isBoardOrAdminRecipient(role: string, designation: string | null): boolean {
  if (isAdminRole(role as CommunityRole)) return true;
  return designation === 'board_president' || designation === 'board_member';
}

interface AdminRecipient {
  userId: string;
  email: string;
  fullName: string;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * The association's physical postal address as display lines, or null when it is
 * incomplete. CAN-SPAM requires a valid postal address, so an incomplete one
 * blocks the send rather than shipping a non-compliant footer.
 */
export function formatCommunityPostalAddress(community: {
  addressLine1: unknown;
  addressLine2: unknown;
  city: unknown;
  state: unknown;
  zipCode: unknown;
}): string[] | null {
  const line1 = nonEmpty(community.addressLine1);
  const city = nonEmpty(community.city);
  const state = nonEmpty(community.state);
  const zip = nonEmpty(community.zipCode);
  if (!line1 || !city || !state || !zip) return null;

  const lines = [line1];
  const line2 = nonEmpty(community.addressLine2);
  if (line2) lines.push(line2);
  lines.push(`${city}, ${state} ${zip}`);
  return lines;
}

/** Board/admin members with a deliverable email who have NOT opted out. */
async function resolveAdminRecipients(scoped: ScopedClient): Promise<AdminRecipient[]> {
  const [roleRows, userRows, prefRows] = await Promise.all([
    scoped.query(userRoles) as Promise<Row[]>,
    scoped.query(users) as Promise<Row[]>,
    scoped.query(notificationPreferences) as Promise<Row[]>,
  ]);

  const usersById = new Map<string, Row>();
  for (const u of userRows) if (typeof u.id === 'string') usersById.set(u.id, u);

  // Opted out only when a prefs row explicitly sets the flag false; missing = default on.
  const optedOut = new Set<string>();
  for (const p of prefRows) {
    if (typeof p.userId === 'string' && p.emailInsuranceAlerts === false) optedOut.add(p.userId);
  }

  const recipients: AdminRecipient[] = [];
  const seen = new Set<string>();
  for (const r of roleRows) {
    const userId = r.userId;
    const role = r.role;
    if (typeof userId !== 'string' || typeof role !== 'string') continue;
    if (seen.has(userId) || optedOut.has(userId)) continue;
    const designation = typeof r.designation === 'string' ? r.designation : null;
    if (!isBoardOrAdminRecipient(role, designation)) continue;

    const u = usersById.get(userId);
    const email = u?.email;
    if (!u || typeof email !== 'string' || email.length === 0) continue;

    seen.add(userId);
    recipients.push({
      userId,
      email,
      fullName: typeof u.fullName === 'string' && u.fullName.length > 0 ? u.fullName : 'there',
    });
  }
  return recipients;
}

interface DueItem {
  kind: InsuranceAlertKind;
  rowId: number;
  band: string;
  daysUntilExpiry: number;
  expiresAt: string;
  itemLabel: string;
}

/** Reports + policies in this community that have crossed into a fresh alert band. */
async function collectDueItems(scoped: ScopedClient, now: Date): Promise<DueItem[]> {
  const [reports, policies] = await Promise.all([
    scoped.query(windMitigationReports) as Promise<Row[]>,
    scoped.query(insurancePolicies) as Promise<Row[]>,
  ]);

  const due: DueItem[] = [];

  for (const r of reports) {
    const expiresAt = typeof r.expiresAt === 'string' ? r.expiresAt : null;
    if (!expiresAt || typeof r.id !== 'number') continue;
    const { band, daysUntilExpiry } = classifyWindMitigationExpiry(expiresAt, now);
    if (!shouldSendWindMitigationAlert(band, (r.lastAlertBand as string | null) ?? null)) continue;
    const formLabel = WIND_FORM_LABELS[String(r.formType)] ?? 'wind-mitigation form';
    const building = nonEmpty(r.buildingLabel);
    due.push({
      kind: 'wind_mitigation',
      rowId: r.id,
      band,
      daysUntilExpiry,
      expiresAt,
      itemLabel: building ? `${formLabel} — ${building}` : formLabel,
    });
  }

  for (const p of policies) {
    const expiresAt = typeof p.expiresAt === 'string' ? p.expiresAt : null;
    if (!expiresAt || typeof p.id !== 'number') continue;
    const { band, daysUntilExpiry } = classifyInsurancePolicyExpiry(expiresAt, now);
    if (!shouldSendInsurancePolicyAlert(band, (p.lastAlertBand as string | null) ?? null)) continue;
    due.push({
      kind: 'master_policy',
      rowId: p.id,
      band,
      daysUntilExpiry,
      expiresAt,
      itemLabel: `${String(p.carrierName)} ${String(p.policyType)} policy`,
    });
  }

  return due;
}

/**
 * Process one daily tick. `now` is injectable for tests. Alerts fire on band
 * transitions, so a single daily run (no local-hour gate) is sufficient.
 */
export async function processInsuranceAlerts(
  now: Date = new Date(),
  options: { emailsPerTick?: number } = {},
): Promise<InsuranceAlertRunResult> {
  const budget = options.emailsPerTick ?? DEFAULT_EMAILS_PER_TICK;
  const unscoped = createUnscopedClient();
  const baseUrl = getBaseUrl();

  const hubCommunities = (await unscoped
    .select({
      id: communities.id,
      name: communities.name,
      addressLine1: communities.addressLine1,
      addressLine2: communities.addressLine2,
      city: communities.city,
      state: communities.state,
      zipCode: communities.zipCode,
    })
    .from(communities)
    .where(
      and(inArray(communities.communityType, [...INSURANCE_HUB_TYPES]), isNull(communities.deletedAt)),
    )) as Array<{
    id: number;
    name: string;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
  }>;

  const result: InsuranceAlertRunResult = {
    communitiesProcessed: 0,
    emailsSent: 0,
    communitiesSkippedNoAddress: 0,
    itemsAlerted: 0,
  };

  for (const community of hubCommunities) {
    if (result.emailsSent >= budget) break;

    const scoped = createScopedClient(community.id);
    const due = await collectDueItems(scoped, now);
    if (due.length === 0) continue;

    // Something is due — a valid postal address is now required to send.
    const addressLines = formatCommunityPostalAddress(community);
    if (!addressLines) {
      // Skip WITHOUT advancing any band, so the alert still fires once the
      // board fills in the community's mailing address.
      result.communitiesSkippedNoAddress += 1;
      continue;
    }

    const recipients = await resolveAdminRecipients(scoped);
    if (recipients.length === 0) continue;

    result.communitiesProcessed += 1;

    for (const item of due) {
      // The per-item dedupe band is shared by all of this item's recipients, so
      // an item is sent ATOMICALLY w.r.t. the budget: either every recipient is
      // emailed this run (then the band advances) or the item is deferred whole
      // to the next run (band untouched). Truncating mid-item would advance the
      // band and permanently drop the un-emailed board members.
      if (result.emailsSent + recipients.length > budget) return result;

      const copy = buildInsuranceAlertEmail({
        kind: item.kind,
        communityName: community.name,
        itemLabel: item.itemLabel,
        expiresAtLabel: format(parseISO(item.expiresAt), 'MMMM d, yyyy'),
        daysUntilExpiry: item.daysUntilExpiry,
      });

      let sentCount = 0;
      for (const recipient of recipients) {
        const token = signInsuranceAlertUnsubscribeToken({
          communityId: community.id,
          userId: recipient.userId,
        });
        const unsubscribeUrl = `${baseUrl}/api/v1/insurance-alerts/unsubscribe?token=${encodeURIComponent(token)}`;

        try {
          await sendEmail({
            to: recipient.email,
            subject: copy.subject,
            react: createElement(InsuranceAlertEmail, {
              branding: { communityName: community.name },
              recipientName: recipient.fullName,
              heading: copy.heading,
              intro: copy.intro,
              body: copy.body,
              disclaimer: copy.disclaimer,
              portalUrl: `${baseUrl}/communities/${community.id}/insurance`,
              senderAddressLines: addressLines,
              unsubscribeUrl,
            }),
            category: 'non-transactional',
            unsubscribeUrl,
            // Stable for this recipient + alert band, so Resend deduplicates
            // transport retries while the provider's 24-hour key window lasts.
            idempotencyKey: `insurance-alert/${community.id}/${item.kind}/${item.rowId}/${item.band}/${recipient.userId}`,
          });
          result.emailsSent += 1;
          sentCount += 1;
        } catch {
          // Best-effort: one undeliverable address must not abort the whole
          // cron run (which would wedge every later community behind it).
        }
      }

      // A shared dedupe band can only advance after every intended recipient
      // receives the alert. Otherwise a transient failure for one recipient
      // would permanently suppress their notification once another send passed.
      // Retrying the whole item may duplicate the successful delivery; avoiding
      // that requires durable per-recipient delivery state, which this job does
      // not currently maintain.
      if (sentCount !== recipients.length) {
        // This event deliberately carries only aggregate delivery counts and
        // the alert identity. Sentry can alert on repeated occurrences without
        // exposing recipient email addresses in operational telemetry.
        captureMessage('insurance_alert_partial_delivery', {
          level: 'warning',
          extra: {
            communityId: community.id,
            alertKind: item.kind,
            resourceId: item.rowId,
            alertBand: item.band,
            attemptedRecipients: recipients.length,
            deliveredRecipients: sentCount,
            failedRecipients: recipients.length - sentCount,
          },
        });
        await logAuditEvent({
          userId: null,
          action: 'notification_delivery_partial',
          resourceType: item.kind === 'wind_mitigation' ? 'wind_mitigation_report' : 'insurance_policy',
          resourceId: String(item.rowId),
          communityId: community.id,
          newValues: {
            alertBand: item.band,
            attemptedRecipients: recipients.length,
            deliveredRecipients: sentCount,
            failedRecipients: recipients.length - sentCount,
          },
        });
        continue;
      }

      // Advance the per-row dedupe band after the item was delivered.
      const table = item.kind === 'wind_mitigation' ? windMitigationReports : insurancePolicies;
      await scoped.update(table, { lastAlertBand: item.band }, eq(table.id, item.rowId));
      result.itemsAlerted += 1;

      await logAuditEvent({
        userId: null,
        action: 'notification_sent',
        resourceType: item.kind === 'wind_mitigation' ? 'wind_mitigation_report' : 'insurance_policy',
        resourceId: String(item.rowId),
        communityId: community.id,
        newValues: { alertBand: item.band, recipients: sentCount },
      });
    }
  }

  return result;
}
