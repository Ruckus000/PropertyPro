# Launch blockers — open ops items

**Opened:** 2026-09-01, from the pre-launch audit.
**Scope:** things that must be true before real Florida associations are onboarded.

Items **1–5 are environment, DNS, or a dashboard action** — none is a code change.
The code is in good shape: 25/25 guards, ~12,155 unit tests green, clean production build
of both apps as of `aabf9727`.

Items **6–7 are the exception**: two Website Editor feature gaps promoted to blockers on
2026-09-02. They are code, not config, and they are sequenced last for that reason.

> **6 and 7 merged 2026-09-04 — but 7 did not WORK in production until 2026-09-05.**
> #1031 (notify on publish), #1032 (announcement expiry, migration `0064`) and #1037
> (scheduled publishing, migration `0065`) are all merged, and **both migrations are
> applied to production** with drizzle ledger rows recorded by hand.
>
> **A grep proving code exists is not evidence it runs**, and this entry previously said
> "DONE" on that basis. Item 7 shipped **non-functional**: every raw statement in
> `site-publish-schedule-service` bound a JS `Date` into a `sql` template, which
> postgres-js cannot serialise, so `/api/v1/internal/scheduled-site-publish` returned
> **500 on all ~96 daily runs from the moment it shipped**, and no schedule could even be
> armed — `site_publish_schedules` held zero rows. Fixed in #1042 (2026-09-05). Item 6 was
> unaffected: the manual publish route calls `notifyResidentsOfSitePublish` directly and
> never touches the schedule service.
>
> **The ledger note below is a RED HERRING — do not start there.** The production ledger
> is out of numeric order — `0063 → 0066 → 0064 → 0065` — because another session applied
> `0066` in between. That is true and harmless, and it was the first hypothesis for the
> #1042 outage because it makes a missing column look plausible. It was wrong:
> `lease_expires_at` is present in production, verified against `information_schema`. The
> ordering does still mean the ledger's newest `created_at` belongs to `0066`, and
> `drizzle-kit migrate` only applies migrations stamped after the newest applied one.
>
> **#1033 became #1037**: merging #1031 with `--delete-branch` auto-closed the PR stacked
> on top of it, and a closed PR's base cannot be retargeted, so the commits were replayed
> onto `main` under a new number.

The through-line is that all of these fail **silently**. None crashes anything; each
degrades or no-ops while dashboards stay green. That is why they need a checklist rather
than a bug tracker.

> **Status discipline:** each item says what is *verified* and what is *assumed*. Do not
> promote an assumption to a fact without re-running the named command — several entries
> below exist because an earlier doc did exactly that.

---

## 1. Stripe is not cut over to live — checkout cannot take real money

**Status:** verified 2026-09-01 · **Owner:** you (key rotation + dashboard) · **Runbook:** [`docs/runbooks/stripe-live-cutover.md`](runbooks/stripe-live-cutover.md)

`scripts/with-env-local.sh pnpm tsx scripts/verify-stripe-mode.ts` exits **1 — not verified**:

| Check | Result |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…syAs` — **test mode** |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_…o6z6` — test, matches secret key |
| `stripe_prices` rows | all 10 resolve against the **test** key |
| Stored customer/subscription ids | no stale ids |
| `STRIPE_WEBHOOK_SECRET` | **unknown** — `whsec_` carries no mode marker |

The run used the **production** database (`aws-0-us-west-2.pooler.supabase.com`), so the
firm conclusion is: **production's `stripe_prices` table holds test-mode price IDs.**
Stripe objects do not cross the mode boundary — a live key cannot see a test `price_…`.

The keys it read came from local `.env.local`, **not** from Vercel Production, so this is
not proof that prod serves test keys. Either way it blocks:

- If Vercel Production holds **live** keys → checkout is **broken today**: the live key
  cannot resolve those test price IDs, and the customer sees "Unable to start checkout"
  with nothing useful in the server logs.
- If Vercel Production holds **test** keys → checkout works but **takes no real money**.

### 1a. First: resolve which case this is

Check whether Vercel Production's `STRIPE_SECRET_KEY` is `sk_live_` or `sk_test_`. If it
is live, the price-id re-seed below is **urgent**, not scheduled.

