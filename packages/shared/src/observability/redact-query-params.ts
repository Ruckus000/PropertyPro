/**
 * Strip the bound parameter VALUES out of a drizzle query error (#1092).
 *
 * ## What it is defusing
 *
 * `DrizzleQueryError` builds its message as
 * `` `Failed query: ${query}\nparams: ${params}` `` (`drizzle-orm/errors.js:10-19`), where
 * `params` is the bound-parameter ARRAY interpolated into a template literal — so it
 * stringifies to the comma-joined values that were about to be written or matched on.
 *
 * It wraps EVERY driver error, not just connection failures: `pg-core/session.js:36-98`
 * has six sites, all a bare `catch (e) { throw new DrizzleQueryError(queryString, params,
 * e) }` with no type test. A unique-constraint violation on a routine user action against
 * a perfectly healthy database produces the identical message.
 *
 * That matters because two of the values bound in this codebase are live bearer tokens:
 * `invitations.token` (plaintext, and `invitations/route.ts:117-119` already grades it
 * "enough to complete the accept flow and set that user's password") and
 * `esign_signers.slug`. Both are bound in a `where` on an UNAUTHENTICATED path, while the
 * token is still live. See the enumeration in issue #1092.
 *
 * ## Why the SQL is kept
 *
 * The query text is generated from the schema — table and column names, no user data — and
 * it is what Sentry groups on. `apps/web/src/lib/cron/with-cron-job.ts:239-255` sets a
 * fingerprint that depends on that message staying stable, so mangling it would break a
 * deliberate grouping decision. Only the values go.
 *
 * ## Why it truncates to the END, and does not try to keep the stack
 *
 * An earlier version re-attached everything from the first `\n    at ` frame so
 * stack frames survived. Measuring `util.format` against a real
 * `DrizzleQueryError` killed that design twice over:
 *
 * 1. **The values appear TWICE.** `drizzle-orm/errors.js:14-15` sets `query` and
 *    `params` as own enumerable properties, so `util.inspect` appends a second,
 *    array-form copy — `params: [ 'LIVE_TOKEN' ]` — AFTER the stack frames.
 *    Re-attaching the tail re-attached that copy.
 * 2. **`util.format` escapes the newline.** When the logged argument is a plain
 *    object rather than an Error (the `logStripeWebhookEvent` shape at
 *    `webhooks/stripe/route.ts:96-98`), the message renders as
 *    `'Failed query: ...\n' + 'params: ...'` -- two literal characters, not a
 *    newline. Anchoring on a real `"\nparams:"` did not match it at all.
 *
 * So the rule is: find the `Failed query:` anchor, find the first `params:` at or
 * after it, and drop everything from there. That is complete for every rendered
 * form -- real newline, escaped newline, and the inspect tail -- because no shape
 * can reintroduce a value before the anchor.
 *
 * The cost, stated rather than hidden: a breadcrumb's raw `.stack` string loses
 * its frames, and a formatted object loses any field printed after the error
 * message. The frames are not actually lost from the event -- Sentry parses them
 * into `exception.values[].stacktrace.frames[]` separately, which this never
 * touches. Diagnostics lose a duplicate; the alternative loses a token.
 */

/** Marker left in place of the values, so a reader knows redaction happened rather than truncation. */
export const REDACTED_PARAMS = 'params: [redacted]';

/**
 * Replace the bound-parameter values of a drizzle query error with {@link REDACTED_PARAMS}.
 *
 * Returns the input unchanged when it is not a drizzle query error, so it is safe to call
 * on every string in an event. Never throws: it is reached from `beforeSend`, and a hook
 * that throws drops the event entirely.
 *
 * Pure `indexOf` -- no regex, so no backtracking risk on a multi-kilobyte SQL string.
 */
export function redactQueryParams(text: string): string {
  // Anchor on the drizzle prefix so an unrelated message that merely says "params:"
  // (a Zod contract, a third-party SDK) is left alone.
  if (typeof text !== 'string') return text;
  const anchor = text.indexOf('Failed query:');
  if (anchor === -1) return text;

  // Search from the anchor, never from 0: a formatted object can print its own
  // `params:` field BEFORE the error message, and truncating there would discard
  // context that is not the leak.
  const params = text.indexOf('params:', anchor);
  if (params === -1) return text;

  return text.slice(0, params) + REDACTED_PARAMS;
}
