# Comprehensive Security Audit — 2026-10-13

**Scope:** `apps/web`, `apps/admin`, `packages/*` (Next.js 15 App Router, Supabase/Postgres
+ RLS, Drizzle ORM, Stripe, Resend, Twilio, Supabase Storage). Pre-launch, **Stripe LIVE**,
first real customer imminent.

**Method:** A read-first, multi-agent audit (ponytail methodology — read exhaustively,
recommend minimally, prove risky logic, rank by priority, report residual risk). Seven
dimension auditors (two sweeping all **70 `createUnscopedClient` files / 239 call sites**,
plus auth/session boundary, client-side/XSS/supply-chain, tokens/links/abuse,
payments/billing, and data-layer/RLS/admin/PII) produced candidate findings; every
medium-or-higher finding was re-tested by an **independent adversarial verifier**
(CONFIRMED / PLAUSIBLE / REFUTED); a completeness critic flagged uncovered surfaces. The
lead auditor then **independently verified** the highest-stakes claims against primary
sources (code, live Supabase advisors + storage config, and the real published CVE
advisories) before this report — several agent claims were corrected in that pass (see
§ Verification corrections).

**Prior art built on, not repeated:** `docs/SECURITY_AUDIT.md` (2026-02 baseline: CORS, CSP,
header sanitization, Zod, error sanitization — all landed), `docs/audits/2026-09-28-route-authz-census.md`
(route gating + the open deferrals, re-judged here against launch).

---

## Executive summary

PropertyPro is a **strong, disciplined codebase.** This audit found **no confirmed
cross-tenant data breach reachable by a normal attacker today.** Both independent sweeps of
all 70 unscoped-DB-client files concluded tenant isolation is actually enforced
(membership/role re-check, own-row binding, webhook-signature/cron gating, or public-site
data only). Stripe handling, webhook signatures, input validation, output sanitization
(DOMPurify at every `dangerouslySetInnerHTML`), storage path-scoping, and Sentry PII
scrubbing are all well built. Two scary-sounding candidates — a "Next.js middleware bypass"
and the stranded secret-ballot migration — were **refuted as attacker-reachable security
issues** on close reading (details below).

The concentrated risk is narrow:

