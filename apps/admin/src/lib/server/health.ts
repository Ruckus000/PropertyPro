/**
 * The Health report: is the platform up, what is erroring, and what stopped running.
 *
 * ## Three states, not two
 *
 * Every probe can answer `ok`, `degraded`, `down` — or `unknown`. That fourth
 * state is the one that matters most here, and it means *we did not ask*: the
 * env var naming the dependency is unset, so there is nothing to probe. A fresh
 * checkout has no `WEB_APP_ORIGIN`, no `SENTRY_API_TOKEN`, no `RESEND_API_KEY`;
 * reporting those as `down` would paint a developer's laptop as a production
 * outage, and — worse — would make a REAL outage indistinguishable from a
 * missing line in `.env.local`. `down` is reserved for "we asked and it failed".
 *
 * ## Dependency injection, and why the seams are where they are
 *
 * `HealthDeps` takes a `fetch`, a clock, a Supabase *ping thunk*, a Stripe
 * balance-reader, and two row *loaders* — not a Supabase client. Mocking a
 * PostgREST chainable builder is a well-known way to write assertions that
 * measure nothing (see `.claude/rules/api-patterns.md`), and the probes' own
 * logic is the `ok`/`degraded`/`down`/`unknown` decision, not the query shape.
 * So each data dependency enters as the smallest function that can fail.
 *
 * A `null` dependency means *not configured* and yields `unknown`. A dependency
 * that rejects means *unreachable* and yields `down`.
 *
 * ## Nothing here throws
 *
 * `getHealthReport` is rendered by the one screen an operator opens *because*
 * something is already broken. Every probe and both loaders are individually
 * caught; a total outage produces a report full of `down`, never a 500.
 *
 * @module lib/server/health
 */
import { createAdminClient } from '@propertypro/db/supabase/admin';

import { getStripeClient } from '@/lib/stripe';
import { createSentryClient, type SentryClient, type SentryIssue } from './sentry';
import type { ShellCritical } from './signals/types';

export type ServiceState = 'ok' | 'degraded' | 'down' | 'unknown';

export type ServiceName = 'API' | 'Web app' | 'Admin' | 'Supabase' | 'Stripe webhooks' | 'Resend';

export interface ServiceStatus {
  name: ServiceName;
  state: ServiceState;
  /** One or two words for the pill. */
  short: string;
  /** The detail line: a latency, a backlog count, or the env var that is unset. */
  meta: string;
}

export interface FailedJob {
  source: 'Cron' | 'Stripe';
  name: string;
  error: string;
  when: string;
  attempts: string;
  retryable: boolean;
  /** Present only for cron rows — it is what the retry route accepts. */
  slug?: string;
  /**
   * `cron_runs.consecutive_failures`. Carried rather than parsed back out of
   * `attempts`, because `deriveCritical` needs the NUMBER to decide whether one
   * bad tick or a broken job is being looked at.
   */
  consecutiveFailures?: number;
}

export interface HealthReport {
  services: ServiceStatus[];
  /** `null` = Sentry is not configured, or the call failed. NEVER `[]` for those. */
  errors: SentryIssue[] | null;
  jobs: FailedJob[];
  errorsLastHour: number;
  checkedAt: string;
}

/** One `cron_runs` row, as PostgREST returns it (snake_case, ISO strings). */
export interface CronRunRow {
  job_slug: string;
  last_status: string | null;
  last_error: string | null;
  last_started_at: string | null;
  consecutive_failures: number;
}

/** One unprocessed `stripe_webhook_events` row. */
export interface StripeWebhookRow {
  event_id: string;
  received_at: string;
}

/** The slice of the Stripe SDK this module uses — one read, for latency. */
export interface StripeBalanceReader {
  balance: { retrieve(): Promise<unknown> };
}

/** What a Supabase ping returns: PostgREST RESOLVES with `{ error }`, it does not throw. */
export type SupabasePing = () => Promise<{ error: { message: string } | null }>;

