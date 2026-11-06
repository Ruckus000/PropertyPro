# Association website compliance audit — 2026-11-05

> **Not legal advice.** This is an engineering comparison of what the code does
> against the statute text as read on 2026-11-05. Statements about the code cite
> files and lines on `main` @ `6b20eaca`. Statements about the law cite the
> **2026 Florida Statutes** (flsenate.gov/Laws/Statutes/2026/…) and the Federal
> Register. Where something could not be confirmed it says so. A Florida
> attorney should confirm the readings before any of this is relied on.

**Scope:** the association website and owner portal: the public site, the
protected records section, the compliance checklist that drives both, meeting
notices, and the copy that describes them. It follows
`docs/audits/2026-08-09-legal-risk-audit.md`, whose F-01 (meeting-notice item),
F-02 (redaction attestation) and F-12 (accessibility statement and axe coverage)
fixes are in place and were not re-audited beyond what changed.

## Verdict

The structure is right. There is a protected section only owners, tenants (with
a narrower view) and managers can reach. Files sit in a private bucket behind
short-lived signed URLs. Public posting is off by default. The 25-unit and
100-parcel thresholds are consistent everywhere. Association brand colours are
contrast-checked before publish, and every site links an accessibility
statement.

The gaps are in **what the checklist counts as done**. A board can reach 100% while:

- the 30-day posting clock runs from the wrong date;
- one set of minutes stands in for a year of meetings;
- the agenda never appears on the website;
- five required condo items and three HOA items have no checklist row at all.

The product also tells boards that records are **"owed to the public site"**.
The statute requires the opposite: a protected section. The public framing pushes
boards toward exposing documents to anonymous visitors, which is exactly where
the protected-information rule bites.

One finding is a **security defect**, not a statutory one: PM bulk document
upload accepts any storage path (S-1). Fix it first.

## Findings, most severe first

| # | Severity | Finding |
|---|---|---|
| S-1 | **Critical (security)** | PM bulk upload accepts any storage path, so a PM can read other communities' files |
| H-1 | High | The product treats public posting as the statutory duty; the statute requires a protected section |
| H-2 | High | The 30-day clock starts when the checklist row is created, not when the record is received or created |
| H-3 | High | Required records with no checklist row (condo: 5, HOA: 3) |
| H-4 | High | Meeting notices: no agenda field, and the agenda is not shown on the front page |
| H-5 | High | Minutes: one document satisfies "all board meetings over 12 months" |
| H-6 | High | Redaction attestation is skipped on two upload paths and on most publish-to-public paths |
| M-1 | Medium | The HOA footer line cites the condo statute |
| M-2 | Medium | Video recordings: no recording link, no tie to video meetings |
| M-3 | Medium | "Not applicable" can exclude any row through the API; the score is computed three ways |
| M-4 | Medium | Labels and citations that misstate the law |
| M-5 | Medium | The threshold is counted per community; the statute counts per condominium |
| M-6 | Medium | Protected-area membership: self-claimed ownership, no employee role |
| M-7 | Medium | Help and marketing copy contradict the engine |
| L-1…L-4 | Low | ADA, privacy and breach notice, Fair Housing, custom-domain login |

---

### S-1 · PM bulk upload accepts any storage path (cross-tenant file read)

`POST /api/v1/pm/bulk/documents`:

- The contract only regex-checks `storagePath` and rejects `..` ([contract.ts:17-21](../../apps/web/src/app/api/v1/pm/bulk/documents/contract.ts)).
- `insertBulkDocumentsForCommunity` writes it straight to `documents.file_path` ([bulk-document-upload.ts:43-52](../../apps/web/src/lib/pm/bulk-document-upload.ts)).
- No `assertCommunityOwnedStoragePath` call exists on this path, though branding, e-sign templates and e-sign submissions all use one.
- The authenticated download route signs whatever `file_path` holds.

So a manager of community A can create a row in A that points at
`communities/B/documents/<uuid>/<name>` or `esign-signed/...`, and download it.
Rows are also inserted already posted, with `fileSize: 0` and
`mimeType: application/octet-stream`, and no redaction attestation.

**Exploitability:** the path segment is a `crypto.randomUUID()`
([upload/route.ts:63-65](../../apps/web/src/app/api/v1/upload/route.ts)), so the
attacker needs the path. That limits drive-by abuse, but it is still an IDOR on
the most sensitive data the product holds.

