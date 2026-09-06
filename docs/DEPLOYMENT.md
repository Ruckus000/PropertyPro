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
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | All | Stripe publishable key. **Inlined into the client bundle at build time** — changing it requires a redeploy, not just an env update. Must be the same account+mode as `STRIPE_SECRET_KEY`. |
| `STRIPE_SECRET_KEY` | Server only | Stripe secret key. Its `sk_live_`/`sk_test_` prefix is what the app treats as this deployment's Stripe mode. |
| `STRIPE_WEBHOOK_SECRET` | Server only | Stripe webhook signing secret. Endpoint-specific: a mode change means a *different* endpoint and therefore a different secret. |
| `RESEND_API_KEY` | **Both apps, server only** | Resend email API key. The admin console needs it too, since the support-inbox reply route sends from there. **Without it on `property-pro-admin`, every reply reports "Sent" and goes nowhere** — `sendEmail` resolves with a `test_N` id in that mode. The reply route surfaces this as `delivered: false`, which is the only signal, because the readiness probe lives on the web app.
| `INBOUND_EMAIL_WEBHOOK_SECRET` | Server only, web | **Required** (min 32). HMAC for the inbound support-mail webhook. Fails **closed** — see §4.2 and `.env.example` section 14. Must match Forward Email's "Webhook Signature Payload Verification Key". |
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
| `CRON_SECRET` | **Production, server only** | **Required — every scheduled job depends on it.** Vercel Cron authenticates all 17 jobs with this one platform-wide value. See §4.2. |
| `OTP_HMAC_SECRET` | Server only | **Required** (min 16 chars). Access-request OTPs are 6 digits, so this HMAC key is the only thing preventing an attacker precomputing the entire code space. See §4.2. |
| `TOKEN_ENCRYPTION_KEY` | Server only | **Required** — **exactly 64 hex characters** (32 bytes for AES-256-GCM); not a minimum, and not any 64 characters. Calendar sync and accounting connectors throw without it — those features 500 rather than degrade. See §4.2. |
| `NOTIFICATION_DIGEST_CRON_SECRET` | Server only | Shared bearer secret |
| `READINESS_CHECK_SECRET` | Server only | Shared bearer secret for deployment readiness checks |
| `PAYMENT_REMINDERS_CRON_SECRET` | Server only | Shared bearer secret |
| `COUPON_SYNC_RETRY_CRON_SECRET` | Server only | Shared bearer secret |
| `PROVISIONING_RETRY_SECRET` | Server only | Shared bearer secret |
| `REAUTH_JWT_SECRET` | Server only | **Required** (min 32). Signs short-lived re-auth tokens. Without it the billing portal and account deletion 500 from the user's point of view, with nothing in the UI explaining why. See §4.2. |
| `OAUTH_STATE_SECRET` | Server only | **Required** (min 16). HMAC for the OAuth `state` parameter. `signOAuthState` throws without it, so "Connect Google Calendar" 500s rather than degrading. See §4.2. |
| `COMMUNITY_EMAIL_UNSUBSCRIBE_SECRET` | Server only | **Required** (min 16). Signs the no-login unsubscribe link on announcements, notifications, digests and calendar reminders. Fails **silently** — see §4.2. |
| `SNOWBIRD_UNSUBSCRIBE_SECRET` | Server only | **Required** (min 16). Same, for the snowbird digest. Fails silently. |
| `INSURANCE_ALERTS_UNSUBSCRIBE_SECRET` | Server only | **Required** (min 16). Same, for insurance alerts. Fails silently. |

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

### 4.2 The secrets that fail *silently*

These three are grouped because they share a property nothing else in §4 has:
**when they are missing, production keeps serving traffic and nothing reports a
problem.** A missing `DATABASE_URL` announces itself immediately. These do not.

Each was, at some point, actually unset in production, and none of them
surfaced:

