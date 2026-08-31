/**
 * TCPA consent revocation and restoration, driven by inbound SMS keywords.
 *
 * ── Why this is cross-tenant, and why that is correct ──
 *
 * A resident texts STOP to a phone number, not to a community. They have told
 * us they want no more texts — full stop — and honouring that in one
 * association while continuing to message them from another would be exactly
 * the violation the keyword exists to prevent. So the revocation is applied to
 * **every** `notification_preferences` row belonging to the user who owns that
 * phone number.
 *
 * The webhook has no session and no community, so there is no `communityId` to
 * scope by until the phone number has been resolved to a user — and even then
 * the answer is "all of them".
 *
 * ── What gets written ──
 *
 * `smsEnabled = false` plus `smsConsentRevokedAt`. Both, deliberately: the
 * boolean is what the send path reads, and the timestamp is what proves WHEN
 * consent ended if it is ever disputed. Writing only the boolean would leave no
 * evidence; writing only the timestamp would keep sending.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-10.
 */
import { logAuditEvent, notificationPreferences, users } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
// The inbound webhook is authenticated by Twilio's HMAC signature and carries a
// phone number, not a session or a community. Resolving that number to a user
// and revoking their SMS consent everywhere is inherently cross-tenant — a STOP
// is addressed to us, not to one association. Touches only `users` (read) and
// `notification_preferences` (write).
// AUTHZ: inbound SMS keyword handler — signature-authenticated, cross-community by design.
import { createUnscopedClient } from '@propertypro/db/unsafe';

export interface SmsConsentChange {
  /** Null when the number matches no user we know. */
  userId: string | null;
  /** How many community preference rows were updated. */
  rowsUpdated: number;
}

/**
 * The user who owns this phone number.
 *
 * Matches on the stored `users.phone` verbatim. Both sides are E.164 — the
 * verification flow stores what Twilio Verify confirmed, and Twilio sends `From`
 * in E.164 — so no normalisation is applied. Normalising here would invent a
 * matching rule that the write path does not share, and a number that matches
 * on read but not on write is worse than no match at all.
 */
async function findUserIdByPhone(phone: string): Promise<string | null> {
  const db = createUnscopedClient();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Record a STOP: disable SMS for this user in every community, and stamp when.
 *
 * Returns rather than throws when the number matches no user. Twilio retries a
 * non-2xx webhook, and retrying forever over a number we have never seen would
 * be noise — the carrier has already stopped delivery either way.
 */
export async function revokeSmsConsentByPhone(
  phone: string,
  now: Date = new Date(),
): Promise<SmsConsentChange> {
  const userId = await findUserIdByPhone(phone);
  if (!userId) return { userId: null, rowsUpdated: 0 };

  const db = createUnscopedClient();
  const updated = await db
    .update(notificationPreferences)
    .set({
      smsEnabled: false,
      smsConsentRevokedAt: now,
      updatedAt: now,
    })
    .where(eq(notificationPreferences.userId, userId))
    .returning({ communityId: notificationPreferences.communityId });

  // One audit row per community, because the audit log is tenant-scoped and a
  // board asking "why did this resident stop receiving texts" has to be able to
  // find the answer inside their own community's trail.
  for (const row of updated) {
    await logAuditEvent({
      userId,
      action: 'update',
      resourceType: 'sms_consent',
      resourceId: userId,
      communityId: row.communityId,
      newValues: {
        smsEnabled: false,
        smsConsentRevokedAt: now.toISOString(),
        source: 'sms_keyword',
      },
    });
  }

  return { userId, rowsUpdated: updated.length };
}

/**
 * Record a START.
 *
 * Clears the revocation timestamp but does **not** set `smsEnabled = true`.
 * That is deliberate and is the conservative reading: texting START undoes an
 * opt-out, it does not manufacture consent for someone who never gave it. A
 * user who has never opted in through the app stays off, and the app's own
 * consent flow — which records `smsConsentGivenAt` and the method — remains the
 * only thing that turns SMS on.
 */
export async function restoreSmsConsentByPhone(
  phone: string,
  now: Date = new Date(),
): Promise<SmsConsentChange> {
  const userId = await findUserIdByPhone(phone);
  if (!userId) return { userId: null, rowsUpdated: 0 };

  const db = createUnscopedClient();
  const updated = await db
    .update(notificationPreferences)
    .set({ smsConsentRevokedAt: null, updatedAt: now })
    .where(eq(notificationPreferences.userId, userId))
    .returning({ communityId: notificationPreferences.communityId });

  for (const row of updated) {
    await logAuditEvent({
      userId,
      action: 'update',
      resourceType: 'sms_consent',
      resourceId: userId,
      communityId: row.communityId,
      newValues: { smsConsentRevokedAt: null, source: 'sms_keyword' },
    });
  }

  return { userId, rowsUpdated: updated.length };
}
