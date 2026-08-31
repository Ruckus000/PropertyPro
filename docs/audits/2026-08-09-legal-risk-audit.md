# Pre-Launch Legal & Regulatory Risk Audit — 2026-08-09

> **I am not a lawyer and this is not legal advice.** It is an engineering audit of
> where PropertyPro's *code and copy* diverge from what Florida statutes, federal
> consumer-protection law, and its own published policies say. Every statutory
> reading below should be treated as a hypothesis to be confirmed by a licensed
> Florida attorney before it is relied on. Where I am uncertain about the current
> text of a statute I say so explicitly rather than guessing. Statements about
> **what the code does** are verified against the repository at the cited lines and
> are not hedged.

**Scope:** the whole product surface at the state it is in on `main` as of
2026-08-09. Companion to `docs/audits/2026-08-07-pre-launch-readiness-audit.md`,
which covered operations. That audit's conclusion was "the code is fine, the
environment is not." This one is the opposite: **the environment work is nearly
done, and the remaining launch risk is in what the product says and what it lets
a board do.**

**Classification used throughout:**

- **(A) SELF-FIXABLE** — a code, copy, config or policy change materially reduces
  the exposure. The change is specified.
- **(B) AVOIDABLE BY NARROWING SCOPE** — cheapest mitigation is to not ship it
  yet, or ship it disabled. What to turn off is specified.
- **(C) RESIDUAL** — genuinely needs a licensed attorney, or is an accepted
  business risk. Stated plainly, with who bears it and what a cheap partial
  mitigation looks like.

---

## 1. Executive summary — the five that actually matter

Ranked by likelihood × severity **at launch**, not by how alarming they sound.

### 1. Your own Terms and Privacy Policy describe a product you did not build (A)

`terms.md:95` and `privacy.md:96` both promise that on cancellation, data is
"permanently and irreversibly deleted from our systems **and backups**" after 30
days. The code does not do this, in either direction:

- `executeCommunitySoftDelete` ([account-lifecycle-service.ts:762](apps/web/src/lib/services/account-lifecycle-service.ts:762))
  sets `communities.deletedAt` and schedules a purge **six months** out, not 30 days.
- `purgeCommunityData` ([:843](apps/web/src/lib/services/account-lifecycle-service.ts:843))
  purges *site assets* and flips a status. It does not delete documents, minutes,
  ledgers, violations, ARC records, or storage objects.
- Supabase PITR is now on (per the 2026-08-07 audit, B3). Backups categorically
  are not purged on a 30-day cycle.

So: the association loses **access** at day 30 (RLS hides a soft-deleted
community) while the data itself persists indefinitely, and your policy says the
exact opposite of both halves. A privacy policy that misdescribes your actual
data practices is the single most reliably actionable thing on this list — it is
an FTC Act §5 / FDUTPA deceptive-practice theory that requires no injury and no
statute-specific expertise to plead.

**This is the highest value-per-hour fix in the document.** It is a copy edit.

### 2. TCPA — you have consent capture but no consent *revocation* path (A)

Consent is captured properly ([notification-preferences/route.ts:132-143](apps/web/src/app/api/v1/notification-preferences/route.ts:132),
recording `smsConsentGivenAt` / `smsConsentMethod: 'web_form'`), and the
recipient selector correctly requires verified phone + active consent
([emergency-broadcast-service.ts:711-718](apps/web/src/lib/services/emergency-broadcast-service.ts:711)).
That is better than most products at this stage. But:

- **There is no inbound-message webhook.** `/api/v1/webhooks/twilio`
  ([route.ts:28](apps/web/src/app/api/v1/webhooks/twilio/route.ts:28)) handles
  `MessageStatus` delivery callbacks only. A resident who replies **STOP** never
  causes `smsConsentRevokedAt` to be written. Your own Privacy Policy §7.5
  ([privacy.md:136](apps/web/src/content/legal/privacy.md:136)) promises that
  replying STOP revokes consent. It does not.
- **The message body carries no opt-out disclosure.** `smsBody` is the
  broadcast text verbatim, truncated at 1600 chars
  ([emergency-broadcast-service.ts:246-248](apps/web/src/lib/services/emergency-broadcast-service.ts:246)).
  No "Reply STOP to opt out" is appended.
- **ToS §6.3 claims a legal exception you do not use and may not have.**
  [terms.md:123-125](apps/web/src/content/legal/terms.md:123) tells users that in
  an emergency you may text residents *who have not opted in*, citing the TCPA
  emergency-purposes exception. The code never does this — `hasTcpaConsent` is
  required unconditionally. You have published a claim of legal authority you
  don't exercise, which is worse than useless: it is an admission you believe
  you may text non-consenting people.

Twilio's Advanced Opt-Out very likely stops the messages at the carrier layer
regardless — so the *practical* risk of an actual unwanted message is lower than
it looks. The exposure is the **records** problem: TCPA defense turns on proving
consent state at send time, and your database will assert consent for someone who
revoked it. Statutory damages are $500–$1,500 **per message**.

### 3. An association's statutory records can become unreachable while under a 7-year retention duty (A + C)

Florida requires associations to maintain official records for years
(§718.111(12)(b) — my understanding is 7 years for most categories; confirm).
PropertyPro is where those records live. Three code facts combine badly:

- The only export is `GET /api/v1/export`
  ([route.ts:29](apps/web/src/app/api/v1/export/route.ts:29)) and it produces
  **metadata CSVs, not files**. `exportDocuments`
  ([community-export.ts:140](apps/web/src/lib/services/community-export.ts:140))
  emits `id, title, fileName, fileSize, mimeType, categoryId, timestamps`. The
  actual PDFs are not in the ZIP.
- It covers four tables — residents, documents, maintenance, announcements.
  Not minutes, meetings, financials, ledger, assessments, violations, ARC,
  elections, or the compliance audit log.
- It is gated by `requireEntitledForAdminRead` ([route.ts:50](apps/web/src/app/api/v1/export/route.ts:50)).
  **A lapsed community loses admin reads** — so the association that most needs
  to get its records out, the one that just cancelled, is precisely the one
  blocked from exporting them.

If an owner later demands records under §718.111(12)(c) and the association
cannot produce them because they were behind your paywall or purged, the
association is exposed and will look to you. Partly (A) — build a real export.
Partly (C) — the contractual allocation of a records-custodian duty is an
attorney question.

### 4. ADA Title III / WCAG on the public association websites (A + C)

You are generating public-facing websites for Florida community associations —
the exact profile that drives Florida's very high volume of website
accessibility demand letters. The design system mandates accessibility
(`.claude/rules/design.md`), but **accessibility is asserted, not measured**:
there are two axe test files in the entire repo
(`apps/web/__tests__/accessibility/axe-audit.test.tsx`,
`site-editor-axe.test.tsx`), covering roughly ten components — auth forms,
marketing sections, one maintenance form, one settings button. **No public
tenant page (`(public)/[subdomain]/**`) is covered.** Neither is any authored
site block, which is where user-supplied content and contrast problems will
actually live.

Compounding it: [design_system_coral600_contrast](docs/design-system/) — the
default brand primary `coral-600` is already known to fail AA (4.28:1) on the
sand page background. That is a documented, shipped, default-configuration
contrast failure on every association site.

Demand letters here typically settle in the low five figures. Likelihood over a
12-month horizon with real public sites live: meaningful. Severity: moderate,
survivable, but it lands on *your* customers and they will forward it to you.

### 5. Violation fining lets a board do something the statute probably forbids, using a notice you generated (A + C)

`POST /api/v1/violations/[id]/fine` correctly requires the violation be
`noticed` or `hearing_scheduled` ([violations-service.ts:599](apps/web/src/lib/services/violations-service.ts:599))
— good. But it accepts **any positive `amountCents`**
([fine/contract.ts](apps/web/src/app/api/v1/violations/[id]/fine/contract.ts),
[fine/route.ts:37](apps/web/src/app/api/v1/violations/[id]/fine/route.ts:37)),
with no cap and no record of a fining-committee decision. My understanding of
§718.303(3)–(4) and §720.305(2) is that a fine requires approval by a committee
of at least three members who are not officers, directors, employees, or their
relatives, and is capped at $100 per violation / $1,000 aggregate absent
authorizing documents.

Meanwhile `violation-notice-pdf.ts` generates a hearing notice that **recites the
owner's legal rights and cites the statutes**
([:339-380](apps/web/src/lib/utils/violation-notice-pdf.ts:339)) — including
"The **Board** may, after considering all evidence, ... impose a fine," which as
I read the statute names the wrong decision-maker. So the product is
manufacturing a legal notice, on the association's letterhead, that may misstate
the law, for a fine the product did not constrain.

That combination — automated legal-document generation plus unconstrained
statutory action — is both the clearest unauthorized-practice-of-law exposure in
the product and the clearest "your software caused our fine to be voided"
exposure.

---

### The sixth, which is only sixth because it is switched off

**E-voting stores a permanent unit → candidate link.** `election_ballots` carries
`unitId` alongside `candidateId`, with
`uq_election_ballots_unit_candidate` on `(electionId, unitId, candidateId)`
([elections.ts:165-201](packages/db/src/schema/elections.ts:165)). My reading of
§718.128 is that the system must be able to **permanently separate** identifying
information from the ballot such that a ballot cannot be tied to a specific unit
owner. This schema makes that separation impossible by construction — the join is
the primary key structure.