- **`CRON_SECRET`** — Vercel Cron only sends `Authorization: Bearer
  $CRON_SECRET` **when the variable exists**. Unset, it sends no header at all,
  every scheduled job answers 401, and the Vercel dashboard still shows each
  cron as registered and firing on schedule. All 17 jobs — payment reminders,
  late fees, assessment generation, compliance alerts, demo expiry, account
  lifecycle — can be dead for months behind a green dashboard.

  It is one platform-wide value, **not** per route. A `PER_ROUTE ?? CRON_SECRET`
  fallback does **not** fix this: `??` only reaches the fallback when the
  per-route secret is *unset*, and the routes that were configured all had
  theirs set — so they would go on rejecting the platform's token, and the
  fallback would quietly repair only the routes nobody had configured. The
  actual fix is that `requireCronSecret`
  (`apps/web/src/lib/api/cron-auth.ts`) accepts *any* of the candidates it is
  handed, so a route stays reachable by both its dedicated secret and by
  `CRON_SECRET`.

- **`OTP_HMAC_SECRET`** (min 16) — access-request OTPs are 6 digits. This key is
  the only barrier to precomputing the whole space.

- **`TOKEN_ENCRYPTION_KEY`** (**exactly 64 hex chars**) — calendar sync and
  accounting connectors throw without it, so those features return 500 instead
  of degrading.

- **`REAUTH_JWT_SECRET`** (min 32) — signs short-lived re-authentication
  tokens. The billing portal and account deletion 500 without it.

- **`OAUTH_STATE_SECRET`** (min 16) — HMAC for the OAuth `state` parameter.
  `signOAuthState` throws without it, so connecting a Google Calendar or an
  accounting platform returns 500 rather than degrading.

