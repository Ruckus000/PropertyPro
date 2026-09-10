/**
 * Is this URL pointing at a local service, or a remote one?
 *
 * Shared because the answer gates two very different things and both got it
 * wrong in their own way:
 *
 *  - `scripts/lib/stripe-guards.ts` asks it of `DATABASE_URL` before destructive
 *    tooling runs. That one was already correct and is the source of this code.
 *  - The four `/dev/*` routes ask `nonLocalBackendReason` (below) of BOTH
 *    `NEXT_PUBLIC_SUPABASE_URL` and `DATABASE_URL` before minting sessions,
 *    platform-admin grants or onboarding rows. Those gated on `NODE_ENV` alone,
 *    which cannot distinguish *developing* from *developing against production*
 *    — and on 2026-09-10 that gap put a real `super_admin` row in the production
 *    project, created by a `pnpm dev` in a worktree whose `.env.local` names
 *    prod. The first fix asked only about Supabase, which left
 *    `dev/reset-onboarding` — whose only write is drizzle over `DATABASE_URL` —
 *    gated on a variable it never touches.
 *
 * `scripts/with-env-local-demo-db.sh` states the invariant this enforces:
 * "local Postgres implies local Supabase. A half-redirected env is the
 * dangerous state, because it looks local and writes remote."
 *
 * ## Allowlist, not denylist
 *
 * This answers "is it demonstrably local", never "is it a known production
 * host". A denylist of known prod hosts fails OPEN on the one project nobody
 * remembered to add — which is exactly the shape of
 * `apps/web/e2e/helpers/stripe-e2e.ts`'s `KNOWN_PROD_SUPABASE_REFS`, and why
 * that helper is deliberately not the model here.
 */

/**
 * Hosts that mean "this machine". `host.docker.internal` is included because a
 * containerised service reaching the host's database is still local.
 */
export const LOOPBACK_HOSTS: readonly string[] = [
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  '0.0.0.0',
  'host.docker.internal',
];

/**
 * The bare host of a URL, without pulling in a URL parser — deliberately
 * scheme-agnostic so one implementation serves `postgresql://`, `http://` and
 * `https://` alike.
 *
 * The credential strip (`^[^@/]*@`) is load-bearing, not cosmetic:
 * `postgresql://user:localhost@evil.example.com/db` must resolve to
 * `evil.example.com`, not `localhost`. A naive "does it contain localhost"
 * check reads that URL as local and hands an attacker the gate. That case is
 * pinned by an existing test in `scripts/__tests__/stripe-cutover-tooling.test.ts`.
 */
export function hostFromUrl(url: string): string {
  return url
    .replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '')
    .replace(/^[^@/]*@/, '')
    .replace(/[/?].*$/, '')
    .replace(/:\d+$/, '');
}

/**
 * True only when `url` is present and its host is demonstrably this machine.
 * An absent URL is NOT local — a missing value must never read as safe.
 */
export function isLoopbackUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  return LOOPBACK_HOSTS.includes(hostFromUrl(url));
}

/** The env vars every `/dev/*` route's backends are reached through. */
const DEV_BACKEND_VARS = ['NEXT_PUBLIC_SUPABASE_URL', 'DATABASE_URL'] as const;

/**
 * The env bag `nonLocalBackendReason` reads.
 *
 * An index signature rather than `{ NEXT_PUBLIC_SUPABASE_URL?: string;
 * DATABASE_URL?: string }`, because `process.env` (`NodeJS.ProcessEnv`) overlaps
 * that shape only through its OWN index signature, and TypeScript's weak-type
 * check rejects the assignment outright (TS2559: "has no properties in common").
 * The narrower type reads better and does not compile at the only call site.
 */
export type DevBackendEnv = Readonly<Record<string, string | undefined>>;

/**
 * Why a `/dev/*` route must refuse, or `null` when both backends are
 * demonstrably local.
 *
 * **Both are required in every gated route, including ones that touch only one
 * of them.** That is a decision, not an oversight:
 *
 *  - `scripts/with-env-local-demo-db.sh` already asserts loopback on
 *    `DATABASE_URL`, `DIRECT_URL` and `NEXT_PUBLIC_SUPABASE_URL` *together*,
 *    and states the invariant as "local Postgres implies local Supabase — a
 *    half-redirected env is the dangerous state, because it looks local and
 *    writes remote". A per-route rule re-opens exactly that state.
 *  - One uniform rule is one sentence a reader can verify. Four per-route rules
 *    cannot be checked without reading each file's imports to see which backend
 *    it actually writes to — which is the mistake this function exists to fix:
 *    `dev/reset-onboarding` gated on `NEXT_PUBLIC_SUPABASE_URL` while its only
 *    side effect was an INSERT over `DATABASE_URL`, so `supabase start` plus an
 *    untouched `.env.local` passed the gate and wrote production rows.
 *  - The cost of a false refusal is one env var, on a route that 404s outside
 *    `development`. The cost of a false pass is a production write.
 *
 * An absent value is never local (see `isLoopbackUrl`), so a missing var
 * refuses rather than passing.
 */
export function nonLocalBackendReason(env: DevBackendEnv): string | null {
  const remote = DEV_BACKEND_VARS.filter((name) => !isLoopbackUrl(env[name]));
  if (remote.length === 0) return null;

  // Name the variable but never its host: this string is a response body, and
  // the failing case is precisely the one where the host is a production one.
  const subject =
    remote.length === 1
      ? `${remote[0]} is not a local (loopback) target`
      : `${remote.join(' and ')} are not local (loopback) targets`;

  return (
    `Refusing to run: ${subject}. ` +
    'Dev-only routes require BOTH a local Supabase instance and a local Postgres — ' +
    'a half-redirected env looks local and writes remote. ' +
    'Start a local stack (`supabase start`) or use scripts/with-env-local-demo-db.sh.'
  );
}
