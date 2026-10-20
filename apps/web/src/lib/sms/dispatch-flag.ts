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
 * 1. A global env floor (`isSmsDispatchGloballyEnabled` below), checked inside
 *    the SMS service itself. `sms-service.ts` is the only Twilio *message* path,
 *    so one check there is provably total for that path — no future caller can
 *    slip past it.
 *
 * 2. A per-community flag (`membership.smsDispatchEnabled`), checked where the
 *    SMS/email split is actually computed (`createBroadcast` in
 *    emergency-broadcast-service, fed `smsAllowed` by the broadcast create
 *    route). Checking there degrades an emergency broadcast to EMAIL-ONLY rather
 *    than refusing it. A community flag cannot override the global floor:
 *    callers AND the two.
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
 *
 * ── Why this module has NO imports ──
 *
 * Anything that reaches `@propertypro/db` reaches `drizzle.ts`, which THROWS at
 * module load when `DATABASE_URL` is unset. Keeping the floor import-free lets
 * `sms-service.ts` — a pure Twilio wrapper — and every test that imports it load
 * without a database. Same reasoning, and the same fix, as
 * `scripts/lib/seed-safety.ts`.
 */

/**
 * Whether SMS dispatch is enabled for this deployment.
 *
 * Defaults to DISABLED: only the exact string `'true'` enables it. An unset,
 * empty, or misspelled env var must mean off — the failure mode of guessing
 * wrong is sending real messages to real phones, and TCPA damages are per
 * message.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-10.
 */
export function isSmsDispatchGloballyEnabled(): boolean {
  return process.env.SMS_DISPATCH_ENABLED === 'true';
}