- **`COMMUNITY_EMAIL_UNSUBSCRIBE_SECRET`**, **`SNOWBIRD_UNSUBSCRIBE_SECRET`**,
  **`INSURANCE_ALERTS_UNSUBSCRIBE_SECRET`** (min 16) — sign the no-login
  unsubscribe links. **These are the quietest failure in this section.** The
  signers return `null` instead of throwing (deliberately: an unset variable
  must not take down every association's mail), so the send still succeeds and
  the email still carries a `List-Unsubscribe-Post: One-Click` header — while
  the URL it points at falls back to `/settings?communityId=…`, which is
  login-walled. The mail therefore *advertises* RFC 8058 one-click unsubscribe
  and cannot honour it. Gmail and Yahoo's bulk-sender rules treat that as a
  failed unsubscribe, so it is a deliverability problem and not only a
  compliance one.

`SUPPORT_SESSION_JWT_SECRET` belongs to this set too; it has its own section
above (§4.1) because it must carry the identical value on **both** Vercel
projects.

Generate **each** with the same command (`TOKEN_ENCRYPTION_KEY` excepted — read the warning below before you run it):

```bash
openssl rand -hex 32     # 32 bytes → 64 hex characters
```

Add them with `--no-sensitive`, for the same reason as §4.1.

> **`openssl rand -hex 64` is wrong for `TOKEN_ENCRYPTION_KEY`.** The argument
> is a byte count, not a character count, so `-hex 64` emits **128**
> characters. `parseTokenEncryptionKeyHex`
> (`packages/db/src/crypto/token-encryption.ts`) requires
> `/^[0-9a-fA-F]{64}$/` exactly, so a 128-character key throws on every
> encrypt and decrypt. The same applies to a 64-character *passphrase* that
> isn't hex.

#### Verifying them

`/api/v1/internal/readiness` exists to make this a monitorable signal rather
than silence. It checks **all nine** secrets named in this section — the eight above plus
`SUPPORT_SESSION_JWT_SECRET` from §4.1 — for presence and minimum length
(`TOKEN_ENCRYPTION_KEY` by hex format instead: a length floor cannot express
its requirement), and reports `degraded` — not `healthy` — when any is
missing:

```bash
curl -H "Authorization: Bearer $READINESS_CHECK_SECRET" \
  https://www.getpropertypro.com/api/v1/internal/readiness
```

Each check is keyed by the lowercased variable name — `checks.cron_secret`,
`checks.otp_hmac_secret`, `checks.token_encryption_key`,
`checks.reauth_jwt_secret`, `checks.oauth_state_secret`,
`checks.support_session_jwt_secret`,
`checks.community_email_unsubscribe_secret`,
`checks.snowbird_unsubscribe_secret`,
`checks.insurance_alerts_unsubscribe_secret`.

**`checks.email_delivery` is also there, and it is the one to read first.**
`sendEmail` does not throw when `RESEND_API_KEY` is unset — it collects the
message in an in-memory inbox and returns successfully, so every verification
email, invitation and statutory notice is discarded while each call site
reports success. `EMAIL_DRY_RUN` does the same deliberately, and is correct for
an ops script but never for a deployed app. The check reports the resolved
delivery mode, so either state fails rather than passing unnoticed.

> **A failing check names the variable but never prints its value** — only a
> length. A readiness body is safe to paste into a ticket or a monitor alert.

This also catches the `[SENSITIVE]` mistake described above, though it was not
designed to: a variable pulled back as the literal string `[SENSITIVE]` is 11
characters, under every floor here, so the check fails rather than reporting
green over a publicly-known key.

A green readiness check proves the variables are *set*. To prove the cron path
actually **works end to end**, read the freshness of a job's output — this
endpoint needs no auth, and a recent timestamp means a scheduled job ran *and*
authenticated:

```bash
curl https://www.getpropertypro.com/api/v1/internal/revenue-snapshot/health
# {"status":"healthy","last_snapshot_at":"…","hours_since":21.4}
```

On a freshly provisioned environment — the most likely moment to run this —
there is a third shape, with neither timestamp nor age:

```json
{"status":"unhealthy","reason":"no_snapshots_ever"}
```

`revenue-snapshot` runs at `0 2 * * *`, and the endpoint returns **503** once
`hours_since` passes 26 (one daily run plus a two-hour grace). A 503 here means
the job stopped running — most likely a 401, most likely this secret. It is
already suitable for an external uptime monitor.

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

### 5.3 DNS Records

> **Corrected 2026-09-05.** This section previously described a Cloudflare
> setup with proxy/grey-cloud guidance. **DNS is on Vercel**, not Cloudflare —
> `dig NS getpropertypro.com` returns `ns1.vercel-dns.com` / `ns2.vercel-dns.com`
> — so none of that applied. Records are managed in the Vercel dashboard under
> the domain, and there is no proxy setting to get wrong.

| Type | Name | Content |
|------|------|---------|
| `A` | `@` | Vercel apex address (assigned in the Vercel domain UI) |
| `CNAME` | `www` | `cname.vercel-dns.com` |
| `CNAME` | `*` | `cname.vercel-dns.com` — the per-community subdomains depend on this |

### 5.4 Email DNS Records

> **Corrected 2026-09-05.** The table here previously listed an apex SPF
> (`include:send.resend.com`) and a `p=quarantine` DMARC record. **Neither
> exists** — verified against the authoritative nameserver. What is actually
> live is DKIM on the apex plus SPF on the `send.` subdomain, which is what
> Resend provisions. Do not "restore" the old rows; they describe a
> configuration this domain never had.

**Live today (verified `dig`, 2026-09-05):**

| Type | Name | Content | Purpose |
|------|------|---------|---------|
| `TXT` | `resend._domainkey` | *(value from the Resend dashboard)* | DKIM for outbound |
| `TXT` | `send` | `v=spf1 include:amazonses.com ~all` | SPF for Resend's sending subdomain |
| `MX` | `send` | `10 feedback-smtp.us-east-1.amazonses.com` | Bounce feedback |

**Apex SPF is deliberately absent.** Resend's envelope MAIL FROM is on
`send.getpropertypro.com`, which already carries SPF, and DMARC's default
relaxed alignment accepts the organizational-domain match. Adding an apex SPF
is optional hygiene, and getting it wrong (`-all` plus a forgotten sender)
breaks outbound mail.

### 5.5 Inbound Mail (Forward Email)

Receiving `support@` / `privacy@` / `contact@` is what feeds the admin console's
Inbox. Nothing here is live until these records are added, and **order matters**.

**Add the endpoint first.** With no MX record the webhook can be deployed and
serving 401s to the world with zero blast radius. If MX lands before the alias
TXT exists, Forward Email rejects at SMTP time and the address still bounces —
but now it *looks* configured, which is worse than the honest bounce.

1. **Verification TXT** on `@`, value from the Forward Email dashboard.
2. **Alias routing TXT** on `@`, routing each local part to the webhook:

   ```
   forward-email=support:https://www.getpropertypro.com/api/v1/webhooks/inbound-email?raw=false&attachments=false,privacy:…,contact:…,hello:…,postmaster:…,abuse:…
   ```

   `?raw=false&attachments=false` is **not optional**. Forward Email POSTs the
   whole message, including a full raw copy, and attachment bodies JSON-encode
   as integer arrays roughly 4-6x their real size. Vercel rejects request
   bodies over 4.5 MB **before the handler runs**, so without these flags a
   single ~900 KB PDF silently fails to arrive with no log line and no row.

3. **MX last**, priority 10: `mx1.forwardemail.net`, `mx2.forwardemail.net`.
4. **DMARC**, which closes launch blocker #4:

   ```
   _dmarc  TXT  v=DMARC1; p=none; rua=mailto:<id>@dmarc.postmarkapp.com; fo=1
   ```

   `rua=` points at Postmark's free DMARC Digests (no account, no mailbox,
   weekly summaries by email) because aggregate reports arrive as gzipped XML
   attachments — exactly the payload class the webhook deliberately does not
   store. Pointing `rua=` at our own domain would deliver them somewhere that
   drops them. Start at `p=none`, read a week of reports, then ratchet.