**Fix:** require the path's community segment to be one the caller manages,
and confirm the object exists. The route is meant to share one uploaded file
across communities, so a per-target-community check would break it. Or copy the
object into each target community's prefix. Also: add the redaction
attestation, and record the real size and MIME type.

**Status (2026-11-06):** fixed and deployed. PR #1449 merged as `fa890596`; the
Deploy and Production Health runs on that SHA both passed. Before any community
is written, the route now:

- requires each path to sit in the `documents/` folder of a community *in the
  request*. It runs `assertCommunityOwnedStoragePath` against that community,
  whose exact-prefix check also refuses `010`-style near misses and `.`
  segments;
- refuses a missing redaction attestation with a 400;
- reads each file once with `readValidatedUpload`.

Rows are then created through `createUploadedDocument`, which records the real
size and MIME type and an audit entry. The redaction attestation is recorded per
community and document. `categoryId` was dropped from the contract, since
category ids are per community and no caller sent one.

The shared-object design is kept, with a `ponytail:` marker naming its trigger.

**Not verified:** whether any existing production row points outside its own
community. The read-only query below was blocked by the session's permission
policy twice (2026-11-05 and 2026-11-06); run it yourself. A `foreign_path`
above 0 needs investigating row by row. `public_docs` sizes H-1.

```sql
select count(*) filter (where file_path not like 'communities/' || community_id || '/%') as foreign_path,
       count(*) filter (where public_access) as public_docs
from public.documents
where deleted_at is null;
```

---

### H-1 · The product frames public posting as the duty

**Law.**
- §718.111(12)(g)1.b–c requires a protected subpage, portal or location,
  "inaccessible to the general public", reachable only by unit owners and
  association employees.
- (12)(g)3. bars posting anything (12)(c) makes inaccessible, and requires
  redaction.
- §720.303(4)(b)2–4 says the same for HOAs.
- Nothing requires official records to be posted to the open internet. The one
  thing that must be in plain view on the front page is the owner/member
  meeting notice and agenda.

**Code.**
- [document-state.ts:12-28, 136](../../apps/web/src/lib/documents/document-state.ts)
  marks every applicable linked record that is not public as `owed`. The comment
  calls this "the conservative reading".
- The UI shows that as the filter "Owed to public"
  (`document-library.tsx:460`) and the warning "Not on the public site."
  (`document-inspector.tsx:156-158`).
- The same reading appears in route docblocks
  (`api/v1/public/documents/[id]/download/route.ts:13-14`,
  `api/v1/documents/route.ts:243-246`).
- The marketing page tells prospects that "residents and prospective buyers can
  view this information without logging in"
  ([transparency/page.tsx:30-32](../../apps/web/src/app/(marketing)/transparency/page.tsx)).
  The page itself shows posted/not-posted status and dates only. No document is
  linked.
- Once a document is public:
  - [sitemap.ts:121-127](../../apps/web/src/app/sitemap.ts) advertises its
    download URL to crawlers;
  - the anonymous download route has no category allowlist
    (`public-community-reader.ts:727-751`);
  - every starter look ships a Documents block whose `other` filter matches
    insurance, contracts, elections and unknown categories
    (`site-looks/looks.ts:79-81`, `site-blocks/documents.ts:36-57`).

**Why it matters.** It is not over-cautious. It points the cautious direction
the wrong way. The protected-information safe harbor covers disclosure
"unless made with a knowing or intentional disregard", and a board that
published because the product said the law required it is in a worse position.

**Fix.**
- Make `owed` mean "not yet posted to the owner portal". Treat public as an
  optional extra.
- Drop the marketing sentence or make it accurate.
- Take document downloads out of the sitemap.
- Consider a category allowlist for anonymous download: governing documents
  and rules, not minutes, financials or contracts.

Today, `public_access` was false for every production row, according to the
`document-state.ts` comment. Not re-verified: blocked as in S-1.

---

### H-2 · The 30-day clock starts at the wrong time

**Law.**
- §718.111(12)(g)1.: available "within 30 days after the association receives
  or creates an official record", unless a shorter period applies. This was
  added by HB 913 (2025).
- §720.303(4)(b) has **no** general 30-day posting deadline for HOAs.

**Code.**
- `calculatePostingDeadline(now, days)` is called with the time the checklist
  row is generated, everywhere ([compliance/route.ts:113-121](../../apps/web/src/app/api/v1/compliance/route.ts),
  `provisioning-service.ts:440,449`, `transparency-service.ts:416,426`).
- The `documents` table has no received-on or created-on field
  (`packages/db/src/schema/documents.ts`).
