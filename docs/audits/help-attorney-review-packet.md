# Help Center — Attorney Review Packet

**Prepared:** 2026-06-12  
**Status:** Frozen for internal product-compliance use, subject to Florida counsel confirmation and 2026 legislative recheck — freeze edits applied 2026-06-12  
**Scope:** Four statutory topics flagged during the June 2026 help-content accuracy audit.

**Caveat:** Florida-specific, current-law-specific. Recheck after any 2026 legislative changes become effective. This packet reflects **internal legal/compliance review** — not licensed Florida counsel sign-off unless separately obtained. “Approved” does not mean zero caveats; associations should still consult counsel for community-specific obligations.

---

## Sign-off summary

| Topic | Decision | Notes |
| ----- | -------- | ----- |
| SIRS milestone age | **Approved** | Post-report distribution/posting obligations added; §719.106(1)(k) for cooperative SIRS. |
| Transparency password framing | **Approved** | Website/mobile-app framing; owner or employee access; condo vs. HOA record-list distinction. |
| Election notice timing | **Approved** | Information-sheet terminology; §718.128 e-voting in article Phase 3 (see follow-up). |
| Minutes 30-day clock | **Approved** | Website/application subsection scope explicit; UI label **Target post by** with contextual hover. |

**Applied in:** four MDX articles + meeting detail modal (paths below).

---

## 1. SIRS milestone age — approved product-compliance language

**Article:** `apps/web/src/content/help/compliance/understanding-sirs-inspections.mdx`

Florida milestone inspection requirements apply to condominium and cooperative buildings that are three habitable stories or more, subject to statutory exclusions. The default first milestone inspection is due by December 31 of the year the building reaches 30 years of age, measured from the certificate of occupancy, and every 10 years thereafter. A local enforcement agency may require the first milestone inspection by December 31 of the year the building reaches 25 years of age based on local circumstances, including environmental conditions such as proximity to salt water. Once the local enforcement agency issues written notice that a milestone inspection is required, additional statutory notice and completion deadlines apply, including owner-notice obligations and phase-one inspection timing. Associations may also have separate statutory obligations after receiving a phase-one or phase-two milestone inspection report, including owner distribution, conspicuous posting, and website or application publication where applicable.

Structural Integrity Reserve Studies are related but separate. Covered residential condominium associations must complete and update SIRS under §718.112(2)(g); covered residential cooperative associations have parallel requirements under §719.106(1)(k), including transition deadlines and coordination rules under Chapter 719. Do not assume the SIRS deadline is always the same as the milestone inspection deadline.

---

## 2. Transparency page — approved product-compliance language

**Article:** `apps/web/src/content/help/transparency/configuring-the-transparency-page.mdx`

Florida law may require certain condominium and homeowners' associations to make specified records available through an association website or mobile application, including protected electronic sections for owner or employee access, as applicable. For condominium associations with 25 or more non-timeshare units, §718.111(12)(g) requires specified records to be posted or made available digitally and requires a protected electronic location that is inaccessible to the general public and accessible only to unit owners and association employees. For homeowners' associations with 100 or more parcels, §720.303 imposes a similar website/application requirement and protected-access framework for parcel owners and association employees.

The categories and timing of required records differ between condominium associations and homeowners' associations.

PropertyPro's transparency page shows posting and access-control status. It does not determine which records your association must post, which records must be redacted, or which users must receive access credentials. Protected access does not override statutory redaction or non-disclosure requirements.

---

## 3. Election notice timing — approved product-compliance language

**Article:** `apps/web/src/content/help/elections/running-a-board-election.mdx`

For Florida condominium board elections, the first notice of the election date must be mailed, delivered, or electronically transmitted at least 60 days before the scheduled election. A candidate must submit written notice of intent at least 40 days before the election. The second notice, together with the ballot listing all candidates, must be mailed, delivered, or electronically transmitted not less than 14 days and not more than 34 days before the election.

A candidate who wants an information sheet included with the second notice and ballot must furnish the sheet at least 35 days before the election.

HOA election procedures are governed separately by §720.306 and the association's governing documents, including any applicable statutory notice, ballot, eligibility, and election-challenge rules.

**E-voting note:** §718.128 opt-in requirements are addressed separately in the article (Phase 3 — Voting window); election notice timing alone does not authorize e-voting.

---

## 4. Meeting minutes 30-day clock — approved product-compliance language

**Article:** `apps/web/src/content/help/meetings/posting-meeting-minutes.mdx`

For condominium associations subject to §718.111(12)(g), approved board minutes are among the records that must be posted or made available through the association's website or application. Unless a shorter deadline applies, records required to be posted under the website/application subsection must be made available within 30 days after the association receives or creates the listed official record. Because the website-posting subsection refers to approved board minutes, the statutory website-posting deadline should not be described as automatically running from the meeting date.

PropertyPro displays a **Target post by** label on the meeting detail modal (30 days after meeting date) as a conservative internal reminder based on meeting date. Hover text: *Conservative internal reminder based on meeting date; statutory website-posting deadlines may depend on when approved minutes are created or received. Confirm with counsel.*

**Additional note:** Video-conference meeting recordings have separate posting requirements under §718.111(12)(g); §720.303 separately treats HOA minutes as official records.

---

## Follow-up items

### Engineering (minutes deadline)

PropertyPro's meeting-date target is a conservative internal reminder, not the statutory website-posting trigger. A future product change could support both a conservative internal target measured from meeting date and a statutory website-posting deadline measured from the approval or creation date of approved minutes.

### E-voting (§718.128 legislative recheck)

Before the next legislative cycle, separately verify Phase 3 e-voting copy in `running-a-board-election.mdx` against §718.128 and any 2026 amendments or pending changes. Election notice timing alone does not authorize electronic voting.

### Cross-article consistency (help center)

Searched `apps/web/src/content/help/` on 2026-06-12 for stale phrases:

| Phrase | Result | Action |
| ------ | ------ | ------ |
| `candidate bio` / `bios` | Found in `elections/running-a-board-election.mdx` | **Fixed** — replaced with "information sheet" terminology |
| `SIRS cadence` / `same cadence` | No matches | None needed |
| `milestone age 30` (without 25-year caveat) | No matches | SIRS article includes 25-year local caveat |
| `password-protect` | Found in `transparency/configuring-the-transparency-page.mdx` FAQ only | **No change** — counsel-approved framing |
| `Minutes post by` | No matches in help MDX | UI already uses **Target post by**; help cross-refs updated |

Re-run this grep after future help articles are added or after 2026 legislative changes.
