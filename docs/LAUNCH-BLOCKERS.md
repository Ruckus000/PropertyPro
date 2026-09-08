# Launch blockers — open ops items

**Opened:** 2026-09-01, from the pre-launch audit.
**Scope:** things that must be true before real Florida associations are onboarded.

Items **1–5 are environment, DNS, or a dashboard action** — none is a code change.
The code is in good shape: 25/25 guards, ~12,155 unit tests green, clean production build
of both apps as of `aabf9727`.

Items **6–7 are the exception**: two Website Editor feature gaps promoted to blockers on
2026-09-02. They are code, not config, and they are sequenced last for that reason.

An **Engineering backlog** was folded into the end of this file on 2026-09-07 — the
engineering debt, coverage gaps and open GitHub items that were previously scattered
across five unreconciled trackers. **None of it blocks launch**, and it is placed below
the deliberate-non-blockers list so it cannot be mistaken for the checklist above. It
carries a re-measure command beside every number, and none of those commands was run
against a built tree; read that section's method note before acting on a row.

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

**Status:** verified 2026-09-08 · **Owner:** you (Stripe dashboard + live keys) · **Runbook:** [`docs/runbooks/stripe-live-cutover.md`](runbooks/stripe-live-cutover.md)

**Production serves TEST-mode keys.** This is now settled from outside, which an
earlier revision of this entry said was impossible:

```bash
curl -sg "https://www.getpropertypro.com/_next/static/chunks/app/(public)/signup/checkout/page-*.js" \
  | grep -oE 'pk_(test|live)_[A-Za-z0-9]{6}'
# -> pk_test_51Syt6
```

The 2026-09-04 check that concluded "not present in the served bundle" looked at
the page HTML and the shared chunks. The key is read inside a `'use client'`
component (`signup/checkout/page.tsx`) that Stripe.js loads lazily, so it is
inlined into the **route** chunk — reachable only by extracting the chunk path
from the HTML first.

So this is the benign case: **checkout works and takes no money.** It is
scheduled work, not an outage. (The urgent case — live keys against the test
price ids in the database, i.e. checkout broken for everyone — is ruled out.)

### Blast radius: zero real customers

Measured against production 2026-09-08:

| | |
|---|---|
| Communities holding a `cus_…`/`sub_…` | 5 — the 3 seeded demo communities (sharing one customer and one subscription) and 2 soft-deleted `Big Mama's House` test signups |
| `billing_groups` | 4, all with customer ids, none tombstoned |
| `stripe_connected_accounts` | 0 |
| `finance_stripe_webhook_events` | 0 |
| `access_plans` (holds `stripe_coupon_id`) | 0 |

No real money has ever moved through this account. The cutover can be done in one
sitting with no customer impact — but that is a **snapshot**, not a standing
property. Re-measure before relying on it.

### The tooling was fixed first

An adversarial audit of the runbook against the code (2026-09-08) found two
defects that would have broken the cutover mid-flight. Both are fixed:

- `remediate-stale-stripe-ids.ts` accepted a **test** key. Combined with
  `scripts/with-env-local.sh` clobbering an exported `STRIPE_SECRET_KEY`, step 4
  would have reported "nothing to remediate" and done nothing — and any later
  re-run, once real customers existed, would have nulled their billing state. It
  now calls `assertKeyMode(secretKey, true, …)`.
- `verify-stripe-mode.ts` counted **soft-deleted** billing groups that
  `remediate` skips, so step 5 could never pass once step 4 had run, and
  re-running step 4 was a no-op. The two queries now agree.

### Known, unfixed, and documented in the runbook

- **`verify-stripe-mode.ts` can never exit 0.** `webhookSecretCheck` returns
  `unknown` whenever the secret is set and `isFailing` counts that as failing, so
  the exit code carries no signal in any environment. Read the table.
- **It reads your shell's env, not Vercel's** — `.env.local`, not what is
  deployed.
- **`STRIPE_SECRET_KEY` lives on two Vercel projects.** `property-pro-admin`
  reads it for the demo→customer conversion route.
- **The live Customer Portal is a separate dashboard object** with no API
  equivalent here; `/billing/portal` 500s until it is configured in live mode.
- **Step 6 cannot "purchase then refund"** — signup is a 30-day trial, so the
  first invoice is $0. End the trial from the dashboard to force a real charge.

**Verify:** re-run `verify-stripe-mode.ts` (read-only, safe against prod) and
read the table — the exit code is always 1. Then a real card, per runbook §6.

---

## 2. `COMMUNITY_EMAIL_UNSUBSCRIBE_SECRET` is unset in production

**Status:** CLOSED — measured 2026-09-08. The secret is set in production and at least
16 characters. · **Owner:** —

