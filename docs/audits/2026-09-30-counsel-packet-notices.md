# Counsel Packet — Generated Violation & Hearing Notices, Fining, ARC, E-Sign Consent

**Prepared:** 2026-09-30 · **Status:** awaiting counsel — nothing below is approved
**Covers:** items 2 and 5 of `2026-08-09-legal-risk-audit.md` §5 ("What to take to counsel
first"), plus the e-sign consent question added there on 2026-09-28. One session,
estimated 1–2 hours.
**Attach:** three sample PDFs generated from demo data by the code on `main` after #1250
(`sample-violation-notice.pdf`, `sample-hearing-notice.pdf`,
`sample-hearing-notice-short-notice.pdf`). They regenerate from code, so they are not
committed; ask for a fresh set if the templates change.

**What rides on the answers:** generated notices are switched off for every community
(`noticePdfGenerationEnabled`), and the two download routes have no button in the UI. The
engineering trigger is written down (`apps/web/src/lib/violations/common.ts`): *counsel
approves enabling notices for a first community → wire the buttons in that PR, not
before.* A "no" means replacing the feature with a blank, association-authored template.

---

## 1. What the notices say today (not what the 2026-08-09 audit saw)

The audit reviewed an earlier text. Before #1250 (2026-09-30) the PDFs also rendered only
their first line, so no one — including the audit — could have read the output as an
owner would. Changes since:

| Audit concern | Current text (see the PDFs) |
|---|---|
| Software producing an apparently final legal notice | Opens with **"DRAFT — FOR REVIEW BY THE ASSOCIATION AND ITS COUNSEL"** and "has not been reviewed by an attorney"; closes with "PropertyPro is not a law firm…". Signature line is blank ("Authorized representative: ____"), never "Board of Directors". |
| Enumerating the owner's rights | "Your Rights" / "Hearing Procedure" now **point to** the governing documents and Florida law rather than list rights. |
| Certifying 14-day compliance | States a **measurement** ("dated N days before the scheduled hearing"); when N < 14 it adds a bold "fewer than 14 days … Verify before sending". Days are counted in the community's calendar. |
| Board imposing fines | "a committee of members who are not officers, directors, or their relatives (F.S. 718.303 / 720.305)". |
| Hardcoded $100 / $1,000 caps | States the **community's effective caps** — the same numbers the fine service enforces ($100 / $1,000 unless an override is stored in that community's settings; no screen sets one today, so an override means a platform operator edited the record). |

## 2. Questions

1. **UPL.** Does a software vendor generating these documents — DRAFT-marked, from data
   the association entered, for the association to review and send — constitute the
   unauthorized practice of law in Florida? Does the DRAFT marking plus the removal of
   legal conclusions cure it? *(Decides: enable vs. blank template.)*
2. **Sentences we believe still assert law or fact, and did not change because wording is
   yours.** Keep, soften, or remove each:
   - Violation notice, hearing section: *"You have the right to attend the hearing and
     present evidence in your defense."* — the one remaining enumerated right.
   - Violation notice: *"You are hereby notified that the above violation must be
     corrected within 14 days of the date of this notice (by …)."* — the 14-day default is
     ours when the association sets none.
   - Both: *"This notice is issued pursuant to … F.S. Chapter 718 and/or … Chapter 720."*
   - Hearing notice: *"If you do not attend, the hearing may proceed in your absence."*
3. **Fining (§718.303(3) / §720.305(2)).** Is the committee sentence correct and
   sufficient? Are the default caps ($100 per violation, $1,000 aggregate) right for both
   condos and HOAs post-2024 amendments, and is a per-association override (from its
   governing documents) the right model?
4. **Notice period.** Is 14 days the right threshold for the warning in both regimes, and
   is "calendar days from the notice date to the hearing date" the right count?
5. **ARC denials (§720.3035 as amended by HB 1203).** The product refuses a denial with no
   written reason and no rule/covenant reference (`apps/web/src/app/api/v1/arc/[id]/decide/contract.ts`).
   Is that the complete content requirement?
6. **E-sign consent withdrawal (ESIGN Act).** Facts: consent is recorded implicitly the
   first time a user completes a signing; withdrawal exists only as a manager-only API with
   no UI, so a resident cannot withdraw their own; the next signing silently re-records
   consent. Production held zero consent records on 2026-09-28. Do the consumer-disclosure
   rules apply when an association sends owners documents to e-sign, and if so what must
   withdrawal look like?
7. **Owner consent to electronic notice (§718.112(2)(d), §720.303).** Facts: since
   migration `0090_notice_consent`, an owner can tick an optional, unchecked box when
   accepting an invitation, or give or withdraw consent later in Settings. Tenants and
   managers are not offered it. Each consent stores the exact wording, its version
   (`NOTICE_CONSENT_VERSION` in `packages/shared/src/notice-consent.ts`, currently
   `2026-10-06.1`), the email address it covers, IP address, user agent and time.
   Withdrawal stamps the row; consenting again adds a new row, so history is kept. Every
   change is written to the audit log. Managers see an "E-notice" marker in the residents
   list, and the community export includes the records. **Nothing changes how notices are
   delivered**: the screens say "Recorded only. Notices are still delivered the way they are
   today." The current wording is:

   > I consent to receive official notices from my association by email at
   > {email}, instead of by mail or hand delivery. This includes notices of owner and
   > board meetings and other notices Florida law requires the association to send. I can
   > withdraw this consent at any time in Settings, and I will keep my email address up to date.

   Questions: (a) Is this wording, given this way, a valid written consent under both
   statutes? (b) Does a consent cover only the address it names, so a changed email needs
   a new consent? The product currently asks for one. (c) Must the association, rather than
   PropertyPro, collect or countersign it? (d) What would have to be true before an
   association may rely on these records to stop sending paper notice?

## 3. Known gaps in the samples (engineering, not for counsel to fix)

- The addressee is always "Unit Owner/Resident" and the hearing location is not stored.
  Both are deferred until counsel says they are required.
- The aggregate cap prints as "$1000.00" (no thousands separator) and the notice "Date:"
  prints as `2026-03-23` while other dates are spelled out — cosmetic; will be fixed with
  any wording change counsel asks for.

## 4. Sign-off (for counsel)

| Question | Decision | Notes |
|---|---|---|
| 1. UPL / DRAFT cure | | |
| 2. Remaining sentences | | |
| 3. Fining committee and caps | | |
| 4. Notice period | | |
| 5. ARC denial content | | |
| 6. E-sign consent withdrawal | | |
| 7. Electronic-notice consent | | |
