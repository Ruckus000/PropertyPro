# Launch blockers — open ops items

**Opened:** 2026-09-01, from the pre-launch audit.
**Scope:** things that must be true before real Florida associations are onboarded.
**Last re-verified end-to-end:** 2026-09-09 — every command below was re-run, every
issue re-checked, every count re-measured.

**One blocker is open: item 1, the Stripe live cutover.** It is a dashboard and
key-rotation task, not code. Items 2–7 are resolved and collapsed below.

The code is in good shape: the `guard:*` suite passes **29/29** (measured 2026-09-09,
`pnpm lint`), and ~12,155 unit tests plus a clean production build of both apps were
green at `aabf9727`.

The through-line of everything here is that it fails **silently**. None of it crashes
anything; each degrades or no-ops while dashboards stay green. That is why it needs a
checklist rather than a bug tracker.

> **How this file stays true — the rule that failed, and why.** It already said "do not
> promote an assumption to a fact without re-running the named command", and on
> 2026-09-09 a re-verification found ~20 stale or self-contradictory claims. The rule was
> not the problem. **814 lines was.** Nobody re-reads that, so nothing is re-run.
>
> Three habits caused all of it, and the file is now shaped to make them hard:
>
> 1. **Do not restate a fact another system owns.** GitHub issue state, an age in days, a
>    count a `guard:` or baseline file owns. Link to it; the link renders the truth. B3
>    called #747 "open — a job known to be failing" when it was closed *and* had ~29
>    consecutive green nights.
> 2. **When an item closes, delete its body — do not update it.** A closed item's problem
>    statement is where staleness lives. Items 5, 6 and 7 each drifted into contradicting
>    their own status lines. Move anything durable to the code, a runbook, or
>    `docs/audits/` first; those are the homes that outlive this file.
> 3. **Stamp every measurement with a date or a SHA.** A dated measurement is true
>    forever. A present-tense claim about another system is true only until it changes.
>
> None of this is enforced. There is no guard, deliberately: this repo already has two
> unwired documentation linters, and one of them validates a file *this* document lists
> as stale.

---
## 1. Stripe is not cut over to live — checkout cannot take real money

**Status:** verified 2026-09-08 · **Owner:** you (Stripe dashboard + live keys) · **Runbook:** [`docs/runbooks/stripe-live-cutover.md`](runbooks/stripe-live-cutover.md)

**Production serves TEST-mode keys.** This is now settled from outside, which an
earlier revision of this entry said was impossible:

```bash
chunk=$(curl -s https://www.getpropertypro.com/signup/checkout \
  | grep -oE '/_next/static/[^"]+signup/checkout/page-[a-f0-9]+\.js' | head -1)
curl -sg "https://www.getpropertypro.com$chunk" \
  | grep -oE 'pk_(test|live)_[A-Za-z0-9]{6}'
# -> pk_test_51Syt6      (re-run 2026-09-09)
```

The key is read inside a `'use client'` component (`signup/checkout/page.tsx`)
that Stripe.js loads lazily, so it is inlined into the **route** chunk, whose hash
changes every build. The path therefore has to be read out of the HTML first — which
is why the 2026-09-04 check, looking at the page HTML and the shared chunks, concluded
it was "not present in the served bundle".

> A fixed URL cannot work here, and `curl -g` *disables* globbing, so the `page-*.js`
> form an earlier revision of this block printed returns **404**. It shipped with
> output pasted from a different invocation that had worked. Re-run a command before
> printing it; a transcript beside it is not evidence that the line above produced it.

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

## Resolved

**Item numbers are load-bearing — nothing here is renumbered.** Four places outside this
file cite them: `.github/workflows/production-health.yml:20`,
`apps/web/src/app/api/v1/internal/cron-health/route.ts:28`,
`docs/runbooks/cron-alerting.md:103`, and
`packages/db/migrations/0070_cron_runs_first_observed_at.sql:14` — all "item 5".

The problem statements these items were opened with are **deleted, not updated**. Where
the reasoning was worth keeping it was moved somewhere that outlives this file, and the
line says where.

- **2. `COMMUNITY_EMAIL_UNSUBSCRIBE_SECRET` unset** — closed 2026-09-08. Established
  deductively, since nobody recorded fixing it: readiness returns `healthy`, and
  `readiness/route.ts:190` cannot reach `healthy` unless every `secretRules` entry passes
  (`:104`, `:186`). Confirmed again by the scheduled run on 2026-09-09.

