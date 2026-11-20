import { redactParams } from './scrub-server-event';

/**
 * Render an unknown caught value as a log-safe STRING for `console.error`.
 *
 * ## Why this exists (#951 residual, Vercel-log channel)
 *
 * `scrubServerEvent` only scrubs the Sentry EVENT in `beforeSend` — it cannot
 * reach the raw `console.error` write to stdout/stderr, which is what Vercel
 * function logs capture. Drizzle's `DrizzleQueryError` embeds the full SQL and
 * its BOUND PARAMETER VALUES (tenant emails, tokens, row contents) in
 * `error.message` after a `params: ` marker (#1092), and passing the Error
 * OBJECT to `console.error` ships all of it to the logs unredacted. Logging
 * `formatErrorForLog(error)` instead ships the redacted string.
 *
 * ## Why NOT `redactParams(err.stack)`
 *
 * Drizzle's message is `Failed query: <sql>\nparams: <values>` — the marker
 * sits INSIDE the stack's first line (`Error: <message>`), so truncating the
 * stack at the marker destroys every `at …` frame, losing the call site for
 * exactly the errors this helper exists for. Instead: redact the message, and
 * take the frames from the stack by cutting the header line off. Frame lines
 * are code locations; drizzle puts no bound values in them.
 *
 * Keep `Sentry.captureException(error)` receiving the RAW object — beforeSend
 * scrubs that copy, and stack fidelity matters there. This helper is for the
 * console channel only.
 *
 * Known, accepted trade-offs versus logging the raw object: the `cause` chain
 * and own enumerable properties (drizzle's `.query`/`.params`, postgres.js's
 * `.detail`) are NOT rendered — they were leak surfaces in the object form,
 * and Sentry still receives them for triage. A thrown non-Error object logs
 * as its `String()`; one without a usable toString logs a placeholder rather
 * than throwing from inside a catch block.
 */
export function formatErrorForLog(err: unknown): string {
  if (err instanceof Error) {
    const message = redactParams(err.message);
    const stack = err.stack;
    let frames = '';
    if (typeof stack === 'string' && stack.length > 0) {
      // V8 stacks start with `${name}: ${message}` (the FULL message, including
      // its newlines), so slicing the header keeps multi-line messages from
      // being duplicated or partially dropped. Fallback for runtimes that
      // format differently: drop only the first line.
      const header = `${err.name}: ${err.message}`;
      if (stack.startsWith(header)) {
        frames = stack.slice(header.length);
      } else {
        // Misaligned header (hand-assigned stack, or a name/message mutated
        // after the stack was first materialized): dropping one line could
        // leave a multi-line message's continuation — including a raw
        // `params:` line — in the "frames". Redact the fallback slice: frame
        // lines are code locations, so this is lossless on any real stack and
        // fail-safe on a pathological one (it may cost frames; it can never
        // re-admit values).
        const nl = stack.indexOf('\n');
        frames = redactParams(nl >= 0 ? stack.slice(nl) : '');
      }
    }
    return `${message}${frames}`;
  }
  try {
    return redactParams(String(err));
  } catch {
    // `String()` itself can throw (e.g. Object.create(null) has no toString).
    // A logger that becomes the failure is worse than the missing detail;
    // Sentry still receives the raw value.
    return '[unstringifiable value]';
  }
}
