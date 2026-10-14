# Ponytail Audit: 2026-10-13

**Date:** 2026-10-13
**Author:** Claude, multi-agent refactor-audit workflow, ponytail lens
**Status:** The audit itself changed no code. Fixes land in follow-up PRs; see the progress list at the top of Appendix E.
**Scope:** Commit `70cefc77a` (previous ponytail-lens audit: `07e56b6e7`). All eight dimensions ran: M (money), T (trust), W (writes), S (statute), P (scale), R (reuse), E (exist), C (truth). No dimension failed, and every verifier caught both of its planted canaries (16 of 16), so every verdict below is calibrated and no finding is UNCHECKED. The 2026-10-13 security audit's 22 findings are not re-filed here.

---

## 1. What this repo does

PropertyPro is a compliance and community-management platform for Florida condominium and HOA associations (§718.111(12)(g), §720.303). It is a Next.js 15 monorepo on Supabase Postgres, with a separate super-admin console, Stripe billing and Resend email. **Assumed load:** about 5 live communities, all demos, and no paying customers. The largest list is 26 rows. Stripe has been LIVE since about 2026-09-10 and the first paying customer is imminent, so **one real customer is enough load** for any money, privacy or statutory defect. Resident payments, fines, SMS and notice PDFs are disabled by a legal launch-gating decision.

## 2. Findings

65 findings survived verification (42 CONFIRMED, 15 CORRECTED, 6 SHRUNK, 2 DEFER, 0 REJECTED). Deduping on (primary file, failure class) leaves 60. The 20 headline items are below. Every other finding is in Appendix A, and the two DEFERs are in Appendix B.

### Must fix

**1. Deleted accounts keep signing in with every role: `ban_duration: 'none'` lifts a ban instead of setting one** (`apps/web/src/lib/services/account-lifecycle-service.ts:678`, T-01, W-01)
- **What this is:** `executeUserSoftDelete`, the cron step that runs after a user's 30-day deletion cooling period. It is meant to ban the GoTrue login. Privacy policy §5.2 (`content/legal/privacy.md:92`) promises the account "is deactivated and is no longer accessible".
- **Problem:** In supabase-js `'none'` means "lift the ban" (auth-js 2.95.3 `types.d.ts:434`). `demo-conversion.ts:184,519` bans with `'876600h'`. `user_roles` is kept, and no auth path reads `users.deleted_at`. `purgeUserPII` (`:738`) scrubs only `public.users`, so `auth.users` keeps the real email and password hash forever. The unit test pins the bug (`account-lifecycle-service.test.ts:738`).
- **Fix:** *correctness-fix*, about +8 lines. Use `'876600h'`. Add `updateUserById(user_id, { ban_duration: 'none' })` to the admin recover route (`apps/admin/src/app/api/admin/deletion-requests/[id]/recover/route.ts`), or a recovered user stays locked out. In `purgeUserPII`, also redact the `auth.users` email and metadata. Flip the test assertion and revert-check it. Keep `user_roles`, because restore needs them. Do this together with #20 so that only one recover path needs the unban.
- **If we skip it:** The first real user who deletes their account can still sign in 30 days later, and again after the 6-month "purge", with full roles. A root manager who acknowledged offboarding stays root.

**2. Volume-discount sync deletes every non-volume coupon on every subscription in the group** (`apps/web/src/lib/billing/volume-discounts.ts:28`, M-01)
- **What this is:** `applyVolumeDiscountToSubscriptions`, which runs on add-to-group provisioning, billing-group bootstrap, community cancel and the coupon-sync-retry cron. Its docblock promises to keep any coupon other than the volume one.
- **Problem:** `subscriptions.list` does not expand `discounts`, so every entry is a `di_…` string, and both helpers skip strings (`:65`, `:80`). Even when expanded, a Discount has only `source.coupon` and no top-level `coupon` (stripe@20.3.1 `Discounts.d.ts`). `preservedCoupons` is therefore always `[]`, and `update({ discounts })` (`:50`) replaces the whole list. The test feeds a Discount shape the API never returns.
- **Fix:** *correctness-fix*, −6 lines. List with `expand: ['data.discounts']`. Read the coupon id from `d.source.coupon`. Classify a discount as volume by the three tier coupon ids. Rebuild the list as `[...nonVolume.map(d => ({ discount: d.id })), { coupon: newId }]`, which reuses existing discounts by id and keeps a repeating coupon's elapsed duration. Delete the `deleteDiscount` branch. Fix the test fixtures to `{ id, source: { coupon } }`. In the same PR, fix admin `applyCoupon` (`billing-actions.ts:514`), which also strips the volume coupon, and `couponIdOf` (`:316-325`), which writes a `di_…` id into an append-only audit row.
- **If we skip it:** The first PM group that crosses 3, 6 or 11 communities, in either direction, silently loses every admin-applied coupon. The customer is overcharged, and the audit log still says the coupon is applied.

**3. Announcement and meeting-notice emails fire up to 100 concurrent sends against a 2 req/s limit, with no retry** (`apps/web/src/lib/services/announcement-delivery.ts:275`, P-01)
- **What this is:** The request-path email fan-outs: `deliverImmediateAnnouncementEmails` and `dispatchNotification` (`notification-service.ts:670-695`, which handles meeting notices, document-posted, violations and compliance alerts). Both run `Promise.all(sendEmail)` per recipient.
- **Problem:** Resend allowed 2 req/s when the repo measured it (`gate2-preflight-2026-02-16.md:79`). `sendEmail` throws on any error, and resend@6.9.2 has no retry. In a burst of N sends, roughly N−2 fail. Announcements mark those rows `failed` in a table nothing reads, and notifications only `console.error`. The default `emailFrequency` is `'immediate'`. PM bulk (`pm/bulk/announcements/route.ts:52`) multiplies the burst across communities.
- **Fix:** *rung 2, already in repo*, −8 lines. Replace both loops with `sendBulkEmail(payloads)` (`packages/email/src/send.ts:175`) and map `results[i]`, as `emergency-broadcast-service.ts:361` already does. Make the PM bulk route's `Promise.allSettled` a sequential `for…of`. Do not add a retry layer yet.
- **If we skip it:** The first real 25-unit condo's first announcement or owner-meeting notice reaches about 2 residents. The manager sees success.