- **3. No MX record — `support@` bounced** — closed 2026-09-07. Mail delivers and reaches
  the admin Inbox. `dig getpropertypro.com MX +short` → `mx1`/`mx2.forwardemail.net`;
  six aliases route to the webhook. **The reasoning lives in
  [`DEPLOYMENT.md`](DEPLOYMENT.md) §5.5, kept in full** — including the measured finding
  that Forward Email's *free* plan sends webhooks unsigned, our ingress fails closed, and
  the whole SMTP delivery dies with it. That section carries the do-not-downgrade
  tripwire; no test would catch a regression.

- **4. No DMARC record** — closed 2026-09-07. Live at `p=none`, `rua=` to Postmark DMARC
  Digests. Verified unchanged 2026-09-09.
  **Open tail:** `p=none` enforces nothing. The digest window closes **~2026-09-14**;
  read a week of reports first, then ratchet. Per #1104, ratchet `p=` **and `sp=`
  together** — `sp=none` is an opt-*out*, not an omission, so `p=quarantine; sp=none`
  leaves every subdomain `From:` unenforced. One DNS edit, yours.

- **5. Nothing polls the readiness probe** — closed 2026-09-08.
  `.github/workflows/production-health.yml` polls readiness, cron-health and both
  `/api/health` twice daily (`0 7,19 * * *`) and fails the run on `degraded`/503. It now
  runs **on schedule, not just by dispatch** — runs `34223418769`, `34281183441`,
  `34349295881` (2026-09-09 12:08Z), all green. It runs on GitHub rather than as a Vercel
  cron deliberately: a cron watching crons shares the failure mode it exists to detect.
  **Open tail:** no escalation, no history, no on-call routing — a failure is a red run
  and whatever email GitHub sends. Only worth closing if you want a real uptime service.