Everything *else* about the elections design is genuinely careful: per-unit
uniqueness at submission (`uq_election_ballot_submissions_unit`), append-only
ballot tables with no `updatedAt`/`deletedAt`, an immutable eligibility snapshot,
proxy support with a per-unit unique grantor index. Someone thought hard about
this. But the secrecy property is the one that a losing candidate's lawyer will
attack, and it is not there.

**This is why the `electionsAttorneyReviewed` gate is the most valuable line of
code in the repository.** `requireElectionsEnabled`
([common.ts:11-20](apps/web/src/lib/elections/common.ts:11)) fails closed, and
the flag is null/false for every production community. Leave it that way.

---

## 2. Findings

### Florida statutory

---

#### F-01 · Compliance checklist omits meeting notices and agendas
**Class: (A)** · Likelihood: high · Severity: moderate

`CONDO_718_CHECKLIST_TEMPLATE` ([templates.ts:16-155](packages/shared/src/compliance/templates.ts:16))
is a careful, well-cited mapping of §718.111(12)(g)2 records — declaration,
bylaws, articles, rules, Q&A sheet, budget, financial report, rolling-12-month
minutes, video recordings, affidavits, insurance, executory contracts, conflict
contracts, bids, milestone inspection, SIRS. Each carries a `statuteReference`
and a `defaultVisibility` (`owner_portal` / `owner_only` / `board` /
`public_page`), which is the right architecture.

**What is missing:** there is no checklist item for **notices of meetings and
their agendas**. My understanding is §718.111(12)(g)2 requires notice of any unit
owner meeting and the agenda to be posted to the website at least 14 days before,
and board meeting notices likewise. The product *knows* these deadlines — the
`meeting-calculator` computes 14-day and 48-hour lead times correctly
([meeting-calculator.ts:18-37](apps/web/src/lib/utils/meeting-calculator.ts:18))
— but that computation never becomes a scored compliance obligation. An
association can sit at 100% compliance while never posting a single meeting
notice.

I could not independently verify the complete current enumerated list against the
statute as amended (HB 1021, 2024). **Treat the item list as needing one lawyer
pass**, and treat the missing notice/agenda item as a defect regardless.

**Remediation:** add `718_meeting_notices` / `720_meeting_notices` template items
keyed to the existing `calculateNoticePostBy` output, so the 14-day and 48-hour
windows appear on the dashboard as scored obligations.

---

#### F-02 · Documents are posted verbatim; nothing prompts redaction
**Class: (A) for the prompt, (C) for the duty** · Likelihood: high · Severity: moderate-high

`grep -ri redact` across `apps/` and `packages/` returns only audit-log metadata
scrubbing and the deletion-time email placeholder. There is **no
document-redaction affordance anywhere in the product.**

My understanding is §718.111(12)(c) obliges the association to redact protected
personal information — SSNs, driver's license numbers, personal contact details,
medical and personnel records — before making official records available. Boards
upload scanned PDFs. Scanned PDFs of minutes, ledgers, and delinquency reports
routinely contain exactly this. The product then posts them to an owner portal,
and in some configurations a public page.

The duty is the association's, not yours. But you built the frictionless path
that makes the breach one click away, and you have no warning on it.

**Remediation (A):** an interstitial on document upload for the categories most
likely to contain protected information (financial records, meeting records,
operations), requiring an affirmative "I have redacted protected personal
information per §718.111(12)(c)" acknowledgement, recorded to the audit log with
actor and timestamp. This is cheap and it converts your position from "we
published it" to "they attested."

**Residual (C):** whether an attestation actually shifts the duty is an attorney
question. It certainly improves the evidentiary posture.

---

#### F-03 · ARC denials do not capture the required written reason
**Class: (A)** · Likelihood: high · Severity: moderate

`arc_submissions` ([arc-submissions.ts:7-32](packages/db/src/schema/arc-submissions.ts:7))
has a single free-text `reviewNotes`, and it is **optional on denial**:
`POST /api/v1/arc/[id]/decide` accepts `{ decision: 'approved' | 'denied',
reviewNotes? }` and coerces a missing value to `null`
([decide/route.ts:61](apps/web/src/app/api/v1/arc/[id]/decide/route.ts:61)).

My understanding of the HB 1203 (2024) amendments to §720.3035 is that an ARC/ACC
denial must be in writing and must state the **specific rule or covenant** relied
on. The product allows a board to deny an owner's application with an empty
reason field. There is also no deadline tracking against the statutory response
window.

**Remediation:**
1. Make `reviewNotes` **required and non-empty when `decision === 'denied'`** —
   a Zod refinement on the contract, enforced server-side, not just in the UI.
2. Add a structured `ruleReference` column (text, required on denial) so the
   citation is a field rather than something a board might bury in prose.
3. Surface both verbatim in the owner-facing decision view and in any generated
   notice.

This is a half-day of work and it directly converts a statutory defect into a
statutory compliance feature you can market.

---

#### F-04 · Fine amounts unconstrained; no fining-committee record
**Class: (A)** · Likelihood: moderate · Severity: moderate-high

