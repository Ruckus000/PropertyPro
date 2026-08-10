# Feature-correctness audit — do the mutations actually do the right thing?

**Date:** 2026-08-09
**Scope:** Mutations, not page loads. Statutory timing math above all.
**Predecessor:** `docs/audits/2026-08-07-pre-launch-readiness-audit.md` loaded 427
authenticated pages across 7 roles and found zero 500s. That established that pages
*render*. It exercised almost no writes, so nothing was known about whether the
writes are *correct*.

**Method.** A full local stack — Supabase CLI 2.113.0 on ports 545xx, all migrations
applied, `pnpm seed:demo` + `pnpm seed:verify` green — plus a `next dev` server on
:3000. Every claim below marked "verified" means a mutation was performed as a real
role over HTTP and the result was then read back out of Postgres and/or off the
reading user's API surface. Nothing here rests on a page rendering without an error.
Production was never written to except for the two-community cleanup in §6, which
was explicitly requested.

---

## 1. Headline

Nine defects. Eight are fixed in this branch with tests that fail before the fix and
pass after; one is documented rather than fixed because the correct behaviour is a
product decision. (D9 was found by the pre-merge code review — see §7.)

**The statutory timing math was the worst of it, and it had no unit tests at all.**
`apps/web/src/lib/utils/meeting-calculator.ts` — the file that computes the §718
48-hour and 14-day notice windows, i.e. the product's core compliance claim — had
zero direct test coverage before this audit. A property sweep over a year of start
dates found that a Monday-morning board meeting was assigned a notice deadline equal
to **its own start instant: zero hours of notice against a 48-hour statutory
minimum**, and owner meetings routinely lost two of their fourteen statutory days.