- **6. Publishing the site notified nobody** — closed 2026-09-04 (#1031). A publish can
  now email residents with a one-line summary; `notifyResidentsOfSitePublish` at
  `apps/web/src/lib/services/site-publish-notification.ts:105`, called from
  `api/v1/pm/site/publish/route.ts:83`.

- **7. Nothing could be scheduled; only urgent notices expired** — merged 2026-09-04
  (#1032 expiry, #1037 scheduling) but **non-functional until #1042** on 2026-09-05: every
  raw statement bound a JS `Date` into a `sql` template, which postgres-js cannot
  serialise, so the cron 500'd ~96×/day and no schedule could be armed. The `ts()` helper
  at `site-publish-schedule-service.ts:82-84` carries the rationale, and
  `guard:no-date-in-raw-sql` now prevents the class.

> **A grep proving code exists is not evidence it runs.** Item 7 was marked DONE on that
> basis while it had never once succeeded in production. That is why each line above
> names the thing that *ran*, not the thing that merged.

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

**Method, and its limits.** Every number below is a static measurement taken at the
commit named in its column header, with the command printed beside it. Read a row that
says a count grew as "this program is not progressing", never as "this is broken".

The original pass could run nothing — `node_modules` was absent in the container that
produced it — so it could say what the tree *contained*, never what *passed*. That gap is
now closed for the guards: **29/29 pass**, re-measured 2026-09-09 via `pnpm lint`. The
unit-test and e2e counts are still un-rerun and stay stamped at `aabf9727`.

Baselines in the "2026-07-18" column are quoted from the refactor audit's §1 headline
table and are like-for-like: route counts are scoped to `apps/web/src/app/api/v1`
(+ `/api/health`) as that audit scoped them.

---

## B1. In-flight programs, re-measured against their own baselines

The structural work the July audit ranked first. Four of the eight rows are **larger**
than the day they were written down, one is flat, and the two that improved improved
because a *different* program (the admin design migration) was actively worked. This is
the part of this section that argues for doing something.

| Program | 2026-07-18 | 2026-09-07 @ `ddf3469` | |
|---|---|---|---|
| Uncontracted routes (`KNOWN_UNCONTRACTED_ROUTES`) | 37 of 257 | **46 of 284** | ⬆ · **ceiling pinned 2026-09-07** |
| `contract.ts` declaring `tenantScope` | 12 | **15** | ⬆ (the column said “flat”; 12→15 is growth) |
| Contracted routes still hand-calling `resolveEffectiveCommunityId` | 121 | **148** | ⬆ · unratcheted (ceiling removed on review — see below) |
| `apps/web/src/middleware.ts` | 994 LOC | **1,318 LOC** | ⬆ 33% |
| `lib/services/finance-service.ts` | 2,410 LOC | **2,548 LOC** | ⬆ |
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

> **The `ddf3469` column is a dated measurement, not a current one.** Re-measured
> 2026-09-09: middleware.ts is **1,332** LOC, finance-service.ts **2,554**, the
> design-token baseline **1,017 across 83 files**. Everything else in the table is flat —
> the contract ceiling is holding at 46. The two LOC rows are the only things that grew,
> which is what this section predicted would happen when it declined to add LOC ceilings.
> The hook-coverage row was dropped: it printed no command, and two independent attempts
> to reproduce it disagreed (110 vs 111 hooks).

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
| `verify-*` guards with a same-named fixture test under `scripts/__tests__/` | **11 of 41** (2026-09-09; was 9 of 40) |
| `verify-no-mocks-in-integration.ts` `LEGACY_ALLOWLIST` — comment says it "should shrink to zero" | **16 entries** |
| `it.todo` chaos scenarios, `__tests__/api/revenue-snapshot-chaos.test.ts` | **7** — duplicate same-day snapshot, 3-day cron gap, backdated Stripe webhook, DST fallback, TZ boundary, grace boundary, future-dated `created_at` |

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

## B3. Open on GitHub

**[#526](https://github.com/Ruckus000/PropertyPro/issues/526) — Site-assets quota +
lifecycle, 3 deferred findings that need design — is the only open issue in the repo**
(`gh issue list --state open`, 2026-09-09).

> **This section used to restate issue state, and that is what rotted.** It said "three
> remain" and described #747 as *"open — a job known to be failing"*. #747 closed
> 2026-09-08, and its last failure was **2026-08-09** with ~29 consecutive green nights
> since — so that row was false on the day it was written, not merely stale later.
> [#771](https://github.com/Ruckus000/PropertyPro/issues/771) also closed 2026-09-08, as
> `NOT_PLANNED`. Issue state lives on GitHub; link to it rather than copying it here.

Everything the ~27-day batch (#947, #950, #951, #956) established is recorded on the
issues themselves. Two findings from it are worth keeping here because they are *not*
recorded anywhere a reader of this file would look:

- **#951 residuals, still open.** `scrubServerEvent` drops Sentry request bodies and
  `redactQueryParams` redacts drizzle's bound parameters, both re-measured on a live
  envelope. Three things it does **not** cover: the export-job column still shows the PM
  raw SQL, `invitations.token` is still plaintext at rest, and ~90 other `console.error`
  sites still reach Vercel logs.
- **#956 is a deliberate exemption, not an oversight.** ARC withdraw skips
  `requireActiveSubscriptionForMutation` on purpose — gating it would strand the row in
  `submitted` with no way out for either side. Recorded in the route docblock and at the
  call site.

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

- **Nothing is wired to analytics.** **Seven** call sites `console.info('[analytics] …')`
  behind **five** `// TODO: wire to analytics service` comments —
  `components/operations/operations-hub.tsx` (×5), `(authenticated)/maintenance/submit/page.tsx`,
  `(authenticated)/maintenance/inbox/page.tsx`. (This row said "five call sites"; five is
  the count of TODO *comments*. Re-measured 2026-09-09; it was wrong at authorship, not
  drifted.) There is no analytics service; those
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
| ~~`.claude/rules/tenant-isolation.md:26`~~ | ~~`ADMIN_ROLES: …`~~ | **FIXED 2026-09-07.** Replaced with a *Roles in a Scoped Query* section stating the real value (`['manager']`), the v3 three, the `isAdminRole`/`isElevatedRole` predicates, and that board status is a `designation`, not a role |
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

**Two things were deliberately NOT changed, and are the open remainder.** (A third —
the user-facing error string in `lib/onboarding/wizard-common.ts` — was fixed in #1101;
that line now reads *"Only a property manager or root manager can modify wizard state"*.)

1. **The `use-role-management.ts` over-fetch.** Fixing the inverted comment does not fix
   the behaviour: the hook still pulls the whole roster and partitions client-side, for a
   reason that no longer exists. A server-side `roles` filter works today. That is a
   behaviour change, not a comment fix.
2. **`packages/db/migrations/_archive/0023` and `0024`** still assert `requireAdminRole`
   and the retired names in the present tense. They are frozen historical artifacts;
   rewriting archived SQL is worse than leaving it. Recorded so the next reader does not
   re-open them.

### A dead triplet found in the same sweep — deleted 2026-09-08 (#1101)

`use-residents.ts`, its test, and `components/maintenance/AssignmentModal.tsx` were dead:
the hook sent a retired `?roles=` list that `GET /api/v1/residents` would have rejected
with a 400 on every call, and nothing rendered the only consumer. Its unit test **pinned
the broken value**, so the suite was green *because* the string was wrong — worth
remembering as a shape, which is why this line survives the deletion.

> `ADMIN_ROLES_PARAM` now appears **only inside this file**. When that is true of a
> symbol, the doc is the last thing in the repo referring to something that no longer
> exists, and the row should go with it.

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
