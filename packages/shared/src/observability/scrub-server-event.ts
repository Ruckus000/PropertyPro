<<<<<<< HEAD
import { scrubBrowserEvent, type ScrubbableEvent } from './scrub-browser-event';
=======
/**
 * Redaction pass for server- and edge-side Sentry events.
 *
 * The sibling of `scrub-browser-event.ts`, and it exists because the four
 * server/edge `beforeSend` hooks (web + admin × server + edge) were four
 * byte-identical copies of a three-line header delete that missed the thing
 * most worth dropping.
 *
 * ## What it drops, and why `request.data` is the point (#951)
 *
 * `@sentry/nextjs` buffers incoming request bodies: `maxRequestBodySize`
 * defaults to `'medium'` (10,000 bytes), and `requestDataIntegration`'s
 * `DEFAULT_INCLUDE` sets `data: true` — which, unlike `ip`, is **not** gated
 * behind `sendDefaultPii`. So an exception thrown inside a route handler can
 * carry that route's raw request body to Sentry.
 *
 * For `POST /api/v1/webhooks/stripe` that body is the raw Stripe invoice JSON:
 * customer name, billing address, line items, amounts, and
 * `hosted_invoice_url`. That last one is a **bearer capability** — possession
 * alone lets someone view and pay the association's invoice, with no session
 * and no login. It is not the only route with secrets in a body:
 * `/api/v1/auth/signup` and invitation-accept take them too, which is why this
 * drops bodies globally rather than for one path.
 *
 * Nothing in this codebase reads request bodies out of Sentry today, so there
 * is no cost to dropping them.
 *
 * ## Wire it to BOTH hooks
 *
 * `beforeSend` fires for ERROR events only — `@sentry/core`'s `processBeforeSend`
 * gates it on `event.type === undefined` and routes transactions to
 * `beforeSendTransaction`. On Node a transaction carries the same
 * `event.request` an error does: `requestDataIntegration` is registered
 * unconditionally and its `processEvent` has no event-type check. So a config
 * that wires only `beforeSend` scrubs half the traffic. Every caller here wires
 * both, and `apps/web/__tests__/sentry/sentry-config.test.ts` asserts it.
 *
 * ## Also scrubbed, because the same hook is the only place to do it
 *
 * URLs and query strings, reusing `scrubUrl` / `scrubQueryString` from the
 * browser scrubber. A server-side error on a URL carrying `?token=…` shipped
 * that token before this: the old hooks touched headers only.
 *
 * ## Settled 2026-09-08: bodies ARE attached
 *
 * Measured against a production build with the SDK's envelopes captured locally
 * (docs/audits/sentry-request-body-capture-2026-09-08.md). `event.request.data`
 * arrived as the raw body string, canary and all, on Next 15.5.12 + App Router +
 * Node. This delete is load-bearing, not defence in depth.
 *
 * ## What this does NOT cover
 *
 * A failed DB query. Drizzle's `Failed query:` error embeds its bound parameter
 * VALUES, and that string reaches Sentry as a chained exception and as
 * `console.error` breadcrumbs — four copies in one event, none of them under
 * `event.request`, so nothing here touches them. Same data, different door.
 * Tracked in #1092, which also records why the obvious fixes miss: the params
 * are in the stack as well as the message, and drizzle's `logger` option is a
 * no-op against them.
 */