export interface HealthDeps {
  fetchImpl: typeof fetch;
  now: () => Date;
  /** `WEB_APP_ORIGIN`. `undefined` → Web app and API report `unknown`. */
  webOrigin: string | undefined;
  /** The admin app's own origin, derived from the request host by the caller. */
  adminOrigin: string | undefined;
  resendApiKey: string | undefined;
  /** `null` → `STRIPE_SECRET_KEY` is unset. */
  stripe: StripeBalanceReader | null;
  /** `null` → the service-role credentials are unset. */
  pingSupabase: SupabasePing | null;
  loadCronRuns: () => Promise<CronRunRow[]>;
  loadUnprocessedStripeEvents: () => Promise<StripeWebhookRow[]>;
  /** `null` → `SENTRY_API_TOKEN`/`SENTRY_ORG` unset; `errors` stays `null`. */
  sentry: SentryClient | null;
  sentryProject: string;
}

/** Every probe is bounded: the Health page must render even when a dependency hangs. */
const PROBE_TIMEOUT_MS = 4000;

/**
 * Consecutive cron failures before the shell interrupts with a banner.
 *
 * One failed tick is a `Retry` button. Two in a row is a job that is not going
 * to fix itself — `withCronJob` resets the counter to 0 on any success, so this
 * cannot be reached by a job that is merely flaky across days.
 */
export const CRON_CONSECUTIVE_FAILURE_THRESHOLD = 2;

/** Unprocessed Stripe webhook rows in the last hour before `Stripe webhooks` degrades. */
const STRIPE_BACKLOG_DEGRADED_AT = 1;

/* -------------------------------------------------------------------------- */
/* formatting helpers (pure)                                                   */
/* -------------------------------------------------------------------------- */

function elapsedMs(started: number): number {
  return Math.max(0, Math.round(performance.now() - started));
}

/**
 * A compact age. Deliberately NOT date-fns `formatDistance`: "about 2 days ago"
 * wraps a table cell, and the unit here is a glance, not prose.
 */
