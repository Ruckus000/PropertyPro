/**
 * Inbound SMS keyword classification (TCPA opt-out).
 *
 * ⚠️ **Import-free on purpose.** Pure string classification with no database or
 * provider dependency, so the webhook, the tests, and anything else can use it
 * without dragging `@propertypro/db` into module load.
 *
 * ── Why we handle these ourselves ──
 *
 * Twilio's Advanced Opt-Out feature blocks further messages at the carrier
 * layer when a recipient texts STOP, and that is what actually protects the
 * account today. But it stops delivery WITHOUT telling the application, so our
 * own `notification_preferences` row would keep saying the resident consented,
 * every delivery report would read "failed", and a board could look at the
 * screen and conclude the resident simply has a bad number. Recording the
 * revocation is what makes our records match reality — and TCPA consent is
 * proved by records.
 *
 * The keyword lists follow the CTIA short-code handbook / Twilio's defaults.
 * They are matched case-insensitively on the whole trimmed body, with
 * surrounding punctuation stripped — a message reading "Please STOP." is
 * unambiguous, but "stop by the clubhouse at 6" is not an opt-out and must not
 * be treated as one.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-10.
 */

/** Opt OUT. Carrier-level in Twilio; we mirror it into our own records. */
export const STOP_KEYWORDS = [
  'stop',
  'stopall',
  'unsubscribe',
  'cancel',
  'end',
  'quit',
] as const;

/** Opt back IN after a STOP. */
export const START_KEYWORDS = ['start', 'unstop', 'yes'] as const;

/** Ask for help. Answered, but changes no consent state. */
export const HELP_KEYWORDS = ['help', 'info'] as const;

export type SmsKeyword = 'stop' | 'start' | 'help' | null;

/**
 * Classify an inbound message body.
 *
 * Returns `null` for anything that is not a bare keyword — including a message
 * that merely CONTAINS one. Treating "stop by the clubhouse" as an opt-out
 * would silently cut a resident off from emergency notices, which is a worse
 * failure than missing an unusually-phrased opt-out that the carrier already
 * honoured anyway.
 */
export function classifyInboundSms(body: string | null | undefined): SmsKeyword {
  if (!body) return null;

  // Strip surrounding whitespace and punctuation, collapse case. "STOP!" and
  // " stop. " are both plainly opt-outs.
  const normalized = body
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9]+/, '')
    .replace(/[^a-z0-9]+$/, '');

  if ((STOP_KEYWORDS as readonly string[]).includes(normalized)) return 'stop';
  if ((START_KEYWORDS as readonly string[]).includes(normalized)) return 'start';
  if ((HELP_KEYWORDS as readonly string[]).includes(normalized)) return 'help';
  return null;
}

/**
 * The disclosure appended to non-emergency SMS bodies.
 *
 * Leading space so callers concatenate directly. Kept short because it is
 * appended INSIDE the 1600-character truncation — see
 * `appendStopDisclosure`.
 */
export const STOP_DISCLOSURE = ' Reply STOP to opt out.';

/** Twilio's multi-part SMS ceiling. */
export const SMS_MAX_LENGTH = 1600;

/**
 * Append the opt-out disclosure, keeping the result within the SMS ceiling.
 *
 * ⚠️ The disclosure is reserved BEFORE the body is truncated, not appended
 * after. Truncating first and appending second can exceed the limit, and
 * appending first and truncating second cuts off the disclosure itself — which
 * is precisely the part that must survive. A long message therefore loses its
 * own tail, never the notice.
 */
export function appendStopDisclosure(body: string): string {
  if (body.endsWith(STOP_DISCLOSURE)) return body;

  const budget = SMS_MAX_LENGTH - STOP_DISCLOSURE.length;
  const trimmed =
    body.length > budget ? `${body.slice(0, budget - 3)}...` : body;
  return `${trimmed}${STOP_DISCLOSURE}`;
}

/**
 * Whether a broadcast of this severity carries the opt-out disclosure.
 *
 * TCPA's emergency-purpose exception is narrow, and `urgent` / `info`
 * broadcasts are not within it — a "reminder: pool closed for maintenance"
 * blast is ordinary messaging no matter which button a PM pressed. Only a true
 * `emergency` is sent without the disclosure, which is also the only severity
 * where twenty-three characters of a hurricane notice are worth arguing about.
 */
export function severityRequiresStopDisclosure(severity: string): boolean {
  return severity !== 'emergency';
}
