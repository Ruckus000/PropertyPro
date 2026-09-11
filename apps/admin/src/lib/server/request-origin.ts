/**
 * Resolve the origin the admin console is currently being served from.
 *
 * The Health board's `Admin` row probes `${origin}/api/health`, and the origin
 * has to be the host the OPERATOR is looking at: the console answers on the
 * Vercel production domain, on preview URLs, and on `localhost:3001`, and a row
 * that probed a different one of those would be reporting on a deployment
 * nobody asked about.
 *
 * ## Why this is more careful than `request.nextUrl.origin`
 *
 * `Host` and `X-Forwarded-Host` are CLIENT-SUPPLIED. Feeding either straight
 * into `fetch` turns the probe into a request-forgery sink: the console would
 * make an outbound GET to whatever host the header named. The exposure is
 * genuinely small — `/api/admin/health` and the Health page are both
 * `super_admin`-gated, the probe sends no credentials and no body, and the
 * caller sees only a state, a latency and an error string — but "small" is not
 * "none", and a header is not a fact.
 *
 * So two defences:
 *
 * 1. `ADMIN_APP_ORIGIN`, when set, wins outright and removes the request from
 *    the decision entirely. Production should set it.
 * 2. Otherwise the header is parsed as a bare `host[:port]` and rejected unless
 *    it is exactly that — no userinfo (`evil@`), no path, no scheme, no comma
 *    (a forwarded-header list), nothing that could address a different URL than
 *    `https://<host>/api/health` reads like.
 *
 * Returns `undefined` when nothing usable is available, which the probe reports
 * as `unknown` — "we did not ask" — rather than inventing a host.
 *
 * @module lib/server/request-origin
 */

/**
 * `host[:port]`, and nothing else.
 *
 * Letters, digits, `-` and `.` in labels; an optional numeric port. Anchored at
 * both ends. This is what excludes `evil.test/..`, `a@evil.test`,
 * `localhost:3001,evil.test` (a real shape for `X-Forwarded-Host`) and
 * `https://evil.test`.
 */
const HOST_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*(?::\d{1,5})?$/i;

/** Hosts that are legitimately served over plain http. */
function isLoopback(host: string): boolean {
  const name = host.split(':')[0] ?? '';
  return name === 'localhost' || name === '127.0.0.1' || name === '[::1]';
}

export function resolveAdminOrigin(headers: Headers): string | undefined {
  const configured = process.env.ADMIN_APP_ORIGIN;
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.origin;
    } catch {
      // Fall through to the request host — a malformed env var should not make
      // the row permanently `unknown` with no explanation.
    }
  }

  const raw = (headers.get('x-forwarded-host') ?? headers.get('host') ?? '').trim();
  if (!raw || !HOST_PATTERN.test(raw)) return undefined;

  const proto = headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const scheme = proto === 'http' || (proto === undefined && isLoopback(raw)) ? 'http' : 'https';

  return `${scheme}://${raw}`;
}
