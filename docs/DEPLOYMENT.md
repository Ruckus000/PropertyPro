# Deployment Runbook — PropertyPro Florida

**Last Updated:** 2026-02-24
**Phase:** P4-60

---

## 1. Architecture Overview

```
GitHub (main) ──push──► GitHub Actions CI ──pass──► Vercel Deploy (Production)
                            │                              │
                            ├─ lint                        ├─ getpropertypro.com
                            ├─ typecheck                   ├─ *.getpropertypro.com (wildcard)
                            ├─ test                        └─ SSL via Let's Encrypt
                            └─ build
                                                     Supabase (Managed Postgres)
PR branch ──push──────────────────────────────────► Vercel GitHub Preview Deploy
                                                     └─ unique preview URL
```

## 2. Environments

| Environment | URL | Branch | Auto-deploy |
|-------------|-----|--------|-------------|
| Production | `getpropertypro.com` | `main` | Yes (via `deploy.yml` after CI passes) |
| Preview | `*.vercel.app` (unique per PR) | PR branches | Yes (via native Vercel GitHub integration) |
| Local dev | `localhost:3000` | Any | N/A |

## 3. Required GitHub Secrets

Configure these in GitHub repository Settings > Secrets and Variables > Actions.

### Repository Secrets

| Secret | Description | Where to get it |
|--------|-------------|-----------------|
| `VERCEL_TOKEN` | Vercel personal access token | Vercel Dashboard > Settings > Tokens |
| `VERCEL_ORG_ID` | Vercel team/org identifier | `.vercel/project.json` after `vercel link` |
| `VERCEL_PROJECT_ID` | Vercel project identifier | `.vercel/project.json` after `vercel link` |
| `DATABASE_URL` | Supabase pooled connection string (port 6543) | Supabase Dashboard > Project Settings > Database |
| `DIRECT_URL` | Supabase direct connection string (port 5432) | Supabase Dashboard > Project Settings > Database |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Supabase Dashboard > Project Settings > API |
| `DEMO_TOKEN_ENCRYPTION_KEY_HEX` | AES-256-GCM key for demo token-secret encryption | Generated via `openssl rand -hex 32` |
| `DEMO_DEFAULT_PASSWORD` | Password for demo seed users | Internal documentation |
| `DIGEST_CRON_BASE_URL` | Production URL for cron invocations | `https://getpropertypro.com` |
| `NOTIFICATION_DIGEST_CRON_SECRET` | Bearer token for digest cron endpoint | Generated shared secret |
| `COUPON_SYNC_RETRY_CRON_SECRET` | Bearer token for coupon sync retry cron endpoint | Generated shared secret |

### Repository Variables

| Variable | Description | Value |
|----------|-------------|-------|
| `INTEGRATION_TESTS_ENABLED` | Enable CI integration tests | `true` or `false` |

## 4. Required Vercel Environment Variables

Configure in Vercel Dashboard > Project > Settings > Environment Variables.

Set for **Production** and **Preview** environments unless noted.

| Variable | Scope | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | All | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Supabase service role key |
| `DEMO_TOKEN_ENCRYPTION_KEY_HEX` | Server only | AES-256-GCM key used to decrypt `demo_instances.auth_token_secret` |
| `DATABASE_URL` | Server only | Pooled connection string (port 6543) |
| `DIRECT_URL` | Server only | Direct connection string (port 5432, migrations only) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | All | Stripe publishable key |
| `STRIPE_SECRET_KEY` | Server only | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Server only | Stripe webhook signing secret |
| `STRIPE_PRICE_COMPLIANCE_BASIC` | Server only | Stripe price ID |
| `STRIPE_PRICE_COMPLIANCE_PLUS_MOBILE` | Server only | Stripe price ID |
| `STRIPE_PRICE_FULL_PLATFORM` | Server only | Stripe price ID |
| `STRIPE_PRICE_APARTMENT_OPERATIONS` | Server only | Stripe price ID |
| `RESEND_API_KEY` | Server only | Resend email API key |
| `NEXT_PUBLIC_SENTRY_DSN` | All | Sentry client DSN |
| `SENTRY_DSN` | Server only | Sentry server DSN |
| `SENTRY_AUTH_TOKEN` | Build only | Source map upload token |
| `SENTRY_ORG` | Build only | Sentry organization slug |
| `SENTRY_PROJECT` | Build only | Sentry project slug |
| `SENTRY_PROJECT_ADMIN` | Build only, **admin** | Sentry project slug for `apps/admin`. **Unset means admin's errors and source maps silently land in the WEB project** — `apps/admin/next.config.ts` falls back to `SENTRY_PROJECT`. Set on `property-pro-admin`. |
| `WEB_APP_BASE_URL` | Server only, **admin** | Base URL the demo→paid conversion flow sends the customer back to after Stripe checkout (`apps/admin/.../demos/[id]/convert`). Production: `https://getpropertypro.com`. |
| `UPSTASH_REDIS_REST_URL` | Server only | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Server only | Upstash Redis REST token |
| `NEXT_PUBLIC_APP_URL` | All | Web: `https://getpropertypro.com` (prod). Admin app: your admin host, e.g. `https://admin.getpropertypro.com` |
| `NEXT_PUBLIC_WEB_APP_URL` | Admin only | Web apex for tenant URLs/copy, e.g. `https://getpropertypro.com` (omit on web app) |
| `NEXT_PUBLIC_COOKIE_DOMAIN` | All | Production: `.getpropertypro.com` |
| `ADMIN_ORIGIN` | Web | Optional; CSP framing for admin→web previews, e.g. `https://admin.getpropertypro.com` |
| `SUPPORT_SESSION_JWT_SECRET` | **Both apps, server only** | **Required** — HMAC key for support-impersonation JWTs (min 32 chars). Admin signs, web verifies, so the **same value** must be set on `property-pro-admin` **and** `property-pro-web`. Generate with `openssl rand -hex 32`. See the note below. |
| `NODE_ENV` | All | `production` |
| `NOTIFICATION_DIGEST_CRON_SECRET` | Server only | Shared bearer secret |
| `READINESS_CHECK_SECRET` | Server only | Shared bearer secret for deployment readiness checks |
| `PAYMENT_REMINDERS_CRON_SECRET` | Server only | Shared bearer secret |
| `COUPON_SYNC_RETRY_CRON_SECRET` | Server only | Shared bearer secret |
| `PROVISIONING_RETRY_SECRET` | Server only | Shared bearer secret |

