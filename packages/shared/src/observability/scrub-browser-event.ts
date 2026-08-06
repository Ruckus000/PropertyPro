/**
 * Redaction pass for browser-side Sentry events.
 *
 * ## Why the server hook is the wrong thing to copy
 *
 * `sentry.server.config.ts` / `sentry.edge.config.ts` each carry a `beforeSend`
 * that deletes the `authorization`, `cookie` and `x-api-key` headers. Copying
 * that verbatim into the client configs would look like coverage and do
 * nothing: browsers do not populate `event.request.headers` — the SDK cannot
 * see them.
 *
 * What browsers DO populate is the part that actually carries secrets here:
 *
 * - `event.request.url` and `event.request.query_string` — on error events via
 *   `beforeSend`, and on TRANSACTION events via `beforeSendTransaction`.
 *   Transactions are sampled at 10% in production and were the larger hole:
 *   `beforeSend` does not fire for them at all.
 * - Breadcrumb URLs, from the automatic `fetch` and `xhr` instrumentation —
 *   every request the page made, query strings included. This is where the
 *   admin console's demo-login HMAC token actually shows up: the token-bearing
 *   URL is a navigation the SDK records as a breadcrumb `from`/`to`, not a
 *   document URL it ever reports (the demo-login route answers with a
 *   client-side redirect, and by the time the SDK initialises on the
 *   destination the token is gone from `location.href`).
 *
 * ## What it does NOT cover
 *
 * Session Replay envelopes do not pass through either hook. `apps/web` runs
 * replay at 100% on error in production, and replay's own network
 * instrumentation records request URLs. Scrubbing those needs replay's
 * `beforeAddRecordingEvent` / network options, which is a separate change.
 *
 * ## Approach
 *
 * Redact query-parameter *values*, keeping the keys. Knowing that a request
 * carried `token` is useful when triaging; knowing its value is not. Two rules:
 *
 * 1. Any parameter whose name looks credential-ish (`SENSITIVE_PARAM`).
 * 2. Any value that *looks* like a credential regardless of its name — a JWT or
 *    a long hex/base64 blob. This catches the parameter someone adds next year
 *    and does not think to list.
 *
 * Paths are left intact: they are the most useful part of the URL for triage
 * and this codebase does not put secrets in them (the esign signing route uses
 * a path token, but that is a web server route, not a browser URL this sees).
 */

const REDACTED = '[redacted]';

/**
 * Parameter names whose values are never safe to ship.
 *
 * Deliberately a SUBSTRING match, not anchored. An anchored version missed
 * every compound name — `access-token`, `demo_token`, `inviteToken`,
 * `csrf_token`, `reset_token` — while the docblock above sold this rule as
 * future-proofing. It is only future-proof if it matches the names a future
 * author would actually write.
 */
const SENSITIVE_PARAM =
  /(token|secret|api[-_]?key|apikey|password|passwd|pwd|auth|session|signature|jwt|credential)/i;

/**
 * Short, generic names that are sensitive as a WHOLE word only.
 *
 * `code` cannot go in the substring rule — it would swallow `zipcode`,
 * `postcode` and `countryCode`, which are the sort of thing you want to still
 * see when triaging. Same for `key`, `sig`, `state`, `hash`, `nonce`, `otp`.
 */
const SENSITIVE_PARAM_EXACT =
  /^(code|key|sig|state|hash|nonce|otp|pin)$/i;

/**
 * Names that CONTAIN a sensitive substring but whose values are not secret.
 * Checked first, so `tokenCount` and `authorId` stay legible in triage.
 */
const SENSITIVE_PARAM_EXCEPTIONS = /^(authorId|authorName|author|tokenCount|sessionCount)$/i;

/** A JWT: three base64url segments. */
const JWT_SHAPE = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;

/**
 * A long opaque blob — HMAC tokens, raw keys, Supabase tokens.
 *
 * Covers hex AND base64url. An earlier version was `/^[A-Fa-f0-9]{32,}$/`
 * while its own comment claimed "hex or base64url", so every base64url
 * credential — which is most of them — slipped through the value-shape rule
 * that exists precisely to catch the parameter nobody named.
 */
const OPAQUE_BLOB = /^[A-Za-z0-9_-]{40,}$/;

function isSensitiveValue(value: string): boolean {
  return JWT_SHAPE.test(value) || OPAQUE_BLOB.test(value);
}