import { redactQueryParams } from './redact-query-params';
import { scrubQueryString, scrubUrl } from './scrub-browser-event';
import { scrubSensitiveHeaders } from './sensitive-headers';
>>>>>>> 94483e1 (fix(sentry): redact drizzle's bound query params before they leave (#1092))

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
 *
 * REQUEST BODIES ARE A THIRD CHANNEL, AND THE WORST ONE. @sentry/node-core's
 * `httpServerIntegration` buffers up to 10,000 bytes of every incoming request
 * body (`maxRequestBodySize` defaults to `'medium'`; @sentry/nextjs does not
 * override it), and `requestDataIntegration` copies it onto
 * `event.request.data` — `DEFAULT_INCLUDE.data` is `true` and, unlike `ip`, is
 * NOT gated behind `sendDefaultPii`.
 *
 * Capture happens only where the app consumes the body through `req.on('data')`,
 * which the integration proxies. Measured on Node 20:
 *
 *   - App Router ROUTE handlers do NOT. `NextRequestAdapter` hands the raw
 *     `IncomingMessage` to undici, which drains it via the async iterator
 *     (`'readable'` + `read()`), never `'data'`. Nothing is captured — so the
 *     Stripe webhook body, and `hosted_invoice_url` with it, never reached
 *     Sentry (issue 951).
 *   - SERVER ACTIONS DO. `action-handler` runs
 *     `pipeline(req.body, sizeLimitTransform)` before branching on content
 *     type, `pipeline` pipes, and `Readable.pipe` attaches a `'data'` listener.
 *
 * `updatePasswordAction(newPassword)` in `apps/web/src/lib/auth/actions.ts` is
 * a server action, so a plaintext password sits in that body. Any error
 * captured during a password reset would have carried it.
 *
 * WHY THIS IS UNCONDITIONAL rather than per-route: the safe/unsafe split above
 * lives entirely in undici and Next internals, so a dependency bump can move a
 * route from the first bullet to the second with nothing here to notice. We
 * have no use for request bodies in Sentry, so the cheap, stable answer is to
 * drop them all.
 */
<<<<<<< HEAD

/** Everything after this marker in a drizzle error message is bound values. */
const PARAMS_MARKER = 'params: ';

/**
 * Also used by the two places that PERSIST an error message rather than sending
 * it to Sentry: `community_export_jobs.error_message`, which
 * `export-job-card.tsx:161-163` renders to the PM, and
 * `provisioning_jobs.error_message`. Same drizzle string, sinks this module's
 * `beforeSend` hooks cannot reach.
 */
export function redactParams(value: string): string {
  const marker = value.indexOf(PARAMS_MARKER);
  return marker < 0 ? value : `${value.slice(0, marker)}${PARAMS_MARKER}[redacted]`;
}

interface ServerScrubbableEvent extends ScrubbableEvent {
  exception?: { values?: Array<{ value?: string; [key: string]: unknown }> };
}

/**
 * Scrub a server event in place and return it.
=======
export interface ScrubbableServerEvent {
  request?: {
    url?: string;
    query_string?: unknown;
    headers?: Record<string, string>;
    data?: unknown;
    [key: string]: unknown;
  };
  /** Chained exceptions. `linkedErrorsIntegration` walks `cause`, so a wrapped
   *  drizzle error lands here as its own entry alongside the driver error. */
  exception?: { values?: Array<{ value?: unknown; [key: string]: unknown } | null> };
  /** Console breadcrumbs, already merged onto the event by `_prepareEvent`
   *  before `beforeSend` runs — which is what lets one hook cover them. */
  breadcrumbs?: Array<{
    message?: unknown;
    data?: { arguments?: unknown; [key: string]: unknown };
    [key: string]: unknown;
  } | null>;
  [key: string]: unknown;
}

/**
 * `event.request` — URL, query string, headers, and the #951 body drop.
 *
 * The `delete` stays LAST: it throws on a frozen object in strict mode, and
 * anything after it in the same block would be abandoned.
 */
function scrubRequest(event: ScrubbableServerEvent): void {
  if (!event.request) return;

  if (typeof event.request.url === 'string') {
    event.request.url = scrubUrl(event.request.url);
  }
  if (typeof event.request.query_string === 'string') {
    event.request.query_string = scrubQueryString(event.request.query_string);
  }
  if (event.request.headers) {
    scrubSensitiveHeaders(event.request.headers);
  }

  // The #951 fix. Unconditional: there is no allowlist of routes whose bodies
  // are safe, and adding one would be a list to keep correct.
  delete event.request.data;
}