> **How this was established, since nobody recorded fixing it.** The first run of
> `.github/workflows/production-health.yml`
> ([run 34181966758](https://github.com/Ruckus000/PropertyPro/actions/runs/34181966758))
> reported `readiness status: healthy`. That is deductive, not circumstantial:
> `readiness/route.ts:104` puts `COMMUNITY_EMAIL_UNSUBSCRIBE_SECRET` in `secretRules`,
> `:186` computes `secretsOk` as *every* rule passing, and `:190` makes `healthy` require
> `secretsOk`. There is no path to `healthy` with this secret missing or short.
>
> The item below is kept because the failure it describes is real and silent, and would
> return the moment the variable is cleared — the signer returns `null` rather than
> throwing, so nothing would tell you.

**The problem this described, for when it recurs:**

While the variable was unset, every announcement, notification, digest and
calendar-reminder email shipped a **login-walled** unsubscribe URL while still sending `List-Unsubscribe-Post: One-Click`.
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

**Status:** CLOSED 2026-09-07 — mail delivers AND reaches the admin Inbox ·
**Owner:** —

> **Measured in production 2026-09-07, not inferred:**
>
> ```
> dig getpropertypro.com MX +short   →  0 mx1.forwardemail.net.
>                                       0 mx2.forwardemail.net.
> apex TXT                           →  6 aliases carrying webhook URLs
> support_inbox_messages             →  3 rows (2 inbound, 1 outbound),
>                                       normalization_status = ok on all three,
>                                       15:06 → 16:02 UTC
> ```
>
> The outbound row matters as much as the inbound ones: it means a reply sent
> from `/inbox` went back out through Resend, so the loop closes rather than
> merely ingesting. Item 4 (DMARC) is closed with this one.

**The last thing standing was a plan tier, not code.** Forward Email's free
plan sends webhooks **unsigned** — `helpers/get-settings.js` populates
`webhookKey` only inside `if (domain && domain.plan !== 'free')`, and
`helpers/on-data-mx.js` attaches `X-Webhook-Signature` only
`if (recipient.webhookKey)`. Our ingress fails closed, so it answered 401, and
Forward Email then failed the **entire SMTP delivery** — the sibling
catch-all forward included. A webhook that 401s does not just miss the portal;
it eats the message.

**Resolved by upgrading to Enhanced Protection** ($3/mo, unlimited domains),
the cheapest of the three options weighed in `docs/DEPLOYMENT.md` §5.5.
Signatures now arrive and the code works unchanged — nothing was modified to
accommodate this.

> **Do not downgrade this domain to the free plan.** Nothing in our code would
> change, no test would redden, and no alert would fire — inbound mail would
> simply start failing closed again, silently, exactly as it did before. That
> is the whole reason the source analysis above is kept rather than deleted
> along with the blocker.

**What is live:** an ingress at `POST /api/v1/webhooks/inbound-email`
(HMAC-verified, fails closed) and an **Inbox** in the admin console at
`/inbox` — threads, triage, internal notes, and replies sent from the mailbox
the thread arrived on. Replies go out through Resend, which is DKIM-verified.

Two details worth preserving, because both were expensive to learn and neither
is visible from the records themselves:

- The alias routing TXT **must** carry `?raw=false&attachments=false`. A single
  ~900 KB attachment otherwise exceeds Vercel's 4.5 MB body cap and the message
  vanishes with no log line.
- **If the webhook is broken when mail arrives, nothing is lost:** it returns
  429, Forward Email temp-fails the SMTP session with a 421, and the sender's
  own mail server holds and retries for 24–72 hours. That window only helps if
  somebody notices, so it does not replace the monitor in item 5.

---

## 4. No DMARC record

**Status:** CLOSED 2026-09-07 — record live at `p=none`; ratchet still open ·
**Owner:** you (one DNS edit, after a week of reports)

> **Verified 2026-09-07:** `dig _dmarc.getpropertypro.com TXT +short` returns a
> `v=DMARC1; p=none; pct=100;` record with `rua=` pointed at Postmark's DMARC
> Digests, as recommended below. The record Postmark generates also carries
> `sp=none; aspf=r` and omits `fo=1`; that is fine at `p=none` — but see the
> `sp=` note below before ratcheting, because it does not stay fine at
> `p=quarantine`.
>
> **Re-verified 2026-09-08.** Record unchanged and still live. Also confirmed at
> the same time: `resend._domainkey.getpropertypro.com` is published on the
> **apex**, which is what makes the absent apex SPF a non-issue — a DKIM key is
> scoped to domain + selector, so DMARC passes on DKIM alignment alone for every
> apex `From`. The apex carries no `v=spf1` record at all (only Forward Email
> routing TXT), and that remains correct rather than an oversight.
>
> **The one thing left is not a blocker but should not be forgotten:** `p=none`
> observes and enforces nothing. Read a week of digests, then ratchet to
> `p=quarantine`. Doing that before reading the reports is how legitimate mail
> starts silently going to spam.
>
> **Reviewed 2026-09-07 — do not ratchet yet, and do not add `fo=1`.**
>
> `fo=1` was considered and rejected: RFC 7489 makes failure-report options
> meaningful only alongside a `ruf=` destination, Postmark's DMARC Digests is an
> aggregate (`rua`) service, and the major receivers largely do not send failure
> reports at all. Pointing `ruf=` at our own inbox is wrong for the same reason
> this item already rejects `rua=mailto:dmarc@getpropertypro.com`. It would look
> like progress and change nothing.
>
> **`sp=none` protects nothing here.** Every `From:` in the codebase is on the
> **apex** — `noreply@` (`packages/email/src/send.ts`, and `RESEND_FROM` is
> unset in production so that fallback is what ships) plus `support@` /
> `privacy@` / `contact@` (`packages/shared/src/support-inbox.ts`).
> `send.getpropertypro.com` is only Resend's envelope MAIL FROM, which is not
> what `p=`/`sp=` key off. So `p=quarantine` would govern **100%** of outbound.
>
> **But `sp=none` is an opt-OUT, not an omission, and must be ratcheted with
> `p=`.** Those are different things in RFC 7489: with `sp` absent, subdomains
> inherit `p`; with `sp=none` present, they are exempt from whatever `p` says.
> So `p=quarantine; sp=none` would still leave `From: billing@mail.getpropertypro.com`
> entirely unenforced — the spoofing shape a ratchet is meant to close. Since no
> legitimate `From` is on a subdomain (the paragraph above is what establishes
> that), tightening `sp` alongside `p` costs nothing and is free coverage. Either
> drop `sp=` so it inherits, or set it explicitly; Postmark's generated record
> ships `sp=none` by default, so this will not fix itself.
>
> Note this is unrelated to the HTTP subdomain reservations added in #1103.
> Those govern which hostnames a tenant may serve; nothing stops a spoofer
> writing an unowned subdomain into a `From:` header, and DMARC resolves that by
> falling back to the organizational domain's `sp=`.
>
> **Password reset is the one path to establish, and it has TWO outcomes — only
> one of them is a problem.**
> `apps/web/src/lib/auth/password-reset.ts` calls
> `supabase.auth.resetPasswordForEmail`, so Supabase composes and sends that
> message; it never touches the DKIM-aligned Resend pipeline. The asymmetry is
> deliberate elsewhere: `signup.ts` uses `generateLink` *"so that Supabase does
> NOT send its default confirmation email."* That was never applied here.
>
> But "outside our pipeline" is not the same as "will break":
>
> - **Default Supabase SMTP** — the `From` is a Supabase-owned domain, so *our*
>   DMARC record never applies to it and ratcheting cannot affect it at all.
>   Not a blocker.
> - **Custom SMTP configured to send as `@getpropertypro.com`** — our record
>   does apply, and without an SPF include and DKIM key at the apex for that
>   provider, `p=quarantine` starts quarantining password resets. This is the
>   only failing case.
>
> An earlier revision of this entry called password reset "the casualty
> candidate" without that split, which reads as a blocker when it is a coin
> whose second face is harmless. Establish which one it is before treating it
> as either.
>
> **Three preconditions, none answerable from the repo** (the Supabase
> management API exposes no SMTP config):
>
> 1. Supabase Dashboard → Auth → SMTP. If custom SMTP is on with an apex
>    `From`, every password reset quarantines unless that provider gets an SPF
>    include and a DKIM key at the apex.
> 2. Resend Dashboard → Domains: confirm the **apex** is verified, not only
>    `send.`.
> 3. Read one delivered message's `Authentication-Results` for
>    `dkim=pass header.d=getpropertypro.com` and `dmarc=pass`.
>
> **Preconditions 2 and 3 are now satisfied**, by a real delivered reply
> captured in #1067:
>
> ```
> dkim=pass  header.i=@getpropertypro.com header.s=resend
> spf=pass   smtp.mailfrom=…@send.getpropertypro.com
> dmarc=pass (p=NONE sp=NONE dis=NONE) header.from=getpropertypro.com
> ```
>
> Scope that correctly. It is **one message, to one Gmail recipient, from
> `support@`** — not a corpus. It does generalise across everything Resend
> sends, because a DKIM key is scoped to the DOMAIN and the selector, not to a
> `From` address: `resend._domainkey.getpropertypro.com` signs `noreply@` the
> same way it signed `support@`. What it cannot speak to is any path that does
> not go through Resend — which is exactly precondition 1, and why that one is
> the whole remaining question.
>
> Then a week of digests, then ratchet. Note
> `specs/phase-1-compliance-core/28-email-infrastructure.md` specifies a `mail.`
> subdomain and `p=quarantine`; neither ever shipped, so it is not precedent.

The original finding, kept for the reasoning: `_dmarc.getpropertypro.com` was
absent at the authoritative nameserver.

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

**Status:** PARTIALLY CLOSED 2026-09-08 — `.github/workflows/production-health.yml`
polls readiness, cron-health and both `/api/health` endpoints twice daily and fails
the run on `degraded`/503. Verified by dispatch the same day
([run 34181966758](https://github.com/Ruckus000/PropertyPro/actions/runs/34181966758)):
all four probes green. · **Owner:** you, only if you want a real uptime service with
escalation

> **Correction.** This item briefly claimed the workflow needed
> `READINESS_CHECK_SECRET` added as a repository secret. It has been one since
> **2026-04-24**. The claim came from §3 of `DEPLOYMENT.md`, whose table does not list
> it — the table is incomplete, not authoritative. Fixed there in the same change.

> **What it does not give you.** No escalation, no history, no on-call routing — a
> failure is a red run and whatever email GitHub sends. It runs on GitHub rather
> than as a Vercel cron deliberately: a cron watching crons shares the failure mode
> it exists to detect, and the seventeen that died in 2026-08 would have taken their
> own monitor down with them. Twice daily rather than every 15 minutes because
> Actions minutes are constrained (#976) and these failures are slow.

> **Update (cron alerting):** the same monitor should now also poll
> `/api/v1/internal/cron-health`, which returns 503 when any scheduled job has not
> succeeded inside its own window. That is the only check that catches a job which
> STOPPED RUNNING — failure alerting cannot, because a 401'ing cron throws `AppError`
> and never reaches Sentry, which is exactly how all seventeen stayed dead behind a
> green dashboard in 2026-08. One monitor setup now covers readiness, `/api/health`
> and cron freshness.
>
> Safe to wire as of 2026-09-07: the probe used to report 503 for
> `generate-assessments`, a monthly job whose last real run predated the
> `cron_runs` table, and would have until 2026-10-01. A monitor pointed at a
> probe that is red by construction teaches whoever watches it to ignore the
> alert. Migration 0070 gave the probe a grace window measured from when it
> first knew about a job, so a 503 now means something.

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

**The first run reported `healthy`** (2026-09-08), which is what closed item 2 — see
there. An earlier version of this line told you to expect `degraded`; that was true
when written and is not now.

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

---

# Engineering backlog

**Folded in 2026-09-07.** Everything above this line blocks launch. **Nothing below it
does.** It is here because it had no other home that anyone reads: the same work was
scattered across `docs/audits/2026-07-18-refactor-audit-and-cleanup-roadmap.md`, four
root-level `PHASE*_EXECUTION_PLAN.md` files, `docs/issues/`, `specs/`, and the GitHub
issue tracker, each with its own date and none of them reconciled against the others.

**Method, and its limits.** Every number below is a static measurement taken at
`ddf3469` with the command printed beside it. **No test, guard, lint or build was run** —
`node_modules` was absent in the container that produced this. So this section can tell
you what the tree *contains*; it cannot tell you what *passes*. Read a row that says a
count grew as "this program is not progressing", never as "this is broken".

Baselines in the "2026-07-18" column are quoted from the refactor audit's §1 headline
table and are like-for-like: route counts are scoped to `apps/web/src/app/api/v1`
(+ `/api/health`) as that audit scoped them.

---

## B1. In-flight programs, re-measured against their own baselines

The structural work the July audit ranked first. Four of the eight rows are **larger**
than the day they were written down, one is flat, and the two that improved improved
because a *different* program (the admin design migration) was actively worked. This is
the part of this section that argues for doing something.

| Program | 2026-07-18 | 2026-09-07 | |
|---|---|---|---|
| Uncontracted routes (`KNOWN_UNCONTRACTED_ROUTES`) | 37 of 257 | **46 of 284** | ⬆ · **ceiling pinned 2026-09-07** |
| `contract.ts` declaring `tenantScope` | 12 | **15** | flat |
| Contracted routes still hand-calling `resolveEffectiveCommunityId` | 121 | **148** | ⬆ · unratcheted (ceiling removed on review — see below) |
| `apps/web/src/middleware.ts` | 994 LOC | **1,318 LOC** | ⬆ 33% |
| `lib/services/finance-service.ts` | 2,410 LOC | **2,548 LOC** | ⬆ |
| Hook sources with no same-named test file | ~28 of 98 | **38 of 111** | ⬆ |
| Design-token baseline | 1,650 in 76 files | **1,019 in 84 files** | ⬇ (admin drain) |
| `scripts/page-padding-baseline.json` | — | **`{}`** | clean |

```bash
find apps/web/src/app/api -name route.ts | wc -l                                  # 284
grep -rl "runRoute(" apps/web/src/app/api --include=route.ts | wc -l              # 238
awk '/KNOWN_UNCONTRACTED_ROUTES/,/^\];/' scripts/verify-contracts.ts \
  | grep -cE "^\s*'apps/"                                                          # 46
grep -rl tenantScope apps/web/src/app/api --include=contract.ts | wc -l           # 15
grep -rl "runRoute(" apps/web/src/app/api --include=route.ts \
  | xargs grep -lE 'resolveEffectiveCommunityId\s*\(' | wc -l                      # 148
wc -l apps/web/src/middleware.ts apps/web/src/lib/services/finance-service.ts
```

238 contracted + 46 allowlisted = 284, so the allowlist is exactly the uncontracted set
and the guard is telling the truth about coverage. What it cannot tell you is that **the
allowlist is a hand-edited array**: `guard:contracts` fails a new uncontracted route only
until somebody appends a line to `scripts/verify-contracts.ts`. Nine lines were appended
in the seven weeks since the audit. Most are `internal/*` cron and webhook routes the
runner genuinely cannot express (201/202/204, raw bodies, non-JSON) — that is the
documented permanent tier, not backsliding — but the ratchet is a convention, not a
mechanism, and the number it guards has only ever gone up.

**One of the three is ratcheted (2026-09-07).** `guard:contracts` fails if the allowlist
exceeds 46, via a shared shrink-only helper (`scripts/lib/ceiling.ts`) that copies
`guard:legacy-roles`' slack hint, so coming in UNDER passes and prints the value to ratchet
down to.

A second ceiling on `guard:tenant-scope`'s hand-rolled resolver count was added and then
**removed on review**, for the reason stated immediately below about LOC ceilings:
`.claude/rules/api-patterns.md` says routes that resolve tenancy differently (PM
cross-community, token-auth, header-only) SHOULD hand-resolve — so the first correctly
authored one fails CI and the only response is to raise the number. It fired on honest
work, which is the test this section already applies.

**LOC ceilings were deliberately NOT added**, on a ponytail review: `middleware.ts` (1,318)
and `finance-service.ts` (2,548) stay unratcheted. A line count is the one signal here that
fires on honest work — any real feature added to middleware trips it — so it would get
raised rather than respected. The decomposition in the July audit is the actual fix for
those two; a ceiling would be a nag standing in for it. That is an accepted gap, not an
oversight.

## B2. Coverage that is absent rather than failing

| Gap | Measured |
|---|---|
| E2E blocks never exercised on a PR | **13 of 45** — 5 Stripe signup (own workflow, needs secrets), 6 tenant-host (need `:3002`), 2 `onboarding-first-run` `test.fixme`. **Not measured here** — block counts need `playwright test --list`; quoted from `CLAUDE.md` and `docs/audits/2026-08-03-e2e-inventory.md`. What *is* measured: 15 spec files exist, and `apps/web/e2e/ci-safe-specs.json` names 8 of them with `expectedTestCount: 29` |
| `verify-*` guards with a same-named fixture test under `scripts/__tests__/` | **9 of 40** |
| `verify-no-mocks-in-integration.ts` `LEGACY_ALLOWLIST` — comment says it "should shrink to zero" | **16 entries** |
| Hook sources with no same-named test | **38 of 111** |
| `it.todo` chaos scenarios, `__tests__/api/revenue-snapshot-chaos.test.ts` | **7** — duplicate same-day snapshot, 3-day cron gap, backdated Stripe webhook, DST fallback, TZ boundary, grace boundary, future-dated `created_at` |
| `it.skip` placeholders citing "Phase 3", `feature-flag-enforcement.integration.test.ts` | **2** — Phase 3 closed 2026-02-22; these describe work that was never scoped and will never be written as stated. Delete them |

`onboarding-first-run.spec.ts` deserves its own line, because it is not a coverage gap —
it is a **contradiction between the spec and the product, unresolved since 2026-08-03.**
Both blocks wait on `data-testid="condo-onboarding-wizard"`. `git log -S condo-onboarding-wizard`
(re-run 2026-09-07) puts that identifier in three files ever — the spec itself,
`docs/audits/2026-08-03-e2e-inventory.md`, and `docs/spec-bundle/SPECIFICATIONS_COMPLETE.md`.
It has never appeared in `apps/web/src`, and `grep -rn condo-onboarding-wizard apps/web/src`
returns 0 today. The shipped
`/onboarding/condo` is a different, 2-step wizard. So the spec has never been capable of
passing, and leaving it `test.fixme` records the disagreement without settling it. Either
the 4-step wizard is still wanted (then it is a feature, and belongs above this line) or
it is not (then delete the spec and the phase-2 spec section together).

## B3. Open on GitHub, 2026-09-07

**The four ~27-day issues are addressed (2026-09-07); three remain.** PR #1067 merged as
`225dd58` while this section was being written, which is why the line about it is gone.

| Item | Age | Status |
|---|---|---|
| ~~#956 ARC withdraw skips `requireActiveSubscriptionForMutation`~~ | 26d | **Documented, not changed.** The exemption is deliberate — gating withdraw would strand the row in `submitted` with no way out for either side. Noted in the route's docblock and at the call site |
| ~~#951 Sentry may buffer raw Stripe webhook bodies~~ | 27d | **Fixed and MEASURED.** `scrubServerEvent` drops `request.data` (plus URLs, and headers case-insensitively) on all four server/edge configs, wired to **both** `beforeSend` and `beforeSendTransaction`. The issue's closing precondition is met: bodies **are** attached (`event.request.data` arrived as the raw body string on a production build — [audit](audits/sentry-request-body-capture-2026-09-08.md)), so the drop is load-bearing. The audit also found a **wider leak of the same data that this fix does not cover** — drizzle's `Failed query:` error carries its bound parameter values into Sentry via the chained exception and `console.error` breadcrumbs. Filed as #1092, and **now fixed and closed**: `redactQueryParams` redacts the bound values in `exception.values[]` and in console breadcrumbs, re-measured on a live envelope (canary 4 → 0, event still delivered with its SQL intact). Three residuals are recorded on the closed issue — the export-job column still shows the PM raw SQL, `invitations.token` is still plaintext at rest, and ~90 other `console.error` sites still reach Vercel logs |
| ~~#950 meetings POST runs `assertNotDemoGrace` before authenticating~~ | 27d | **Fixed, and the title was wrong.** Not unauthenticated: `/api/v1` is in `PROTECTED_PATH_PREFIXES`, so middleware 401s first. The real gap was a pre-auth unscoped PK read for an authenticated caller |
| #947 Access-request OTP cap / orphan auth accounts | 27d | **Part 1 closed, by reverting.** The attempt cap was made to survive a resend and then reverted: because a resend also refreshes the expiry, preserving the count let anyone hold any address in a permanent lockout. Brute force is bounded by the Redis-backed auth tier instead — which `/verify` reached via #1096, not here. **Part 2 measured, not automated** — production was audited by direct read-only query (below); what remains is a per-row deletion decision a human has to make, not a script |
| #771 Wave 4 follow-up: full Next/Back step-wizard for signup (B4) | 56d | open |
| #747 Nightly Demo Reset failing | 76d | open — a job known to be failing |
| #526 Site-assets quota + lifecycle: 3 deferred findings need design | 102d | open |

> **#947 part 2 — MEASURED against production 2026-09-07, and the issue's premise does not
> hold.** The audit's queries were run read-only via Supabase MCP (the script itself needs
> `.env.local`, which a fresh clone does not have).
>
> ```
> auth.users 70 · public.users 43 · orphans (auth with no public.users) 31
> orphans blocking a pending access request:                             0
> ```
>
> **Zero wedged requests.** The issue's stated harm — "the corresponding request stays
> wedged", users approved but unable to log in — is not occurring. Nor is any orphan a
> stranded customer: all 31 are the owner's own test and demo residue, in four groups —
> 12 demo-instance personas (`demo-*@demo-*.propertyprofl.com`, all 2026-03-05/06),
> 1 `.local` seed identity, ~14 `@example.com` audit/smoke artifacts (2026-03-21 →
> 2026-05-06), and 4 owner/QA mailboxes. Exactly one address is plausibly third-party, and
> it is unconfirmed, has never signed in, and has no access request. 3 of the 31 have ever
> signed in.
>
> So this is **hygiene, not an incident**: 31 auth identities that can authenticate against
> a system with no application user behind them. Worth clearing; not worth paging anyone.
> Deletion is still per-row and still needs a human.
>
> **There is deliberately no reconciliation script.** One was written and then deleted
> unrun, in the same session: its `= ANY(${array})` predicate renders as `ANY(($1, $2, $3))`
> — a row constructor Postgres rejects with `42809` — which `scripts/reap-test-communities.ts:88-90`
> already warns about; it omitted `deleted_at IS NULL`, so a soft-deleted request would have
> printed as evidence *against* deleting an orphan; and it could not see an auth account whose
> `public.users` row was soft-deleted, which is the very state it claimed to detect. The
> queries above are the audit. Re-run them the same way rather than reviving the file.
>
> **The reverse direction turned up something the issue never mentions:** 4 `public.users`
> rows with NO auth identity. Two are the soft-delete flow working correctly
> (`deleted-…@redacted`, no roles). The other two are `root.manager@*.local` seed identities
> **holding a role they cannot authenticate to use**. That is a different corruption and
> nothing was tracking it.

Branch `fix-cron-runs-rls-registration` (`b11c50f`) is on the remote with no PR and is not
an ancestor of `main`; its content was superseded by #1059 / #1061 / #1062. Safe to
delete — but nothing in the repo says so, which is why it is written here.

## B4. Code that is a stub rather than a feature

- **Nothing is wired to analytics.** Five call sites `console.info('[analytics] …')`
  behind `// TODO: wire to analytics service` — `components/operations/operations-hub.tsx`
  (×3), `(authenticated)/maintenance/submit/page.tsx`,
  `(authenticated)/maintenance/inbox/page.tsx`. There is no analytics service; those
  events go nowhere. Decide whether the product wants them, or delete the calls — a
  `console.info` in production reads as instrumentation to the next person and is not.
- ~~`packages/shared/src/http/request-context.ts:20` — `x-tenant-id` fallback marked for
  removal "after migration window" (P2-30).~~ **Removed**; `COMMUNITY_ID_HEADERS` is now
  `['x-community-id']` and `docs/platform-data-flow-audit.md` records M-03 as fixed.
- **`docs/issues/mobile-demo-gaps.md` has never been updated.** Of its 7 issues, #1 is
  fixed (`app/mobile/more/page.tsx` exists) and #2 is still open (no
  `app/mobile/announcements/[id]`). The file cannot tell you which is which. Mobile is
  out of standardization scope by decision, so this is a *tracking* defect, not a
  product one — but a stale issue list is worse than none.

## B5. Documentation that states things that are no longer true

The most expensive item in this section, because it is what agents and new readers act on.

| Where | Says | Actually |
|---|---|---|
| ~~`.claude/rules/tenant-isolation.md:26`~~ | ~~`ADMIN_ROLES: board_member, board_president, cam, site_manager, property_manager_admin`~~ | **FIXED 2026-09-07.** Replaced with a *Roles in a Scoped Query* section stating the real value (`['manager']`), the v3 three, the `isAdminRole`/`isElevatedRole` predicates, and that board status is a `designation`, not a role |
| `CLAUDE.md` (api-patterns) | "233 routes contracted; 40 grandfathered" (2026-08-09) | 238 / 46 |
| This file's header | "25/25 guards" (2026-09-01) | 29 `guard:*` scripts exist today. Whether they pass was not measured here |
| `IMPLEMENTATION_PLAN.md` (164 KB, repo root) | "PR #33 … ready to merge to `main`" | The repo is past #1072. Historical; so are the four `PHASE*_EXECUTION_PLAN.md` files beside it |
| `docs/gtm/03-LAUNCH-READINESS.md` | B1–B4 blockers | Already called stale above |

**The same defect ran far wider than the rule file, and `guard:legacy-roles` could not
see any of it.** The guard matched *quoted* literals (`'cam'`, `'site_manager'`,
`'property_manager_admin'`) in `.ts`/`.tsx`; every instance was unquoted prose inside a
comment, so it sat at zero cost while ADR-006 recorded role-v3 as "fully landed".

**CLOSED 2026-09-07 — 56 source files swept and the guard widened so there is no fifth
pass.** Every site was traced to the gate it describes before being rewritten, which is
what turned up the mechanism errors below; none of it was search-and-replace.

| Class | Count | Notes |
|---|---|---|
| Wrong about the **mechanism**, not just the vocabulary | 14 sites | the reason this was worth doing — see below |
| Dead `BILINGUAL (role-v3): collapse to v3-only at Phase 4 cleanup` markers | 17 in 13 files | every one sat over a constant that is **already** v3-only — a standing instruction to do work ADR-006 records as complete. Invisible to every earlier grep, since the string contains none of the retired names |
| Vocabulary-only rewrites | ~32 sites | nearly all resolve to the same set, `property_manager \| root_manager` |
| Verified legitimate, now marked `legacy-roles:exempt — <reason>` | 19 markers / 21 flagged lines | help-content vocabulary, historical notes, dev-login aliases, the parity test |

The mechanism errors are why this was worth doing at all — a rename would have left every
one of them in place and made it look reviewed:

- **`api/v1/export/route.ts`** described the **closed vulnerability as the current gate**:
  it claimed `settings:read` grants `owner`, which is exactly the hole legal-risk audit
  F-07 closed. Two paragraphs above it, the same docblock described the fix correctly.
- **`hooks/use-role-management.ts`** was **inverted** — it said the residents GET only
  accepts legacy filter values and would 400 on `property_manager`; it accepts exactly
  `resident|property_manager|root_manager` and would 400 on `manager`/`pm_admin`.
- **`lib/api/branding.ts`** carried a blanket "all callers must have verified…" over a
  module whose read path has **six unauthenticated callers** by design.
- **`finance-service.ts`**, **`reservations/[id]/cancel/contract.ts`** and
  **`resident-form.tsx`** each granted or categorised **board designation** as a role.
  `resolveMatrixRole` never reads `designation`; a board member is a `resident`.
- **`onboarding-checklist-service.ts`** asserted `pm_admin` matches `PM_SCOPE_DB_ROLES`
  while **`create-community.ts` asserted the opposite** — the two files contradicted
  each other, and `create-community.ts` was right.
- Three `rls-config.ts` notes named **`requireAdminRole`, a function that exists nowhere
  in the repo** (swept earlier the same day).

**Enforcement (this is the part that matters).** `guard:legacy-roles` gained a second
pass over **comment prose**, extracted with the TypeScript **parser** — a regex cannot
tell a comment from a string literal or JSX text, and `pm_admin` legitimately appears in
both. Escape hatch `legacy-roles:exempt — <reason>`; fixture test at
`scripts/__tests__/verify-legacy-roles.test.ts` (24 cases). Verified by probe, not by
reasoning: an injected comment fails, the exempt marker suppresses, the same name in a
string/JSX/template/identifier does not fire, an empty root exits 2, and a **missing**
root exits 2 — that last one was a real defect the probe found, since pass 1's
`readdirSync` used to throw and exit 1 ("violations") for what is "could not check".

> **Coverage is partial ON PURPOSE.** Bare `cam` is not matched: ~50 legitimate hits
> (the marketing "CAM portfolio" copy — Community Association Manager is the Florida
> licensure term — the `who-cam` asset filename, a `cam.getpropertypro.com` DNS
> fixture). Matching it would train people to exempt rather than fix. A future
> `// cam can do X` still lands silently. The guard also does not scan `scripts/`,
> which is pre-existing for both passes.

**Three things were deliberately NOT changed, and are the open remainder:**

1. **`lib/onboarding/wizard-common.ts:33`** — a *user-facing* error string, not a comment:
   `'Only board members, CAMs, and property managers can modify wizard state'`. It ships a
   retired word to end users and names board members, whom the role-only check grants
   nothing. Copy change, possibly with a snapshot test — its own decision.
2. **The `use-role-management.ts` over-fetch.** Fixing the inverted comment does not fix
   the behaviour: the hook still pulls the whole roster and partitions client-side, for a
   reason that no longer exists. A server-side `roles` filter works today. That is a
   behaviour change, not a comment fix.
3. **`packages/db/migrations/_archive/0023` and `0024`** still assert `requireAdminRole`
   and the retired names in the present tense. They are frozen historical artifacts;
   rewriting archived SQL is worse than leaving it. Recorded so the next reader does not
   re-open them.

### A dead triplet found in the same sweep

`apps/web/src/hooks/use-residents.ts` exports `ADMIN_ROLES_PARAM =
'board_member,board_president,cam,site_manager,property_manager_admin'` and sends it as
`?roles=` to `GET /api/v1/residents`, which validates every entry against
`COMMUNITY_ROLES` and throws `ValidationError` on the first one. **It would 400 on every
call.** It does not, because nothing calls it: `useResidents` has exactly one consumer,
`components/maintenance/AssignmentModal.tsx`, and nothing renders that modal
(`residents-page-client` uses a different hook). Hook, constant and modal are all dead —
DC-03 territory.

What keeps it invisible is the unit test: `hooks/__tests__/use-residents.test.tsx:36` is
`expect(ADMIN_ROLES_PARAM).toBe('board_member,…')`. It **pins the broken value**, so the
suite is green *because* the string is wrong. Deleting the triplet is the fix; whoever
wires that modal up instead will get a 400 and no assignee list.

The `tenant-isolation.md` line was fixed in the same change that added this section. The
rest is one question, not five: **`docs/` holds ~50 top-level files plus `audits/`, `specs/`,
`superpowers/specs/`, `agent-tasks/` and `gtm/`, with overlapping and differently-dated
backlogs.** Every count in the table above drifted because it was written down twice.

That is the argument against this section, stated so it is not skipped: folding the
backlog in here makes *this* file the fifty-first place a number can go stale. The reason
to do it anyway is that this file is the only one in the repo with a status discipline —
"say what is verified and what is assumed" — and a re-measure command beside every claim.
**Re-run the commands before trusting a row. If a row is stale, fix it or delete it; do
not promote it.**