> **This cannot be answered from outside.** Checked 2026-09-04: the publishable key is not
> present in the served production bundle at all — Stripe.js only loads inside the checkout
> flow, so the public pages carry no key to read. It is a dashboard check, not something a
> script can settle.

### 1b. Then: the cutover is four surfaces, not one

| Surface | Where | Needs |
|---|---|---|
| Secret key | `STRIPE_SECRET_KEY` | env update |
| Publishable key | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | env update **+ redeploy** — it is inlined into the client bundle at build time |
| Price ids | `stripe_prices` (10 rows) | `scripts/seed-stripe-live-prices.ts` |
| Webhook secret | `STRIPE_WEBHOOK_SECRET` | a **new endpoint** in the Stripe dashboard — live and test are separate registrations with separate secrets |

Two traps the runbook calls out:

1. **The publishable key needs a redeploy.** Updating it in Vercel without rebuilding
   leaves the old value baked into the served bundle. Checkout then initialises a
   test-mode publishable key against a live session and fails *in the browser*, where
   server logs will not show you why.
2. **Do not "helpfully" update the CI repo secret.** `.github/workflows/stripe-e2e.yml`
   refuses a non-`sk_test_` key on purpose — the E2E suite must stay on test mode. After
   cutover the repo secret and the production env var are *supposed* to differ.

**Verify:** re-run `verify-stripe-mode.ts` (read-only, safe against prod). Every check must
read `pass`; `unknown` counts as unverified, never as green. Then a real card, per runbook §6.

---

## 2. `COMMUNITY_EMAIL_UNSUBSCRIBE_SECRET` is unset in production

**Status:** verified 2026-09-01 · **Owner:** you (secret creation)

Every announcement, notification, digest and calendar-reminder email currently ships a
**login-walled** unsubscribe URL while still sending `List-Unsubscribe-Post: One-Click`.
The mail advertises RFC 8058 one-click unsubscribe and cannot honour it. Gmail and Yahoo's
bulk-sender rules treat that as a failed unsubscribe, making it a **deliverability** problem
and not only a compliance one.