- The deadline is set once and never recomputed. So next year's budget, a new
  financial report or a new insurance policy never gets a deadline. The old file
  satisfies the row forever.
- A manual link stamps `documentPostedAt = now` (`compliance/route.ts:200`), so
  linking an old file reads as on time.

**Fix.**
- Add a received/created date to the upload and link flows. Default it to today
  and let the manager change it.
- Compute each row's deadline from that date.
- Give annual items (budget, financial report, insurance) a yearly cycle.
- For HOAs, keep 30 days as a product default, but stop citing it as statutory
  (see M-7).

---

### H-3 · Required records with no checklist row

The checklist is the product's core claim, so each missing row is a way to show
100% while out of compliance. Mapping against the 2026 text:

**Condo, §718.111(12)(g)2.**

| Item | Required record | Checklist row |
|---|---|---|
| a–d | Declaration, bylaws, articles, rules | ✔ `718_declaration`, `_bylaws`, `_articles`, `_rules` |
| e | Approved board minutes, preceding 12 months | ⚠ `718_minutes_rolling_12m` (see H-5) |
| f | Video recording **or hyperlink**, every video-conference meeting, 12 months | ⚠ `718_video_recordings` (see M-2) |
| g | Executory contracts list; bids list for past year; bid summaries over $500 kept 1 year | ⚠ `718_contracts`, `718_bids` (cite the general (12)(g)2.) |
| h | Annual budget **and any proposed budget** for the annual meeting | ✔ `718_budget` (no yearly cycle, see H-2) |
| i | Financial report **and any monthly income/expense statement** to be considered at a meeting | ⚠ report ✔; **monthly statements ✘** |
| j | Each director's certification (§718.112(2)(d)5.b.) | **✘ missing** |
| k | Contracts with a director, officer or financially interested entity | ⚠ `718_conflict_contracts` cites §718.3026; partial |
| l | Conflict-of-interest documents (§§468.4335, 468.436(2)(b)6., 718.3027(3)) | **✘ missing** |
| m | Owner meeting notice + agenda 14 days before, on the front page or a linked "Notices" subpage; vote/agenda documents 7 days before | ⚠ `718_meeting_notices` (see H-4) |
| n | Board meeting notice, agenda, documents, by the 48-hour deadline | ⚠ same row |
| o | Inspection reports (§553.899, §718.301(4)(p), other structural/life-safety) | ✔ `718_inspection_reports` |
| p | Most recent SIRS | ✔ `718_sirs` |
| q | **Building permits** for ongoing/planned construction (HB 1021) | **✘ missing** (no document category either) |
| r | Affidavits required by ch. 718 | ✔ `718_affidavits` |
| — | Community association manager name, contact, hours, duties, kept current within 14 business days (§468.4334(3)(b), HB 913) | **✘ missing** (not a document; a site section) |

Over-inclusive rows (not on the (12)(g)2. list):

- `718_insurance` (insurance is an HOA posting item, (4)(b)1.h, not a condo one);
- `718_qa_sheet` (§718.111(12)(d) requires preparing it, not posting it).

Keeping them is harmless, but label them "recommended", not statutory (M-4).

**HOA, §720.303(4)(b)1.a–m.** Present:

- articles, bylaws, declaration, rules;
- budget, financial report, insurance;
- contracts and bids;
- meeting notices.

Missing or partial:

- **(e)** the *list* of executory contracts. `720_contracts` is "Current Contracts".
- **(g)** monthly income/expense statements to be considered at a meeting.
- **(i)** director certifications (§720.3033(1)(a)). **✘**
- **(j)/(k)** related-party contracts and conflict-of-interest documents. **✘**
- **(4)(c)** the written records-retention rules, which must be made available
  through the website or app. **✘**

**Fix.**
- Add rows: condo `j`, `l`, `q`, monthly statements, manager info. HOA `i`,
  `j`/`k`, retention rules, and rename `720_contracts` to the list.
- Make the meeting-tied ones (monthly statements, `l`) conditional.
- Add a "Building permits" document category.
- Manager info belongs on the site as a section driven by the community's
  assigned manager. Not a checklist upload.

---

### H-4 · Meeting notices and agendas

**Law.**
- §718.111(12)(g)2.m / §720.303(4)(b)1.l:
  - owner/member meeting notice **and agenda** in plain view on the front page,
    or on a "Notices" subpage conspicuously linked from it, 14 days before;
  - documents to be voted on, or listed on the agenda, posted 7 days before.