**4. The admin Deletion Requests screen selects a column that `public.users` does not have, so it 500s as soon as one request exists** (`apps/admin/src/lib/server/deletion-requests.ts:121`, W-02)
- **What this is:** `getDeletionRequestsData`, which feeds `/deletion-requests` and its API. This is the operator's only UI for intervening on or recovering a deletion.
- **Problem:** It selects `raw_user_meta_data`, which is an `auth.users` column. `public.users` has `full_name`. A hand-written `AdminUserRow` (`admin-types.ts:126`) hides this from tsc, and every test mocks the function.
- **Fix:** *correctness-fix*, −12 lines. Select `id, email, full_name`. Delete `buildRequesterName` and correct `AdminUserRow`.
- **If we skip it:** The safety valve is dead the moment it is first needed. The 30-day window passes unattended, and 6 months later site assets and export archives are purged irreversibly.

**5. AGENTS.md tells agents to run integration tests against production** (`AGENTS.md:69`, C-01)
- **What this is:** The agent safety guide, which Codex sessions on this machine load as primary context.
- **Problem:** `:69` runs the integration suite through `scripts/with-env-local.sh`, which targets PRODUCTION. Five more claims are false: `:43` describes a weekend rollover that `posting-deadline.ts:14-23` deleted; `:31` claims journal drift (there are 90 files and 90 entries); `:67` says Build "depends on all 6" (it needs only perf-check); `:91` cites `pdf-parse`, which is not installed; and `:106`/`:114` describe the admin app as calling `/api/v1/admin` with `corsHeaders()`, which has 0 hits in `apps/admin/src`. `:34` and `:87` say to run `db:migrate`, which `migration-safety.md` forbids for prod.
- **Fix:** *rung 1*, −25 lines. Replace each false bullet with a one-line pointer to CLAUDE.md or `.claude/rules`. Change `:69` to `pnpm test:integration:local`.
- **If we skip it:** The next agent that "runs the integration tests" writes test communities into the production database, which has happened before. Or it restores a weekend roll that scores late postings as on time.

### Should fix

**6. Three private `apiFetch` copies drop the server's error message, so maintenance and violation failures show nothing** (`apps/web/src/lib/api/violations.ts:106`, R-01)
- **What this is:** Byte-identical `apiFetch` helpers in `violations.ts`, `maintenance-requests.ts` and `admin-maintenance.ts`, used by 11 calls.
- **Problem:** They read a top-level `message`, but `withErrorHandler` sends `{ error: { message } }`. The fallback `res.statusText` is `''` over HTTP/2, which production served when checked with curl on 2026-10-13. Every caller renders `{error && …}`, so nothing appears. #1349 fixed the same bug in `use-import-residents.ts`.
- **Fix:** *rung 2*, −39 lines. Delete the three copies and call `requestJsonEnvelope`. Its `{ data, warnings }` is a superset of their return shape. Add one test asserting that the server message surfaces.
- **If we skip it:** A rejected maintenance submission, comment, violation report or transition just stops spinning, and the user never learns why. (StatusUpdateForm is itself orphaned per E-08.)

**7. Every hearing date is stored as UTC midnight, so Florida viewers see the previous day at 8 PM** (`apps/web/src/components/violations/ViolationStatusTransition.tsx:193`, S-01)
- **What this is:** The hearing form submits `new Date('yyyy-MM-dd').toISOString()` into `violations.hearing_date timestamptz`.
- **Problem:** `ViolationDetailView.tsx:184` and `ViolationDetailPanel.tsx:121` render the value in the viewer's zone, so 2026-10-27 shows as "10/26/2026, 8:00:00 PM" (node probe). Residents see their own violations. The notice PDF has the same off-by-one, and the +1-day slack in `hearing-notice-warning.ts:64` exists only to absorb it. That slack hides up to 24 h of shortfall for any timestamped input. The PDF is behind `noticePdfGenerationEnabled`, which is off.
- **Fix:** *rung 2*, about +10 lines. Add a time field. Submit `wallClockValueToUtcIso(…, communityTimezone)` (the `meeting-form.tsx:214` precedent). Render with `formatDeadlineStamp` (`meeting-status.ts:93`). Delete the `+ DAY_MS` slack.
- **If we skip it:** The cited owner sees the wrong hearing day today. Once notices are enabled, a fine imposed after a mis-noticed hearing can be challenged.

**8. An undocumented `NEXT_PUBLIC_BASE_URL` falls back to localhost for a LIVE Stripe Checkout `return_url`** (`apps/web/src/app/api/v1/pm/communities/route.ts:60`, E-02)
- **What this is:** The live PM "Add community" flow, which creates an embedded Stripe Checkout session.
- **Problem:** `process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'` is read only here. It is absent from `.env.example`, docs and workflows. The sibling signup path (`lib/actions/checkout.ts:147-151`) derives the base from the Host header. Whether the var is set in Vercel was not readable.
- **Fix:** *rung 2*, +2 lines. Derive the base from the request host as `checkout.ts` does, and delete the localhost fallback.
- **If we skip it:** If the var is unset, a PM who has just paid lands on `localhost:3000` and may pay twice.

**9. A notice posted after its deadline shows a green success badge** (`apps/web/src/lib/meetings/meeting-status.ts:61`, S-03)
- **What this is:** `deriveMeetingStatus` and `describeMeetingStatus`, which drive the schedule table and the next-notice strip.
- **Problem:** Any `noticePostedAt` becomes `noticed` and paints the `compliant` (success) variant, labelled "Noticed Oct 12". `transparency-service.ts:259` computes `metRequirement=false` for the same row. The late case is untested.
- **Fix:** *correctness-fix*, +8 lines. In the `noticed` branch, compare against `deadlines.noticePostBy`. When the notice is late, return badge `overdue` with the label "Noticed late …", and add the late-notice test.
- **If we skip it:** A manager is told a 2-hour board notice (48 h minimum) is fine, and actions taken at the meeting are challengeable. The private and public views also contradict each other.