Why it is silent: the signer returns `null` rather than throwing (deliberate — an unset var
must not take down every association's mail), so
`buildCommunityEmailUnsubscribeUrl` falls back to `/settings?communityId=…`, which sits in
`PROTECTED_PATH_PREFIXES`. The send succeeds and nothing reports it.

Affects four senders: `announcement-delivery`, `notification-service`,
`notification-digest-processor`, `calendar-event-reminder-service`. Snowbird and
insurance-alert unsubscribes are unaffected — their secrets are set.

```bash
openssl rand -hex 32
vercel env add COMMUNITY_EMAIL_UNSUBSCRIBE_SECRET production --no-sensitive
```

> **`--no-sensitive` is not optional.** `vercel env add` marks a variable Sensitive by
> default, `vercel pull` writes it back as the literal string `[SENSITIVE]`, and
> `deploy.yml` runs pull-then-build. The deployed HMAC key would become a publicly-known
> constant and anyone could forge an unsubscribe token for any recipient — **worse than
> leaving it unset.** Match the Encrypted type `SNOWBIRD_UNSUBSCRIBE_SECRET` uses.
> See [`DEPLOYMENT.md`](DEPLOYMENT.md) §4.1.

Then **redeploy** — env changes do not reach the running deployment on their own.

**Verify, in this order:**

1. Readiness probe — cheap, needs no send. `checks.community_email_unsubscribe_secret`
   must read `pass`. This also catches the `[SENSITIVE]` mistake by accident: that string
   is 11 characters, under the 16 floor, so it fails rather than reporting green over a
   compromised key.
2. An actual outgoing email carrying `?token=…` rather than `/settings?communityId=…` —
   the end-to-end proof.

**Probing the unsubscribe endpoint proves nothing:** a bogus token returns 400 whether the
secret is set or not, because the verifier returns `null` in both cases.

---

## 3. No MX record — `support@getpropertypro.com` bounces

**Status:** code shipped, **DNS still to do** · **Owner:** you (DNS)

`dig @ns1.vercel-dns.com getpropertypro.com MX` still returns SOA only. That
address is published as the support off-ramp on `(marketing)/contact/page.tsx`
and in the global marketing footer, so **the only human support channel on the
site hard-bounces** until the records below exist.

**What is now built and waiting for them:** an ingress at
`POST /api/v1/webhooks/inbound-email` (HMAC-verified, fails closed) and an
**Inbox** section in the admin console at `/inbox` — threads, triage, internal
notes, and replies sent from the mailbox the thread arrived on. Transport is
[Forward Email](https://forwardemail.net)'s free tier (MIT-licensed, unlimited
inbound, no mailbox to pay for); replies go out through Resend, which is
already DKIM-verified.

**Do this, in this order** — the full record values are in
`docs/DEPLOYMENT.md` §5.5:

1. Set `INBOUND_EMAIL_WEBHOOK_SECRET` on the web project
   (`vercel env add … --no-sensitive`) and confirm `RESEND_API_KEY` is set on
   the **admin** project too, then redeploy both.
2. Add Forward Email's verification TXT, then the alias routing TXT — the
   webhook URL **must** carry `?raw=false&attachments=false`, or a single
   ~900 KB attachment exceeds Vercel's 4.5 MB body cap and the message vanishes
   with no log line.
3. Add the MX records **last**.

**Verify:** `dig getpropertypro.com MX +short` returns a host, then send a real
message from an external account and confirm the thread appears at `/inbox`.

**If the webhook is broken when mail arrives, nothing is lost:** it returns 5xx,
Forward Email temp-fails the SMTP session with a 421, and the sender's own mail
server holds the message and retries for 24-72 hours. That is why there is no
fallback mailbox — but the window only helps if somebody notices, so point an
uptime monitor at the readiness probe (item 5).

---

## 4. No DMARC record

**Status:** open · **Owner:** you (DNS) · **Do with item 3**

`_dmarc.getpropertypro.com` is absent at the authoritative nameserver.

```
_dmarc  TXT  v=DMARC1; p=none; rua=mailto:<id>@dmarc.postmarkapp.com; fo=1
```

**Point `rua=` at Postmark's free DMARC Digests**, not at an address on this
domain. Aggregate reports arrive as gzipped XML attachments — exactly the
payload class the inbound webhook deliberately does not store — so
`rua=mailto:dmarc@getpropertypro.com` would deliver them somewhere that drops
them. Postmark's service needs no account and no mailbox and emails a weekly
summary: https://dmarc.postmarkapp.com/

Start at `p=none`, read a week of reports, then ratchet to `quarantine`.

The rest of email auth is already correct — DKIM (`resend._domainkey`) is live
and `send.getpropertypro.com` carries both SPF (`v=spf1 include:amazonses.com ~all`)
and the feedback MX. Note that `docs/DEPLOYMENT.md` §5.4 previously claimed an
apex SPF and a `p=quarantine` DMARC that never existed; that section has been
corrected.

**Verify:** `dig _dmarc.getpropertypro.com TXT +short`.

---

## 5. Nothing polls the readiness probe

**Status:** open · **Owner:** you (monitoring)

> **Update (cron alerting):** the same monitor should now also poll
> `/api/v1/internal/cron-health`, which returns 503 when any scheduled job has not
> succeeded inside its own window. That is the only check that catches a job which
> STOPPED RUNNING — failure alerting cannot, because a 401'ing cron throws `AppError`
> and never reaches Sentry, which is exactly how all seventeen stayed dead behind a
> green dashboard in 2026-08. One monitor setup now covers readiness, `/api/health`
> and cron freshness.

`/api/v1/internal/readiness` now reports nine secrets plus email delivery, and it is
callable in production today — both `READINESS_CHECK_SECRET` and `CRON_SECRET` are set, so
there is no prerequisite to arrange. But **nothing reads it**, so it cannot tell anyone
anything.

```bash
curl -H "Authorization: Bearer $READINESS_CHECK_SECRET" \
  https://www.getpropertypro.com/api/v1/internal/readiness
```

Point an uptime monitor at it: 200 `healthy` / 200 `degraded` / 503 `unhealthy`. Alert on
`degraded`, not only on 503 — the whole point is that a missing secret keeps serving
traffic.

> **Correction (2026-09-04):** an earlier version of this item said to *add* `/api/health`
> on both apps. It already exists — `apps/web/src/app/api/health/route.ts` and the admin
> equivalent. Only the polling is missing.

**Expect `degraded` on the first run** until item 2 is done. That is the probe working.

---

## Feature blockers — Website Editor

Promoted from the *Website Editor Feature Gap Audit* (25 July 2026) on 2026-09-02, after
reconciling that audit against `main`. Its three P0 gaps and all five UX-audit risks are
already shipped; these two P1s are the ones judged to matter before real associations
onboard. Unlike items 1–5, these are engineering work.

---

## 6. Publishing the site notifies nobody

**Status:** ✅ DONE — merged 2026-09-04 (#1031) · **Source:** gap audit G-05

A publish updates the public site and tells no one. Residents do not poll a website. The
platform already holds the resident roster and a working email channel — DKIM and SPF are
live (items 3–4 are about the *inbound* address) — so the missing piece is one opt-in step
on the publish sheet, not a notification system.

Why this outranks its P1 label: the product is sold against a statutory clock, and the
clock is about residents *being informed*. A §718 notice posted where nobody looks meets
the letter and misses the point. The first association to notice will notice during a real
notice.

Scope: an "Email residents about this update" checkbox with an editable one-line summary,
offered when the publish includes an announcement. Not a newsletter product.

**Verify (absent today):**

```bash
grep -rn "notifyResidents" apps/web/src | grep -vi package
```

Returns nothing. Note the filter: the only `notifyResidents*` symbol in the tree is
`notifyResidentsOfPackage` in `lib/services/package-visitor-service.ts`, which is package
delivery and unrelated. An unfiltered grep reads as a false positive and scores this done.

---

## 7. Nothing can be scheduled; only urgent notices expire

**Status:** ✅ DONE — merged 2026-09-04 (#1032 expiry, #1037 scheduling), but scheduling was
**non-functional in production until #1042** (2026-09-05) · **Source:** gap audit G-07

Half shipped, and the missing half is the half on a statutory clock. Urgent notices carry
an `expiresAt` — it shipped alongside the mobile fast path — so a pool-closure notice can
take itself down. But there is **no scheduled publish and no announcement expiry**: meeting
materials that must appear a fixed number of days before a meeting depend on someone
remembering, and every seasonal notice is removed by hand.

Scope: per-publish "go live at…", and per-announcement expiry — the authoring-side
complement to the time-window filtering the public feed sections already perform.

**Verify:**

```bash
# expiry exists — for urgent notices only
grep -n "expiresAt" apps/web/src/app/api/v1/pm/site/urgent-notice/contract.ts
# scheduled publishing — the symbols this repo ACTUALLY uses. The earlier form of this
# line grepped `scheduledPublishAt|goLiveAt`, names that appear nowhere in the tree, so
# it kept returning nothing after the feature shipped and read as "still missing".
grep -rl "scheduleSitePublish" apps/web/src
```

Existence is not function — #1042 is exactly that gap. To check it still **runs**, look at
the worker rather than the source:

```bash
# 200 = healthy. A 500 here is the worker down again; read the `[cause]` chain, not the
# "Failed query: <SQL>" wrapper, which names a statement Postgres may never have seen.
vercel logs "$(vercel inspect getpropertypro.com 2>&1 |
  grep -oE 'property-pro-[a-z0-9]+-[a-z0-9-]+\.vercel\.app' | head -1)" --json |
  grep scheduled-site-publish | head -3
```

---

## Not blockers — deliberate, listed so they are not re-litigated

- **E-voting** is gated off per community (`electionsAttorneyReviewed`), and migration
  `0062_secret_ballot` is merged but **deliberately unapplied** pending attorney sign-off.
  It is irreversible; see [`DEPLOYMENT.md`](DEPLOYMENT.md) §7.3.
- **Reserve transparency** and **storm tools** ship dark by design.
- **Resident payments** are gated per community (`assessmentPaymentsEnabled`) and are not
  launching. `STRIPE_CONNECT_CLIENT_ID` is unset, which now returns a typed 503 rather than
  a raw 500.
- **PM lead notification** deferred — leads are captured and visible in admin `/leads`;
  only the push is missing, and there is no inbox to push to until item 3.
- **`docs/gtm/03-LAUNCH-READINESS.md` is stale.** Its B1–B4 blockers are all resolved or
  deliberate: `/resources` exists, the PM tier has a real inquiry form, and the placeholder
  testimonial and logo strip are unrendered.