- (g)2.n / (4)(b)1.m: board meeting notice and agenda by the 48-hour deadline.
- §718.112(2)(c)1 / §720.303(2)(c)2: meetings on non-emergency special
  assessments, or on unit/parcel-use rule amendments, need 14 days' notice. An
  assessment notice must state its purpose and estimated cost.
- Posting on the website **instead of** on the property is allowed only by
  board rule, plus an emailed hyperlink to owners with email on file.

**Code.**
- **No agenda field.** `meetings` has none, and `createMeetingSchema` takes
  title, type, times and location only ([meetings/route.ts:55-62](../../apps/web/src/app/api/v1/meetings/route.ts)).
  An agenda can only be an attached file, and the public Meetings block does not
  show attachments (`public-community-reader.ts:803-826`).
- **Front page:** every starter look puts a Meetings block on the home page
  (`looks.ts:108,126,147,164`). It lists the next 5 meetings with title, type,
  time and location. **No agenda.** Its look-ahead window is configurable from
  1 to 365 days, default 30 (`site-blocks/meetings.ts:11`), so a manager can set
  it below 14.
- **"Notices" subpage:** `/notices` on the canonical host renders the branded
  404. It has no host-native twin (`public-host-routes.ts:195-210`), and the
  apex route only redirects there.
- **Lead times** are warnings only (`notice-warning.ts`, `notice-window.ts`).
  `getNoticeLeadDays` ignores community type and gives every `special` meeting
  14 days, even a special *board* meeting (`meeting-calculator.ts:52-58`). The
  special-assessment and use-rule 14-day cases, and the purpose/cost content
  rule, are not modelled. Help admits part of this (`schedule-meeting.mdx:75-77`).
- **The 7-day voting-documents rule** is not represented.
- **Checklist:** `718_meeting_notices` / `720_meeting_notices` are satisfied by
  linking any one document whose title matches `notice|agenda`, for 12 months
  (`record-matching.ts:109,158-159`). Creating a meeting or pressing "Post
  notice" never touches the row. An empty row is never overdue and is not in
  "Action needed".

**Fix.**
- Add an agenda (text plus optional files) to meetings and show it in the public
  Meetings block. Floor the block's window at 14 days.
- Score notices per meeting: posted at least N days before, from
  `noticePostedAt`, which the transparency page already uses.
- Add "special assessment" and "use-rule amendment" flags that force 14 days and
  prompt for purpose and cost.
- Add a 7-day check for documents attached as "to be voted on".
- Either build `/notices` or drop the route and rely on the front page.

---

### H-5 · Minutes: one document satisfies a year

**Law.** §718.111(12)(g)2.e: approved minutes of **all** board meetings over
the preceding 12 months.

**Code.** One row holds one document, and the rolling window only checks that
document's age (`compliance-calculator.ts:66-71`; "latest-wins",
`compliance-service.ts:115-120`). Auto-link never replaces an existing link, so
newer minutes don't refresh it (`record-auto-link-service.ts:12-21`).

The transparency service already computes per-meeting `minutes_missing` from
`meetings.minutes_approved_at` (`transparency-service.ts:285-334`), but the
score never reads it.

**Fix:** derive the minutes row from held board meetings in the past 12 months.
The row is satisfied only when each has posted, approved minutes. Reuse
`buildMinutesMonths`.

HOAs have no statutory minutes-posting item, so `720_minutes_rolling_12m` is a
product default. Label it that way.

---

### H-6 · Redaction attestation gaps

The attestation (from F-02) is enforced on direct upload, draft posting, file
replace and publish-to-public, for six categories plus unknown
(`document-categories.ts:49-56`).

It is **not** enforced on:

- **authored-minutes publish**
  ([drafts/[id]/publish/route.ts](../../apps/web/src/app/api/v1/documents/drafts/[id]/publish/route.ts)).
  It posts `meeting_minutes` to owners at once with no attestation. Minutes are
  the category most likely to name owners and delinquencies.
- **PM bulk upload** (S-1).
- **publish-to-public for insurance, contracts, declaration and inspection
  reports.** `enforcePublishRedactionAttestation` reuses the upload category
  list, though its own docblock says publishing is a different risk
  (`redaction-attestation.ts:94-119`).

The PATCH that sets `publicAccess` also never checks `sourceType`, so
`violation_evidence` can be made public through the API (`documents-service.ts:195`).