**Verify:**

```bash
dig getpropertypro.com MX +short
dig _dmarc.getpropertypro.com TXT +short
```

then send a real message to `support@getpropertypro.com` and confirm the thread
appears at `/inbox` in the admin console.

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

Production migrations are applied **manually**, one at a time, by a human. They
are **not** run by `deploy.yml`, by CI, or by merging a PR — see the warning in
§7.1 for why the old gated step was removed. `.claude/rules/migration-safety.md`
is the authoritative procedure; this section is the short form.

**Order the apply against the deploy before you touch anything** — this is what
replaced the CI gate as drift protection, and getting it backwards is how you
take production down:

| Migration kind | Example | When to apply |
| --- | --- | --- |
| **Expand** | add a column, add a table, widen a `CHECK` | **BEFORE** merging the code that uses it |
| **Contract** | drop a column, drop an enum value | **AFTER** the code that stopped reading it is live |
| **Repair** | RLS policy / trigger / grant fix | Order-independent |

To apply:

1. Apply the migration's statements **in order** via the Supabase MCP
   `apply_migration` tool.
2. Verify the result against `information_schema` / `pg_catalog` — do not trust
   the tool's return value alone.
3. Record the `drizzle.__drizzle_migrations` ledger row (`hash` = sha256 of the
   migration file bytes, `created_at` = the journal `when`) so any later
   `drizzle-kit` run stays consistent.

> **Do not run `pnpm --filter @propertypro/db db:migrate` to reach production.**
> Root `.env.local`'s `DATABASE_URL` points at **production**, so
> `scripts/with-env-local.sh` targets prod, not a local database. Beyond that,
> `drizzle-kit migrate` collides with the manually-maintained ledger and applies
> contract migrations migrate-first, which drops columns the live old code is
> still reading.
>
> `db:migrate` is for **disposable local databases only** — use
> `pnpm db:test-local:setup` / `pnpm db:test-local:reset`, which create and
> migrate a throwaway localhost Postgres mirroring CI.

### ON HOLD — do not apply: `0062_secret_ballot`

`0062_secret_ballot` is merged to `main` and present in the Drizzle journal, but
is **deliberately unapplied in production** and must stay that way until
e-voting clears attorney review.

It is a **contract** migration and it is **irreversible**: it drops
`submission_id`, `unit_id`, `voter_hash`, `is_proxy_vote` and `proxy_id` from
`election_ballots`. Re-adding the columns does not undo it — the linkage data is
gone. That destruction is the point (§718.128 secret ballot), but applied early
it destroys audit linkage for any election already recorded in exchange for a
secrecy property nothing is relying on yet.

