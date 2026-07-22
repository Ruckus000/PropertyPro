/**
 * No-login insurance-alert unsubscribe write.
 *
 * Runs without a session (reached from the one-click email link), so it uses
 * the unscoped/privileged client. Callers MUST have verified the signed
 * unsubscribe token first — the token authorizes the write and confines it to
 * the exact (communityId, userId) it encodes.
 *
 * Opt-out state lives in the EXISTING notification_preferences table (the
 * `email_insurance_alerts` flag) — the same row the settings toggle writes — so
 * there is no separate subscription store to keep in sync.
 */
import { notificationPreferences } from '@propertypro/db';
import { and, eq } from '@propertypro/db/filters';
// AUTHZ: no-session token-authorized write; confined to the token's (communityId, userId).
import { createUnscopedClient } from '@propertypro/db/unsafe';

export async function applyInsuranceAlertUnsubscribe(payload: {
  communityId: number;
  userId: string;
}): Promise<void> {
  const db = createUnscopedClient();
  const existing = await db
    .select({ id: notificationPreferences.id })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.communityId, payload.communityId),
        eq(notificationPreferences.userId, payload.userId),
      ),
    );

  if (existing.length > 0) {
    await db
      .update(notificationPreferences)
      .set({ emailInsuranceAlerts: false, updatedAt: new Date() })
      .where(eq(notificationPreferences.id, existing[0]!.id));
  } else {
    // Lazily create the prefs row; every other column carries a schema default.
    await db.insert(notificationPreferences).values({
      communityId: payload.communityId,
      userId: payload.userId,
      emailInsuranceAlerts: false,
    });
  }
}