**10. The PM dashboard, PM report and overview cards score compliance differently from the community's own page** (`packages/db/src/queries/pm-portfolio.ts:421`, S-02)
- **What this is:** #1360 made `loadChecklistWithStatus` the single place item status is derived. The PM queries still score from "is `document_id` non-null".
- **Problem:** The three pm-portfolio queries (`:163-177`, `:417-428`, `:711-725`) never filter `is_applicable`. `cross-community.ts:149-166` ignores `postingClockApplies`, so a 20-unit condo shows "N critical".
- **Fix:** *rung 2*, −8 lines. Add `eq(isApplicable, true)` to the three WHERE clauses, and switch cross-community to `loadChecklistWithStatus`. The four admin copies are left alone (SHRUNK: they already skip not-applicable items).
- **If we skip it:** A PM sees a different score and critical count on the portfolio than on each community's page: contradictory statutory-compliance claims.

**11. Cancelling a running export is undone by the worker** (`apps/web/src/lib/services/export/export-job-service.ts:289`, W-03)
- **What this is:** `cancelExportJob` is status-guarded, but the worker's `saveJobProgress`, `markJobReady` and `markJobFailed` update `WHERE id = ?` only.
- **Problem:** A tick already in flight sets the job back to `running`, or to `ready` and sends the email. If the user re-requested in between, the partial unique index (`0058:79-81`) makes the tick 500.
- **Fix:** *correctness-fix*, +6 lines. Add `inArray(status, ['queued','running'])` to the three WHERE clauses. Skip the email when `markJobReady` affects 0 rows.
- **If we skip it:** A cancelled full-PII archive is built, stored and announced by email anyway.

**12. Admin demo DELETE destroys the auth users first, then fails on an FK and leaves an unusable demo** (`apps/admin/src/app/api/admin/demos/[id]/route.ts:103`, W-05)
- **What this is:** The hard delete behind the stale-demos banner.
- **Problem:** Auth users are deleted at `:95` with errors swallowed. `deleteCommunity`'s error is discarded at `:103`. `conversion_events` NO ACTION FKs (`0000:1605-1606`) block both deletes, and `deleteDemo` throws a 500. The test mocks both calls.
- **Fix:** *correctness-fix*, +4 lines. Replace the hard delete with the soft delete `expire-demos` already does (set `deleted_at` and ban the users), which also keeps the funnel data. Reordering alone only turns the failure into a clean refusal.
- **If we skip it:** Every admin demo deletion half-completes into an undeletable zombie that stays live on its subdomain.

**13. Snowbird digest: one failed send aborts the tick, and the 8 AM gate loses the rest for the week** (`apps/web/src/lib/services/snowbird-digest-processor.ts:197`, W-04)
- **What this is:** An hourly cron that sends owner digests only during the 8 AM local hour.
- **Problem:** Sends are serial with no per-recipient catch, and `sendEmail` throws (`send.ts:163`). The 9 AM tick fails the hour gate (`:154`). There is no idempotency key, and the processor has 0 tests.
- **Fix:** *rung 2*, +10 lines. Wrap each send in try/catch, count failures under `failed`, and pass `idempotencyKey: snowbird/${communityId}/${userId}/${localDate}` (`insurance-alert-processor.ts:309` precedent).
- **If we skip it:** Whole communities silently miss a week's digest, with possible duplicate sends.

**14. Platform-wide super_admin sign-in is one password factor with no MFA** (`apps/admin/src/middleware.ts:356`, T-02)
- **What this is:** Admin login calls `signInWithPassword` from the browser straight to GoTrue. The middleware then admits any session that has a `platform_admin_users` row.
- **Problem:** Security-audit open gap 2. Credential attempts never reach the app (`middleware.ts:36-42`), HIBP is off, and the `aal`/MFA grep over `apps/admin/src` is empty. One reused password gives control of every tenant, billing actions on live Stripe, and impersonation.
- **Fix:** *rung 3, platform*, about +110 lines. Use Supabase built-in TOTP. Require `aal2` in middleware step 7, add a small `/auth/mfa` enrol-and-challenge page, and mirror the check in `requirePlatformAdmin` (`platform-admin.ts:57`).
- **If we skip it:** The whole platform rests on one password. This exposure exists now: a platform admin exists.