Two consequences worth stating plainly:

- **`main`'s highest migration number is not the next free one.** Production has
  applied through `0061`; `0062` sits merged-but-unapplied. Re-derive the next
  number from the production ledger and open branches, never from `main` alone.
- **A single `db:migrate` against a production `DATABASE_URL` applies it.** There
  is no tooling interlock — `scripts/local-test-db.sh` runs that same command
  legitimately, so it cannot be blocked outright. The protection is this
  document and the warning above.

**Important:** when you do migrate a local database, use the direct connection
(port 5432), not the pooled connection (port 6543). Drizzle reads `DIRECT_URL`
for migrations automatically.

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
| `/api/v1/internal/revenue-snapshot/health` | GET, **no auth** | 200 while `hours_since` < 26, else 503. The only check that proves the cron path *works* rather than that its config exists — see §4.2. |
| `/api/v1/internal/cron-health` | GET, **no auth** | 200 while EVERY scheduled job has succeeded inside its own window, else 503 naming the stale ones. Generalises the row above from one job to all seventeen. Returns slugs and timestamps only — never `last_error`, which can carry query text. |

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

To list what is actually set without revealing any value:

```bash
vercel env ls production --project property-pro-web
```

### Scheduled Jobs Silently Not Running

The symptom is that there is no symptom: the Vercel Cron tab shows every job
registered and firing, while nothing they were supposed to do has happened —
no reminder emails, no late fees, no generated assessments.

1. Open the Vercel Cron tab. **A wall of 401s is the direct signal**; the cron
   still reports as having fired.
2. Confirm `CRON_SECRET` exists for **Production** (`vercel env ls production`).
   Unset, Vercel sends no `Authorization` header at all, so every job 401s.
3. Confirm a job actually completed, not merely that config is present:
   `curl https://www.getpropertypro.com/api/v1/internal/cron-health`

   Prefer this over `revenue-snapshot/health`, which proves ONE job of seventeen
   ran. A 503 here names the stale jobs directly. (The older probe still works and
   is kept: `curl https://www.getpropertypro.com/api/v1/internal/revenue-snapshot/health`)

See §4.2 — and note that adding a per-route secret does **not** fix this.

### Subdomain Not Resolving

1. Verify wildcard DNS record exists in Cloudflare
2. Verify wildcard domain is added in Vercel project settings
3. Check that Cloudflare proxy is set to "DNS only" (grey cloud)
4. Wait up to 5 minutes for DNS propagation

### Webhook Failures

1. Check Stripe Dashboard > Developers > Webhooks > Recent events
2. Verify `STRIPE_WEBHOOK_SECRET` matches the endpoint's signing secret
3. Check Vercel function logs for the webhook route

#### Local development must not share production's webhook endpoint

**A Stripe webhook endpoint is registered per Stripe account + mode, not per
deployment.** It holds one destination URL. So if local development uses the same
`STRIPE_SECRET_KEY` as production, a checkout completed on `localhost` is delivered
to whatever URL that endpoint points at — production — while the matching
`pending_signups` row exists only in the local database.

Symptom, and it is easy to misread as a production bug: FK violations on
`provisioning_jobs` for signups that exist in no database you can inspect.

```
insert or update on table "provisioning_jobs" violates foreign key constraint
"provisioning_jobs_signup_request_id_pending_signups_signup_requ"
```

This happened on 2026-08-10 — six local checkouts produced twelve production error
events (Sentry `PROPERTY-PRO-1G`). Nothing was wrong with the production code path.

For local work, forward events to your own machine instead:

```bash
stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe
```

Use the signing secret the CLI prints as your local `STRIPE_WEBHOOK_SECRET` — it is
specific to that listener. A separate Stripe account for development works too.

Note that the mode guard in the webhook route does **not** protect against this: the
guard compares `event.livemode` against the mode of `STRIPE_SECRET_KEY`, and local
dev sharing production's key is by definition in the *same* mode. The guard catches a
different fault — an endpoint wired to a deployment whose keys are in the other mode.
