# Deployment Runbook — PropertyPro Florida

**Last Updated:** 2026-02-24
**Phase:** P4-60

---

## 1. Architecture Overview

```
GitHub (main) ──push──► GitHub Actions CI ──pass──► Vercel Deploy (Production)
                            │                              │
                            ├─ lint                        ├─ propertyprofl.com
                            ├─ typecheck                   ├─ *.propertyprofl.com (wildcard)
                            ├─ test                        └─ SSL via Let's Encrypt
                            └─ build
                                                     Supabase (Managed Postgres)
PR branch ──push──► GitHub Actions CI ──pass──► Vercel Preview Deploy
                                                     └─ unique preview URL
```

## 2. Environments

| Environment | URL | Branch | Auto-deploy |
|-------------|-----|--------|-------------|
| Production | `propertyprofl.com` | `main` | Yes (via `deploy.yml` after CI passes) |
| Preview | `*.vercel.app` (unique per PR) | PR branches | Yes (via `deploy.yml` on PR events) |
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
| `DIGEST_CRON_BASE_URL` | Production URL for cron invocations | `https://propertyprofl.com` |
| `NOTIFICATION_DIGEST_CRON_SECRET` | Bearer token for digest cron endpoint | Generated shared secret |

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
| `UPSTASH_REDIS_REST_URL` | Server only | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Server only | Upstash Redis REST token |
| `NEXT_PUBLIC_APP_URL` | All | `https://propertyprofl.com` (prod) |
| `NODE_ENV` | All | `production` |
| `NOTIFICATION_DIGEST_CRON_SECRET` | Server only | Shared bearer secret |
| `PAYMENT_REMINDERS_CRON_SECRET` | Server only | Shared bearer secret |
| `PROVISIONING_RETRY_SECRET` | Server only | Shared bearer secret |

## 5. Domain & DNS Configuration

### 5.1 Vercel Domain Setup

1. In Vercel Dashboard > Project > Settings > Domains, add:
   - `propertyprofl.com` (primary)
   - `www.propertyprofl.com` (redirect to apex)
   - `*.propertyprofl.com` (wildcard for tenant subdomains)

2. Vercel will provide DNS records to configure.

### 5.2 Cloudflare DNS Records

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| `A` | `@` | `76.76.21.21` (Vercel) | DNS only (grey cloud) |
| `CNAME` | `www` | `cname.vercel-dns.com` | DNS only |
| `CNAME` | `*` | `cname.vercel-dns.com` | DNS only |

**Important:** Set Cloudflare proxy to "DNS only" (grey cloud) for Vercel domains. Vercel manages SSL via Let's Encrypt; Cloudflare proxying can interfere with certificate provisioning.

> **Trade-off:** DNS-only mode bypasses Cloudflare's WAF and DDoS protection for these records. If you need those features, an alternative is to keep the proxy enabled (orange cloud) and set Cloudflare's SSL/TLS mode to **Full (Strict)**. Full (Strict) encrypts traffic end-to-end and avoids certificate conflicts, but requires additional configuration on the Cloudflare side (an Origin CA certificate or a valid cert on the origin). For a simpler setup, DNS-only is the recommended default.

### 5.3 Email DNS Records (Resend)

| Type | Name | Content |
|------|------|---------|
| `TXT` | `@` | `v=spf1 include:send.resend.com ~all` |
| `CNAME` | `resend._domainkey` | *(value from Resend dashboard)* |
| `TXT` | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@propertyprofl.com` |

## 6. CI/CD Pipeline

### 6.1 Workflow Overview

| Workflow | File | Trigger | Purpose |
|----------|------|---------|---------|
| **CI** | `ci.yml` | PR + push to main | lint → typecheck → test → build (fail-fast) |
| **Deploy** | `deploy.yml` | PR + push to main | Production deploy (main) / Preview deploy (PR) |
| **Integration Tests** | `integration-tests.yml` | PR + push to main | Database integration tests (requires Postgres service) |
| **Performance Budget** | `performance-budget-check.yml` | PR (src changes) | Bundle size budget enforcement |
| **DB Access Guard** | `scoped-db-access-guard.yml` | PR + push (src changes) | Scoped DB access pattern verification |
| **Branch Freshness** | `branch-freshness-guard.yml` | PR | Rebase enforcement (max 20 commits behind) |
| **Demo Reset** | `reset-demo.yml` | Daily 3:00 AM ET | Nightly demo data reset |
| **Notification Digest** | `notification-digest-cron.yml` | Every 15 minutes | Process notification digest queue |

### 6.2 CI Pipeline Stages

```
lint ─────────┐
typecheck ────┤── (parallel) ──► build (sequential, after all pass)
test ─────────┘
```

- **lint**: `pnpm lint` (ESLint + Turbo + DB access guard)
- **typecheck**: `pnpm typecheck` (TypeScript strict mode via Turbo)
- **test**: `pnpm test` (Vitest unit tests)
- **build**: `pnpm build` (Next.js production build via Turbo, runs only after lint+typecheck+test pass)

### 6.3 Branch Protection Rules

Configure in GitHub > Settings > Branches > Branch protection rules for `main`:

- [x] Require a pull request before merging
- [x] Require status checks to pass before merging
  - Required checks: `Lint`, `Typecheck`, `Unit Tests`, `Build`
- [x] Require branches to be up to date before merging
- [x] Do not allow bypassing the above settings

## 7. Deployment Procedures

### 7.1 Standard Production Deploy

Production deploys happen automatically when a PR is merged to `main`:

1. PR passes CI checks (lint, typecheck, test, build)
2. PR is reviewed and approved
3. PR is merged to `main`
4. `deploy.yml` triggers: builds via Vercel CLI and deploys to production
5. Smoke test verifies HTTP 200 at the deployment URL

No manual steps required.

### 7.2 Hotfix Deploy

For urgent production fixes:

1. Create a branch from `main`: `git checkout -b fix/description main`
2. Apply the fix, commit, push
3. Open a PR targeting `main`
4. CI runs automatically — ensure all checks pass
5. Merge the PR (follow standard flow, skip only non-essential reviews if time-critical)

### 7.3 Database Migration Deploy

Migrations are NOT run automatically in CI/CD. Run them manually before or after deployment:

```bash
# Via scripts/with-env-local.sh (local verification)
scripts/with-env-local.sh pnpm --filter @propertypro/db db:migrate

# Or set DATABASE_URL/DIRECT_URL directly
DATABASE_URL=<pooled_url> DIRECT_URL=<direct_url> pnpm --filter @propertypro/db db:migrate
```

**Important:** Always run migrations against the direct connection (port 5432), not the pooled connection (port 6543). The `DIRECT_URL` env var is used by Drizzle for migrations automatically.

> **Note — manual migration risk:** Running migrations as a manual step is intentional (avoids surprise schema changes during automated deploys) but requires discipline. If you miss running a migration after deploying, the app may crash or behave incorrectly due to schema/code mismatch. To automate, you can add a migration step to `deploy.yml` that runs `pnpm --filter @propertypro/db db:migrate` with `DATABASE_URL` and `DIRECT_URL` injected from GitHub Secrets immediately before the Vercel deployment step.

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