function ago(iso: string | null, now: Date): string {
  if (!iso) return 'never run';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'unknown';
  const seconds = Math.max(0, Math.round((now.getTime() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function attemptsLabel(count: number): string {
  const n = Math.max(1, count);
  return n === 1 ? '1 attempt' : `${n} attempts`;
}

/** Trim an origin so `${origin}/api/health` cannot produce a double slash. */
function normaliseOrigin(origin: string): string {
  return origin.replace(/\/+$/, '');
}

/* -------------------------------------------------------------------------- */
/* probes                                                                      */
/* -------------------------------------------------------------------------- */

function unconfigured(name: ServiceName, envVar: string): ServiceStatus {
  return { name, state: 'unknown', short: 'Not configured', meta: `${envVar} is not set` };
}

/**
 * Probe `${webOrigin}/api/health`, which answers for TWO rows.
 *
 * `Web app` is about reachability — did the deployment answer at all. `API` is
 * about what it said: the route returns `{ status: 'ok' }`, and anything else
 * means the process is serving but unhealthy. Collapsing them into one row
 * loses exactly the distinction an operator needs first ("is it down, or is it
 * up and wrong?").
 */
export async function probeWebApp(
  webOrigin: string | undefined,
  fetchImpl: typeof fetch,
): Promise<{ web: ServiceStatus; api: ServiceStatus }> {
  if (!webOrigin) {
    return {
      web: unconfigured('Web app', 'WEB_APP_ORIGIN'),
      api: unconfigured('API', 'WEB_APP_ORIGIN'),
    };
  }

  const started = performance.now();
  try {
    const response = await fetchImpl(`${normaliseOrigin(webOrigin)}/api/health`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const ms = elapsedMs(started);

    if (!response.ok) {
      const short = `HTTP ${response.status}`;
      return {
        web: { name: 'Web app', state: 'down', short, meta: `${ms} ms` },
        api: { name: 'API', state: 'down', short, meta: `${ms} ms` },
      };
    }

    const web: ServiceStatus = { name: 'Web app', state: 'ok', short: 'Reachable', meta: `${ms} ms` };

    let status: unknown;
    try {
      status = ((await response.json()) as { status?: unknown }).status;
    } catch {
      // A 200 that is not JSON means something is answering on that origin
      // that is not our route handler — a proxy error page, a login wall.
      return {
        web,
        api: { name: 'API', state: 'degraded', short: 'Unreadable', meta: 'Response was not JSON' },
      };
    }

    return status === 'ok'
      ? { web, api: { name: 'API', state: 'ok', short: 'Healthy', meta: `${ms} ms` } }
      : {
          web,
          api: {
            name: 'API',
            state: 'degraded',
            short: 'Unhealthy',
            meta: `Reported status: ${String(status ?? 'none')}`,
          },
        };
  } catch (error) {
    const meta = error instanceof Error ? error.message : 'Request failed';
    return {
      web: { name: 'Web app', state: 'down', short: 'Unreachable', meta },
      api: { name: 'API', state: 'down', short: 'Unreachable', meta },
    };
  }
}

/**
 * Probe the admin app's own `/api/health`.
 *
 * The origin is passed in rather than read from an env var: the console is
 * reachable on more than one host (the Vercel domain, a preview URL,
 * `localhost:3001`) and the one that matters is the one the operator is looking
 * at. `undefined` means the caller could not resolve a request host, which is
 * `unknown` rather than a fabricated guess.
 */
export async function probeAdminApp(
  adminOrigin: string | undefined,
  fetchImpl: typeof fetch,
): Promise<ServiceStatus> {
  if (!adminOrigin) {
    return {
      name: 'Admin',
      state: 'unknown',
      short: 'Not configured',
      meta: 'The request host could not be resolved',
    };
  }

  const started = performance.now();
  try {
    const response = await fetchImpl(`${normaliseOrigin(adminOrigin)}/api/health`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const ms = elapsedMs(started);
    return response.ok
      ? { name: 'Admin', state: 'ok', short: 'Reachable', meta: `${ms} ms` }
      : { name: 'Admin', state: 'down', short: `HTTP ${response.status}`, meta: `${ms} ms` };
  } catch (error) {
    return {
      name: 'Admin',
      state: 'down',
      short: 'Unreachable',
      meta: error instanceof Error ? error.message : 'Request failed',
    };
  }
}

/**
 * Probe Supabase with the cheapest read that proves the Data API answers.
 *
 * Two failure shapes, and only one of them throws. PostgREST RESOLVES with an
 * `{ error }` object for a denied or malformed query, so a bare `await` would
 * report a permission failure as `ok`; the thunk's contract returns that object
 * and this checks it.
 */
export async function probeSupabase(ping: SupabasePing | null): Promise<ServiceStatus> {
  if (!ping) {
    return {
      name: 'Supabase',
      state: 'unknown',
      short: 'Not configured',
      meta: 'NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set',
    };
  }

  const started = performance.now();
  try {
    const { error } = await ping();
    const ms = elapsedMs(started);
    return error
      ? { name: 'Supabase', state: 'down', short: 'Query failed', meta: error.message }
      : { name: 'Supabase', state: 'ok', short: 'Reachable', meta: `${ms} ms` };
  } catch (error) {
    return {
      name: 'Supabase',
      state: 'down',
      short: 'Unreachable',
      meta: error instanceof Error ? error.message : 'Query failed',
    };
  }
}

/** Probe Resend by listing domains — the cheapest authenticated read it offers. */
export async function probeResend(
  apiKey: string | undefined,
  fetchImpl: typeof fetch,
): Promise<ServiceStatus> {
  if (!apiKey) return unconfigured('Resend', 'RESEND_API_KEY');

  const started = performance.now();
  try {
    const response = await fetchImpl('https://api.resend.com/domains', {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const ms = elapsedMs(started);
    return response.ok
      ? { name: 'Resend', state: 'ok', short: 'Reachable', meta: `${ms} ms` }
      : { name: 'Resend', state: 'down', short: `HTTP ${response.status}`, meta: `${ms} ms` };
  } catch (error) {
    return {
      name: 'Resend',
      state: 'down',
      short: 'Unreachable',
      meta: error instanceof Error ? error.message : 'Request failed',
    };
  }
}

/**
 * Probe Stripe: API latency AND the unprocessed-webhook backlog.
 *
 * Two independent signals on one row, because they fail for the same reason
 * from an operator's point of view — money events are not landing. A reachable
 * Stripe with a growing backlog is the more dangerous of the two and is the one
 * `deriveCritical` escalates: `stripe_webhook_events.processed_at` staying null
 * means our handler is the thing that is broken, not Stripe.
 */
export async function probeStripeWebhooks(
  stripe: StripeBalanceReader | null,
  unprocessed: StripeWebhookRow[],
  now: Date,
): Promise<ServiceStatus> {
  if (!stripe) return unconfigured('Stripe webhooks', 'STRIPE_SECRET_KEY');

  const started = performance.now();
  let ms: number;
  try {
    await stripe.balance.retrieve();
    ms = elapsedMs(started);
  } catch (error) {
    return {
      name: 'Stripe webhooks',
      state: 'down',
      short: 'API failed',
      meta: error instanceof Error ? error.message : 'balance.retrieve failed',
    };
  }

  const hourAgo = now.getTime() - 60 * 60 * 1000;
  const lastHour = unprocessed.filter((row) => {
    const at = new Date(row.received_at).getTime();
    return Number.isFinite(at) && at >= hourAgo;
  }).length;

  if (lastHour >= STRIPE_BACKLOG_DEGRADED_AT) {
    return {
      name: 'Stripe webhooks',
      state: 'degraded',
      short: `${lastHour}/hr`,
      meta: `${unprocessed.length} unprocessed in 24h · API ${ms} ms`,
    };
  }

  return {
    name: 'Stripe webhooks',
    state: 'ok',
    short: 'Processing',
    meta: unprocessed.length > 0 ? `${unprocessed.length} unprocessed in 24h` : `${ms} ms`,
  };
}

/* -------------------------------------------------------------------------- */
/* row summarisers (pure)                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Turn one `cron_runs` row into a failed job, or `null` when the job is healthy.
 *
 * Two independent failure arms:
 *
 * 1. `consecutive_failures > 0` — set to 1 on the first error and incremented
 *    thereafter by `cron-run-service.ts`, reset to 0 on any success.
 * 2. `last_status` present and not `'ok'`.
 *
 * The second arm is written as "not ok" rather than "=== 'failed'" on purpose.
 * `cron-run-service.ts` writes `'ok' | 'error'` — it has never written
 * `'failed'` — so a predicate matching that literal would be dead code against
 * real rows, leaving the whole behaviour resting on arm 1 with nothing saying
 * so. "Not ok" covers `'error'`, covers `'failed'`, and covers whatever a future
 * status string is, which is the right default for a monitoring read: an
 * unrecognised status is not evidence of health.
 *
 * A row with `last_status: null` and no failures is a REGISTERED job that has
 * not run yet (`cron_runs` seeds a row on the first authenticated tick of a
 * process), which is not a failure and must not be reported as one.
 */
export function summariseCronRun(row: CronRunRow, now: Date): FailedJob | null {
  const failures = row.consecutive_failures ?? 0;
  const statusFailed = typeof row.last_status === 'string' && row.last_status !== 'ok';
  if (failures <= 0 && !statusFailed) return null;

  return {
    source: 'Cron',
    name: row.job_slug,
    error: row.last_error ?? 'No error recorded',
    when: ago(row.last_started_at, now),
    attempts: attemptsLabel(failures),
    retryable: true,
    slug: row.job_slug,
    consecutiveFailures: failures,
  };
}

/**
 * An unprocessed Stripe webhook row as a failed job.
 *
 * `retryable: false`, and no `slug`. There is no internal endpoint that replays
 * a Stripe event — replay is a Stripe-dashboard action against their event id,
 * and the retry route only accepts slugs it has seen in `cron_runs`, so a
 * `retryable` Stripe row would render a button with nothing behind it.
 */
export function summariseStripeEvent(row: StripeWebhookRow, now: Date): FailedJob {
  return {
    source: 'Stripe',
    name: row.event_id,
    error: 'not processed',
    when: ago(row.received_at, now),
    attempts: '—',
    retryable: false,
  };
}

/* -------------------------------------------------------------------------- */
/* critical-banner derivation (pure)                                           */
/* -------------------------------------------------------------------------- */

/**
 * The single most urgent thing on this report, or `null` (spec D20).
 *
 * Priority order, highest first — it is the order of "how much money or trust is
 * leaking per minute", not severity in the abstract:
 *
 * 1. An error spike. The blast radius is every user of every community.
 * 2. A Stripe webhook backlog. Payments are landing at Stripe and not here.
 * 3. A cron job failing repeatedly. Scheduled work is silently not happening.
 *
 * `fingerprint` is what the shell de-duplicates on, so it must be STABLE for
 * the same underlying condition and must CHANGE when the condition does —
 * otherwise a dismissed banner for one outage suppresses the next.
 */
export function deriveCritical(
  report: HealthReport,
  thresholds: { errorsPerHour: number },
): ShellCritical | null {
  if (report.errorsLastHour >= thresholds.errorsPerHour) {
    const top = report.errors?.[0];
    return {
      // `errors:spike` when the counts and the issue list disagree — a banner
      // fingerprinted `errors:undefined` would collide with every other such case.
      fingerprint: `errors:${top?.shortId ?? 'spike'}`,
      text: top
        ? `${report.errorsLastHour} production errors in the last hour — ${top.title}`
        : `${report.errorsLastHour} production errors in the last hour`,
      shortText: `${report.errorsLastHour} errors/hr`,
      href: '/health',
    };
  }

  const stripe = report.services.find((service) => service.name === 'Stripe webhooks');
  if (stripe && (stripe.state === 'degraded' || stripe.state === 'down')) {
    return {
      // The state is in the fingerprint so a degradation escalating to `down`
      // raises a fresh banner rather than being swallowed as "already seen".
      fingerprint: `stripe-webhooks:${stripe.state}`,
      text: `Stripe webhooks are ${stripe.state} — ${stripe.short}`,
      shortText: 'Stripe webhooks',
      href: '/health',
    };
  }

  const brokenCron = report.jobs.find(
    (job) =>
      job.source === 'Cron' &&
      (job.consecutiveFailures ?? 0) >= CRON_CONSECUTIVE_FAILURE_THRESHOLD,
  );
  if (brokenCron) {
    return {
      fingerprint: `cron:${brokenCron.slug ?? brokenCron.name}`,
      text: `${brokenCron.name} has failed ${brokenCron.attempts} in a row — ${brokenCron.error}`,
      shortText: `${brokenCron.name} failing`,
      href: '/health',
    };
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* composition                                                                 */
/* -------------------------------------------------------------------------- */

/** How far back unprocessed Stripe webhook rows are counted. */
const STRIPE_BACKLOG_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Distinct job slugs the heartbeat knows about.
 *
 * `cron_runs.job_slug` is the PRIMARY KEY — one row per job, not a run log — so
 * this is a plain select and needs no `distinct`.
 *
 * This is the retry route's allowlist, and it is deliberately derived from
 * observed rows rather than from a hard-coded list: a slug that has never
 * appeared in `cron_runs` is one this console has no business POSTing to, even
 * if an `/api/v1/internal/<slug>` route exists for it (`provision` and
 * `readiness` are real endpoints and are not cron jobs).
 *
 * Returns `[]` rather than throwing — a read failure must refuse every retry,
 * not 500 the page.
 */
export async function listKnownJobSlugs(): Promise<string[]> {
  try {
    // `cron_runs` is absent from the admin Supabase type shim, so this goes
    // through the untyped client — the same escape `leads`'s POST documents.
    const { data, error } = await createAdminClient().from('cron_runs').select('job_slug');
    if (error) return [];
    return (data ?? []).map((row) => String((row as { job_slug: unknown }).job_slug));
  } catch {
    return [];
  }
}

function defaultDeps(): HealthDeps {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  let stripe: StripeBalanceReader | null = null;
  if (process.env.STRIPE_SECRET_KEY) {
    try {
      stripe = getStripeClient();
    } catch {
      stripe = null;
    }
  }

  return {
    fetchImpl: fetch,
    now: () => new Date(),
    webOrigin: process.env.WEB_APP_ORIGIN,
    adminOrigin: undefined,
    resendApiKey: process.env.RESEND_API_KEY,
    stripe,
    pingSupabase: supabaseConfigured
      ? async () => {
          // admin-community-scope:exempt — not a population read. This is a liveness probe: the COUNT is discarded (only `error` is returned) and nothing renders it, so there is no on-screen number for an unfiltered population to disagree with. `is_demo`/`deleted_at` would add predicates to a latency measurement without changing what it measures.
          const { error } = await createAdminClient()
            .from('communities')
            .select('id', { head: true, count: 'exact' })
            .limit(1);
          return { error: error ? { message: error.message } : null };
        }
      : null,
    loadCronRuns: async () => {
      const { data, error } = await createAdminClient()
        .from('cron_runs')
        .select('job_slug, last_status, last_error, last_started_at, consecutive_failures');
      if (error) throw new Error(`cron_runs read failed: ${error.message}`);
      return (data ?? []) as unknown as CronRunRow[];
    },
    loadUnprocessedStripeEvents: async () => {
      const since = new Date(Date.now() - STRIPE_BACKLOG_WINDOW_MS).toISOString();
      const { data, error } = await createAdminClient()
        .from('stripe_webhook_events')
        .select('event_id, received_at')
        .is('processed_at', null)
        .gt('received_at', since)
        .order('received_at', { ascending: false })
        .limit(100);
      if (error) throw new Error(`stripe_webhook_events read failed: ${error.message}`);
      return (data ?? []) as unknown as StripeWebhookRow[];
    },
    sentry: createSentryClient(),
    sentryProject: process.env.SENTRY_PROJECT ?? 'property-pro',
  };
}

/** Resolve a loader, reporting `[]` rather than propagating a failure. */
async function safeLoad<T>(load: () => Promise<T[]>): Promise<T[]> {
  try {
    return await load();
  } catch {
    return [];
  }
}

/**
 * Build the whole report. Never throws.
 *
 * Probes run concurrently: six sequential 4 s timeouts would make a fully
 * broken platform take 24 s to report, which is longer than an operator will
 * wait before reaching for the Vercel dashboard instead.
 */
export async function getHealthReport(deps: Partial<HealthDeps> = {}): Promise<HealthReport> {
  const d: HealthDeps = { ...defaultDeps(), ...deps };
  const now = d.now();

  const [stripeRows, cronRows] = await Promise.all([
    safeLoad(d.loadUnprocessedStripeEvents),
    safeLoad(d.loadCronRuns),
  ]);

  const [webAndApi, admin, supabase, stripeService, resend, errors] = await Promise.all([
    probeWebApp(d.webOrigin, d.fetchImpl),
    probeAdminApp(d.adminOrigin, d.fetchImpl),
    probeSupabase(d.pingSupabase),
    probeStripeWebhooks(d.stripe, stripeRows, now),
    probeResend(d.resendApiKey, d.fetchImpl),
    // `null` for BOTH "not configured" and "the call failed" — the page shows a
    // banner either way, and an empty array here would read as "production is
    // quiet", which is a claim an unconfigured console cannot make.
    d.sentry
      ? d.sentry.listIssues(d.sentryProject).catch(() => null)
      : Promise.resolve(null),
  ]);

  const jobs: FailedJob[] = [
    ...cronRows
      .map((row) => summariseCronRun(row, now))
      .filter((job): job is FailedJob => job !== null),
    ...stripeRows.map((row) => summariseStripeEvent(row, now)),
  ];

  // The most recent hourly bucket, summed across issues. Sentry's series is
  // oldest-first, so the last element is the hour in progress.
  const errorsLastHour = (errors ?? []).reduce(
    (total, issue) => total + (issue.hourly.at(-1) ?? 0),
    0,
  );

  return {
    services: [webAndApi.api, webAndApi.web, admin, supabase, stripeService, resend],
    errors,
    jobs,
    errorsLastHour,
    checkedAt: now.toISOString(),
  };
}
