/**
 * SMS dispatch gates.
 *
 * SMS ships DISABLED. The reason is TCPA record-keeping, not message content:
 * there is no inbound-message webhook, so a resident who replies STOP never
 * causes `smsConsentRevokedAt` to be written. Twilio's Advanced Opt-Out very
 * likely stops the message at the carrier, but our database would go on
 * asserting consent for someone who revoked it — and consent state at send time
 * is the whole ballgame in a TCPA defense, at $500–$1,500 per message.
 * See docs/audits/2026-08-09-legal-risk-audit.md F-10.
 *
 * ── Why TWO layers, and why neither is a route guard ──
 *
 * 1. A global env floor, checked inside the SMS service itself. `sms-service.ts`
 *    is the only Twilio *message* path, so one check there is provably total for
 *    that path — no future caller can slip past it.
 *
 * 2. A per-community flag, checked where the SMS/email split is actually computed
 *    (`createBroadcast` in emergency-broadcast-service). Checking there degrades
 *    an emergency broadcast to EMAIL-ONLY rather than refusing it.
 *
 * A route guard on `/emergency-broadcasts/[id]/send` was rejected: it would kill
 * the email leg too, and emergency broadcasts deliberately bypass even the
 * subscription guard ("life-safety over revenue", see the header comment on
 * apps/web/src/app/api/v1/emergency-broadcasts/route.ts). Disabling SMS must not
 * cost residents their hurricane notice.
 *
 * `phone/verify/{send,confirm}` do NOT route through `sms-service` — they call
 * Twilio Verify directly — and are userId-scoped with no communityId, so they
 * are unreachable by the per-community flag and rely on the env floor alone.
 * That asymmetry is why the floor exists at all rather than a single flag.
 *
 * `webhooks/twilio` stays alive and ungated: it only records delivery status for
 * messages already sent, and silencing it would strand in-flight records.
 */
import type { CommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { isSmsDispatchGloballyEnabled } from './dispatch-flag';

/**
 * Layer 1 — the global floor.
 *
 * Defined in `./dispatch-flag` (a module with no imports) and re-exported here
 * for convenience. It has to live there because this module imports the DB
 * client, whose module-load throws without DATABASE_URL — see the note in that
 * file. Import from `./dispatch-flag` directly from any module that does not
 * otherwise need a database.
 */
export { isSmsDispatchGloballyEnabled } from './dispatch-flag';

/**
 * Layer 2, membership-bearing callers (routes). Synchronous.
 *
 * Requires BOTH layers — a community flag cannot override the global floor.
 */
export function requireSmsDispatchEnabled(membership: CommunityMembership): void {
  if (!isSmsDispatchGloballyEnabled() || !membership.smsDispatchEnabled) {
    throw new ForbiddenError('SMS notifications are not available for this community');
  }
}

/**
 * Layer 2, convenience predicate for callers that need a boolean rather than a
 * throw — chiefly the broadcast create route, which passes it to
 * `createBroadcast` so an emergency alert degrades to email instead of failing.
 */
export function isSmsDispatchAllowed(membership: CommunityMembership): boolean {
  return isSmsDispatchGloballyEnabled() && membership.smsDispatchEnabled;
}