### 4.1 `SUPPORT_SESSION_JWT_SECRET` — required, no fallback

Support access (admin impersonation of a tenant user) works by having
`apps/admin` **sign** a short-lived HS256 JWT that `apps/web` **verifies**.
Both sides read `SUPPORT_SESSION_JWT_SECRET`, so the two projects must carry
the identical value.

Until 2026-08-05 both sides fell back to a constant checked into the repo
whenever `NODE_ENV !== 'production'`. Any deployment not explicitly running
with `NODE_ENV=production` would therefore accept a `pp-support-session` cookie
that anyone with a checkout could forge — impersonation of any user in any
community, with no admin session. That fallback has been removed.

The feature now **fails closed** when the secret is absent: the admin app
returns `500 SERVER_MISCONFIGURED` when creating a session, and the web app
rejects every support cookie. To configure it:

```bash
openssl rand -hex 32
```

Set that one value on both projects, for `production`, `preview` and
`development`:

```bash
vercel env add SUPPORT_SESSION_JWT_SECRET production --no-sensitive \
  --scope <team-id> --project property-pro-admin
```

Repeat for `property-pro-web` and for the `preview` / `development`
environments. Use `--no-sensitive`: a Sensitive variable is written back by
`vercel pull` as the literal string `[SENSITIVE]`, which the build then inlines.

Also add it to the root `.env.local` — `apps/web/e2e/support-access.spec.ts`
drives the real signer and verifier and cannot pass without it.

## 5. Domain & DNS Configuration

### 5.1 Vercel Domain Setup

**Web app (`apps/web`):**

1. In Vercel Dashboard > Project > Settings > Domains, add:
   - `getpropertypro.com` (primary apex)
   - `www.getpropertypro.com` (optional; redirect to apex)
   - `*.getpropertypro.com` (wildcard for tenant subdomains)

**Admin app (`apps/admin`):**

- Add `admin.getpropertypro.com` to the admin Vercel project.

2. Vercel will provide DNS records to configure.

### 5.2 Supabase Auth (Redirect URLs)

In Supabase Dashboard > Authentication > URL configuration, add redirect patterns for:

- `https://getpropertypro.com/**`
- `https://*.getpropertypro.com/**` (or enumerate tenant hosts if wildcard is not available)
- `https://admin.getpropertypro.com/**`

Set **Site URL** to the canonical web apex (e.g. `https://getpropertypro.com`).

### 5.3 Cloudflare DNS Records

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| `A` | `@` | `76.76.21.21` (Vercel) | DNS only (grey cloud) |
| `CNAME` | `www` | `cname.vercel-dns.com` | DNS only |
| `CNAME` | `*` | `cname.vercel-dns.com` | DNS only |

**Important:** Set Cloudflare proxy to "DNS only" (grey cloud) for Vercel domains. Vercel manages SSL via Let's Encrypt; Cloudflare proxying can interfere with certificate provisioning.