1. **One genuinely high item (dependency + a privileged image path).** `sharp@0.34.5`
   decodes attacker-controlled image bytes inside the privileged Node process (the one
   holding the RLS-bypassing DB connection), using native decoders with **real, published
   2026 CVEs** including a libheif advisory that mentions possible RCE on glibc Linux
   (Vercel's platform). The document draft-image route trusts the client-declared
   `Content-Type`, so a manager can route a disguised AVIF/HEIF/SVG/TIFF straight to the
   vulnerable decoder. **Fix: bump `sharp` to ≥0.35.5 and magic-byte-validate that route.**

2. **Four mediums, all "fix-before-first-customer":** a **confirmed plan-gate bypass**
   (Essentials managers can unlock Professional features via direct API calls — revenue
   leak, same-tenant); an **unauthenticated email-amplification flaw** on the public
   access-request endpoint (bomb arbitrary inboxes under a customer's brand, burning the
   shared Resend domain reputation); a **confirmed open redirect** (backslash bypass in the
   `returnTo` validator → post-login phishing on trusted subdomains); and a **latent
   finance-webhook gap** that permits cross-tenant ledger corruption *once resident payments
   launch*.

3. **Two more real dependency advisories** (both one-line bumps closing published
   HIGH-rated CVEs): `drizzle-orm@0.45.1` → **0.45.2** (identifier-injection SQLi) and
   `prosemirror-view@1.41.8` → **1.42.3** (paste XSS).

4. **~16 low/info hardening items** — most actionable: flip the Supabase leaked-password
   toggle, close the cross-tenant draft-site `?preview=true` leak, add the `queryById`
   scope guard, `import 'server-only'` on the admin client, filter demo communities out of
   public search, and resolve consent-IP from `x-real-ip`.

**Recommended sequence:** fix the `sharp` path + the three confirmed mediums (#2–#4) + the
dependency bumps before the first paying customer; close the finance-webhook account binding
before enabling resident payments; batch the dependency bumps in one PR.

---

## Posture assessment

Genuinely strong. Tenant isolation rests on `createScopedClient` WHERE-injection + route-level
`requireCommunityMembership`/`requirePermission`, and the two unscoped-client sweeps confirmed
it is followed at all 70 unsafe sites. The risk surface is (a) one privileged native-image
path on an out-of-date library, (b) authorization gaps that are same-tenant/revenue or
abuse/reputation rather than isolation breaks, and (c) a cluster of **latent** findings that
are safe in today's shipping configuration but fail open the moment a plausible future change
lands (resident payments, a new global-table `queryById` caller, a new mutating Server Action,
enabling Sentry Replay). The team already documents these in-code; the next maturity step is
turning remembered invariants into enforced guards and bumping three outdated runtime deps.

---

## Verification corrections (what I checked first-hand, and what changed)

The raw agent output was not taken at face value. Independent checks:

- **`sharp` CVEs are REAL** (I was initially skeptical — they post-date the model's training).
  [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) (CVE-2026-33327/33328/35590/35591,
  libvips GIF/TIFF/VIPS loaders, CVSS 7.3, fixed 0.35.0) + a libheif advisory mentioning
  possible RCE on glibc Linux + a librsvg advisory; **target ≥0.35.5.** The draft-image
  route's client-`Content-Type`-only check was confirmed verbatim
  ([route.ts:77,97](apps/web/src/app/api/v1/documents/drafts/[id]/images/route.ts:77)).
- **`drizzle-orm` and `prosemirror-view` advisories are REAL** ([CVE-2026-39356](https://advisories.gitlab.com/npm/drizzle-orm/CVE-2026-39356/) fixed 0.45.2;
  [CVE-2026-104847 / GHSA-c8x8-7fp4-3x9w](https://discuss.prosemirror.net/t/xss-vulnerability-found-in-prosemirror-view/9067) fixed 1.42.3). Installed versions confirmed in `pnpm-lock.yaml`.
- **REFUTED — "Next.js middleware bypass" (not a finding):** the headline exploit misattributed
  CVE-2025-29927 (fixed well below the installed `next@15.5.12`, and Vercel-exempt); the only
  in-window middleware bypass needs Turbopack, but production builds with webpack. Worth
  bumping `next` as hygiene, not a vulnerability.
- **REFUTED (as a *security* finding) — stranded `0062_secret_ballot`:** confirmed unapplied
  (ledger jumps 0061→0063; `election_ballots` still has `voter_hash`/`unit_id`/`submission_id`/
  `proxy_id`). But it is **not attacker-reachable**: elections are 403-gated by
  `electionsAttorneyReviewed` (absent on all prod communities), the Data API is revoked on
  `election_ballots`, and the table has 0 prod rows. It is a **correctness/launch landmine**
  (first ballot would 500; ballots non-secret at storage) — keep it on the operational
  launch-blocker list, not the security list.
- **Storage buckets verified** via live query: `documents`, `community-exports`, `maintenance`
  are **private**; `community-assets` / `community-site-assets` are public **by design** and
  restricted to `image/jpeg|png|webp` (no SVG). The signed-URL model's precondition holds.
- **Supabase security advisors (live):** no `rls_disabled_in_public`; the 24
  `rls_enabled_no_policy` are intended deny-all tables; `auth_leaked_password_protection`
  **disabled** (WARN); `extension_in_public` (btree_gist, pg_trgm) WARN; 7 SECURITY DEFINER
  functions anon/authenticated-executable (all search-path-pinned and non-escalating — not fixed).

---

## Findings (ranked; 22 survived adversarial verification, 24 raised)

Severity reflects **contextual** exploitability in the shipping configuration, not just the
upstream advisory rating.

| # | Sev | Status | Finding | Fix-when |
|---|-----|--------|---------|----------|
| 1 | **High** | CONFIRMED | `sharp@0.34.5` decodes attacker bytes in the privileged process (real libvips/libheif/librsvg CVEs); draft-image route trusts client `Content-Type` | before first customer |
| 2 | Med | CONFIRMED | Plan-gate bypass: polls / forum / calendar-sync / accounting-connector guards check community **type**, not **plan** | before first customer |
| 3 | Med | CONFIRMED | Public access-request submit is email-bombable (branded OTP to arbitrary inboxes); in-memory write tier, not the claimed auth tier | before first customer |
| 4 | Med | CONFIRMED | `returnTo` validator blocks `//` but not `/\` (backslash) → open redirect / post-login phishing | before first customer |
| 5 | Med | PLAUSIBLE | Resident-payment (Connect) webhook trusts `metadata.communityId` without binding to `event.account` → latent cross-tenant ledger corruption | before resident payments |
| 6 | Low | PLAUSIBLE | Any authenticated user can read any community's **unpublished site pages/blocks/draft branding** via `?preview=true` | accept-with-mitigation |
| 7 | Low | PLAUSIBLE | Supabase Auth leaked-password protection (HIBP) disabled | quick win |
| 8 | Low | PLAUSIBLE | Access-request submit is an unauthenticated community-membership **enumeration oracle** | quick win |
| 9 | Low | PLAUSIBLE | Public community search returns **demo communities** and every customer, no `is_demo` filter / listing opt-in | quick win |
| 10 | Low | PLAUSIBLE | `prosemirror-view@1.41.8` paste XSS (CVE-2026-104847, fixed 1.42.3) — self-XSS, server re-sanitizes | dep bump |
| 11 | Low | PLAUSIBLE | `drizzle-orm@0.45.1` identifier-injection SQLi (CVE-2026-39356, fixed 0.45.2) — no confirmed dynamic-identifier path | dep bump |
| 12 | Low | PLAUSIBLE | `resolveClientIp` trusts first `X-Forwarded-For` hop → forgeable statutory **consent-IP** evidence | quick win |
| 13 | Low | PLAUSIBLE | CSP uses `script-src 'unsafe-inline'` (no nonce) → no XSS backstop behind single-layer DOMPurify | hardening |
| 14 | Low | PLAUSIBLE | No-login unsubscribe mutates on GET with non-expiring, non-single-use tokens (prefetch/CSRF-via-GET) | hardening |
| 15 | Low | PLAUSIBLE | `/api/v1/upload` presign has no MIME allowlist and no per-community quota | hardening |
| 16 | Low | PLAUSIBLE | `scoped-client.queryById` omits the `assertScopedRead` guard its sibling reads enforce (latent) | quick win |
| 17 | Low | PLAUSIBLE | `read_only` support-session mutation block is `isApi`-gated → Server Actions uncovered (latent) | hardening |
| 18 | Low | PLAUSIBLE | Service-role `createAdminClient` lacks `import 'server-only'` | quick win |
| 19 | Low | PLAUSIBLE | `units.rent_amount` derived-column rule unenforced on INSERT (`POST /units` accepts `rentAmount`) | hardening |
| 20 | Low | PLAUSIBLE | Sentry Replay is inert but config + two docblocks assert it runs at 100% → latent PII landmine if someone "completes" it | hardening |
| 21 | Info | PLAUSIBLE | 5 internal SECURITY DEFINER functions EXECUTE-able by anon/authenticated (search_path pinned; not exploitable) | optional |
| 22 | Info | PLAUSIBLE | `phone/verify/send` SMS-pumping (authenticated, 60s/account cooldown, globally kill-switched — inert at launch) | before SMS launch |

### Detail on the actionable items

**#1 — `sharp` native-image decode (HIGH, CONFIRMED).**
`apps/web/src/app/api/v1/documents/drafts/[id]/images/route.ts:77` validates only the
client-supplied `file.type` against `{png,jpeg,webp,gif}`, then `:97` calls `sharp(inputBytes)`.
libvips sniffs the *true* format, so an AVIF/HEIF (libheif, RCE-relevant), TIFF, or SVG
(librsvg) payload mislabeled `image/png` reaches the vulnerable decoder inside the
RLS-bypassing process. (GIFs are passed through untouched in this route, so the GIF-loader CVE
is reached instead via the maintenance-photo thumbnail path,
[photo-processor.ts](apps/web/src/lib/services/photo-processor.ts).)
**Fix:** bump `sharp` to ≥0.35.5 (closes all cited CVEs), and replace the `file.type` check with
the repo's existing magic-byte validator (`detectFileTypeFromBytes`,
`apps/web/src/lib/documents/file-validation.ts`) so the declared type is verified against the
bytes; optionally `sharp.block()` the SVG/HEIF loaders.

**#2 — Plan-gate bypass (MED, CONFIRMED).**
[polls/common.ts:6-18](apps/web/src/lib/polls/common.ts:6),
[accounting/common.ts:6-11](apps/web/src/lib/accounting/common.ts:6), and
`calendar/common.ts` all call `getFeaturesForCommunity(membership.communityType)` — community
**type** — never `requirePlanFeature`. An Essentials-plan condo/HOA (type grants the feature
unconditionally) that calls `POST /api/v1/polls`, `/forum/threads`, `/accounting/connect`, or
`/calendar/google/connect` directly obtains Professional-tier features. Same-tenant revenue
leak, no isolation impact. **Fix:** add `await requirePlanFeature(membership.communityId, '<flag>')`
to each helper, exactly as finance/violations/logistics already do (`membership` already
carries `communityId` + plan — no new query).

**#3 — Access-request email bomb (MED, CONFIRMED).**
`POST /api/v1/access-requests` is public (`TOKEN_AUTH_ROUTES`); each call emails a branded OTP
to the caller-chosen address from the production Resend domain and the resend branch re-mails
indefinitely. The only throttle is the **in-memory per-isolate write tier** (30/min) — *not*
the Redis-backed auth tier the in-code comment at
[access-request-service.ts:119-122](apps/web/src/lib/services/access-request-service.ts:119)
claims. CSRF/Origin is skipped (token-auth route); no session needed. Burns the shared
sending-domain reputation that every customer's statutory mail depends on. **Fix:** classify
this POST into a Redis-backed distributed tier (mirror the `roster-imports` block in
`classifyRoute`) + a per-destination-address cap via the existing `consumeKeyedRateLimit`
helper; correct the false comment.

**#4 — `returnTo` open redirect (MED, CONFIRMED).**
[auth.ts:19](apps/web/src/lib/utils/auth.ts:19): `raw.startsWith('/') && !raw.startsWith('//')`
accepts `/\evil.com`, which the WHATWG URL parser (Next router / `<a href>`) resolves to
`https://evil.com/`. Sinks: `login-form.tsx` `router.replace` (post-sign-in) and the public
`auth/verify-email` page `<Link href>` (one-click, no sign-in). A credential-harvest
springboard on a trusted association domain. **Fix:** in the shared helper, reject a second
`/` or `\` and control chars — e.g. accept only `/^\/(?![/\\])/.test(raw) && !/[\u0000-\u001f]/.test(raw)`
— and apply the same to `safeReturnTo` for defense in depth.

**#5 — Finance Connect webhook account binding (MED, PLAUSIBLE, latent).**
`handlePaymentIntentSucceeded` / `handleChargeRefunded` / `handleChargeDisputeCreated`
(`finance-service.ts:2300-2765`) read `communityId` from PaymentIntent `metadata` and never
compare `event.account` to that community's stored connected-account id (the
`requireConnectedAccountId` helper exists but is called in none of the three). With Connect
STANDARD + direct charges, an onboarded operator of A can fire a signature-valid event carrying
`metadata.communityId = B` and corrupt B's ledger/payable status. Inert today (payments
pre-launch, 0 connected accounts). **Fix:** in each handler, `const expected = await requireConnectedAccountId(communityId); if (event.account && event.account !== expected) return;`
(skip, don't throw) + a unit test. Close **before enabling resident payments**.

**#6 — Cross-tenant draft-site preview (LOW, PLAUSIBLE).**
[middleware.ts:622](apps/web/src/middleware.ts:622): `canPreviewDrafts = isPreviewRequest && middlewareUser != null`
— gated on *signed-in*, not *may edit this community's site*. Any authenticated user can read
any community's unpublished `site_pages`/`site_blocks`/draft branding via its subdomain +
`?preview=true`. Bounded to website-builder content (documents/meetings/announcements always
read the published set). **Fix:** gate the `x-preview` stamp on an edit-rights membership
lookup in the resolved community, or a signed community-scoped preview token (the code comment
already names the token as the real fix).

**Dependency bumps #10/#11** — add pnpm overrides mirroring the existing
`isomorphic-dompurify>*` pattern: `"@tiptap/pm>prosemirror-view": ">=1.42.3"` and bump
`drizzle-orm` to `^0.45.2`. (No client-controlled `sql.identifier()`/`.as()` path was found in
a quick scan, so #11 is a hygiene bump; still worth it given the privileged connection.)

**Quick-win one-liners #16/#18/#9/#12** —
`assertScopedRead('queryById', table)` as the first line of `queryById`
([scoped-client.ts:345](packages/db/src/scoped-client.ts:345));
`import 'server-only'` atop `packages/db/src/supabase/admin.ts`;
`eq(communities.isDemo, false)` in `searchPublicCommunities`;
resolve consent IP from `x-real-ip` (reuse `extractClientIp`) in `notice-consent`, `invitations`, `esign/sign`.

---

## Completeness-critic gaps — verify before launch

These are surfaces no dimension fully covered, or facts not confirmable from code:

1. **Upstash Redis provisioning in prod.** The security rate-limit tiers (auth/esign-sign/
   roster-imports) **degrade to per-isolate in-memory** when `UPSTASH_REDIS_REST_URL`/`_TOKEN`
   are unset (confirmed in `distributed-rate-limiter.ts` — degrade, not fail-open). If unset in
   prod, every "distributed" brute-force bound on login/OTP/signup collapses. **Verify:
   `vercel env ls` on the web project.**
2. **Admin-app sign-in throttle.** `apps/admin` grants platform-wide `super_admin`; confirm its
   login path has a distributed throttle, not just the per-isolate in-memory limiter. (Admin
   API routes were enumerated — 61 files, each references a gate — but not every verb was
   proven per-verb.)
3. **Cross-event finance idempotency.** The Stripe webhook fence dedupes per `event.id`; two
   distinct signature-valid events for the same charge (`charge.succeeded` +
   `payment_intent.succeeded`) both clear it, and `ledger_entries` has no unique key — confirm
   handlers are idempotent on the payable/charge object before resident payments launch.
4. **App-layer log injection / PII in structured logs** — not swept; confirm user free-text is
   logged as structured fields, not concatenated into message strings.
5. **Stripe `constructEvent` raw-body** — *confirmed* during this audit (reads `req.text()` and
   verifies before trusting `event.type`); listed here only because the workflow flagged it as
   unaudited by its dimensions.

---

## Residual risk / out of scope / accepted deferrals

- **Out of scope (not resolved here):** Florida statutory/legal adequacy (secret-ballot as a
  legal matter, §718.128 attorney-review gate, SIRS/notice timing), infra dashboard toggles
  beyond the one Supabase leaked-password setting, load/DoS testing, and the build-time-only
  dependency advisory cluster (`@sentry` bundler plugins → rollup/terser/braces etc., which do
  not execute while serving requests).
- **Static-only / latent (safe today, depend on a future change):** #5 finance-webhook (needs
  resident-payments launch + a connected account), #16 `queryById`, #17 read-only support
  Server Actions, #20 Sentry Replay. The two unscoped-client sweeps traced 70 files statically
  (not dynamically); shared gate-helper internals (`requireCommunityMembership`,
  `resolveEffectiveCommunityId`, `requirePlanFeature`) were assumed correct — a bug there would
  be systemic and is the highest-value target for a follow-up.
- **Accepted census deferrals re-judged at launch:** #6 preview, #14 unsubscribe-GET, #15
  upload-quota/MIME, #22 SMS-pumping — each is low/reversible or inert in the shipping config;
  acceptable to defer **if documented**, with the trigger (first real customer / enabling SMS)
  recorded.

---

## Recommended remediation sequence

1. **Now (this engagement, confirmed HIGH + bundled dep bumps):** bump `sharp` ≥0.35.5 +
   magic-byte-validate the draft-image route (#1); bump `drizzle-orm` ≥0.45.2 (#11) and add the
   `prosemirror-view` ≥1.42.3 override (#10) in the same dependency PR; bump `next` as hygiene.
2. **Before the first paying customer (mediums):** plan-gate (#2), access-request rate-limit +
   comment (#3), `returnTo` validator (#4); the quick-win one-liners (#7 toggle, #9, #12, #16,
   #18); verify Upstash is provisioned (gap 1) and the admin login throttle (gap 2).
3. **Before resident payments:** finance-webhook account binding (#5) + cross-event idempotency
   (gap 3).
4. **Hardening backlog:** nonce-based CSP (#13), unsubscribe GET→POST (#14), upload MIME/quota
   (#15), support-session Server-Action guard (#17), `rent_amount` INSERT (#19), Sentry-Replay
   doc/config truth (#20). Plus the operational launch-blocker (not security): apply
   `0062_secret_ballot` as a hard precondition before enabling e-voting.

---

*Audit conducted read-only; no production data was mutated. Dependency advisories verified
against primary sources on 2026-10-13. Severities are contextual to the shipping configuration.*