Covered in the executive summary (#5). Specifically:

- `violationsFineContract` validates `amountCents` as a positive int with no
  ceiling; `imposeViolationFineForCommunity` checks only `> 0`
  ([violations-service.ts:602](apps/web/src/lib/services/violations-service.ts:602)).
- No column, table, or route records fining-committee composition or approval.
  `violation_fines` ([violation-fines.ts:9-29](packages/db/src/schema/violation-fines.ts:9))
  records amount, ledger link, status, issue/paid/waived timestamps — no approver
  other than an implicit actor.
- The generated hearing notice states the **Board** imposes the fine
  ([violation-notice-pdf.ts:378](apps/web/src/lib/utils/violation-notice-pdf.ts:378)),
  which conflicts with the committee requirement as I read it — while the same
  document correctly cites the $100/$1,000 caps at line 379-380. The PDF knows
  the cap; the API does not enforce it.

**Remediation:** enforce the cap at the contract layer with a community-settings
override for associations whose documents authorize more; add a required
`approvedByCommittee` boolean + committee-member snapshot on the fine; fix the
notice text to name the committee. Have counsel review the notice template
before it goes out again (see §5).

---

#### F-05 · Generated legal notices are the sharpest UPL edge
**Class: (C), with (A) mitigations** · Likelihood: low-moderate · Severity: high if it lands

`violation-notice-pdf.ts` produces a document that: addresses the owner, cites
Florida statutes, computes and asserts whether the 14-day notice period was
satisfied, enumerates "Your Rights at the Hearing" including the right to
counsel, and states the range of outcomes with statutory caps. That is not a
form with blanks — it is a drafted legal notice with legal conclusions in it,
produced by a non-lawyer vendor.

Florida's UPL line for non-lawyer document preparation is, as I understand it,
roughly: filling in blanks with customer-supplied information is permissible;
selecting, drafting, or advising on the legal content is not. The 14-day
compliance assertion in particular is a legal conclusion the software reaches on
its own.

Everything *else* on your UPL surface is already well handled and I want to be
clear about that, because it is unusual:

- The marketing footer carries "PropertyPro is not a law firm and does not
  provide legal advice" ([footer.tsx:57](apps/web/src/components/marketing/footer.tsx:57)).
- `/resources` articles have a disclaimer **template-injected top and bottom** so
  no article can ship without one ([resources/[slug]/page.tsx:96-102](apps/web/src/app/(marketing)/resources/[slug]/page.tsx:96)).
- The compliance-checker carries a remarkable in-code comment
  ([compliance-checker.tsx:208-219](apps/web/src/components/marketing/compliance-checker.tsx:208))
  explaining why a previously-headlined "$50/day penalty" claim was removed as
  overstated. Whoever wrote that understood the assignment.
- ToS §1 leads with the non-legal-advice statement in bold
  ([terms.md:11-13](apps/web/src/content/legal/terms.md:11)).

**The gap is the in-app help center.** 11 of 66 MDX articles mention an attorney
or "not legal advice", and unlike `/resources` there is **no injected
disclaimer** — I found no disclaimer component in the help rendering path. Help
articles narrate statutory obligations to boards.

**Remediation (A):**
1. Inject a disclaimer into the help-article template the same way `/resources`
   does. One component, one template edit, covers all 66 and every future one.
2. Reframe the generated notices as *drafts*: watermark or header them "DRAFT —
   for review by the association and its counsel", and strip the software's own
   legal conclusions (the 14-day compliance assertion, the rights enumeration)
   into content the association explicitly configures once, rather than content
   you generate.

**Residual (C):** whether templated legal notices cross the line at all is
exactly the question to spend an hour of attorney time on. It is item 2 on my
counsel list.

---

#### F-06 · Compliance help copy contradicts the compliance engine
**Class: (A)** · Likelihood: certain (it is wrong today) · Severity: low-moderate

`compliance-scoring-explained.mdx` tells boards: "**Posting late still counts as
Satisfied**, but the record's timing shows in the audit history."

The calculator does the opposite. `calculateComplianceStatus`
([compliance-calculator.ts:91-97](apps/web/src/lib/utils/compliance-calculator.ts:91))
returns `'overdue'` when `documentPostedAt > deadline`, with an explicit comment:
"A document posted past its deadline does not retroactively satisfy the item."

The code's behaviour is the correct one. The article is wrong. On a product whose
entire value proposition is telling fiduciaries whether they are compliant, a
help article that misdescribes the compliance calculation is a small
misrepresentation with an outsized credibility cost — and it is the kind of thing
that gets quoted back at you.

**Remediation:** fix the article. Then add a test that asserts the documented
behaviour matches `calculateComplianceStatus`, or at minimum a review checklist
item, because this class of drift will recur.

**Note on what the calculator gets right:** the 30-day window
(`calculatePostingDeadline`, default 30 days, [:52](apps/web/src/lib/utils/compliance-calculator.ts:52)),
weekend rollover, the rolling-12-month window for minutes, and the defensive
treatment of soft-deleted documents as non-satisfying
([:78-79](apps/web/src/lib/utils/compliance-calculator.ts:78)) are all sound and
well-commented. The engine is not the problem here; the prose about it is.

---

#### F-07 · Soft delete and records retention
**Class: (A) partly, (C) partly** · Likelihood: moderate · Severity: high if it lands

Covered as executive summary #3. To state the retention question precisely:
**soft delete does not by itself satisfy a retention duty, and it does not by
itself violate one either.** What matters is whether the association can *produce*
the record on demand. Under the current design, after cancellation +30 days it
cannot: `communities.deletedAt` is set, RLS hides the tenant, and
`requireEntitledForAdminRead` blocks the export route. The bytes exist and the
association cannot reach them. That is the worst of both worlds — you carry the
storage cost and the breach-surface, and they get no benefit.

**Remediation (A):**
1. Build a **real** export: every tenant table, plus the actual document files
   from Supabase Storage, as a ZIP. Remove the `MAX_EXPORT_ROWS` truncation or
   make it paginate rather than silently truncate.
2. **Exempt export from the entitlement gate.** A lapsed or cancelling community
   must be able to get its records out. This is one line and it is the most
   important line in this finding.
3. Force an export (or an explicit, logged waiver) before a community deletion
   request can be confirmed.

**Residual (C):** whether you should contractually position yourself as a records
*custodian* at all, versus a pure conduit, is an attorney question with real
consequences for §718.111(12) exposure. See §5.

---

#### F-08 · E-voting: unit-to-ballot linkage
**Class: (B) — keep it off** · Likelihood: currently ~zero · Severity: very high if enabled

Covered above. Enumerated so it has a finding ID.

**What to keep off, exactly:** `community_settings.electionsAttorneyReviewed`
must remain null/false in production. `requireElectionsEnabled`
([elections/common.ts:11](apps/web/src/lib/elections/common.ts:11)) is the only
gate and it fails closed on both the feature flag and the attorney flag. Do not
add a UI to set this flag. Do not set it manually to demo the feature.

**Liability if a board runs a contested election on this and loses:** the losing
candidate challenges under §718.128; the association's election is voided and
re-run at its cost, potentially with an arbitration proceeding before the DBPR's
Division of Condominiums. The association's damages are real and quantifiable,
and its theory against you is straightforward — you sold a §718.128-compliant
e-voting feature that was not §718.128-compliant. Your ToS liability cap
(12 months of fees, [terms.md:70](apps/web/src/content/legal/terms.md:70)) is the
only thing standing between you and that, and caps are not always enforced
against a claim framed as misrepresentation rather than breach.

**Cheap partial mitigation if you ever want to enable it:** redesign so
`election_ballots` carries no `unitId` — the submission table already establishes
one-ballot-per-unit; the ballot table only needs the submission's *existence*
proven, not its identity. That is a schema change plus a results-query change,
and it is the difference between "arguably compliant" and "provably not."

---

#### F-09 · SIRS / milestone transparency
**Class: (A) — already largely correct** · Likelihood: low · Severity: low

`718_inspection_reports` and `718_sirs` template items exist, are correctly marked
`isConditional`, cite §553.899 / §718.301(4)(p) / §718.112(2)(g), and carry no
`deadlineDays` — which is right, since these are event-driven rather than
30-day-window obligations. The project rule that SIRS pages "display factual data
only — no assessment of adequacy" (`.claude/rules/florida-compliance.md`) is the
correct posture and appears to be honoured.

**One thing to verify before launch:** that no SIRS or milestone surface anywhere
in the app renders language characterizing reserves as "adequate", "sufficient",
"underfunded", or similar. That characterization is engineering/financial advice.
A grep before each release is cheap insurance.

---

### Beyond the statutes

---

#### F-10 · TCPA — no STOP handler, no in-message disclosure, false ToS claim
**Class: (A)** · Likelihood: moderate-high · Severity: high

Covered as executive summary #2.

**Remediation, in order:**
1. **Add an inbound-message webhook.** A second Twilio webhook (or extend the
   existing route to branch on the presence of a `Body` field) that on
   STOP/UNSUBSCRIBE/CANCEL/END/QUIT writes `smsConsentRevokedAt` and
   `smsEnabled = false`, and on START/UNSTOP clears it. Signature validation is
   already implemented and reusable
   ([sms-service.ts:106](apps/web/src/lib/services/sms/sms-service.ts:106)).
2. **Append "Reply STOP to opt out" to every non-emergency SMS body**, inside the
   existing 1600-char truncation so the disclosure is never the part that gets cut.
3. **Delete or rewrite ToS §6.3.** Either remove the emergency-exception claim
   entirely (recommended — you don't use it), or, if you genuinely want that
   capability, get it reviewed before you assert it. Do not publish a claimed
   legal authority you are not exercising.
4. **Confirm Twilio Advanced Opt-Out is enabled** on the Messaging Service. This
   is a console setting, not code, and it is what is actually protecting you
   today. If it is off, the finding's severity rises sharply.

---

#### F-11 · CAN-SPAM — partial, and the gap is defensible but not free
**Class: (A)** · Likelihood: low-moderate · Severity: low-moderate

The infrastructure is better than typical. `send.ts`
([:42-56](packages/email/src/send.ts:42)) **throws** if a `non-transactional`
email is sent without an `unsubscribeUrl`, and sets `List-Unsubscribe` and
`List-Unsubscribe-Post` one-click headers. Six senders are correctly classified
non-transactional (announcements, digests, calendar reminders, insurance alerts,
snowbird digests, notification-service).

Two templates — `insurance-alert-email.tsx` and `snowbird-digest-email.tsx` —
include a **visible unsubscribe link and the association's postal address in the
body**, with a comment explaining that the address is the association's, not
PropertyPro's ([insurance-alert-email.tsx:21-31](packages/email/src/templates/insurance-alert-email.tsx:21)).
That is exactly right.

**The gap:** `EmailLayout` — the shared layout every template uses — has no
postal address and no unsubscribe link in its footer
([email-layout.tsx:81-98](packages/email/src/components/email-layout.tsx:81)).
So `announcement-email.tsx`, sent in bulk to every resident
([announcement-delivery.ts:262](apps/web/src/lib/services/announcement-delivery.ts:262)
classifies it non-transactional), carries the header but no in-body opt-out and
no physical address.

**Honest assessment of severity:** association announcements to members are
plausibly "transactional or relationship" messages under CAN-SPAM — they concern
an existing membership relationship — in which case the postal-address and
opt-out requirements do not attach. I think that is the better reading. But you
have already classified them `non-transactional` in your own code, which is an
admission against interest, and the fix costs an hour.

**Remediation:** add optional `postalAddress` and `unsubscribeUrl` props to
`EmailLayout` and render them in the footer whenever present; pass them from
every non-transactional sender. One component, six call sites. Source the address
from the association's own record, as the insurance template already does.

---

#### F-12 · ADA / WCAG on public association sites
**Class: (A) for coverage, (C) for the residual** · Likelihood: moderate · Severity: moderate

Covered as executive summary #4.

**Remediation (A), highest value first:**
1. **Fix the `coral-600` contrast default.** A known-failing AA contrast ratio in
   the *default* brand configuration means every association site ships with it
   unless the association changes it. Darken the default, or pair it with a
   compliant text token.
2. **Extend axe coverage to the public surface**: every `(public)/[subdomain]/**`
   page and every site block type. `vitest-axe` is already wired up
   ([setup.jsdom.ts](apps/web/__tests__/setup.jsdom.ts)); this is test-writing,
   not infrastructure.
3. **Add an accessibility statement page** to each generated association site,
   with a contact address for accommodation requests. This is genuinely
   protective — a documented remediation channel meaningfully changes the posture
   in a demand-letter negotiation, and it costs one static page.
4. Run one manual keyboard-and-screen-reader pass over a generated public site
   before launch. Automated tooling catches perhaps a third of real WCAG issues.

**Residual (C):** automated + manual testing gets you to "good faith effort,"
not immunity. Serial-filer demand letters are largely uncorrelated with actual
accessibility. Budget for one, or ask counsel about whether tech E&O covers it.

---

#### F-13 · Unauthorized practice of law
**Class: (C) with (A) mitigations** — see F-05, F-06. Not duplicated here.

---

#### F-14 · Florida DBPR / CAM licensing
**Class: (C), low** · Likelihood: low · Severity: low-moderate

§468.431(2) defines community association management as performing, *for
compensation*, specified management functions for an association above a size
threshold. The relevant question is whether PropertyPro-the-company is performing
those functions, not whether the software assists someone who does.

My reading: the product is a tool. Boards and licensed CAMs operate it. Document
posting, notice scheduling, and record-keeping performed *by the association's
own people through your software* is not you managing anything. Software vendors
to CAMs are not, as far as I know, treated as CAMs.

**Two things that would change that answer**, and you should avoid both:
1. Offering to perform setup, document upload, or notice preparation *for* an
   association as a paid service. That is you doing the work.
2. Any automation that takes an action requiring judgment without a human in the
   loop — e.g. auto-issuing violation notices on a schedule. Every notice and
   fine currently requires an authenticated admin to act; keep it that way.

**Cheap mitigation:** a line in the ToS stating that PropertyPro does not provide
community association management services as defined in §468.431 and that the
association is responsible for engaging a licensed CAM where required.

---

#### F-15 · Payments — you are in the flow of funds, and probably didn't mean to be
**Class: (A)** · Likelihood: moderate · Severity: moderate-high

The Connect integration is **Standard** accounts via OAuth
([finance-service.ts:1548-1590](apps/web/src/lib/services/finance-service.ts:1548)),
which is the right choice — the association owns the Stripe account and the
banking relationship. The OAuth state parameter is HMAC-signed with a 10-minute
expiry and community/user binding ([:1594-1633](apps/web/src/lib/services/finance-service.ts:1594)),
which is properly done.

**But the charges are destination charges, not direct charges:**

```
stripe.paymentIntents.create({
  amount, currency: 'usd',
  transfer_data: { destination: connectAccount.stripeAccountId },
})
```
([finance-service.ts:1006-1013](apps/web/src/lib/services/finance-service.ts:1006))

There is no `stripeAccount` header. That means the PaymentIntent is created **on
your platform account**. Consequences:

1. **Assessment funds transit your Stripe balance.** Owners' assessment payments
   momentarily sit in PropertyPro's account before transfer. For a product whose
   customers are fiduciaries with association-funds segregation duties, this is
   the wrong shape. It is the kind of detail that surfaces during an association's
   annual audit, not during your sales call.
2. **You carry dispute and refund liability.** On destination charges the
   platform is the merchant of record. A chargeback on a $4,000 special
   assessment debits *your* Stripe balance, and you recover from the association
   only if you can. With Standard accounts Stripe's own guidance is to use direct
   charges precisely for this reason.
3. **Money-transmission questions get harder** the more it looks like you hold
   and forward other people's money. Stripe's payment-facilitator posture almost
   certainly covers you, but direct charges make the question not arise.

**Remediation (A):** switch to **direct charges** — create the PaymentIntent with
`{ stripeAccount: connectAccount.stripeAccountId }` and keep your cut as
`application_fee_amount`. The funds never touch your balance, dispute liability
sits with the association, and the trust-fund story becomes clean. This is a
contained change to `createPaymentIntentForPayable` and
`updatePaymentIntentFee`, plus the client-side `Elements` stripe-account option.

**PCI: you are fine.** `PaymentElement` in a Stripe-hosted cross-origin iframe
([payment-dialog.tsx:156-179](apps/web/src/components/finance/payment-dialog.tsx:156)),
no card fields in your DOM, no PAN anywhere in the codebase. That is SAQ-A. I
found no card data touching the application. Good.

---

#### F-16 · Debit-card surcharging
**Class: (A)** · Likelihood: moderate · Severity: low-moderate

In `owner_pays` mode the convenience fee is a grossed-up cost pass-through
([payment-fees.ts:39-55](packages/shared/src/payment-fees.ts:39)) added to the
charge, with `payment_method_types: ['card', 'us_bank_account']`.

`'card'` includes **debit** cards. Card-network rules (Visa/Mastercard) prohibit
surcharging debit transactions outright, regardless of amount. Fla. Stat.
§501.0117's credit-card surcharge ban was held unconstitutional as applied in
*Dana's Railroad Supply v. Bondi* (11th Cir. 2015) and I would not rely on it
either way — but the network rules bind you through your Stripe agreement, and
the remedy is losing card acceptance, which is worse than a fine.

**Remediation:** either (a) branch on the funding type Stripe reports and apply
no fee to debit, or (b) restructure it as a flat **service fee** applied
identically to *all* payment methods including ACH — the standard compliant
pattern, since a uniform service fee is not a card surcharge. Option (b) is
simpler and also removes the awkward incentive to route owners to ACH.

Also confirm the fee is disclosed to the payer *before* they commit — the
`updatePaymentIntentFee` flow suggests it is computed after method selection,
which is the right moment, but verify the UI shows the total before confirmation.

---

#### F-17 · Privacy Policy and ToS misstate your actual data practices
**Class: (A)** · Likelihood: certain · Severity: moderate-high

Executive summary #1. The specific corrections needed:

| Statement | Where | Reality |
|---|---|---|
| "permanently and irreversibly deleted from our systems **and backups**" in 30 days | [terms.md:95](apps/web/src/content/legal/terms.md:95) | 30-day cooling → 6-month soft delete → a purge that removes site assets and PII only. Backups (PITR) retain everything. |
| "data is permanently deleted from our active systems and backups" after 30 days | [privacy.md:96](apps/web/src/content/legal/privacy.md:96) | Same. |
| "Replying STOP ... we will stop sending you SMS messages promptly" and revocation is recorded | [privacy.md:136-139](apps/web/src/content/legal/privacy.md:136) | No inbound webhook exists; `smsConsentRevokedAt` is never written from a STOP reply (F-10). |
| Emergency broadcasts may go to non-opted-in residents under the TCPA emergency exception | [terms.md:123-125](apps/web/src/content/legal/terms.md:123) | The code requires consent unconditionally. You claim an authority you don't use. |
| "Regular security audits and vulnerability assessments" | [privacy.md:108](apps/web/src/content/legal/privacy.md:108) | Verify this is true and on a cadence you can evidence. If not, soften it. |
| "we will provide timely notification in the event of a data breach as required by §501.171" | [privacy.md:147](apps/web/src/content/legal/privacy.md:147) | No documented incident-response or breach-notification procedure exists in the repo. The commitment is real; the process to honour it is not written down. |

The rest of both documents is genuinely solid — service-provider enumeration with
links, "we do not sell your data," §501.171 / FIPA / SB 262 acknowledgement,
clear SMS-consent section. The problem is narrow and entirely fixable by making
the words match the code (or the code match the words — for the STOP handler,
fix the code).

**Also add:** a written breach-notification runbook. §501.171 imposes a 30-day
notification deadline to affected individuals and, above 500 Floridians, to the
Department of Legal Affairs. You do not want to be discovering that timeline
during an incident. A one-page runbook naming who decides, who drafts, and what
the deadlines are is sufficient and takes an afternoon.

---

#### F-18 · Contract formation and clickwrap
**Class: (A), small** · Likelihood: low · Severity: moderate if it fails

Formation is genuinely done correctly, which is worth stating:

- The signup form has a real checkbox, unchecked by default
  ([signup-form.tsx:91,591](apps/web/src/components/signup/signup-form.tsx:91)),
  with a link to `/legal/terms` ([:601](apps/web/src/components/signup/signup-form.tsx:601)).
- It is validated server-side, not just client-side
  ([signup-schema.ts:214](apps/web/src/lib/auth/signup-schema.ts:214)).
- Acceptance is **persisted with a timestamp**: `pending_signups.terms_accepted_at`
  is `.notNull()` ([pending-signups.ts:43](packages/db/src/schema/pending-signups.ts:43)),
  written at [signup.ts:348,372](apps/web/src/lib/auth/signup.ts:348).

That is proper clickwrap with an evidentiary record. Two gaps:

1. **You record *when* they accepted, not *what* they accepted.** ToS §11 reserves
   the right to modify terms with continued use as acceptance
   ([terms.md:182](apps/web/src/content/legal/terms.md:182)). When you revise the
   terms, you will not be able to prove which version any given user agreed to.
   **Fix:** add a `terms_version` column, stamp it at acceptance, and version the
   markdown files. Trivial now; impossible to reconstruct later.
2. **Invited users may never see the terms at all.** ToS §3.1 contemplates users
   being "invited by your community association's administrator"
   ([terms.md:29](apps/web/src/content/legal/terms.md:29)), and the terms purport
   to bind "all users ... including ... unit owners or residents"
   ([terms.md:21](apps/web/src/content/legal/terms.md:21)). I did not find a
   terms-acceptance step on the invitation-acceptance path. If residents onboard
   by invitation without a clickwrap, your liability cap and disclaimers are
   materially weaker against them — and residents are the people most likely to
   be harmed by a notice failure. **Verify this path and add acceptance if it is
   missing.**

On the substance of the contract: §4.3 disclaims consequential damages including
"fines or penalties resulting from compliance failures" — well targeted for this
product. §4.4 caps at 12 months of fees. §10 sets Florida law and Palm Beach
County venue. **What is absent:** any indemnity from the customer, any
arbitration or class-waiver clause, and any express disclaimer of implied
warranties of merchantability and fitness (§4.2 disclaims uptime only). Those are
the three highest-leverage additions and they are item 1 on my counsel list.

---

#### F-19 · Marketing "compliance" claims
**Class: (A)** · Likelihood: moderate · Severity: moderate

The tone across the marketing site is "compliance is achieved by using this":

- "compliant **by default**" — [hero-section.tsx:22,33](apps/web/src/components/marketing/hero-section.tsx:22), [layout.tsx:16,32](apps/web/src/app/(marketing)/layout.tsx:16)
- "**Compliant in three steps.**" — [how-it-works-section.tsx:28](apps/web/src/components/marketing/how-it-works-section.tsx:28)
- "gets a branded, **compliant website** on its own subdomain — instantly" — [how-it-works-section.tsx:7](apps/web/src/components/marketing/how-it-works-section.tsx:7)
- "Every plan includes **statute compliance monitoring**" — [pricing-section.tsx:84](apps/web/src/components/marketing/pricing-section.tsx:84)

Meanwhile ToS §4.1 says the exact opposite in capital letters: "**PropertyPro does
not guarantee compliance**" ([terms.md:50](apps/web/src/content/legal/terms.md:50)).

That contradiction is the FDUTPA theory. An association that gets fined or loses
a §718.111(12)(c) records dispute will point at "compliant by default" and argue
the ToS disclaimer cannot cure a headline representation. Deceptive-practices
analysis looks at the net impression on a reasonable consumer, and "compliant in
three steps" is a strong net impression.

To be fair to the existing copy: the *substantive* claims are careful and
accurate. The FAQ correctly states the 25-unit and 100-parcel thresholds
([faq-section.tsx:9](apps/web/src/components/marketing/faq-section.tsx:9)); the
compliance-checker states real deadlines and, per its own in-code comment,
deliberately removed an overstated penalty figure. The problem is only the
hero-level slogans.

**Remediation:** shift the claims from outcome to capability. "Compliant by
default" → "**Built for §718 and §720 compliance**" or "**Everything the statute
requires, in one place.**" "Compliant in three steps" → "**Set up in three
steps.**" "statute compliance monitoring" → "**statutory deadline tracking**."
Then add a short disclosure near the pricing table, not just in the footer:
*PropertyPro provides tools to help your association meet its statutory
obligations. Compliance remains the association's responsibility.* You lose
almost no persuasive force and you remove the strongest sentence a plaintiff
would quote.

---

#### F-20 · FCRA and Fair Housing — not implicated
**Class: none — verified clean** · Likelihood: n/a

`grep -ri "background check|credit report|screening|consumer report|FCRA"` across
`apps/` and `packages/` returns **zero** hits. There is no tenant screening, no
consumer-report pull, no adverse-action flow. FCRA is not in scope. Do not add
screening without counsel — it is a materially different regulatory regime.

Fair housing: violations and ARC decisions are human judgments recorded in the
product; there is no automated scoring, no algorithmic decisioning, and no
protected-class data in the schema. The audit trail (`compliance_audit_log`, and
per-record actor/timestamp columns) is affirmatively *protective* — a board
accused of selective enforcement can show the record. The residual FHA risk is a
board discriminating and the product having faithfully recorded it, which is the
correct outcome.

**One product suggestion that is also a legal one:** surface a
"similar violations in the last 12 months" view when a board issues a violation.
Selective-enforcement claims are the common FHA theory in this domain, and making
consistency visible at decision time helps the association more than any
disclaimer.

---

## 2a. Decisions locked — 2026-08-09

Owner decisions taken after the audit. These **override** the ship/don't-ship
table in §3 where they conflict; §3 is preserved as the analysis that produced
them.

| Decision | Choice | Consequence |
|---|---|---|
| **Launch gating** | Ship **disabled**: violation fines, assessment payments, SMS/emergency broadcasts, generated legal notices. (Elections already off.) | Launch surface shrinks to: compliance dashboard + document posting, meetings & notices, resident portal, announcements/email, ARC, forum, resident management. F-04, F-05, F-10, F-15, F-16 all move from "fix before launch" to "fix before re-enable." |
| **Stripe** | Switch to **direct charges** before payments are re-enabled | `stripeAccount` header on PaymentIntent creation; keep the cut as `application_fee_amount`. Not launch-blocking any more, but it is the gate on re-enabling payments. |
| **Retention/deletion** | **Match copy to the code** | Rewrite ToS §5.3–5.4 and Privacy §5.2–5.3 to describe the real lifecycle. No hard-purge build. Better outcome for associations under a 7-year retention duty. |
| **Attorney budget** | **Assume zero for 90 days** | Every (C) item is designed around or accepted in writing. The SaaS-agreement gaps — no customer indemnity, no implied-warranty disclaimer, no arbitration/class waiver — are **permanent constraints for now**, not deferred work. See "Standing exposure" below. |

### Implementation status — 2026-08-09

**The four kill switches are LANDED and fail closed.** They are keys in the
`communities.community_settings` JSONB column (no migration), hydrated onto
`CommunityMembership` with a strict `=== true` read, and enforced by synchronous
guards. Absent / `null` / `false` / the **string** `"true"` all mean disabled, so
every existing community ships with all four off.

| Gate | Enforced at | Behaviour when off |
|---|---|---|
| `violationFinesEnabled` | `POST /violations/[id]/fine` + late-fee cron | 403 on imposition. Existing fines stay visible and payable. Late-fee accrual pauses. |
| `assessmentPaymentsEnabled` | `payments/{create,update}-intent`, `stripe/connect/{onboard,complete}` | 403 on the charge path. Balances, history and statements stay readable. |
| `smsDispatchEnabled` | `createBroadcast` + a global `SMS_DISPATCH_ENABLED` env floor | Broadcast **degrades to email**, never refused. OTP routes 503. |
| `noticePdfGenerationEnabled` | `violations/[id]/{notice,hearing-notice}` | 403. No UI caller exists today. |

Three design decisions worth recording, because each was the non-obvious choice:

1. **Not `CommunityFeatures` flags, and not `<FeatureGate>`.** Both resolve through
   `requirePlanFeature`, which **fails open when a community has no plan**
   (`plan-guard.ts:44,53`). Routing a legal gate through a fail-open resolver would
   defeat its purpose. UI gating passes a plain boolean from the server component
   instead, following the `board/layout.tsx` precedent.
2. **SMS is gated in the service, not on the route.** A 403 on
   `/emergency-broadcasts/[id]/send` would kill the **email** leg too — inverting
   the deliberate "life-safety over revenue" bypass. The gate therefore sits where
   the SMS/email split is computed, and `sendBulkEmergencySms` returns *skipped*
   results rather than throwing, so a disabled SMS channel can never take email
   down with it. There is a test that fails if this regresses.
3. **`phone/verify/*` needed a second mechanism.** Those routes call Twilio Verify
   directly (not through `sms-service`) and are userId-scoped with no
   `communityId`, so the per-community flag cannot reach them. Hence the global
   env floor, which lives in an import-free module
   (`apps/web/src/lib/sms/dispatch-flag.ts`) because pulling the DB-touching gate
   module into `sms-service` made a pure Twilio wrapper require `DATABASE_URL` at
   module load.

Also landed: `users.terms_accepted_at` / `users.terms_version` /
`pending_signups.terms_version` (migration `0057`, expand-only, **not yet applied
to prod**), `CURRENT_TERMS_VERSION` in `packages/shared`, per-key audited admin
toggles, and `pnpm demo:enable-gates` for local demos (demo seed mirrors
production — all gates off).

**Terms acceptance now persists (Wave 3, landed).** Both entry points write
`users.terms_accepted_at` + `users.terms_version`:

- **Invitation:** the accept contract requires `termsAccepted: z.literal(true)`
  (not `z.boolean()` — a `false` must be a 400, never an account that exists
  having accepted nothing). The hook and form now send it; the PATCH handler
  writes it via `recordTermsAcceptance`, sharing one timestamp with
  `markInvitationConsumed` so the audit trail cannot show the two happening at
  different moments.
- **Signup:** `pending_signups.terms_version` is stamped at signup — *not* at
  provisioning, because a signup can sit unverified for days and stamping later
  would record whatever version is current then against an earlier acceptance.
  Provisioning carries both values onto `users`.

**The `onConflictDoNothing` trap was real and is fixed.** `provisioning-service`
created the `users` row with `.onConflictDoNothing()`, so on any retry where the
row already existed the terms columns would have been silently skipped — a signup
that genuinely accepted would end up with no record. Now `.onConflictDoUpdate`
with a **narrow set** (terms columns only, so a retry cannot clobber an
email/name the user has since changed). There is a test that fails if this
reverts.

> **Migrations `0057`, `0058` and `0059` are APPLIED to production (2026-08-10),
> and the drizzle ledger is reconciled.** Applied via Supabase MCP
> `apply_migration`, which is the path `.claude/rules/migration-safety.md`
> prescribes. Verified against `information_schema`/`pg_catalog` rather than the
> tool's success flag: `users.terms_accepted_at` + `terms_version` present,
> `pending_signups.terms_version` present, both export tables present with
> ENABLE **and** FORCE RLS, 8 policies, 2 scope triggers, the partial unique
> index, the status CHECK, and the private `community-exports` bucket.
>
> `apply_migration` writes to Supabase's own `supabase_migrations.schema_migrations`,
> NOT to `drizzle.__drizzle_migrations` — so three ledger rows were inserted
> separately (`hash` = sha256 of the migration file bytes, `created_at` = the
> journal `when`). Ledger is 55 → 58 rows, max `created_at` = `1786363191610`
> = 0059's journal timestamp. Skipping that half is what caused the June
> drift that froze prod deploys for two weeks.
>
> Supabase's security advisor was re-run afterwards: neither new table appears
> under `rls_enabled_no_policy`, and no new finding was introduced.

### Wave 5 — launch-blocking remediation (landed 2026-08-10)

Eleven tracks. What shipped, and the three places the audit above was **wrong**.

| # | Finding | What landed |
|---|---|---|
| 5A | F-05 | `HelpArticleDisclaimer` **injected by the page template** into every help article, on both rendering surfaces (the `/help` route and the docs modal). Wording escalates when the article cites statutes. Only 8 of 66 articles had authored one; injection means the 67th cannot ship without it. |
| 5B | F-02 | Redaction attestation on document upload. Server-enforced (`enforceRedactionAttestation`, 400 without it), recorded to `compliance_audit_log` with actor, timestamp and the attestation **text verbatim**. Applies to the six categories that routinely carry PII — plus any category the normalizer does not recognise, so a rename cannot switch the check off. |
| 5C | F-11 | `EmailLayout` footer now renders the association's postal address and a visible opt-out. **The four login-walled unsubscribe URLs are gone**: announcements, notifications, digests and calendar reminders now mint a per-recipient signed-token URL at `/api/v1/notifications/unsubscribe`, reachable with no session. |
| 5D | F-14 | ToS §1.1 — "We Are Not Community Association Managers", citing §468.431 and enumerating what PropertyPro will not do. Terms bumped to `2026-08-10.1`. |
| 5E | F-17 | `docs/runbooks/data-breach-response.md` — §501.171 deadlines, the determination clock, where PII actually lives in this system, and three standing gaps recorded honestly. |
| 5F | F-01 | `718_meeting_notices` added to the condo checklist. |
| 5G | F-03 | Structured `ruleReference` column on `arc_submissions`, required on denial as its own contract-level refinement (migration `0060`). |
| 5H | F-12 | Accessibility statement linked from **every** generated association site footer — deliberately *not* opt-in, unlike the statutory line. |
| 5I | F-12 | `public-site-axe.test.tsx` — axe over all 11 block types plus header and footer, driven by `blockViewRegistry` so a new block type arrives covered. |
| 5J | F-09 | `docs/runbooks/release-legal-checks.md`. |
| 5K | — | `pnpm demo:enable-gates` (already shipped in the sub-hour wave). |

**Three corrections to the audit, found while implementing:**

1. **F-01 overstated the gap.** `720_meeting_notices` **already existed** in the
   HOA template with the right shape. Only the condo side was missing it. The
   finding said both.
2. **F-09 is clean, measured rather than assumed.** The reserve/SIRS adequacy
   sweep returns 30 hits and **zero** are affirmative claims — every one is a
   disclaimer that negates the claim, an `insufficient-permissions` redirect, or
   an unrelated code comment. Recorded as a repeatable check rather than a
   guard, because a regex cannot distinguish "reserves are sufficient" from
   "does not state whether reserves are sufficient", and a guard that fires on
   every disclaimer gets ignored.
3. **F-03's "surface it in the decision view" has no decision UI to surface it
   in.** Nothing in `apps/web/src` calls `POST /api/v1/arc/[id]/decide` — ARC
   decisions are API-only today. The read-side panel now shows `ruleReference`
   above the notes; there is no denial *form* to add a field to.

**Two things this wave deliberately did NOT do:**

- **The `insurance-alert-email` and `snowbird-digest-email` templates were left
  alone.** The plan called for removing their inline address/unsubscribe blocks
  as now-duplicated. They are not duplicated — both were already correct, and
  their bespoke link text ("Unsubscribe from insurance alerts") tells the reader
  more than a generic footer link. Routing working, compliant code through a new
  path is churn with regression risk and no legal gain.
- **A CI guard for reserve-adequacy language** — see correction 2.

> **New required environment variable: `COMMUNITY_EMAIL_UNSUBSCRIBE_SECRET`.**
> Follows the existing per-feature-secret convention
> (`INSURANCE_ALERTS_UNSUBSCRIBE_SECRET`, `SNOWBIRD_UNSUBSCRIBE_SECRET`).
> **Unlike those, an unset value does not throw** — `buildCommunityEmailUnsubscribeUrl`
> falls back to the old login-walled settings URL and mail still ships. Throwing
> would have meant one missing variable silently stopping every announcement
> email for every association, and `sendEmail` refuses a non-transactional send
> with no unsubscribe URL, so the fallback must be a real URL rather than an
> empty string. Set it in Vercel to get the compliant behaviour.

> **Migration `0060` (`arc_submissions.rule_reference`) is APPLIED to production
> (2026-08-10) and the drizzle ledger is reconciled.** Pure expand — one nullable
> column — applied ahead of the code per expand-before-code. Verified against
> `information_schema`: `rule_reference`, `text`, nullable. Ledger row inserted
> separately (`apply_migration` does not write drizzle's ledger): id 88,
> `hash` = sha256 of the migration file bytes, `created_at` = the journal `when`
> (`1786383233876`). Ledger is now 59 rows with that as its max.

### Wave 6 — pre-re-enable work (landed 2026-08-10)

Not launch-blocking. This is the work that has to exist before each gated
feature can be turned back on.

| Gate | What landed |
|---|---|
| **SMS** (F-10) | Inbound Twilio webhook branches on `Body` and handles STOP/START/HELP. A STOP writes `smsEnabled = false` **and** `smsConsentRevokedAt` across **every** community the user belongs to, audit-logged per community. Non-emergency bodies carry "Reply STOP to opt out", reserved *before* truncation. The dead `sms-consent-form.tsx` is now reachable from Settings — gated on the per-community flag **and** the env floor. |
| **Payments** (F-15, F-16) | PaymentIntents are **direct charges** (`{ stripeAccount }`); `transfer_data` is gone and the cut stays `application_fee_amount`. Every later touch — retrieve, update, and the three webhook re-reads — passes the connected account. Stripe.js loads per-account in the browser. `owner_pays` is **retired**. |
| **Fines** (F-04) | §718.303(3)/§720.305(2) caps enforced in the service (per-fine *and* aggregate, excluding waived fines), with a community-settings override. `approvedByCommittee` + a committee-member **snapshot** required at the contract layer. |
| **Notices** (F-05) | DRAFT banner first on the page, on both documents. The 14-day *compliance assertion* is now a *measurement*. The rights enumeration became a pointer to the governing documents. The signature block no longer signs as "Board of Directors". |
| **Elections** (F-08) | `election_ballots` drops `submission_id`, `unit_id`, `voter_hash`, `is_proxy_vote`, `proxy_id`. |

**Two corrections and one design note:**

1. **Removing `unit_id` alone would have been theatre.** The audit named that
   one column, but `submission_id` reaches the same unit and voter in one join.
   The fix removes all five identifying columns; what remains is election +
   candidate + one vote.
2. **The idempotency check had to move first.** Recognising a duplicate ballot
   meant reading the ballot rows back, and that read-back was the *only* reason
   `submission_id` existed. It is now a salted, order-independent
   `selection_digest` on the submission row. Salted deliberately: the unsalted
   input is a small integer set, so an observer with the candidate list could
   enumerate every possible ballot and match a digest back to a selection.
3. **`owner_pays` was retired, not repaired** — owner's call. The alternatives
   were a uniform fee (an ACH payer's cost on a $2,000 assessment goes from ~$5
   to ~$60) or debit detection (funding type is not reliably known before the
   payment method is attached). Associations absorbing was already the default
   for every community. The stored setting is left in place and read back, so
   the settings page can say the old choice is no longer used rather than
   silently showing a different one.

> **A green suite is not evidence.** All 173 election tests passed with the
> ballot schema gutted, because the only coverage of the duplicate-submission
> path is an **integration** test that `pnpm test` does not run. The digest is
> now unit-tested. `vote-integration.test.ts` still needs a run against
> `pnpm test:integration:local` before this ships.

> **Migration `0061` is APPLIED to production (2026-08-10) and the drizzle
> ledger is reconciled.** Pure expand — three nullable columns on
> `violation_fines`. Verified against `information_schema` (all three present,
> correct types, all nullable). Ledger row inserted separately, id 89; ledger is
> now 60 rows, max `created_at` = `1786412347694` = 0061's journal timestamp.
>
> **Migration `0062` is NOT applied, deliberately.**
> `0062_secret_ballot` is **destructive, irreversible, and CONTRACT-ordered**:
> apply only *after* the code that stops reading those columns is live, and
> **not at all** until e-voting has attorney sign-off. Dropping the columns
> destroys the vote→voter linkage permanently, which is the point, but it
> cannot be undone by re-adding them. The on-disk migration tip is therefore
> one ahead of the production tip; that gap is intentional.

### Security review finding — export authorization (fixed 2026-08-10)

A security review of the Wave 4/5/6 branch found one HIGH-severity defect, in
Wave 4's own code.

**The bar was `settings:read`, under a comment claiming it was "admin-tier
only". It is not.** The RBAC matrix grants `settings: { read: true }` to the
**`owner`** row (`rbac-matrix.ts:153`), and `resolveMatrixRole` maps every
`resident` with `isUnitOwner: true` onto that row. So every unit owner in a
condo/HOA could queue and download the full archive — ~25 tables plus, by
default, every file in the community's `documents` bucket. Only tenants were
excluded.

The exposure exceeded the owner's own entitlements in the same matrix, which
denies them `audit: read` and `contracts: read` while the archive ships
`compliance_audit_log`, `contracts`, `vendors` and `insurance_policies`. It also
bypassed the per-unit scoping that normally narrows finance and violation reads,
yielding community-wide `ledger_entries`, `assessment_line_items`,
`violation_fines` and `leases`.

**Fixed:** the bar is now management tier (`property_manager` / `root_manager`)
**or** a board designation, and the missing `requireFreshReauth` — which the
legacy sync route always required — is restored.

Four things worth recording:

1. **The database already knew.** `0058_community_export_jobs.sql` gives both
   new tables RLS policies requiring `pp_rls_can_read_audit_log` — manager-only,
   exactly the intended bar. Those policies never fire, because job rows are
   read with the service role, so they could not have caught this. The schema
   and the route disagreed and only the route was load-bearing.
2. **Board designation is admitted deliberately.** Designation is orthogonal to
   role (ADR-006 §3.2), so an `isAdmin`-only check would refuse a self-managed
   association's board — the people who actually run this, and who carry the
   §718.111(12) records duty.
3. **The legacy `/api/v1/export` route had the same bar**, shipping every
   resident's name and email to any unit owner. Pre-existing and outside the
   review's scope, but fixed in the same change: it now shares the *same
   predicate function* rather than a second copy, because two gates that can
   drift is how one of them ends up wrong again.
4. **A test asserted the vulnerability.** `export-route.test.ts` contained
   `it('allows owner role access')` — the defect faithfully encoded as intent.
   Nothing covered the job routes' permission bar at all. Both are now pinned in
   `export-route-auth.test.ts`, and removing the fix fails 9 tests.

### What the gating decision buys, and what it does not

**Removed from the launch risk surface entirely:** unconstrained fines and the
missing fining-committee record (F-04); the auto-generated hearing notice and
its legal conclusions (F-05); destination-charge funds custody and dispute
liability (F-15); debit surcharging (F-16); the TCPA consent-revocation gap as a
*live* risk (F-10 — no messages will be sent).

**Still live and still required before launch:**

- **F-17 / F-01 legal copy.** Gating features does not fix a policy that
  misdescribes your data practices. Highest priority, unchanged.
- **ToS §6.3 (TCPA emergency exception) must still be deleted.** SMS being off
  does not make a published claim of legal authority you don't exercise less
  damaging — arguably more so, since you now can't even point to a working
  implementation. 5 minutes.
- **F-19 marketing claims.** Unchanged. Also now partly a *truth* problem, not
  just an FDUTPA one: the pricing page advertises capabilities that will be
  switched off. Any gated feature must come off the pricing/feature copy, or be
  marked "coming soon."
- **F-03 ARC denial reasons.** ARC is shipping. Required `reviewNotes` on denial
  + `ruleReference` column stays on the critical path.
- **F-07 item 2, export entitlement gate.** Shipping. One line.
- **F-12 accessibility.** Public association sites are shipping. Contrast fix +
  accessibility statement stay pre-launch.
- **F-02 redaction interstitial, F-06 help-copy fix, F-01 meeting-notice
  checklist items.** All on the shipping surface.
- **F-18 invitation-path terms acceptance.** Residents onboard by invitation on
  day one. Still needs investigating and probably fixing.
- **F-05's residual UPL question narrows but does not vanish.** With notice
  generation off, the remaining surface is the help center (66 articles, 11 with
  a disclaimer, no injected one) and the compliance dashboard's "you are
  compliant" framing. The template-injected disclaimer is now the whole
  mitigation, which makes it more important, not less.

### Standing exposure accepted with zero counsel budget

Stated plainly so it is a decision and not an oversight. With no attorney
engagement, these are **accepted, not solved**:

1. **No customer indemnity, no implied-warranty disclaimer, no arbitration or
   class-action waiver** in the ToS. The existing consequential-damages carve-out
   and 12-month liability cap are the entire defensive posture. They are
   reasonable clauses, but they were not drafted against Florida contract law by
   someone who does this, and a cap framed against a *misrepresentation* claim
   rather than a breach claim may not hold.
2. **Every statutory reading in this document is unconfirmed.** The compliance
   checklist item lists in particular — the product's core claim — have not been
   validated against §718/§720 as amended by HB 1021 / HB 1203.
3. **Whoever operates the company personally bears the residual.** If PropertyPro
   is not an LLC or corporation with the association agreements executed in the
   entity's name, fix that first — it costs ~$125 in Florida and it is the
   cheapest liability limitation available. Confirm before launch.
4. **Cheapest partial mitigations available without a lawyer**, in order:
   entity formation and correct contracting party (see 3); tech E&O / cyber
   insurance quote (a broker, not an attorney — likely $1.5–3k/yr for this
   revenue scale, and it covers the ADA demand letter, the breach-notification
   cost, and defense costs the ToS cap does not); and keeping the gated features
   gated until they are actually right.

The counsel-first list in §5 stands unchanged as the spend order for the moment
budget appears. Re-read it before spending anything.

---

## 3. Ship / don't ship

| Feature | Verdict | Why / what it needs |
|---|---|---|
| **E-voting / elections** | **DO NOT SHIP** | F-08. Ballot table permanently ties unit → candidate. Keep `electionsAttorneyReviewed` false. Needs schema redesign **and** attorney sign-off. |
| **Violation fines** | **SHIP DISABLED, or ship after F-04** | No statutory cap, no fining-committee record, generated notice names the wrong decision-maker. Cap + committee field is ~1 day. Until then, consider gating fines while leaving violation *tracking* on. |
| **Generated legal notices (violation / hearing)** | **SHIP MARKED AS DRAFT** | F-05. Add "DRAFT — for review by the association and its counsel"; strip the software's own legal conclusions. Cheap, and it changes the UPL story. |
| **Assessment payments (Stripe Connect)** | **SHIP AFTER F-15** | Switch destination → direct charges first. Funds custody + dispute liability. ~1 day. PCI posture is already correct. |
| **Convenience fee** | **SHIP AFTER F-16** | Stop surcharging debit, or convert to a uniform service fee. Half a day. |
| **SMS / emergency broadcasts** | **SHIP AFTER F-10** | STOP webhook + in-body disclosure + delete the ToS §6.3 claim. Confirm Twilio Advanced Opt-Out is on. ~1 day. |
| **Bulk email / announcements** | **SHIP** | Header-level unsubscribe already enforced at the send layer. Add footer address + link (F-11) in the first week; it is not a launch blocker. |
| **Public association websites** | **SHIP WITH F-12 items 1 & 3** | Fix the default contrast failure and add an accessibility statement before the first public site goes live. Axe coverage can follow. |
| **Document posting / compliance dashboard** | **SHIP** | The engine is correct. Add the redaction interstitial (F-02) and the meeting-notice checklist items (F-01) in the first two weeks. |
| **Compliance scoring** | **SHIP AFTER the help-copy fix (F-06)** | Ten-minute fix. Do not ship a help article that misdescribes your core calculation. |
| **ARC / architectural review** | **SHIP AFTER F-03** | Required denial reason + rule reference. Half a day, and it is a feature you can sell. |
| **Meetings & notices** | **SHIP** | Timing math is correct. Notices simply are not yet scored (F-01). |
| **E-sign** | **SHIP** | Not separately audited for ESIGN/UETA consent-disclosure requirements. Low concern for intra-association documents; flag for counsel if you ever use it for contracts with third parties. |
| **Resident portal / documents** | **SHIP** | With F-02's redaction prompt. |
| **Account & community deletion** | **SHIP AFTER F-07 item 2** | Exempting export from the entitlement gate is one line and is a genuine blocker — a cancelling association must be able to retrieve its records. |
| **Marketing site** | **SHIP AFTER F-19** | Copy edits only. |

---

## 4. Self-remediation checklist

Ordered by (exposure reduced) ÷ (hours). Nothing here needs a lawyer.

**Do before you onboard the first paying association:**

> **Status 2026-08-09: 10 of 11 done in one batch.** Item 6 is yours (a Twilio
> console setting). Two items changed shape once the code was actually read —
> see the notes. Verified with `pnpm typecheck` (clean), `pnpm test`
> (11,334 passing; the 4 failing files are a pre-existing `Missing DATABASE_URL`
> load error, confirmed identical on a stashed tree), and `pnpm lint`
> (0 errors, all 23 guards green).

- [x] **1. Rewrite the retention/deletion language** in `terms.md` §5.3–5.4 and
      `privacy.md` §5.2–5.3. **Done** — both now describe the real lifecycle and
      state affirmatively that cancelling destroys nothing, which is both true
      and the better answer for associations under a retention duty. Backups
      disclosed in a section of their own.
- [x] **2. Delete ToS §6.3** (the TCPA emergency-exception claim). **Done** —
      replaced with "Consent Is Always Required", which is what the code does
      ([emergency-broadcast-service.ts:711](apps/web/src/lib/services/emergency-broadcast-service.ts:711)).
      The STOP-revocation copy in both documents was also corrected: it now says
      STOP stops delivery *at the carrier*, and directs users to settings for a
      recorded revocation.
- [x] **3. Fix the compliance help article.** **Done** — now states that late
      posting stays Overdue, matching `calculateComplianceStatus`.
- [x] **4. Soften the marketing outcome claims** + pricing disclosure. **Done** —
      capability framing across hero, how-it-works, pricing, page metadata and
      OpenGraph; disclosure placed under the pricing grid, at the point of
      purchase, not only in the footer. Also caught in passing: the hero's float
      card read "12 communities / compliant this quarter", an outcome claim
      styled as a live customer stat — same class as the fabricated testimonial
      this page already un-rendered. Now "documents posted on time".
- [x] **5. Exempt `GET /api/v1/export` from `requireEntitledForAdminRead`.**
      **Done.** Note: a dedicated CI guard (`guard:read-entitlement`) enforces
      this gate, so the exemption is recorded in its documented
      `// read-entitlement:exempt — <reason>` form rather than by silent removal.
- [ ] **6. Confirm Twilio Advanced Opt-Out is enabled** in the Twilio console.
      **YOURS — not doable from here.** *(10 min. With SMS gated off at launch
      this is no longer urgent, but it is what protects you the moment SMS is
      re-enabled.)*
- [x] **7. Require `reviewNotes` on ARC denial.** **Done** — Zod `superRefine`
      on the contract, so it is enforced server-side and rejects whitespace and
      explicit `null`, not just a missing key. Approvals stay note-optional.
      **Note:** there is currently no ARC decision UI at all — `use-arc.ts` is
      query-only — so this endpoint is API-only today and the practical exposure
      was nil. The guard is now in place before any UI is built.
- [x] **8. ~~Fix the `coral-600` default contrast failure.~~ SUPERSEDED — the
      premise was wrong.** The token layer already routes `text.brand` and
      `text.link` through coral-**700**, reserving coral-600 for button fills,
      with comments at [semantic.ts:64-70](packages/tokens/src/semantic.ts:64)
      explaining exactly that tradeoff. There is no default contrast failure.
      A contrast advisory also already exists in the site-editor publish flow and
      is deliberately non-blocking. Per the 2026-08-09 decision that advisory
      stays non-blocking; its **copy** was sharpened instead to name WCAG 2.1 AA,
      name who is affected, and state that the association carries the risk —
      because an advisory that cannot block has exactly one job, which is to make
      the choice informed.
- [x] **9. Add an accessibility statement page.** **Done** — published at
      `/legal/accessibility`, linked from the marketing footer alongside Terms
      and Privacy. It commits to a 5-business-day acknowledgement and to
      supplying the information by another means at no cost while a fix is
      pending, and it **discloses the known gaps** rather than only claiming
      conformance. Tests guard the contact route and the admissions specifically.
      *Follow-up: the statement is not yet linked from the generated association
      site footers, which are `resolveFooterSettings`-driven. That is the surface
      a demand letter would actually target.*
- [x] **10. Version the legal documents.** **Done, per the 2026-08-09 decision** —
      file-level versioning only (`Version: 2026-08-09.1`, superseded-version
      noted), no migration. The `terms_version` **column** on `pending_signups`
      remains open: acceptance is still timestamped without recording *which
      version* was accepted. That gap is unrecoverable for anyone who signs up in
      the meantime, so put the column in the next migration batch.
- [x] **11. Invitation-path terms acceptance.** **Confirmed missing, now fixed.**
      `accept-invite/page.tsx` rendered only `SetPasswordForm`, so invited
      residents accepted nothing while ToS §2 purports to bind them. Added a
      clickwrap checkbox mirroring the signup form, validated in `handleSubmit`
      as well as via `required` — because `required` is bypassed by any
      programmatic submit. Tests cover the unchecked default, the links, and a
      scripted submit with the box unticked.
      **Still open:** acceptance is not *persisted* for invited users (they go
      through Supabase Auth, not `pending_signups`). Pair this with the
      `terms_version` column in the same migration batch.

**Do in the first two weeks:**

- [ ] 12. Build the **inbound Twilio STOP/HELP webhook** writing
      `smsConsentRevokedAt`, and append "Reply STOP to opt out" to non-emergency
      SMS bodies. *(1 day.)*
- [ ] 13. Switch Stripe to **direct charges** (`stripeAccount` header) and keep the
      fee as `application_fee_amount`. *(1 day.)*
- [ ] 14. **Stop surcharging debit** — uniform service fee across methods is the
      simpler path. *(0.5 day.)*
- [ ] 15. **Cap violation fines** ($100 / $1,000 aggregate, with a
      community-settings override) and add a required committee-approval field.
      Fix the notice PDF to name the committee. *(1 day.)*
- [ ] 16. **Watermark generated notices as DRAFT** and remove the software's own
      legal conclusions (the 14-day compliance assertion). *(0.5 day.)*
- [ ] 17. **Inject a legal disclaimer into the help-article template**, mirroring
      `/resources`. Covers all 66 articles and every future one. *(2 hr.)*
- [ ] 18. **Document upload redaction interstitial** with a logged attestation.
      *(0.5 day.)*
- [ ] 19. **Add postal address + visible unsubscribe to `EmailLayout`**, passed
      from the six non-transactional senders. *(2 hr.)*
- [ ] 20. **Write a one-page §501.171 breach-notification runbook** — who decides,
      who drafts, 30-day individual deadline, 500-Floridian AG threshold.
      *(2 hr.)*
- [ ] 21. **Add a §468.431 CAM disclaimer** to the ToS. *(15 min.)*

**Do in the first month:**

- [ ] 22. **Real export**: all tenant tables + actual document files as a ZIP; no
      silent truncation; force-or-waive it before community deletion.
- [ ] 23. **Meeting notice/agenda checklist items** wired to the existing 14-day /
      48-hour calculator.
- [ ] 24. **Extend axe coverage** to every public tenant page and site block;
      one manual keyboard/screen-reader pass.
- [ ] 25. **Add a `ruleReference` column** to ARC decisions and surface it.
- [ ] 26. **Grep for reserve-adequacy language** on SIRS surfaces; add it to the
      release checklist.

---

## 5. What to take to counsel first

If a limited budget appears, spend it in this order. A Florida community
association attorney with SaaS-vendor experience is the right profile; expect
$350–$550/hr.

**1. A proper SaaS agreement to replace the current ToS. (3–5 hrs — highest value)**
Your existing terms are a good drafting brief: the disclaimers are well targeted
and the liability cap exists. What they lack is a **customer indemnity**, an
**express disclaimer of implied warranties**, and an **arbitration / class-action
waiver**. Those three additions do more to bound your downside than every other
item in this document combined, because they apply across *all* the residual
risks — the ones I found and the ones I didn't. Bring the current `terms.md` and
ask for a redline, not a from-scratch draft; you will halve the hours.

**2. The generated-notice UPL question. (1–2 hrs)**
Show them `violation-notice-pdf.ts` output and ask one narrow question: does
generating a hearing notice that recites the owner's statutory rights and asserts
notice-period compliance constitute UPL by a non-lawyer vendor in Florida, and
does a DRAFT watermark plus removal of the legal conclusions cure it? The answer
determines whether you keep a shipped feature or replace it with a blank template.
Cheap question, binary answer, immediate product consequence.

**3. E-voting §718.128 review — but only when you actually want to ship it. (4–8 hrs)**
Do not pay for this now. The gate is holding and the feature earns nothing while
disabled. When you do, bring the redesigned schema (ballot table with no
`unitId`), not the current one — otherwise you are paying an attorney to tell you
what §2 of this document already told you.

**4. The compliance checklist item list, against the statute as amended. (2–3 hrs)**
Have them confirm `CONDO_718_CHECKLIST_TEMPLATE` and `HOA_720_CHECKLIST_TEMPLATE`
are complete and correctly cited post-HB 1021 / HB 1203. This is the product's
core claim. Getting the list wrong means every customer's compliance score is
wrong, and that is the failure mode most likely to produce a claim you cannot
disclaim your way out of. High value per dollar because it is a document review,
not a research question.

**5. Fining and ARC procedure review. (1–2 hrs)**
Confirm the committee requirement, the caps, and the ARC denial-content
requirements, and have them review the notice templates. Bundle this with item 2
— same attorney, same session, overlapping material.

**Explicitly *not* worth early money:** the privacy policy (fix the accuracy
yourself — the structure is fine), CAM licensing (low risk, and a disclaimer
covers the realistic exposure), ADA (an attorney cannot make your site accessible;
engineers can), and FCRA/FHA (not implicated).

---

## Appendix — what I verified, and what I did not

**Verified by reading the implementation:** compliance calculator and checklist
templates; meeting-notice timing math; violation lifecycle, fine gating, and
notice PDF generation; ARC decision path; election schema and the
`electionsAttorneyReviewed` gate; SMS consent capture, recipient selection,
sending, and the Twilio webhook; the email send layer, layout, and all
non-transactional senders; Stripe Connect onboarding, PaymentIntent creation, and
fee calculation; the payment dialog's PCI posture; signup terms acceptance and
its persistence; account and community deletion lifecycle; the export route and
service; ToS and Privacy Policy in full; the marketing site copy; axe test
coverage; and the absence of any FCRA/screening or fair-housing decisioning code.

**Not verified:** I did not query production. Nothing in this audit depends on
production state except the `electionsAttorneyReviewed` flag, which the prompt
established as null/false and which I confirmed fails closed in code regardless.
I did not audit e-sign against ESIGN/UETA. I did not review the admin app's legal
surface. I did not verify the current text of any Florida statute against an
authoritative source — every statutory reading here is from the codebase's own
citations plus my prior understanding, and **every one of them should be
confirmed.** Where the code and my understanding of a statute disagree, I have
flagged it as a finding rather than asserting the code is wrong.

**A note on what is already good**, because an audit that lists only defects
misrepresents the codebase: the compliance engine's handling of soft-deleted
documents, the deliberate removal of an overstated penalty claim from marketing
with the reasoning preserved in a code comment, the template-injected `/resources`
disclaimers, the append-only election tables, the `send.ts` guard that *throws*
rather than silently omitting an unsubscribe header, the HMAC-signed Connect OAuth
state, and the elections attorney-review gate itself are all evidence of someone
who was already thinking about this. The findings above are gaps in an
otherwise-careful product, not symptoms of a careless one.