**Fix:**
- Attest on authored publish and on bulk upload.
- Require attestation for **every** category when making a document public.
- Refuse public access for non-library source types.

---

### M-1 · HOA sites cite the condo statute

`STATUTORY_FOOTER_LINE` is hard-coded to "Records maintained under Fla. Stat.
§718.111(12)(g)" ([site-settings.ts:56-57](../../apps/web/src/lib/site-editor/site-settings.ts)),
and the line can be turned on for any community type.

**Fix:** choose §720.303(4) for `hoa_720`, and hide the line for apartments.

### M-2 · Video recordings

(12)(g)2.f allows "the recording **or a hyperlink**", and (12)(a)6 requires
keeping it at least 1 year after posting.

- The row is satisfied only by an uploaded file whose title matches
  recording/video (`record-matching.ts:157`).
- Meetings have no recording-link field.
- The row is not tied to meetings actually held by video conference.

HB 913 also requires video-conference notices to carry the hyperlink, a call-in
number and a physical location. Not modelled.

### M-3 · "Not applicable" and the score

- The API accepts `mark_not_applicable` on **any** row with any 1–200-character
  reason (`compliance/contract.ts:141-155`). That includes the declaration. The
  UI offers it only for conditional rows, and help says no such control exists
  (`compliance-dashboard.mdx:56`). Restrict it to conditional rows server-side.
- The score is computed three ways:
  - derived status (`cross-community.ts:151-169`);
  - `documentId IS NOT NULL` in the PM portfolio SQL
    (`pm-portfolio.ts:425-428,719-722`), which counts drafts, deleted documents,
    late postings and stale rolling items as satisfied;
  - un-derived in the PATCH response (`compliance/route.ts:233`).
- Conditional rows count as unsatisfied in the score, hidden on the website
  records list, and "not required" on the transparency page.

### M-4 · Labels and citations

- Minutes, affidavits and `720_bids` carry `defaultVisibility: 'board'`
  (`templates.ts:94,135,292`). It is a badge only (nothing reads it for access),
  but it tells managers that owner-required records are board-only. Use
  `owner_portal`.
- Contracts and bids cite the general §718.111(12)(g)(2). Cite (g)2.g.
- Meeting notices cite "(2)(h)". In the current text that is the budget; notices
  are (g)2.m and n.
- Affidavits cite (2)(g). In the current text that is contracts; affidavits are
  (g)2.r.
- Video cites (2)(f), which is correct.

The HB 913 renumbering moved several items. Re-map every `statuteReference`
against the table in H-3.

### M-5 · The threshold unit is the condominium, not the association

(12)(g)1 applies to "an association managing **a condominium** with 25 or more
units which does not contain timeshare units". The engine compares
`communities.unit_count` to 25 (`site-diff/required.ts:52-55`,
`posting-deadline.ts:39-41`).

Three gaps:
- A multi-condominium association with several small condominiums is an open
  question the code answers one way silently.
- No timeshare exemption is modelled (not searched exhaustively).
- `posting-requirements.mdx:49` says nothing changes when the count changes,
  but the clocks do switch off below the threshold.

### M-6 · Who gets into the protected section

The statute limits the protected section to owners and association employees.

- A signed-in user can file a join request claiming "owner" of a unit.
  Approval copies the claim into `isUnitOwner`, with only a roster hint
  (`approve-request.ts:99,231,275-280`).
- There is no read-only staff role: staff are either full managers or residents.
- Owners must get credentials on written request. Invitations cover that;
  `import-residents` creates memberships without inviting, which is fine.

**Fix:** show the roster match prominently when approving an owner claim. A
read-only employee role is optional.

### M-7 · Copy that contradicts the engine

- "Within 30 days of creating or receiving" (`posting-requirements.mdx:31`,
  `statute-section.tsx:14-16`, resources). The engine does not do this (H-2).
- `upload-document.mdx:86` and `post-minutes.mdx:50-54` say an upload does not
  satisfy a requirement on its own. Auto-link on upload does exactly that
  (`documents/route.ts:168,390`).
- HOA copy presents the 30-day window as statutory. §720.303 has none.
- `signup-flow.tsx:800` says "past {threshold}". The rule is "25 or more".

Per the 2026-08-09 decision, match the copy to the code where the code is right,
and fix the code where it is not (H-2).

---

### L-1 · ADA / accessibility

- **Title III** has no website regulation, and there is no binding 11th Circuit
  holding: *Gil v. Winn-Dixie* was vacated as moot in 2021. Florida demand-letter
  volume remains high. No Florida website-accessibility safe-harbor statute was
  enacted through 2026.