**15. The plan-gate fix (#1368) missed elections** (`apps/web/src/lib/elections/common.ts:11`, T-03)
- **What this is:** `requireElectionsEnabled`, the gate for all 15 election handlers.
- **Problem:** It checks community type and `electionsAttorneyReviewed`, never the plan. `hasVoting` is Professional-only (`plan-features.ts:86`), and elections have 0 `requirePlanFeature` hits.
- **Fix:** *rung 2*, +17 lines. Make the helper async with `await requirePlanFeature(communityId, 'hasVoting')`, and await it at all 15 call sites. A missed `await` fails OPEN, so the revert-check must cover a call site.
- **If we skip it:** The day counsel clears an Essentials condo, it gets Professional e-voting through the API.

**16. Paying any line item marks an unrelated pending fine of the same amount as paid** (`apps/web/src/lib/services/finance-service.ts:2466`, M-03)
- **What this is:** `handlePaymentIntentSucceeded` calls `markMatchingViolationFinePaid(…, paymentAmount)` unconditionally.
- **Problem:** Fines are matched on unit and amount only. A $250 assessment payment marks a $250 fine paid and writes an append-only audit row. Even a genuine fine payment never matches, because `paymentAmount` includes the late fee (`:1142`) and the convenience fee (`:1051-1052`). Both tests mock the function.
- **Fix:** *rung 5, one line*. Call it only when `payable.assessmentId == null`, and pass `payable.amountCents`.
- **If we skip it:** Once fines and payments launch, violation records (statutory evidence) disagree with the ledger.

**17. Resident payments cannot launch as coded: one pre-launch bullet carries three money items** (`apps/web/src/app/api/v1/webhooks/stripe/route.ts:665`, M-02, M-04, C-05, M-06)
- **What this is:** Direct-charge finance events (`payment_intent.succeeded`, `charge.refunded`, `charge.dispute.created`) are created on connected accounts (`finance-service.ts:1194`).
- **Problem:** (M-02) Connect events need a Connect endpoint with its own secret. The route verifies only `STRIPE_WEBHOOK_SECRET`, and the cutover runbook registers nine platform events (`stripe-live-cutover.md:213-224`), so no payment would ever be credited. (M-04, C-05) The fence marker at `finance-service.ts:2121` names the trigger "3.T2 lands", which **fired** at `dc3c04f3f` (2026-09-30). (M-06) No `charge.dispute.closed` handler exists, so a won dispute leaves a phantom debt.
- **Fix:** *rung 1, doc only, now*. Add one bullet to the `LAUNCH-BLOCKERS.md:141` resident-payments row covering the Connect endpoint and secret, fence+writes in one transaction, and the dispute-won reversal. Rewrite the `:2121` marker's trigger to "a real community turns on `assessmentPaymentsEnabled`; prerequisite: a scoped-client transaction" and mirror it at roadmap line 96. At launch, the code is about 6 lines in the route plus a `verify-stripe-mode.ts` secret check.
- **If we skip it:** On launch day every online payment is collected but never credited, and the late-fee cron charges fees on paid items.

**18. Web's CSP would block every browser Sentry event** (`apps/web/src/lib/middleware/security-headers.ts:114`, R-02)
- **What this is:** Web's `connectSrc` for the shared `buildCspHeader`.
- **Problem:** The shared DSN host is `….ingest.us.sentry.io`. `*.ingest.sentry.io` cannot match it, and admin fixed this in #906. The defect is latent: the live web bundle for release `6054bfeb` (#1367, checked 2026-10-13) contains no `Sentry.init`, so `NEXT_PUBLIC_SENTRY_DSN` was unset at build and **web has no browser Sentry at all**. No dimension owns that larger gap (see Not checked).
- **Fix:** *rung 5*, +2 lines. Add `'https://*.ingest.us.sentry.io'` and extend `security-headers.test.ts:216`. Restore the DSN in the same change.
- **If we skip it:** Restoring the DSN still yields zero browser events, and the only signal is a CSP console warning.

**19. Three always-loaded agent-context files misstate the deploy and CI model** (`.claude/rules/migration-safety.md:41`, C-02, C-03, C-04)
- **What this is:** `migration-safety.md` (contract-migration timing), `.claude/phase-run/corpus.md` (injected into every phase-run prompt) and CLAUDE.md.
- **Problem:** `migration-safety.md:41` says deploys fire on push and that `ci.yml` is disabled. In fact `deploy.yml` runs on `workflow_run` of CI (#1155), and a cancelled CI deploys nothing (CI 38428661513 → Deploy 38429785066 skipped). `corpus.md:134` says CI runs no e2e (perf-check runs prod smoke with floor 11; `e2e.yml` runs 61). `:129` says auto-merge is off (`gh api` shows `allow_auto_merge=true`, 2026-10-13). `:23` narrows typecheck to apps/web. `CLAUDE.md:240-251,311` calls the prod-smoke set "localci" and "disjoint" (two specs are in both sets); `:256` says e2e runs only on PRs; `:385` claims `py-*` enforcement.
- **Fix:** *rung 1/5*, −12 lines total. Correct those lines only. For typecheck use `pnpm exec turbo run typecheck --force && pnpm exec tsc -p scripts/tsconfig.json`. **Not** `pnpm typecheck --force`, which fails with TS5093.
- **If we skip it:** An agent drops a column before the code stops reading it, or deletes a smoke spec without touching the required floor.

### Nice to have

**20. Callerless web `/api/v1/admin/{access-plans,deletion-requests}` routes are weaker twins of the admin console's routes** (`apps/web/src/app/api/v1/admin/deletion-requests/[id]/recover/route.ts:26`, T-04, W-07, E-07)
- **What this is:** Seven platform-admin routes on the web origin, with CORS for the admin origin. The admin app has served its own `/api/admin/*` since `08f1850fb` (2026-03-23).
- **Problem:** Nothing calls them. Their services have no status predicate: `recoverCommunity` (`:937`) undeletes a *purged* community, `interveneCommunityDeletion` (`:799`) strands a soft-deleted one past its purge, and `recoverUser` writes no audit row.
- **Fix:** *rung 1*, −1,670 lines. Delete the 7 routes, their contracts, the demo-convert tombstone, `admin-cors.ts`, `require-platform-admin.ts`, 8 test files, the `verify-scoped-db-access.ts:270` allowlist entry and the api-patterns catalog lines. Keep `interveneCommunityDeletion`, because `communities/delete` uses it.
- **If we skip it:** A second, unguarded door on irreversible lifecycle state stays open and must be re-audited in every census.

## 3. Verdict

The guarded core is sound. Route gates cover 446 web and 83 admin verbs (`guard:route-gates`, exit 0). The platform webhook, late-fee and coupon-sync paths are race-safe. The statutory deadline math is exact-millisecond, and the cron claims are atomic. The defects sit at **seams**: lifecycles finished on one side only (deletion ban and purge, the admin deletion screen, export cancel, demo delete), integrations whose tests mock the provider's shape (Stripe discounts, Resend rate limits), and about 15k lines of surfaces orphaned by refactors. All five must-fixes bite at a load of one: the first deletion, the first announcement, the first deletion request, the first billing-group tier change with a coupon, and the next agent session. Resident payments must stay gated until #17's bullet is closed. Ship #1–#5 first: together they are about 50 lines of net change.

## 4. Lean

**−15,044 lines and −7 dependencies possible** (`marked`, `@dnd-kit/utilities` and five codemirror packages, plus web's `cmdk` devDependency via E-09). That is the sum of `netLines` over the surviving non-deferred findings, counting each deduped group once. The correctness fixes add back +204, for **net −14,840**. Of the total,
**−12,694** needs no product decision; E-03 (−1,250) and E-04 (−1,100) wait on a product call.

## 5. Not checked

| Area | What was not checked | Dim |
|---|---|---|
| Production state | Any prod DB read: billing groups and coupons, deletion requests, soft-deleted users, `calendar_sync_tokens` and `accounting_connections` rows, failed `announcement_delivery_log` rows, `notification_sent` failedCount, whether `0062` is still unapplied | M T W P E C |
| Stripe / Resend / Vercel / Sentry | Live Connect endpoint and live coupons; `previous_attributes` on `charge.refunded`; Resend plan limit; Vercel env (`NEXT_PUBLIC_BASE_URL`, `OPERATIONS_HUB_CREATE_SHEETS`); Sentry events; GoTrue rate limits | M W P E T |
| **Unowned gap** | Web production build has no client Sentry DSN (release `6054bfeb`, 2026-10-13), so web has no browser error reporting at all | R (surfaced) |
| Money paths | `runAddToGroupProvisioning` end to end; add-to-group checkout double-click; `createPaymentIntentForLineItem` double-submit; Leases v3 rent generation; `handleDemoConversion` | M |
| Trust | ~57 admin route handlers beyond 4; non-API pages calling `requireAdminPageSession`; lapsed-subscription gating; internal cron routes | T |
| Writes | `runDemoSeed` `syncAuthUsers` path; storage-vs-row ordering for documents, e-sign and evidence; Stripe repair scripts; visitor-auto-checkout and inbox-spam-scan idempotency | W |
| Statute | Template citation accuracy (legal); elections internals beyond the gate; notice routes end to end; email and digest date rendering; `/mobile/meetings` | S |
| Scale | Site-editor client request sequencing; pool behaviour under P-01's 100-way `Promise.all`; Twilio fan-out; per-query prod latency | P |
| Reuse / exist | New non-id-ordered list endpoints (SVC-01 trigger); 39 formatDate copies for date-only parsing; `marked` vs `renderMarkdown` HTML; unused exports outside services; 61 admin API routes without UI caller; 8 heuristic orphan routes | R E |
| Truth | `phase-run.md`; 118 of 122 memory files; `pnpm test -- <path>` behaviour; DESIGN.md vs tokens.css; 13 untested guards' vacuity beyond two; agent-testing "lands in" column | C |
| All | No test suite was run by M, S, P; findings rest on source reading plus the listed evidence commands | — |

**Handoffs no dimension picked up:** `demo-conversion.ts:316-322` calls `generateLink`, which returns a link but never emails it, so the founding user of a converted demo gets nothing (T → correctness). Work orders cannot be updated or completed from the UI (E → product). The apartment dashboard's "open" definition differs from the condo dashboard's (P → W; not filed). Admin MRR ignores discounts (M → reporting). Board-seat residents see only their own violations in palette search (E → product).

---

## Appendix A. All surviving findings

H = headline number.

| ID | Sev | Verdict | Title | file:line | Rung | Net lines |
|---|---|---|---|---|---|---|
| T-01 / W-01 | must | CONF / CORR | H1 Soft-delete unbans; auth.users never purged | account-lifecycle-service.ts:678 | correctness | +8 |
| M-01 | must | CORR | H2 Volume sync strips all other coupons | billing/volume-discounts.ts:28 | correctness | −6 |
| P-01 | must | CORR | H3 Email fan-out vs Resend 2 req/s | announcement-delivery.ts:275 | 2 | −8 |
| W-02 | must | CONF | H4 Admin deletion screen selects missing column | admin lib/server/deletion-requests.ts:121 | correctness | −12 |
| C-01 | must | CONF | H5 AGENTS.md runs integration tests on prod | AGENTS.md:69 | 1 | −25 |
| R-01 | should | CONF | H6 apiFetch copies drop server errors | lib/api/violations.ts:106 | 2 | −39 |
| S-01 | should | CONF | H7 Hearing date stored as UTC midnight | ViolationStatusTransition.tsx:193 | 2 | +10 |
| E-02 | should | CONF | H8 Localhost fallback in live Checkout return_url | pm/communities/route.ts:60 | 2 | +2 |
| S-03 | should | CORR | H9 Late notice painted green | meetings/meeting-status.ts:61 | correctness | +8 |
| S-02 | should | SHRUNK | H10 PM compliance scores ignore is_applicable | db/queries/pm-portfolio.ts:421 | 2 | −8 |
| W-03 | should | CONF | H11 Export cancel undone by worker | export-job-service.ts:289 | correctness | +6 |
| W-05 | should | CONF | H12 Admin demo DELETE half-completes | admin demos/[id]/route.ts:103 | correctness | +4 |
| W-04 | should | CONF | H13 Snowbird digest aborts on one failure | snowbird-digest-processor.ts:197 | 2 | +10 |
| T-02 | should | CONF | H14 No MFA on super_admin | admin middleware.ts:356 | 3 | +110 |
| T-03 | should | CONF | H15 Elections skip plan gate | lib/elections/common.ts:11 | 2 | +17 |
| M-03 | should | CORR | H16 Fine matched by amount on any payment | finance-service.ts:2466 | 5 | +1 |
| M-02 | should | CONF | H17 No Connect webhook endpoint/secret | webhooks/stripe/route.ts:665 | 1 | +2 |
| M-04 / C-05 | nice / should | CONF / CONF | H17 Fence marker trigger fired; retarget | finance-service.ts:2121 | 1 / 5 | 0 |
| M-06 | nice | CONF | H17 No dispute-won reversal | finance-service.ts:2689 | 1 | +1 |
| R-02 | should | CORR | H18 Web CSP blocks regional Sentry host | middleware/security-headers.ts:114 | 5 | +2 |
| C-02 | should | SHRUNK | H19 migration-safety deploy model false | .claude/rules/migration-safety.md:41 | 5 | −3 |
| C-03 | should | CORR | H19 corpus.md CI/merge/typecheck facts false | .claude/phase-run/corpus.md:134 | 1 | −5 |
| C-04 | should | SHRUNK | H19 CLAUDE.md prod-smoke/padding/count claims | CLAUDE.md:246 | 1 | −4 |
| T-04 / W-07 / E-07 | nice | CONF / CORR / CONF | H20 Callerless, unguarded web admin twins | web v1/admin/…/recover/route.ts:26 | 1 | −1,670 |
| M-05 | nice | CONF | Late-fee waiver id-only UPDATE double-credits | finance-service.ts:1774 | 6 | +3 |
| T-05 | nice | CONF | Emails interpolated into log messages | demo-conversion.ts:322 | 5 | 0 |
| W-06 | nice | CORR | "3 AM" demo reset runs 12:12–17:15 UTC | .github/workflows/reset-demo.yml:6 | 5 | 0 |
| W-08 | nice | CONF | residents PATCH marker premise false (tx exists) | v1/residents/route.ts:317 | 2 | +4 |
| W-09 | nice | CONF | demo-enable-gates selects by slug, not is_demo | scripts/demo-enable-gates.ts:66 | 2 | −4 |
| S-04 | nice | CONF | Transparency months keyed in UTC | transparency-service.ts:302 | 2 | +4 |
| S-05 | nice | CONF | ARC writes lack status compare-and-swap | violations-service.ts:1138 | 2 | +6 |
| S-06 | nice | CONF | florida-compliance spec + fines-gate comment stale | .claude/rules/florida-compliance.md:15 | 5 | 0 |
| P-02 | nice | DEFER | Apartment dashboard full-table reads | queries/apartment-metrics.ts:191 | 2 | (−20) |
| R-03 | nice | CONF | 3 private isUniqueViolation copies | leases/lease-rules.ts:151 | 2 | −22 |
| R-04 | nice | CONF | ~15 formatDate copies equal format-date.ts | lib/utils/format-date.ts:18 | 2 | −95 |
| R-05 | nice | SHRUNK | Admin re-implements formatDollarsAsCurrency ×2 | admin KpiGrid.tsx:95 | 2 | −16 |
| R-06 | nice | CONF | Private requestJson copy | hooks/use-denied-visitors.ts:43 | 2 | −16 |
| R-07 | nice | CONF | Account settings hand-codes PASSWORD_POLICY | settings/account-settings-client.tsx:34 | 2 | −24 |
| R-08 | nice | SHRUNK | Four near-identical Sentry server configs | web sentry.server.config.ts:27 | 2 | −100 |
| R-09 / E-10 | nice | SHRUNK / CONF | Unused deps (marked, dnd-kit/utilities, codemirror ×5) | apps/admin/package.json:17 | 1 | −8 |
| R-10 | nice | CONF | cn defined three times | apps/web/src/lib/utils.ts:4 | 2 | −8 |
| E-01 | nice | CORR | Rollback flag can't reach client; hydration mismatch | operations/operations-hub.tsx:53 | 1 | −150 |
| E-03 | nice | CORR | Public access-request flow unreachable since #764 | access-requests/request-access-form.tsx:1 | 1 (product) | −1,250 |
| E-04 | nice | CORR | Community-cancel flow never rendered | communities/[id]/cancel/route.ts:32 | 1 (product) | −1,100 |
| E-05 | nice | CORR | Fake calendar/accounting connectors, 9 routes | lib/accounting/adapters.ts:91 | 1 | −4,700 |
| E-06 | nice | CONF | 5 superseded per-group search routes, drifted | search/violations/route.ts:44 | 1 | −800 |
| E-08 | nice | CONF | 12 modules with zero production importers | middleware/validate-upload.ts:34 | 1 | −2,200 |
| E-09 | nice | CONF | V1 command palette dead behind constant | layout/app-shell.tsx:40 | 1 | −258 |
| E-11 | nice | CONF | Unwired verify scripts (2 red) + no-op backfill | scripts/verify-integration-test-discovery.ts:1 | 1 | −880 |
| E-12 | nice | CORR | .env.example: 5 dead vars, 8 missing | .env.example:46 | 5 | +3 |
| E-13 | nice | CONF | feature-registry `audience` never read | constants/feature-registry.ts:71 | 1 | −52 |
| C-06 | nice | CONF | ponytail: convention undefined; 9–10 markers lack trigger | docs/superpowers/plans/2026-09-08-admin-console-redesign.md:15 | 6 | +3 |
| C-07 | nice | CONF | page-state-copy passes on missing root; token-freshness reverts files | scripts/verify-page-state-copy.ts:127 | 5 | −2 |
| C-08 | nice | CONF | design.md admin baseline numbers stale | .claude/rules/design.md:103 | 1 | −3 |
| C-09 | nice | CONF | ADR-005 says single localci/suite context | docs/adr/ADR-005-required-status-checks.md:7 | 5 | −3 |
| C-10 | nice | CONF | Memory: auto-merge "OFF", stale floors/migration | memory MEMORY.md:33 (outside repo) | 1 | −2 |
| C-11 | nice | CONF | LAUNCH-BLOCKERS stale ceiling/table/guard count | docs/LAUNCH-BLOCKERS.md:226 | 1 | −80 |
| C-12 | nice | CONF | LOAD_TEST_RESULTS.md is an all-TBD template | docs/LOAD_TEST_RESULTS.md:1 | 1 | −77 |
| C-13 | nice | CORR | /drain-loop skill + workflows cannot run | .claude/skills/drain-loop.md:28 | 1 | −1,416 |
| C-14 | nice | DEFER | Contract docblocks are changelogs | v1/notifications/read/contract.ts:4 | 1 | (−600) |

## Appendix B. Deferral ledger

This is the single home for every deferral. "Fired?" is taken from the C dimension and from the evidence in each finding. **Marker** says whether a future editor of the file must see a code marker.

| Item | Limit | Trigger (observable) | Fired? | Owner | Marker |
|---|---|---|---|---|---|
| Finance fence + writes not in one tx (`finance-service.ts:2121`) | Half-applied payment 500s forever | Was "3.T2 lands" → **retarget**: `assessmentPaymentsEnabled` true for a real community | **FIRED** (`dc3c04f3f`, 2026-09-30) | M | Update existing |
| Connect webhook endpoint + secret (M-02), dispute-won reversal (M-06) | Payments never credited; phantom debt | Same gate as above | No | M | LAUNCH-BLOCKERS bullet |
| 3.T2 11b Retry races generate-assessments | Duplicate line items | First real community enables assessments | No | M | — |
| 3.T2 11c `ledger_entries` unique key | Double post possible | Same | No | M | — |
| Stripe webhook `isRetry` in-flight re-run | Duplicate payment-failed email | "billing launch" (ambiguous after the 09-10 cutover) | Unclear | M | Restate trigger |
| `walkPaginated` 2,000-row cap (roadmap 3.8) | Truncated lists | `walk_paginated_truncated` Sentry event | No (max 26 rows) | P | — |
| Forum replies >500 / meetings >1,000 (3.7/3.8) | Unbounded reads | Data counts | No | P | — |
| P-02 apartment dashboard full reads | Linear dashboard cost | >2,000 maintenance_requests or >500 announcements in one apartment community, or p95 >1 s | No (≤15 rows) | P + W | **Add** in apartment-metrics.ts |
| Serial cron loops vs 300 s | Killed run, no resume | `cron_runs.last_duration_ms` >150,000 (column is written, never read) | No | P | — |
| Calendar reminders / digests at concurrency 8 | Delayed sends | `cron_job_reported_failures` with `rowsFailed`>0 | No | P | — |
| import-units:73, invitations batch, document-share:136 serial | Request duration | Any request >60 s | No | P | Add trigger to existing |
| residents/route.ts:317 no transaction | Unaudited write window | Premise false (W-08): fix rather than defer | n/a | W | Delete after fix |
| starter-pack-service.ts:137 | Re-applies pack to emptied site | A demo lives past the 30-day site_blocks purge | No | W | Add trigger |
| LeadsDashboard.tsx:288 | Missing lead field | Demo wizard gains a lead field | No | admin | Add trigger |
| getUser() skip (parked) | Middleware latency | p50 ≥75 ms post-launch | No (0 spans) | perf | — |
| Notice PDF routes (`violations/common.ts:94`) | Feature off | Counsel approves | No | S | Existing |
| `0062_secret_ballot` unapplied | Elections off | Attorney sign-off | No | S | — |
| finance-pdf encoding (#1250) | Garbled statement | Reported garble, or next edit of finance-pdf | No | R | — |
| FE-04 search combobox twins | Divergent fixes | A bug fixed in one twin only | No | R | — |
| SVC-01 cursor codecs | Non-id ordering | New non-id-ordered list endpoint | Unknown (not checked) | R | — |
| SVC-04 audit after write | Unaudited window | (per roadmap) | No | W | — |
| site-pages-service.ts:1055 draft-wins 4th copy | Drift | Copies diverge | No (identical) | R | — |
| CommunitySettingsEditor | Single-admin assumption | A second platform admin exists | Unknown (prod read) | admin | — |
| revenue-snapshot-chaos `it.todo` ×7 | Untested chaos | LAUNCH-BLOCKERS B2 | No | M | — |
| C-14 contract.ts changelog comments | Noise | Next functional edit of that contract.ts strips its drain lines | n/a | C | Rule in api-patterns.md, not per file |

## Appendix C. Load at which it bites (P)

| Path | Limit | Observable trigger | Now |
|---|---|---|---|
| Inline announcement / notification email (P-01) | Resend 2 req/s, no retry | Any `announcement_delivery_log.status='failed'`, or `notification_sent` failedCount >0 | 3+ immediate recipients; demos likely already hit it |
| Calendar reminders, digests (concurrency 8) | Same limit, retried ≤5 | `rowsFailed`>0 Sentry event | Self-observing |
| Invitations / document-share serial (≤100) | 300 s, about 2–3 req/s | Batch result `failed`>0 with "rate" | 30–60 s per 100 |
| All crons, serial over communities | 300 s, no resume | `last_duration_ms` >150,000 | Seconds (5 communities) |
| `walkPaginated` | 2,000 rows / 20 round trips | `walk_paginated_truncated` | 26 rows (77× headroom) |
| Apartment dashboard (P-02) | Linear in history | >2,000 rows or p95 >1 s | ≤15 rows |
| Forum / meetings lists | 500 / 1,000 | Data counts | Far below |
| Admin shell signal providers | Bounded + TTL cache | — | One operator, fine |
| Middleware getUser + Upstash | Per request | p50 ≥75 ms | Parked |
| JS route budgets | 1,160 KiB / 1,435 aggregate | perf-check | About 31 KiB headroom (#1365) |

## Appendix D. Agent-context truth table (C, plus S-06 and E-11)

| File | Claim | Status | Fix |
|---|---|---|---|
| AGENTS.md:69 | Integration tests via `with-env-local.sh` | FALSE (targets prod) | `pnpm test:integration:local` |
| AGENTS.md:43 | Weekend rollover, date-fns | FALSE | Pointer to florida-compliance.md |
| AGENTS.md:31 | Files may outnumber journal entries | FALSE (90 = 90) | Delete |
| AGENTS.md:67 | Build depends on all 6 | FALSE (perf-check only) | Pointer to CLAUDE.md CI |
| AGENTS.md:91 | `pdf-parse` dependency | FALSE | Delete |
| AGENTS.md:106,114 | Admin calls `/api/v1/admin`, uses `corsHeaders` | FALSE | Pointer to CLAUDE.md admin block |
| AGENTS.md:34,87 | Run `db:migrate` against target | DUPLICATED, contradicts | Pointer to migration-safety.md |
| migration-safety.md:41 | Deploy on push; ci.yml disabled | FALSE (#1155) | Rewrite sub-bullet |
| corpus.md:134 | CI runs no e2e | FALSE | Delete |
| corpus.md:129 | Auto-merge and branch delete off | FALSE | Delete |
| corpus.md:24 | ~20 guards | STALE (34) | "all" |
| corpus.md:23 | Typecheck apps/web only | DUPLICATED, contradicts | turbo + scripts tsc |
| CLAUDE.md:246,311 | Prod-smoke is localci, disjoint | FALSE | Attribute to perf-check |
| CLAUDE.md:256 | e2e.yml only on PRs | FALSE | Drop "only" |
| CLAUDE.md:385; design.md:33 | page-padding enforces `py-*` | FALSE | "root horizontal padding" |
| CLAUDE.md:63,82,463 | 72 files; 18th cron; 505/285 tests | STALE | Delete counts, point at source |
| design.md:103-106 | 12 admin files, 36 bare-focus-ring | STALE (7 files, 0) | Point at baseline JSON |
| ADR-005:7 | Single `localci/suite` context | FALSE | Status addendum |
| MEMORY.md:33 + 2 memories | Auto-merge OFF | FALSE | Correct |
| MEMORY.md | Next free 0089; floors 272 / 59 | STALE (0091; 271 / 61) | Keep commands, drop digits |
| LAUNCH-BLOCKERS.md:186,226 | tenant-scope ceiling removed | FALSE (156 since `1eff5b5f4`) | Delete B1 |
| LAUNCH-BLOCKERS.md:255 | wizard table kept | FALSE (0091 dropped it) | Delete row |
| LAUNCH-BLOCKERS.md:12,166 | 31/31, 29/29 guards | STALE (34) | Command, not count |
| florida-compliance.md:15,24 | Posted within 30 days of creation; calculator tracks notices | FALSE (S-06) | Describe code |
| violations/common.ts:70-72 | Fines gated for missing cap/committee | FALSE (both enforced) | Cite legal gating |
| integration README.md:24 | Discovery guard runs in lint | FALSE (E-11) | Delete with script |
| LOAD_TEST_RESULTS.md | Results | FALSE (template) | Delete; repoint 2 citers |
| drain-loop skill + api-patterns:170 | Batch tool for drains | FALSE (lane closed) | Delete (C-13) |
| (none) | ponytail: convention defined | Missing | 3 lines in verification.md (C-06) |

## Appendix E. Roadmap

**Progress (finding numbers from section 2):**
- #1–#5 (must fix): merged in #1369 (`ea149a357`), with the post-merge prod ban repair.
- #6–#13 (live-today should-fix): merged in #1370 (`eedd3cced`).
- #17, #19 (truth and fired trigger): the docs-truth PR after #1370.
- #14, #15 (security) and #20 (web admin twins): their own PRs after that.
- Not started: #16, #18, and the nice-to-have items other than #20.

The order follows dependencies, with fired triggers and must-fixes first. PRs 1–4 touch disjoint files and can run in parallel sessions. Re-fetch `origin/main` before each merge.

**PR 1: Truth and fired trigger (docs only).** C-01 (AGENTS.md), M-04/C-05 marker retarget, the M-02/M-06 LAUNCH-BLOCKERS bullet, C-02, C-03 and C-04. There is zero runtime risk, and it stops the next agent from writing to prod. Note: docs-only PRs get no required checks and merge only as admin (CLAUDE.md CI paragraph).

**PR 2: Deletion lifecycle.** W-02 select fix, then T-01/W-01 (ban `'876600h'`, unban in the admin recover route, purge `auth.users`), and in the same PR delete the web admin twins (T-04/W-07/E-07) so only one recover path needs the unban. Revert-check: restore `'none'` → one assertion goes red.

**PR 3: Email fan-out.** P-01 to `sendBulkEmail` in both services, plus a sequential PM bulk route. W-04's snowbird per-recipient catch and idempotency key can ride along, since it is the same email failure class in another file.

Then, in order:
4. M-01 volume discounts, plus admin `applyCoupon`/`couponIdOf`.
5. Live-today bugs: R-01, S-01, S-03, S-02, E-02, W-03, W-05.
6. Security: T-02 (MFA), T-03 (elections plan gate, revert-check one call site).
7. Latent money: M-03, M-05; R-02 together with restoring the web DSN.
8. Rung-1 deletions: E-05 (with its coupled `verify-route-gates.ts:116-117`, `verify-tenant-scope.ts` and floor edits), E-06, E-08, E-09, R-09/E-10, E-11, E-13, E-01, C-13, C-11, C-12, E-12. Raise E-03 and E-04 with product first.
9. Reuse: R-03, R-04, R-05, R-06, R-07, R-08 (keep the literal `app` tag for `guard:sentry-instrumentation`), R-10.
10. Remaining nice items: S-04, S-05, S-06, T-05, W-06, W-08, W-09, C-06–C-10.

**Standing veto (S):** do not merge the meeting and hearing notice rules into one engine, and do not replace the exact-millisecond deadline math with date-fns `addDays`/`subDays` (#931, #948).

## Appendix F. Method

**Dimensions:** M money, T trust (auth/privacy), W writes (data loss, idempotency, lifecycles), S statute (Florida timing and records), P scale, R reuse, E exist (dead code, deps, env), C truth (agent context, deferral markers, guard honesty). Each auditor filed findings with evidence commands, a failure scenario, a ladder rung and net lines. An **independent adversarial verifier** re-ran the evidence and returned CONFIRMED, CORRECTED, SHRUNK, DEFER or REJECTED. **Canaries:** each auditor's output had two planted findings: one *false* (a nonexistent path or symbol) and one that re-litigates a *settled* decision. A verifier that missed either would mark its dimension UNCHECKED and keep it out of the headline. All 16 were caught.

| Dim | Filed | Conf | Corr | Shrunk | Defer | Rej | Unchk | % removed/shrunk | Canaries | Dropped (considered) |
|---|---|---|---|---|---|---|---|---|---|---|
| M | 6 | 4 | 2 | 0 | 0 | 0 | 0 | 0% ⚑ | 2/2 | 13 |
| T | 5 | 5 | 0 | 0 | 0 | 0 | 0 | 0% ⚑ | 2/2 | 11 |
| W | 9 | 6 | 3 | 0 | 0 | 0 | 0 | 0% ⚑ | 2/2 | 11 |
| S | 6 | 4 | 1 | 1 | 0 | 0 | 0 | 17% | 2/2 | 14 |
| P | 2 | 0 | 1 | 0 | 1 | 0 | 0 | 50% | 2/2 | 11 |
| R | 10 | 6 | 1 | 3 | 0 | 0 | 0 | 30% | 2/2 | 13 |
| E | 13 | 8 | 5 | 0 | 0 | 0 | 0 | 0% ⚑ | 2/2 | 16 |
| C | 14 | 9 | 2 | 2 | 1 | 0 | 0 | 21% | 2/2 | 10 |
| **Total** | **65** | **42** | **15** | **6** | **2** | **0** | **0** | **12%** | **16/16** | **99** |

⚑ **Flag: nothing was removed, shrunk or deferred in M, T, W or E.** For M, T and W every finding is a real correctness or security defect, so that is plausible. E's five CORRECTED verdicts were mostly severity downgrades (E-01, E-03, E-04 and E-05 dropped to nice) and missing coupled guard edits (E-05), which this table does not count as shrinkage. Across all dimensions no real finding was REJECTED, so the verifiers' rejection power is shown only by the canaries.

**Coverage gaps:** no dimension owns *correctness* outside money and writes, or *observability*. The two biggest unowned items found in passing are the missing web client Sentry DSN and the demo-conversion magic link that is never sent (§5). No dimension read production, Vercel env or the Stripe dashboard, by rule. W-06's run count is 28 scheduled runs among the 30 most recent (verifier correction), and W-07's evidence `wc` needed `find -print0` under zsh.