> **Trade-off:** DNS-only mode bypasses Cloudflare's WAF and DDoS protection for these records. If you need those features, an alternative is to keep the proxy enabled (orange cloud) and set Cloudflare's SSL/TLS mode to **Full (Strict)**. Full (Strict) encrypts traffic end-to-end and avoids certificate conflicts, but requires additional configuration on the Cloudflare side (an Origin CA certificate or a valid cert on the origin). For a simpler setup, DNS-only is the recommended default.

### 5.4 Email DNS Records (Resend)

| Type | Name | Content |
|------|------|---------|
| `TXT` | `@` | `v=spf1 include:send.resend.com ~all` |
| `CNAME` | `resend._domainkey` | *(value from Resend dashboard)* |
| `TXT` | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@getpropertypro.com` |

## 6. CI/CD Pipeline

### 6.1 Workflow Overview

| Workflow | File | Trigger | Purpose |
|----------|------|---------|---------|
| **CI** | `ci.yml` | PR + push to main | lint → typecheck → test → build (fail-fast) |
| **Deploy** | `deploy.yml` | Push to main CI success | Production deploy only |
| **Integration Tests** | `integration-tests.yml` | PR + push to main | Database integration tests (requires Postgres service) |
| **Performance Budget** | `performance-budget-check.yml` | PR (src changes) | Bundle size budget enforcement |
| **DB Access Guard** | `scoped-db-access-guard.yml` | PR + push (src changes) | Scoped DB access pattern verification |
| **Branch Freshness** | `branch-freshness-guard.yml` | PR | Rebase enforcement (max 20 commits behind) |
| **Demo Reset** | `reset-demo.yml` | Daily 3:00 AM ET | Nightly demo data reset |
| **Notification Digest** | `notification-digest-cron.yml` | Every 15 minutes | Process notification digest queue |

### 6.2 CI Pipeline Stages

```
lint ──────────────┐
typecheck ─────────┤
Unit Tests ────────┤── all six run in PARALLEL from t=0
no-mock-guard ─────┤
migration-ordering ┤
perf-check ────────┴──► Build (assertion gate, ~4s)
```

- **lint**: `pnpm lint` (ESLint + Turbo + DB access guard) + CSS variable migration check
- **typecheck**: `pnpm typecheck` (TypeScript strict mode via Turbo)
- **Unit Tests**: `vitest run --coverage` in `apps/web`, plus the package and admin
  suites. Split into `node` and `jsdom` vitest projects — see
  `apps/web/vitest.shared.ts` before adding test files.
- **no-mock-guard** / **migration-ordering**: repo guards.
- **perf-check**: **owns the only production build.** Runs `pnpm build`, the
  PDF.js production smoke test, and `pnpm perf:check`. The bundle-size budget
  reads the emitted build output from disk, which is why the build lives here.
- **Build**: does **not** build. It is a required status check that asserts
  `needs['perf-check'].result == 'success'` under `if: always()`. The assertion
  is deliberate: GitHub treats a required check as satisfied when it is
  "successful, **skipped**, or neutral", so a bare `needs:` would let a *skipped*
  perf-check skip this job too and satisfy both contexts with no build having
  run. Verified by fault injection: skipping perf-check makes this job **fail**
  rather than skip.

Whole-run wall clock is roughly 8 minutes, bounded by Unit Tests.

### 6.3 Branch Protection Rules

Configure in GitHub > Settings > Branches > Branch protection rules for `main`:

- [x] Require a pull request before merging
- [x] Require status checks to pass before merging
  - Required checks (all eight): `Lint`, `Typecheck`, `Unit Tests`,
    `no-mock-guard`, `migration-ordering`, `perf-check`, `Build`,
    `integration-tests`
- [x] Require branches to be up to date before merging (`strict`) — every PR must
      be rebased onto current `main`, so expect at least one rebase cycle on a
      busy day
- [x] Do not allow bypassing the above settings

> `integration-tests` is a required check for **merging**, but it is a separate
> workflow and `deploy.yml` triggers on `CI` alone — so it does not currently
> gate the production **deploy**. Tracked separately.

## 7. Deployment Procedures

### 7.1 Standard Production Deploy

Production deploys happen automatically when a PR is merged to `main`:

1. PR passes CI checks (lint, typecheck, unit tests, no-mock-guard, migration-ordering, perf-check, Build)
2. PR is reviewed and approved (PR previews are created by the native Vercel GitHub integration during the PR lifecycle)
3. PR is merged to `main`
4. `deploy.yml` triggers after CI succeeds on `main`: installs deps, then builds via Vercel CLI and deploys to production. **It deploys CODE ONLY — it does not run migrations.**
5. Smoke test verifies HTTP 200 at the deployment URL
6. (Optional) Verify `/api/v1/internal/readiness` reports `schema_compatibility.status = "pass"`

> ### ⚠️ Migrations are NOT applied by the deploy pipeline
>
> **`deploy.yml` deploys code only.** There is no `db:migrate` step, and nothing
> in CI or the deploy path will apply a pending migration for you. **Merging a PR
> does not migrate production.**
>
> An earlier version of this document described migrations as "a gated step in
> `deploy.yml` … a failed migration aborts the deploy, so app code never ships
> ahead of its schema". **That has not been true since #743.** The gate was
> removed because it conflicted with the manual-apply model — it drifted the
> `__drizzle_migrations` ledger, failed on every run, and silently blocked all
> production deploys for roughly two weeks. It was also unsafe by design for
> contract migrations, since it ran migrate-first and would have dropped columns
> the still-live old code was reading.
>
> **You are responsible for ordering the schema change against the deploy:**
>
> - **Expand** (add a column/table): apply to production **BEFORE** merging the
>   code that reads or writes it.
> - **Contract** (drop a column/enum value): apply **AFTER** the new code that
>   stopped referencing it is live.
> - Pure policy/trigger **repair** migrations are order-independent.
>
> Apply them by hand via the Supabase MCP `apply_migration`, in statement order,
> then verify against `information_schema` / `pg_catalog` and record the ledger
> row. Full procedure and the current migration numbering live in
> [`.claude/rules/migration-safety.md`](../.claude/rules/migration-safety.md),
> which is the authoritative source — this section only summarises it.

### 7.2 Hotfix Deploy

For urgent production fixes:

1. Create a branch from `main`: `git checkout -b fix/description main`
2. Apply the fix, commit, push
3. Open a PR targeting `main`
4. CI runs automatically — ensure all checks pass
5. Merge the PR (follow standard flow, skip only non-essential reviews if time-critical)

### 7.3 Database Migration Deploy

Production migrations run **automatically** as a gated step in `deploy.yml`
(see §7.1) — a failed migration aborts the deploy before the new code ships.
The commands below are for local verification, staging, or one-off recovery
paths:

```bash
# Via scripts/with-env-local.sh (local verification)
scripts/with-env-local.sh pnpm --filter @propertypro/db db:migrate