- **The Title II rule** (WCAG 2.1 AA) covers governments only. Its dates moved
  to 4/26/2027 and 4/26/2028 by the 4/20/2026 interim final rule.
- **What is in place:**
  - an accessibility statement linked from every association site footer;
  - axe coverage of all public block types (`public-site-axe.test.tsx`);
  - a WCAG contrast gate on custom brand colours (`site-diff/contrast.ts`).
- **What is missing:**
  - The transparency page footer has no accessibility link
    (`transparency-footer.tsx`).
  - The statement claims a WCAG 2.1 AA aim on internal testing only, which is
    honest. Keep it that way.
  - No manual screen-reader pass is on record.

### L-2 · Privacy and breach notice (FIPA, §501.171)

- PropertyPro is a "third-party agent" under §501.171. It must notify the
  association **within 10 days** of a suspected breach. The association then
  owes owners notice within 30 days, and the Attorney General notice at 500+
  affected Floridians.
- Portal usernames and passwords count as "personal information".
- The privacy policy promises "timely notification" (`content/legal/privacy.md:158`).
- **To check:**
  - that the customer terms commit to the 10-day notice to the association;
  - that the incident runbook has that clock.
- Association sites do not link a privacy policy; add one in the footer.
- §501.715 (sale of sensitive data) applies only to sellers. PropertyPro does
  not sell data.

### L-3 · Fair Housing Act

§3604(c) and 24 CFR 100.75 apply to any advertising statement, including
association "about" copy and apartment pages. HUD's 2024 digital-advertising
guidance was withdrawn effective 9/17/2025, but the statute and the regulation
are unchanged.

- There are no listing or availability blocks today, so no Equal Housing
  Opportunity notice is needed now.
- Add one, plus a copy review for preference language, if apartment listings
  ever ship.

### L-4 · Login from a custom domain (unverified)

The public header links "Resident Login" to `/auth/login`. On a verified custom
domain, middleware notes that a foreign host never carries a PropertyPro session
(`middleware.ts:1128-1131`).

Not tested: confirm an owner can actually reach the protected section from a
custom-domain site. The statute requires the protected section to exist and be
reachable.

---

## What is in good shape

- **Protected section exists.** Owners read every category. Condo/HOA tenants
  read only declaration and rules, plus inspection reports by opt-in
  (`access-policies.ts:146-183`).
- **Storage is private.** The `documents` bucket is private with default-deny.
  Every read is a signed URL: 1 hour authenticated, 5 minutes public. The public
  buckets accept images only.
- **Public posting is opt-in.** `public_access` defaults to false, and only
  managers can set it.
- **Thresholds are consistent.** 25 and 100 everywhere. An unknown count is
  treated as required.
- **Earlier fixes hold.** The 2026-08-09 fixes (meeting-notice row, redaction
  attestation on the main paths, accessibility statement, public-site axe tests)
  are present.
- **SIRS and milestone.** Rows exist, are conditional, and the no-adequacy-
  language posture holds (`docs/runbooks/release-legal-checks.md`).

## Suggested fix order

1. **S-1**: storage-path ownership check on bulk upload. Small, security.
2. **H-6 + H-1**: attestation on the two missing paths and on every publish to
   public. Retarget "owed" at the owner portal. Drop document URLs from the
   sitemap. Fix the transparency marketing sentence.
3. **H-3 + M-4**: add the missing checklist rows and re-map the citations. This
   is data plus a backfill script (`scripts/backfill-compliance-templates.ts`).
4. **H-4**: an agenda on meetings, shown on the front page, with a 14-day floor.
   Notices scored per meeting.
5. **H-2 + H-5**: a received/created date and yearly cycles. Minutes scored per
   meeting. These are the largest changes and touch the score.
6. **M-1, M-3, M-7** and the Low items.

## Not verified

- **Production data:** whether any document is public, or points outside its
  community (S-1, H-1). The read query was blocked by the session's permission
  policy.
- **Two 2026 bills:** the effect of the reviser's bill (SB 104, ch. 2026-14) and
  HB 797 (ch. 2026-168) on §718.111 and §720.303. Both were read as non-
  substantive from their history notes only.
- **Title III guidance:** whether DOJ's 3/2025 guidance withdrawal included the
  2022 web guidance.
- **Custom-domain login** (L-4).
- **The timeshare exemption**, and multi-condominium counting (M-5).