| # | Defect | Severity | Status |
|---|---|---|---|
| D1 | Notice deadlines roll the *wrong way* over weekends — up to 100% of the statutory lead time destroyed | **Critical** | Fixed |
| D2 | ARC denials accepted with no written reason (HB 1203) | **High** | Fixed |
| D3 | Live invitation tokens written into the board-readable, append-only audit log | **High** | Fixed |
| D4 | `tenants_only` announcements notified everyone, leaking title + body | **High** | Fixed |
| D5 | Public transparency page rounded a short notice up into "compliant" | **High** | Fixed |
| D6 | 30-day posting deadlines silently lose an hour to DST | Medium | Fixed |
| D7 | Deadline weekday is evaluated in the *server's* timezone, not the community's | Medium | Documented — [#931](https://github.com/Ruckus000/PropertyPro/issues/931) |
| D8 | Nothing warns or blocks when a meeting/hearing is scheduled inside its notice window | Medium | Documented — [#932](https://github.com/Ruckus000/PropertyPro/issues/932) |
| D9 | The 30-day posting rule existed in three copies; a production backfill script kept the bug | **High** | Fixed (§7) |

---

## 2. Statutory timing correctness

This was the highest-value item and it is where the real damage was.

### D1 — Notice deadlines rolled forward over weekends (Critical)

`apps/web/src/lib/utils/meeting-calculator.ts:7` applied a "deadlines landing on a
weekend roll forward to Monday" rule to **notice lead-time** deadlines. A lead-time
deadline is a *post this BY* date that sits **before** the event, so rolling it
forward moves it **later**, which can only ever shorten the notice period.

Measured, before the fix:

| Meeting | Statutory minimum | System's `noticePostBy` | Actual lead time |
|---|---|---|---|
| Board, Mon 2026-01-05 00:00 ET | 48 h | 2026-01-05T05:00Z | **0 hours** |
| Annual, Sat 2026-01-03 00:00 ET | 14 days | 2026-01-05 | **12 days** |
| Owner-vote docs, Sun 2026-03-08 | 7 days | 2026-03-09 | **5.3 days** |

Verified live before the fix (`POST /api/v1/meetings`, board meeting 24 h out):
`deadlines.noticePostBy` came back as `2026-08-10T04:00Z` for a meeting starting
`2026-08-11T01:35Z` — **21.6 hours**, reported without qualification.

**Fix.** Every deadline this module produces is a "post by" deadline, so the only
safe direction for a weekend roll is **earlier**. `adjustWeekendBackward` now rolls
to the preceding Friday. Same meeting now yields 72 hours instead of 0.

- `apps/web/src/lib/utils/meeting-calculator.ts:32` — `adjustWeekendBackward`
- `apps/web/src/lib/utils/meeting-calculator.ts:56` — `calculateNoticePostBy`
- Tests: `apps/web/src/lib/utils/__tests__/meeting-calculator.test.ts` (new, 14
  cases, including a sweep of 365 days × 6 start hours × 5 meeting types asserting
  the lead time never falls below the statutory floor)

### D6 — DST eats an hour of every 30-day window (Medium)

`addDays`/`subDays` from `date-fns` shift the **local calendar day**, so a "30-day"
window that crosses US spring-forward is 719 hours, not 720. §718.112(2)(c) speaks in
*continuous hours*. Proven: `calculateMinutesPostingDeadline(2026-02-18T18:00Z)`
returned 2,588,400,000 ms where 2,592,000,000 was required.

**Fix.** Lead times and posting windows are computed as exact elapsed milliseconds
(`shiftDays`, `meeting-calculator.ts:44`; `calculatePostingDeadline`,
`packages/shared/src/compliance/posting-deadline.ts`).

### The weekend rule on statutory *maximums* — removed, not reversed

`calculatePostingDeadline` (the §718.111(12)(g) 30-day document window) and
`calculateMinutesPostingDeadline` produce **maximums**. Rolling a weekend landing
forward advertised day 31 or 32 and let a posting made after the statutory date read
as `satisfied`. Rolling it *backward* would be safe but would advertise day 28, which
is also not the statute. §718.111(12)(g) grants no weekend exception, so the weekend
rule is not applied to these two at all — the deadline is exactly the statute.

Three pre-existing tests asserted the old roll-forward and were rewritten with an
explicit BEHAVIOUR CHANGE note rather than deleted
(`__tests__/compliance/compliance-calculator.test.ts`,
`__tests__/compliance/statutory-718-regression.test.ts`,
`__tests__/meetings/meeting-calculator.test.ts`).

### D5 — `Math.round` published a false compliance claim (High)

`transparency-service.ts` computed a meeting's notice lead time with `Math.round`,
so **47 h 31 m of notice was reported as 48 hours and `metRequirement: true`** — on
the association's *public* transparency page. Any notice up to 30 minutes short of
the statutory minimum was publicly certified compliant.

Verified live against a seeded meeting with exactly 47 h 31 m of notice:
before → `lead=48 required=48 met=true`; after → `lead=47 required=48 met=false`.
Exactly-48 h still reports compliant.

- `apps/web/src/lib/services/transparency-service.ts:244`
- Test: `apps/web/__tests__/services/transparency-service.test.ts`

### Boundary conditions checked explicitly

- **Exactly 30 days / exactly 48 h / exactly 14 days** → compliant. A posting whose
  timestamp equals the deadline is `satisfied` (`isAfter` is strict).
- **Deadline + 1 second** → `overdue`. Covered, including across the skipped
  spring-forward instant.
- **Leap year.** Jan 30 + 30 days is now exactly 30 elapsed days in both 2024 and
  2025. The non-leap case previously read 2025-03-03 — a Saturday rolled forward to
  Monday, i.e. 32 days.
- **DST spring-forward and fall-back.** Covered by explicit cases in both suites.

### D7 — Timezone: the community's `timezone` column is not consulted (Medium, documented)

`communities.timezone` exists and defaults to `America/New_York`, but neither
calculator reads it. `startOfDay`/`isWeekend` evaluate in the **server's** local
timezone — Eastern on this dev host, **UTC on Vercel** — so the same Miami meeting
can produce different deadlines on different hosts. This is real and it is
reproducible.

It is **not fixed here**, deliberately. The correct fix threads the community
timezone through `serializeMeetingResponse` → `buildMeetingDeadlines` → both
calculators, and it first has to settle a product question the code cannot answer:
*should the weekend rule exist at all*, given neither §718 nor §720 grants a weekend
exception. Guessing would be worse than documenting.

The severity is bounded by the D1 fix: because a weekend roll can now only move a
deadline **earlier**, a timezone disagreement costs an association up to two days of
margin — it can no longer cause a statutory shortfall. That reduction is what makes
deferring acceptable. Noted inline at `meeting-calculator.ts:50`.

### D8 — Nothing enforces the notice window at write time (Medium, documented)

Verified: `POST /api/v1/meetings` accepts an annual meeting three days out and
returns a `noticePostBy` that is already **eleven days in the past**, with no
warning field, no 4xx, and no flag on the response. Same for violations — the state
machine correctly refuses `reported → hearing_scheduled`, but once a violation is
`noticed`, a hearing can be scheduled three days out and the API accepts it.

There *is* a real guardrail on the violation path: the generated hearing-notice PDF
prints, in bold, `WARNING: This notice is being provided 3 days in advance of the
hearing. / Florida statute requires a minimum of 14 days advance notice.` Verified by
generating the PDF. That is a genuine backstop, though it warns the *owner* rather
than the association.

Not fixed: whether a short-notice meeting should be blocked, warned, or merely
flagged is a product decision (emergency board meetings are a legitimate case).

---

## 3. Mutations verified working

Everything in this section was performed as a real role and the result read back.

### Documents — fully verified end-to-end
- Uploaded a PDF to Supabase Storage, created the metadata row as CAM
  (`POST /api/v1/documents` → 200), listed it, requested a signed URL, fetched the
  URL, and **byte-compared the downloaded file against the original** — identical.
- Audit trail: `create` and `document_accessed` rows both written with the correct
  community.
- **Tenant isolation holds.** A community-2 document requested while scoped to
  community 1 → 404, for both a cross-member user and a non-member.
- **Path injection blocked.** `filePath: "communities/2/secret.pdf"` submitted under
  `communityId: 1` → 400 `filePath must start with communities/1/`.
- **Role write gate holds.** A resident's upload → 403.
- **Owner vs tenant subset is real, and it is enforced on download too.** Owner sees
  25 documents, tenant sees 14. The 11 owner-only documents return **404 on direct
  download** for the tenant — this is not list-only filtering.
- Soft-delete correctly unlinks the document from its compliance checklist item, and
  the item drops back to `unsatisfied`.

### Resident invitation — verified
Created a resident (`resident`, unit 2, `isUnitOwner=false`) → invited → accepted
with a password → role/unit binding correct in `user_roles` → token reuse rejected
with `TOKEN_USED`. One-time use is enforced.

### Violations — verified
Created → `noticed` → `hearing_scheduled` → hearing-notice PDF generated. The status
state machine is enforced (`reported → hearing_scheduled` rejected 422 with the
allowed transitions listed). Late-notice warning prints as described in D8.

### Announcements & emergency broadcast — recipient targeting
Created one announcement per audience and read the resulting `notifications` rows:

| Audience | Recipients | Correct? |
|---|---|---|
| `all` | all 6 | yes |
| `board_only` | board president + board member only | yes — sources from `designation`, not role, so a self-managed board resolves correctly |
| `owners_only` | the one unit owner | yes |
| `tenants_only` | **all 6** | **no — D4** |

Emergency broadcasts: `all` → 8 recipients, `owners_only` → exactly the one unit
owner. Correct.

### Finance crons — verified, including the arithmetic
- `generate-assessments`: 3 communities scanned, 6 correctly skipped as duplicates.
- `assessment-overdue`: 6 line items transitioned to `overdue`.
- `late-fee-processor`: applied **0** fees on the first run — and that is *correct*:
  the overdue items were 9 days past due against a 15-day grace. Forcing an item past
  grace produced exactly one $25.00 fee plus one matching `ledger_entries` row, and a
  second run applied nothing further. **Idempotent, and the grace boundary is right.**

### Compliance dashboard — verified reflects real state
16 checklist items, 13 satisfied / 3 unsatisfied. Linking the newly-uploaded document
moved the count to 14/2 and flipped that specific item to `satisfied`. Soft-deleting
the document returned it to `unsatisfied` with `documentId: null`.

---

## 4. Defects fixed in this branch

### D2 — ARC denial with no written reason (High)

HB 1203 requires an ARC/ACC denial to state the specific reason and identify the rule
or covenant relied on. **Verified live:** `POST /api/v1/arc/1/decide` with body
`{"communityId":1,"decision":"denied"}` returned **200** and persisted
`status: "denied", reviewNotes: null` — then notified the resident of an unexplained
denial. `reviewNotes` was `.nullable().optional()` with no conditional requirement,
and there was no check in the service either.

The task asked whether *the UI* enforces this. **There is no ARC write UI at all** ([#933](https://github.com/Ruckus000/PropertyPro/issues/933)).
`ArcSubmissionsTab.tsx` is read-only and nothing in `apps/web/src` calls
`/api/v1/arc/[id]/decide`, `/review`, or `/withdraw`. The four write endpoints exist
and are reachable; no screen drives them. That is a product gap worth its own ticket
— it also means the statutory requirement had no enforcement anywhere in the stack.

**Fix.** A `superRefine` on the contract rejects a denial whose `reviewNotes` is
absent or whitespace-only (400 `VALIDATION_ERROR`), plus a service-level check for
any other caller. Approvals are unaffected. The statute's *content* requirement
(citing the covenant) cannot be machine-verified; requiring a substantive written
reason is the part that can.

- `apps/web/src/app/api/v1/arc/[id]/decide/contract.ts:63`
- `apps/web/src/lib/services/violations-service.ts` (`decideArcSubmissionForCommunity`)
- Tests: `apps/web/__tests__/arc/decide-route.test.ts`

> One pre-existing test, `records a denied decision without reviewNotes`, asserted
> the defective behaviour. It is replaced, with the reason stated in-file.

Verified live after the fix: denial with no reason → 400 with the HB 1203 message;
denial citing `Declaration Art. VII §3` → 200.

### D3 — Live invitation tokens in the audit log (High, security)

`logAuditEvent({ resourceId: token })` wrote the **plaintext, unexpired** invitation
token into `compliance_audit_log`. That table is readable by every board member and
manager through `GET /api/v1/audit-trail`, and `PATCH /api/v1/invitations` turns a
token into a password for the invited account. **Verified: logged in as a board
member, called `/api/v1/audit-trail`, and read the live token out of the response.**
That is an account-takeover primitive against every pending invitee.

Made worse by `compliance_audit_log` being append-only by trigger: leaked rows cannot
be scrubbed. This is fix-forward only, and any tokens already in a production audit
log should be treated as compromised — expiring outstanding invitations is the
mitigation.

**Fix.** `resourceId` is now the invited user's id at all four call sites.

- `apps/web/src/app/api/v1/invitations/route.ts:106` and `:174`
- `apps/web/src/lib/services/onboarding-service.ts:221` (the shared helper behind
  `residents/invite` and `import-residents` — same defect, same fix)
- Tests assert no token-shaped string reaches any audit payload.

### D4 — `tenants_only` announcements went to everybody (High)

`RecipientFilter` had no `tenants_only` member, and the announcements route mapped
that audience to `'all'`. The **email** path (`announcement-delivery.ts:51`) and the
**in-app read visibility** path (`read-visibility.ts:127`) both handled it correctly
— only the notification-feed path did not, which is exactly why it survived.

Impact is a content leak, not just a stray badge: the notification row carries the
announcement title and the first 120 characters of its body. Verified in the
database — `board.president`, `board.member`, `owner.one`, `pm.admin` and
`root.manager` all held a row for a renters-only announcement, body text included.

**Fix.** `tenants_only` added to `RecipientFilter` and to `isRoleMatch` (a resident
who does not own their unit — mirroring the two paths that were already right), and
the route's mapping made 1:1.

- `apps/web/src/lib/services/notification-service.ts:55`, `:195`
- `apps/web/src/app/api/v1/announcements/route.ts:366`

Verified live after the fix: recipients are exactly the two non-owner residents.

---

## 5. Not tested, and why

- **E-sign, elections/e-voting, polls, Stripe billing.** E-voting is a documented
  blocking gate pending attorney review; Stripe needs test-mode price ids the local
  stack has no configuration for.
- **Email and SMS rendering/delivery.** The local env deliberately carries no
  `RESEND_API_KEY` or Twilio credentials, so `sendEmail` runs in test mode. Recipient
  *resolution* was verified via the persisted `notifications` and
  `emergency_broadcast_recipients` rows; the rendered message bodies were not.
- **Google Calendar / accounting OAuth connectors.** Require third-party credentials.
- **The ARC write UI.** It does not exist (see D2).
- **Mobile routes (`/mobile/*`) and the admin app.** Out of scope for this pass.
- **Real multi-user concurrency.** Every mutation here was single-actor.
- **The upcoming-notices public page.** `getTransparencyPageData` filters meetings to
  `startsAt <= now` (past 12 months), so the transparency page shows a *history* of
  notice compliance, not upcoming notices. Whether §718.111(12)(g) is satisfied by
  the separate `/public-notices` surface was not established and is worth a follow-up.

---

## 6. Production cleanup

Two leftover test communities soft-deleted as requested. Identity confirmed by
`SELECT` before writing; the `UPDATE` was guarded on both id **and** exact name.

| id | name | slug | `deleted_at` |
|---|---|---|---|
| 2358 | Big Mama's House | `big-mama-s-house` | 2026-08-10 02:09:53Z |
| 2359 | Big Mama's House 2 | `big-mama-s-house-2` | 2026-08-10 02:09:53Z |

Soft-delete, not hard: `compliance_audit_log` is append-only by trigger, so a hard
delete of a community is blocked by design. `scripts/reap-test-communities.ts` was
not used — it only matches known test slug patterns, and these do not match.

Each community had exactly one attached user role
(`ruthphilistin@gmail.com` / `ruthphilistin1@gmail.com`); those user records were
left untouched.

---

## 7. Post-review addendum

A code review and a security review were run over the branch before merge. The
security review found nothing. The code review found one real miss, and
revert-checking every test found two coverage gaps. All three are fixed in the
follow-up commit.

### D9 — the 30-day rule existed in THREE copies; the audit fixed one (High)

`calculatePostingDeadline` was independently reimplemented in
`scripts/backfill-compliance-templates.ts` and
`packages/db/src/seed/seed-community.ts`, both hand-rolled with `setUTCDate` and
both still rolling a weekend landing **forward** (Saturday +2, Sunday +1) — the
exact defect §2 fixed in `compliance-calculator.ts`. Neither imported the shared
function. `backfill-compliance-templates.ts` is an ops script that writes real
compliance-checklist deadlines against production data, so this was not
demo-seed cosmetics: a backfill run produced deadlines overstating the statutory
maximum by one to two days.

Fixed by making one implementation, in
`packages/shared/src/compliance/posting-deadline.ts`, with the reasoning beside
it. `compliance-calculator.ts` re-exports it so existing importers are
unaffected; the script and the seed now import it. Pinned by
`packages/shared/src/__tests__/posting-deadline.test.ts`.

> Fallout worth recording: `transparency-service.test.ts` mocked
> `@propertypro/shared` with a bare factory, so the newly-shared export became
> `undefined` at *call* time rather than failing at import — a green typecheck
> and 969 green files, one red test. Switched to spreading `importActual`.

### Two coverage gaps, found by revert-checking rather than by reading

Each fix was tested by deleting its production line and re-running. Two fixes
turned out to be **unprotected**:

- The **ARC service-level** HB 1203 check could be deleted with all 171 arc and
  violations tests still green — only the contract was covered.
- The **announcements audience → `RecipientFilter` mapping** — the actual site of
  the `tenants_only` leak — could be reverted to `'all'` with all 48
  announcements tests still green. Only the underlying `isRoleMatch` branch was
  covered.

Both now have direct tests. Final revert-check, one production line removed at a
time:

| Fix | Line reverted | Tests that go red |
|---|---|---|
| D1 weekend direction | `previousFriday` → `nextMonday` | 9 |
| D6 exact-ms lead time | `shiftDays` → `addDays` | 8 |
| D9 shared posting deadline | → old `setUTCDate` roll-forward | 7 |
| D5 lead-time rounding | `Math.floor` → `Math.round` | 1 |
| D2 ARC contract gate | `superRefine` removed | 2 |
| D2 ARC service gate | service check removed | 2 (was **0**) |
| D3 invitations `resourceId` | → `token` | 1 |
| D3 onboarding `resourceId` | → `token` | 1 |
| D4 `tenants_only` filter | `isRoleMatch` branch removed | 1 |
| D4 announcements mapping | → `'all'` | 1 (was **0**) |

One further test was rewritten rather than added: `applies weekend rollover
forward to Monday for post-by dates` used a meeting whose 14-day mark (a
Wednesday) never touched a weekend, so it passed regardless of roll direction and
would not have caught the original bug *or* the fix. Re-pointed at a start date
whose deadline genuinely lands on a Sunday.

## 8. Verification

```
pnpm typecheck                                   15/15 tasks successful
node scripts/run-lint-guards.mjs                 23/23 guards passed
DATABASE_URL=<stub> pnpm test                    11,431 passed | 27 skipped | 7 todo
```

Every fix in §2 and §4 was additionally re-verified against the running dev server
after the change, not only in unit tests.

**One verification trap worth recording.** After editing `notification-service.ts`,
the live re-test of D4 produced *zero* notifications rather than the expected two.
The unit test passed. The cause was a stale server-side module: Turbopack's dev HMR
had not picked up the change. A clean `next dev` restart produced the correct two
recipients. A live probe against a hot-reloaded dev server is not evidence — restart
before trusting one.
