/**
 * Is this URL pointing at a local service, or a remote one?
 *
 * Shared because the answer gates two very different things and both got it
 * wrong in their own way:
 *
 *  - `scripts/lib/stripe-guards.ts` asks it of `DATABASE_URL` before destructive
 *    tooling runs. That one was already correct and is the source of this code.
 *  - The four `/dev/*` login routes ask it of `NEXT_PUBLIC_SUPABASE_URL` before
 *    minting sessions and platform-admin grants. Those gated on `NODE_ENV`
 *    alone, which cannot distinguish *developing* from *developing against
 *    production* — and on 2026-09-10 that gap put a real `super_admin` row in
 *    the production project, created by a `pnpm dev` in a worktree whose
 *    `.env.local` names prod.
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