# Or set DATABASE_URL/DIRECT_URL directly
DATABASE_URL=<pooled_url> DIRECT_URL=<direct_url> pnpm --filter @propertypro/db db:migrate
```

**Important:** Always run migrations against the direct connection (port 5432), not the pooled connection (port 6543). The `DIRECT_URL` env var is used by Drizzle for migrations automatically.

After any migration-backed release, verify runtime schema compatibility before
declaring the deploy healthy:

```bash
curl -fsS \
  -H "Authorization: Bearer $READINESS_CHECK_SECRET" \
  "$NEXT_PUBLIC_APP_URL/api/v1/internal/readiness"
```

The readiness payload must report `schema_compatibility.status = "pass"`.

### 7.4 Rollback

Vercel supports instant rollback to any previous deployment:

1. Go to Vercel Dashboard > Project > Deployments
2. Find the last known-good deployment
3. Click the three-dot menu > "Promote to Production"

For database rollbacks, Supabase provides point-in-time recovery (PITR) on Pro plans.

## 8. Monitoring & Alerting

| Service | Purpose | Dashboard |
|---------|---------|-----------|
| Vercel | Deployment status, function logs, analytics | `vercel.com/dashboard` |
| Sentry | Error tracking, performance monitoring | `sentry.io` |
| Supabase | Database health, connection pool, storage | `supabase.com/dashboard` |
| Stripe | Payment events, webhook delivery | `dashboard.stripe.com` |
| Upstash | Redis metrics, rate limit monitoring | `console.upstash.com` |

### Health Check Endpoints

| Endpoint | Method | Expected |
|----------|--------|----------|
| `/` | GET | 200 (marketing page) |
| `/api/v1/compliance` | GET (authed) | 200/401 |
| `/api/v1/internal/readiness` | GET + Bearer `READINESS_CHECK_SECRET` | `healthy`/`degraded`; `schema_compatibility` must pass |

## 9. Troubleshooting

### Build Failures

```bash
# Reproduce locally
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
DATABASE_URL=... NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... pnpm build
```

### Missing Environment Variables

Check Vercel Dashboard > Project > Settings > Environment Variables. Ensure all variables from Section 4 are set for the correct environment scope (Production/Preview/Development).

### Subdomain Not Resolving

1. Verify wildcard DNS record exists in Cloudflare
2. Verify wildcard domain is added in Vercel project settings
3. Check that Cloudflare proxy is set to "DNS only" (grey cloud)
4. Wait up to 5 minutes for DNS propagation

### Webhook Failures

1. Check Stripe Dashboard > Developers > Webhooks > Recent events
2. Verify `STRIPE_WEBHOOK_SECRET` matches the endpoint's signing secret
3. Check Vercel function logs for the webhook route
