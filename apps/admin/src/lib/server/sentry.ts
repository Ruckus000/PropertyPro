/**
 * Read-side Sentry client: the console's window onto production errors.
 *
 * This is NOT `@sentry/nextjs`. That package WRITES events; this reads the
 * issue stream back out through Sentry's REST API so the Health board can show
 * what is currently broken without an operator leaving the console.
 *
 * ## Why `createSentryClient` can return `null`
 *
 * `SENTRY_API_TOKEN` is a user-scoped auth token, separate from the DSN that
 * `@sentry/nextjs` uses and separate from `SENTRY_AUTH_TOKEN` (which is a
 * build-time source-map upload token and is deliberately NOT reused here — a
 * token that can upload artifacts should not have to be readable by the
 * request path). On a fresh checkout, in CI, and in any preview deployment it
 * will simply be unset.
 *
 * So "not configured" is the normal case and has to be representable. The
 * factory returns `null` rather than a client that resolves to `[]`, because
 * `HealthReport.errors` distinguishes `null` ("we never asked Sentry") from
 * `[]` ("we asked and production is quiet"). An empty array in the absent case
 * would render the single most misleading sentence this surface can produce:
 * no production errors, on a console wired to nothing.
 *
 * @module lib/server/sentry
 */

/**
 * Sentry's regional API host.
 *
 * Sentry moved organisation data behind per-region hosts; `sentry.io` still
 * answers for some endpoints and 404s or cross-region-redirects for others, so
 * the region is pinned rather than discovered. Hard-coded rather than made an
 * env var on purpose: a wrong value here fails visibly on the first call, while
 * a fourth optional env var is a fourth thing to leave unset.
 */
const SENTRY_API_BASE = 'https://us.sentry.io/api/0';

/** How many issues the Health board asks for. The board shows fewer. */
const DEFAULT_LIMIT = 10;

export interface SentryIssue {
  id: string;
  /** Human-facing short id, e.g. `PROPERTY-PRO-7`. Used as a banner fingerprint. */
  shortId: string;
  title: string;
  culprit: string;
  /** Events in the stats period. The API sends this as a STRING. */
  count: number;
  lastSeen: string;
  permalink: string;
  /** Event counts per hour over the stats period, oldest first (up to 24). */
  hourly: number[];
}

export interface SentryClient {
  listIssues(project: string, opts?: { statsPeriod?: '24h'; limit?: number }): Promise<SentryIssue[]>;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Coerce one raw issue from the API into a `SentryIssue`.
 *
 * Pure and total: every field falls back rather than throwing. A health board
 * that 500s because Sentry added a field or sent `culprit: null` is worse than
 * one that shows a row with a blank culprit, and this runs on the screen an
 * operator opens *because* something is already wrong.
 */
export function parseIssue(raw: unknown): SentryIssue {
  const issue = (raw ?? {}) as Record<string, unknown>;

  // `count` is serialized as a string by the API (it is a bigint server-side).
  // `Number('')` is 0 and `Number(undefined)` is NaN, so both are normalised.
  const parsedCount = Number(issue.count);

  // `stats` is `{ '24h': [[unixSeconds, count], …] }`. Only the counts matter
  // — the sparkline is positional, and the buckets are already evenly spaced.
  const stats = (issue.stats ?? {}) as Record<string, unknown>;
  const series = stats['24h'] ?? stats['14d'];
  const hourly = Array.isArray(series)
    ? series.map((bucket) => {
        const value = Array.isArray(bucket) ? Number(bucket[1]) : Number(bucket);
        return Number.isFinite(value) ? value : 0;
      })
    : [];

  return {
    id: str(issue.id),
    shortId: str(issue.shortId, str(issue.id)),
    title: str(issue.title, 'Unknown error'),
    culprit: str(issue.culprit),
    count: Number.isFinite(parsedCount) ? parsedCount : 0,
    lastSeen: str(issue.lastSeen),
    permalink: str(issue.permalink),
    hourly,
  };
}

/**
 * Build a client, or `null` when the console is not wired to Sentry.
 *
 * @param fetchImpl Injected for tests — nothing in the test suite reaches the
 *   network. Defaults to the platform `fetch`.
 * @returns `null` when `SENTRY_API_TOKEN` or `SENTRY_ORG` is unset. Both are
 *   required: the org is part of the path, so a token without an org cannot
 *   address any endpoint.
 */
export function createSentryClient(fetchImpl: typeof fetch = fetch): SentryClient | null {
  const token = process.env.SENTRY_API_TOKEN;
  const org = process.env.SENTRY_ORG;
  if (!token || !org) return null;

  return {
    async listIssues(project, opts) {
      // URLSearchParams encodes `is:unresolved` as `is%3Aunresolved` and
      // preserves insertion order, so the query string is deterministic.
      const params = new URLSearchParams({
        query: 'is:unresolved',
        statsPeriod: opts?.statsPeriod ?? '24h',
        sort: 'freq',
        limit: String(opts?.limit ?? DEFAULT_LIMIT),
      });
      const url = `${SENTRY_API_BASE}/projects/${org}/${project}/issues/?${params.toString()}`;

      const response = await fetchImpl(url, {
        headers: { authorization: `Bearer ${token}` },
        // Bounded like every other probe: the Health page must render even when
        // Sentry itself is the thing that is slow.
        signal: AbortSignal.timeout(4000),
      });

      if (!response.ok) {
        // The message carries the STATUS only. A Sentry error body can echo the
        // query and, on an auth failure, hints about the token; the caller turns
        // this into `errors: null` and shows a banner, so detail buys nothing.
        throw new Error(`Sentry issues request failed: ${response.status}`);
      }

      const body: unknown = await response.json();
      return Array.isArray(body) ? body.map(parseIssue) : [];
    },
  };
}
