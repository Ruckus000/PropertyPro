/**
 * The global SMS dispatch floor — deliberately in its own module with NO imports.
 *
 * This lives apart from `./common` because `common` imports `@propertypro/db/unsafe`
 * for the per-community lookup, and that import chain reaches `drizzle.ts`, which
 * THROWS at module load when `DATABASE_URL` is unset. Pulling `common` into
 * `sms-service.ts` therefore made a pure Twilio wrapper — and every test that
 * imports it — require a database connection to load at all.
 *
 * Same reasoning, and the same fix, as `scripts/lib/seed-safety.ts`: keep the
 * env-check surface pure so it can be imported anywhere and unit-tested without
 * a live database.
 *
 * Callers that already touch the DB should import from `./common` instead, which
 * re-exports this.
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
