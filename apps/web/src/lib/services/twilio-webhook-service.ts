/**
 * Twilio Webhook Service
 *
 * Wraps the cross-tenant `emergency_broadcast_recipients` lookup needed by
 * the Twilio SMS delivery-status webhook (which doesn't carry a community_id
 * — it only carries the provider SID).
 *
 * Authorization contract: the webhook authenticates with an HMAC signature
 * (validated by the route handler before this service is called). Once the
 * signature is verified, the SID-to-recipient lookup must happen
 * cross-tenant because we don't yet know which community the broadcast
 * belongs to. The recipient row's `communityId` is the value we want — we
 * cannot scope the query by it.
 *
 * Companion to:
 *   - apps/web/src/app/api/v1/webhooks/twilio/route.ts
 */
import { emergencyBroadcastRecipients } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
// AUTHZ: Phase 1B: Twilio webhook — cross-tenant SID lookup (no community_id from webhook). Caller MUST validate the Twilio signature before invoking.
import { createUnscopedClient } from '@propertypro/db/unsafe';

export interface TwilioRecipientLookup {
  broadcastId: number;
  communityId: number;
  userId: string;
}

/**
 * Look up an emergency-broadcast recipient by its Twilio Message SID. Returns
 * `null` when no recipient matches the SID (e.g., a delayed callback for an
 * already-purged broadcast, or a misdirected webhook). Caller should treat
 * `null` as "ignore the callback", not as an error.
 *
 * Caller MUST have validated the Twilio signature on the inbound request
 * before invoking this helper.
 */
export async function findRecipientByTwilioSid(
  messageSid: string,
): Promise<TwilioRecipientLookup | null> {
  const db = createUnscopedClient();
  const rows = await db
    .select({
      broadcastId: emergencyBroadcastRecipients.broadcastId,
      communityId: emergencyBroadcastRecipients.communityId,
      userId: emergencyBroadcastRecipients.userId,
    })
    .from(emergencyBroadcastRecipients)
    .where(eq(emergencyBroadcastRecipients.smsProviderSid, messageSid))
    .limit(1);
  return rows[0] ?? null;
}