/** Redact sensitive query-parameter values in a `key=value&…` string. */
export function scrubQueryString(queryString: string): string {
  if (!queryString) return queryString;

  const leadingQuestionMark = queryString.startsWith('?');
  const body = leadingQuestionMark ? queryString.slice(1) : queryString;

  const scrubbed = body
    .split('&')
    .map((pair) => {
      if (!pair) return pair;
      const eq = pair.indexOf('=');
      if (eq === -1) return pair;

      const key = pair.slice(0, eq);
      const rawValue = pair.slice(eq + 1);

      // Decoding can throw on a malformed escape; the raw form is still worth
      // testing, and an undecodable value is not one we want to ship anyway.
      let decoded = rawValue;
      try {
        decoded = decodeURIComponent(rawValue);
      } catch {
        /* keep the raw form */
      }

      const keyIsSensitive =
        SENSITIVE_PARAM_EXACT.test(key) ||
        (!SENSITIVE_PARAM_EXCEPTIONS.test(key) && SENSITIVE_PARAM.test(key));

      if (keyIsSensitive || isSensitiveValue(decoded) || isSensitiveValue(rawValue)) {
        return `${key}=${REDACTED}`;
      }
      return pair;
    })
    .join('&');

  return leadingQuestionMark ? `?${scrubbed}` : scrubbed;
}

/** Redact sensitive query-parameter values in a URL, keeping origin and path. */
export function scrubUrl(url: string): string {
  if (!url) return url;

  // Split manually rather than via `new URL`: breadcrumb URLs are often
  // relative, and `new URL('/a?b=c')` throws without a base.
  const hashIndex = url.indexOf('#');
  const hash = hashIndex === -1 ? '' : url.slice(hashIndex);
  const withoutHash = hashIndex === -1 ? url : url.slice(0, hashIndex);

  const queryIndex = withoutHash.indexOf('?');
  if (queryIndex === -1) return url;

  const base = withoutHash.slice(0, queryIndex);
  const query = withoutHash.slice(queryIndex + 1);

  return `${base}?${scrubQueryString(query)}${hash}`;
}

/**
 * Minimal structural view of a Sentry event. Typing against `@sentry/nextjs`
 * would make `@propertypro/shared` depend on it for one hook; the shape used
 * here is stable and small.
 */
export interface ScrubbableEvent {
  request?: {
    url?: string;
    query_string?: unknown;
    headers?: Record<string, string>;
    [key: string]: unknown;
  };
  breadcrumbs?: Array<{
    message?: string;
    data?: Record<string, unknown>;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

/**
 * Header names to drop if the SDK ever does populate them.
 *
 * Compared case-INSENSITIVELY. HTTP header names are case-insensitive, so a
 * literal `delete headers['authorization']` misses `Authorization` — which is
 * how it is conventionally spelled. Defence in depth that only works against
 * one spelling is not defence in depth.
 */
const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'x-api-key', 'x-csrf-token']);

/**
 * Scrub a browser event in place and return it.
 *
 * Never throws: a `beforeSend` that throws drops the event entirely, so a bug
 * here would silently disable error reporting — the opposite of the intent.
 *
 * The generic is unconstrained on purpose. Sentry's own `ErrorEvent` is not
 * assignable to `ScrubbableEvent` (its `request` is a narrower named type with
 * no index signature), and constraining the parameter makes `beforeSend` reject
 * the hook at the call site. Callers keep their exact event type; the
 * structural view is applied internally.
 */
export function scrubBrowserEvent<T>(rawEvent: T): T {
  const event = rawEvent as ScrubbableEvent;

  try {
    if (event.request) {
      if (typeof event.request.url === 'string') {
        event.request.url = scrubUrl(event.request.url);
      }
      if (typeof event.request.query_string === 'string') {
        event.request.query_string = scrubQueryString(event.request.query_string);
      }
      if (event.request.headers) {
        for (const name of Object.keys(event.request.headers)) {
          if (SENSITIVE_HEADERS.has(name.toLowerCase())) {
            delete event.request.headers[name];
          }
        }
      }
    }

    if (Array.isArray(event.breadcrumbs)) {
      for (const crumb of event.breadcrumbs) {
        if (!crumb) continue;

        // `fetch` / `xhr` breadcrumbs put the request URL here.
        if (crumb.data && typeof crumb.data.url === 'string') {
          crumb.data.url = scrubUrl(crumb.data.url);
        }
        // `navigation` breadcrumbs use from/to.
        if (crumb.data && typeof crumb.data.from === 'string') {
          crumb.data.from = scrubUrl(crumb.data.from);
        }
        if (crumb.data && typeof crumb.data.to === 'string') {
          crumb.data.to = scrubUrl(crumb.data.to);
        }
        // Navigation breadcrumbs also carry the URL in the message.
        if (typeof crumb.message === 'string' && crumb.message.includes('?')) {
          crumb.message = scrubUrl(crumb.message);
        }
      }
    }
  } catch {
    // Return whatever we have rather than losing the event.
  }

  return rawEvent;
}