/**
 * `event.exception.values[].value` — the #1092 exception door.
 *
 * A drizzle error reaches Sentry as a CHAINED exception: `values[0]` is the
 * underlying driver error and `values[1]` is the `DrizzleQueryError` carrying
 * the params. Walking every entry rather than the last one is deliberate — the
 * chain depth is not ours to predict (`linkedErrorsIntegration` follows `cause`
 * up to its own limit).
 */
function scrubExceptionValues(event: ScrubbableServerEvent): void {
  const values = event.exception?.values;
  if (!Array.isArray(values)) return;

  for (const entry of values) {
    if (entry && typeof entry.value === 'string') {
      entry.value = redactQueryParams(entry.value);
    }
  }
}

/**
 * `event.breadcrumbs[]` — the #1092 breadcrumb door, which is the wider one.
 *
 * `consoleIntegration` is a Sentry default, so every `console.error` in the
 * request becomes a breadcrumb on the ISOLATION scope — and that scope spans the
 * whole request, so a drizzle error that was caught and logged still rides out
 * on any LATER captured event. There are ~91 such call sites; this is the only
 * place that covers all of them at once.
 *
 * `console.error('Unhandled error:', err)` yields `data.arguments` of
 * `['Unhandled error:', { message, name, stack }]` after Sentry's `normalize()`
 * (depth 3, applied before `beforeSend`), so both the string and object shapes
 * are handled.
 */
function scrubBreadcrumbs(event: ScrubbableServerEvent): void {
  if (!Array.isArray(event.breadcrumbs)) return;

  for (const crumb of event.breadcrumbs) {
    if (!crumb) continue;

    if (typeof crumb.message === 'string') {
      crumb.message = redactQueryParams(crumb.message);
    }

    const args = crumb.data?.arguments;
    if (!Array.isArray(args)) continue;

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (typeof arg === 'string') {
        args[i] = redactQueryParams(arg);
        continue;
      }
      if (!arg || typeof arg !== 'object') continue;

      // EVERY string value, not just `message`/`stack`. A serialized Error has
      // those two, but a console argument is often a plain object instead —
      // `logStripeWebhookEvent` (`webhooks/stripe/route.ts:96-98`) logs
      // `{ component, errorMessage, … }`, where the drizzle text sits under
      // `errorMessage`. A two-field walk missed that shape entirely; measured.
      const record = arg as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        const value = record[key];
        if (typeof value === 'string') {
          record[key] = redactQueryParams(value);
        }
      }
    }
  }
}

/**
 * Scrub a server/edge event in place and return it.
>>>>>>> 94483e1 (fix(sentry): redact drizzle's bound query params before they leave (#1092))
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

  // One try per section, deliberately. These are INDEPENDENT redactions, and a
  // single shared block means one hostile shape (a frozen `request`, whose
  // `delete` throws in strict mode) cancels the two after it — shipping the
  // event with an account-takeover token in `exception.values[]` intact. Each
  // section now fails alone.
  try {
<<<<<<< HEAD
    for (const entry of event.exception?.values ?? []) {
      if (typeof entry?.value === 'string') {
        entry.value = redactParams(entry.value);
      }
    }

    // See "REQUEST BODIES" above. Unconditional and shape-agnostic: the SDK
    // sets this to a string, but deleting the key is correct for any value.
    if (event.request && 'data' in event.request) {
      delete event.request.data;
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
=======
    scrubRequest(event);
  } catch {
    // fall through to the next section
  }
  try {
    scrubExceptionValues(event);
  } catch {
    // fall through to the next section
  }
  try {
    scrubBreadcrumbs(event);
>>>>>>> 94483e1 (fix(sentry): redact drizzle's bound query params before they leave (#1092))
  } catch {
    // Return whatever we have rather than losing the event.
  }

  return rawEvent;
}
