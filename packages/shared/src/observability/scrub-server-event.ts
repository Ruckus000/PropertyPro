import { scrubBrowserEvent, type ScrubbableEvent } from './scrub-browser-event';

/**
 * Server-side telemetry scrubbing, layered on top of the browser scrubber.
 *
 * WHY THIS EXISTS. drizzle-orm builds its error message as
 * `Failed query: <sql>\nparams: <bound values>` (drizzle-orm/errors.js:11-15),
 * so ANY query failure carries every bound value. For a support-inbox insert
 * those values are a real sender's address, subject and full message body —
 * correspondence from someone who never had an account with us — and Sentry
 * retains events for 30-90 days.
 *
 * THE SECOND CHANNEL IS THE ONE THAT GETS MISSED. Scrubbing
 * `exception.values[].value` is not enough. `consoleIntegration` is in
 * @sentry/node-core's DEFAULT integration list and no config here passes
 * `integrations`, so every `console.*` becomes a breadcrumb whose
 * `data.arguments` holds the raw Error. Sentry normalizes that via
 * `convertToPlainObject`, which spreads the error's own enumerable properties —
 * and `DrizzleQueryError` sets `this.params` and `this.query` as own
 * properties. The params therefore survive verbatim at
 * `breadcrumbs[].data.arguments[1].params` even when the exception value has
 * been cleaned.
 *
 * That is not theoretical: `apps/web/src/lib/api/error-handler.ts` does
 * `console.error(...)` and then `Sentry.captureException(...)` in the same
 * synchronous block, and 298 route files run through it.
 *
 * THE SQL IS KEPT. It is what makes a report actionable and carries no user
 * data; only the values after `params:` are dropped.
 */

/** Everything after this marker in a drizzle error message is bound values. */
const PARAMS_MARKER = 'params: ';

function redactParams(value: string): string {
  const marker = value.indexOf(PARAMS_MARKER);
  return marker < 0 ? value : `${value.slice(0, marker)}${PARAMS_MARKER}[redacted]`;
}

interface ServerScrubbableEvent extends ScrubbableEvent {
  exception?: { values?: Array<{ value?: string; [key: string]: unknown }> };
}

/**
 * Scrub a server event in place and return it.
 *
 * Never throws, for the same reason `scrubBrowserEvent` does not: a `beforeSend`
 * that throws drops the event entirely, which would silently disable error
 * reporting — a worse outcome than the leak this closes.
 *
 * The generic is unconstrained deliberately; see `scrubBrowserEvent`'s note.
 */
export function scrubServerEvent<T>(rawEvent: T): T {
  scrubBrowserEvent(rawEvent);

  const event = rawEvent as ServerScrubbableEvent;

  try {
    for (const entry of event.exception?.values ?? []) {
      if (typeof entry?.value === 'string') {
        entry.value = redactParams(entry.value);
      }
    }

    if (Array.isArray(event.breadcrumbs)) {
      for (const crumb of event.breadcrumbs) {
        if (!crumb) continue;

        if (typeof crumb.message === 'string') {
          crumb.message = redactParams(crumb.message);
        }

        // The raw arguments array is the leak. `util.format` already produced
        // `message`, so nothing readable is lost by dropping the objects that
        // carry the bound values as own properties.
        if (crumb.data && 'arguments' in crumb.data) {
          delete crumb.data.arguments;
        }
      }
    }
  } catch {
    // Return whatever we have rather than losing the event.
  }

  return rawEvent;
}
