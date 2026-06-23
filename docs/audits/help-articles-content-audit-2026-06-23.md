# Help Articles Content Audit — 2026-06-23

**Auditor:** Automated content audit (read-only; no article changes made in this pass).
**Scope:** All 60 published help articles under `apps/web/src/content/help/**`, across 19 categories.
**Focus:** Content only — (a) is each article written clearly and comprehensibly, and (b) does it accurately describe features that actually exist in the app? Every UI label, navigation path, button name, status value, timing rule, statute reference, and workflow claim was traced to the live route/component/service that implements it.

## Relationship to the 2026-06-10 audit

This audit follows `docs/audits/help-content-accuracy-audit-2026-06-10.md` (which reported 58 Critical · 171 High · 88 Medium · 25 Low against a "describes a product that was never shipped" baseline). **The large majority of those Critical/High items have since been remediated** — re-verification confirms the articles now match the code on the previously-broken claims, including:

- Compliance: the fictional "urgency meter" / Calm-Aware-Urgent tiers and the non-existent "finalization date" field are gone; scoring math, KPI card names, and N/A flow now match the UI.
- Finance: the fabricated "saved payment methods / autopay" sections are gone; payment flow now matches the Stripe Payment Element.
- Documents/Meetings: finalization-date steps, "Meeting Minutes" category vocab, and "New X" button names corrected to real labels ("Upload Document", "Create Meeting", "Author Minutes", "Meeting Records").
- Account: export rewritten to the real community-data ZIP; deletion rewritten to the 30-day cooling / 6-month recovery model; profile email correctly read-only.
- Apartment (units/leases/visitors/packages/move-checklists), e-sign, and emergency-broadcast articles are now highly accurate, in several cases documenting real UX limitations verbatim.

This pass therefore reports the **current** residual findings. The total is dramatically lower than the prior audit. Remaining issues cluster in: the PM role-assignment articles, a few cross-feature claims (forum scope, contracts transparency), label drift, and several **coverage gaps** (shipped features with no article at all).

## Findings tally (this pass)

| Severity | Count | Meaning |
|---|---|---|
| HIGH | 11 | Factually wrong, feature doesn't exist as described, internally contradictory, or actively sends the user down a dead end. |
| MEDIUM | ~24 | Imprecise / partially wrong / omits a material field or gate; misleads in some cases. |
| LOW | ~30 | Label casing, frontmatter/keyword nits, minor omissions, unverified-but-plausible. |
| Coverage gaps | 4 | Shipped feature with no help article (or only tangential coverage). |

Counts are approximate for MEDIUM/LOW (label-casing nits are not all enumerated below). HIGH items are listed exhaustively.

---

## HIGH-severity findings (exhaustive)

1. **`pm/adding-cams-and-board-admins.mdx` — the article's central workflow is false.**
   It instructs admins to assign **Community Association Manager / Board Member / Board President / Site Manager** from the **Add Resident** Role dropdown. The Add Resident form offers only **Owner / Tenant** (`apps/web/src/components/residents/resident-form.tsx:29-46`); board/PM designations are assigned exclusively on the root-only **Roles & Access** screen (`/settings/roles`, `RolesAccessClient.tsx:3-14`; the form's own comment at `resident-form.tsx:26-28` says so). The article also claims there is **no in-app role-change control** and that all changes "go through support" — but Roles & Access *does* support promote/revoke PM, transfer root, and set/clear board designations (`useAssignPropertyManager`, `useRevokePropertyManager`, `useSetDesignation`). → *Fix:* rewrite around "add as resident, then designate via Roles & Access"; "contact support" is only accurate for CAM/site_manager, which that screen doesn't expose.

2. **`pm/onboarding-a-new-community.mdx` — "add the board roster via Residents → Add Resident … with role Board President or Board Member."** Same root error as #1 — board roles cannot be set in Add Resident (`resident-form.tsx:29-46`). → *Fix:* add as residents first, then designate on Roles & Access.

3. **`pm/managing-multiple-communities.mdx` — "Invite board members and CAMs via Residents → Add Resident."** Same root error (`resident-form.tsx:29-46`). → *Fix:* point to Roles & Access for board/CAM assignment.

4. **`forum/using-the-board-forum.mdx` — "private space for board members and approved staff" contradicts the code and the article's own access table.** The RBAC matrix grants `polls` read+write to **every role including owner and tenant** (`packages/shared/src/rbac-matrix.ts:353-362`); forum routes gate on `polls:read`/`polls:write` (`forum/threads/route.ts:36,78`). The forum is community-wide, not board-only. → *Fix:* reword the intro to "open to all community members (owners, tenants, board, staff)."

5. **`contracts/tracking-vendor-contracts.mdx` — entire "Public posting on the transparency page" section is false.** The transparency page surfaces only **documents** (by category) and **meeting notices** — never contracts (`transparency-service.ts:6-7,55-70,89-99`; `transparency-page.tsx:55-80`). There is no contract/vendor field in the transparency payload. → *Fix:* delete or rewrite the section.

6. **`violations/arc-acc-submissions.mdx` — instructions to "enter the specific reasons in Review Notes" contradict the read-only UI.** The ARC detail panel is display-only; there is no Review Notes input or approve/deny control (`ArcSubmissionsTab.tsx:180-256`). The decision/notify logic exists at the API (`/api/v1/arc/[id]/decide`, `/review`, `notifyArcDecision()` at `violations-service.ts:294-332`) but is not wired into this UI. The article both tells you to enter notes and (elsewhere) says to "record your decision outside the app." → *Fix:* make it consistent with the read-only queue; flag for re-review if/when a decision UI ships.

7. **`announcements/creating-and-publishing-announcements.mdx` — a "Preview" step that doesn't exist.** "Use the preview to see exactly what residents will receive…" — the composer has Title, Message (TipTap), Audience, Pin, and a submit button only; no preview control (`announcement-composer.tsx`). → *Fix:* delete the Preview step.

8. **`getting-started/managing-community-faqs.mdx` — mobile reorder instructions lead to a dead end.** "On mobile (`/mobile/help/manage`), use the up/down arrows to reorder." `/mobile/help/manage` is a **redirect-only page** to the desktop `/help/manage` (`mobile/help/manage/page.tsx:26`), which has **no reordering UI**. The `MobileFaqManageContent` component (with chevrons + `useReorderFaqs`) is **orphaned — rendered nowhere**. Despite `/api/v1/faqs/reorder` existing, reordering is unreachable through any rendered page. → *Fix:* remove the mobile-reorder paragraph or note reordering is currently unavailable in the UI.

9. **`compliance/reviewing-the-compliance-dashboard.mdx` — wrong filter "buckets."** Article says four buckets "Satisfied / Overdue / Action needed / Not applicable." The real filter chips are **Action needed · All · Overdue · Due ≤ 7 days · Satisfied** (`compliance-queue.tsx:165-179`; `FilterKey` in `compliance-pill-mapping.ts:38`). There is no "Not applicable" chip; the article omits the "Due ≤ 7 days" chip. It also mis-defines "Action needed" as "deadline not passed," whereas the filter includes overdue + due-soon + board-action rows (`needsAttention()`, `compliance-calculator.ts:125-142`). → *Fix:* list the five real chips and correct the Action-needed definition.

10. **`compliance/document-posting-requirements.mdx` — phantom financial requirements.** Lists "reserve study, audit" as financial-records requirements; the condo template has only **Annual Budget** and **Annual Financial Report** (`templates.ts:64-80`). "Reserve study" exists only as the conditional **SIRS** row under operations; there is no "audit" requirement. It also lists "meeting notices/agendas" as a condo meeting requirement — that row is **HOA-only** (`720_meeting_notices`, `templates.ts:223`); condos track minutes/video/affidavits. → *Fix:* drop reserve study/audit; qualify notices/agendas as HOA-only; label insurance as "Current Insurance Policies."

11. **`pm/adding-cams-and-board-admins.mdx` (second HIGH) — "no in-app way to change/remove an existing member's role; all changes go through support."** Counted separately because it is a distinct false claim repeated across the article (lines re: 74, 96-97, 122-123, 141, 171) and contradicts the live Roles & Access capabilities (see #1). → *Fix:* point board/PM role changes to Roles & Access.

---

## MEDIUM-severity findings (by category)

**Getting started / Account**
- `welcome-to-propertypro.mdx` — "Everyone sees Dashboard, Documents, Meetings, Announcements" overstates: Meetings (`featureKey: hasMeetings`) and Operations (feature-gated) are not guaranteed for all communities (`nav-config.ts:96,119`). Payments visibility also depends on `hasFinance`, not just role.
- `joining-your-community.mdx` — page H1 is **"Join Another Community"**, not "Join Community" (`join-community/page.tsx:18`).
- `understanding-your-dashboard.mdx` — implies the onboarding checklist is an admin-only addition; it renders for all users (`dashboard/page.tsx:92`).
- `managing-notifications.mdx` — omits the "Calendar event reminder timing" section (meeting/assessment reminder toggles + timing preset) that the form shows to meeting/finance readers (`notification-preferences.tsx:102-184`).
- `exporting-your-data.mdx` — `roles` frontmatter omits **site_manager**, who has access (route grants `settings:read`; `export/route.ts:10-12`).
- `requesting-account-deletion.mdx` — "What's deleted" lists **photo** (no profile-photo feature exists) and **saved payment methods** (no per-user stored payment methods found). Risks overpromising.

**Compliance / Audit / Transparency**
- `compliance-scoring-explained.mdx` — presents 14-day/48-hour notice timing under "What moves the score," but the calculator only handles 30-day deadlines and 12-month rolling windows (`compliance-calculator.ts:40-78`); notice timing is displayed, not scored. Also calls the "Posting windows" KPI the "Due inside 7 days KPI."
- `reviewing-the-compliance-dashboard.mdx` — "Due inside 7 days KPI" should be the **Posting windows** KPI (Due inside 7 days is its subtitle); "30-day window" framing ignores rolling-window items with no fixed deadline.
- `fixing-compliance-gaps.mdx` — troubleshooting tip "verify the file is under the correct category" is wrong and self-contradictory: satisfaction depends solely on the document being *linked to the row* (`documentId != null`, `compliance-calculator.ts:62`), never on library category. Also uses the unshown label "Unsatisfied" (UI pill reads "Action needed").
- `understanding-sirs-inspections.mdx` — upload step links a doc uploaded to the "Inspection Reports" category to the "SIRS row," conflating two distinct requirements (`718_sirs` vs `718_inspection_reports`).
- `audit/reviewing-the-audit-trail.mdx` — "Open /audit-trail" — the bare route redirects to dashboard without `?communityId=` (`audit-trail/page.tsx:24-26`); say "open Audit Trail from the sidebar."

**Documents / Meetings**
- `finding-community-documents.mdx` — "preview works for any file within the limit" is wrong: only PDFs and images preview inline; DOCX must be downloaded (`document-preview-loader.ts:62-64`).
- `searching-and-filtering-documents.mdx` — promises filtering by **date** or **posting status** ("Three ways to narrow the list"); the library UI exposes only category filter + text search (`document-search.tsx`). Date/mimeType filters exist only in the backend, not the UI.
- `viewing-meetings-and-notices.mdx` — "enable Email Calendar Reminders on the Meetings page" — that card is purely informational with no toggle (`meetings-page-shell.tsx:107-139`); reminders are managed in Settings.
- `meeting-notices-explained.mdx` — the "how PropertyPro calculates notice windows" callout omits the **Committee** type (also 48-hour), inconsistent with the sibling `creating-meeting-notices.mdx` which lists all five types (`meeting-form.tsx:302`, `meeting-calculator.ts:22`).
- `posting-meeting-minutes.mdx` — presents file upload (Step 3) and in-app "Author Minutes" (Step 4) as sequential steps of one flow; they are two mutually exclusive options (`meeting-detail-modal.tsx:243-249`).

**Finance / Announcements / Emergency**
- `creating-and-tracking-assessments.mdx` — "Open Payments → Assessments" is ambiguous: the admin lands on **Overview** by default, which itself contains an "Assessments" sub-tab in addition to the top-level Assessments tab (`AdminPaymentsTabs.tsx:17-19`, `finance-dashboard.tsx:108-113`).
- `creating-and-publishing-announcements.mdx` — button label is **"Publish announcement"**, not "Publish" (`announcement-composer.tsx:79`).

**Maintenance / Violations / Residents**
- `assigning-vendors-to-work-orders.mdx` — "staff mark the work order complete from Operations" overstates the UI: work orders render as read-only cards (`operations-hub.tsx:486-499`); the complete/PATCH endpoints exist but are not surfaced.
- `reporting-and-managing-violations.mdx` — first action button is **"Send Notice"**, not "Send Violation Notice" (`ViolationDetailView.tsx:58`).
- `inviting-and-managing-residents.mdx` — Add-Resident field list omits **Full name (required)** and **Phone**, and calls the required numeric **Unit ID** field "unit number" (`resident-form.tsx:159-233`).

**Apartment / Elections**
- `running-a-board-election.mdx` — understates the **attorney-review gate**: elections are hard-blocked (403) until a platform admin sets `electionsAttorneyReviewed = true` (defaults off; `lib/elections/common.ts:17-19`). The article treats sign-off as advisory. Also implies a candidate add/reorder UI that doesn't exist (candidates are read-only; no candidate endpoint) — candidates, like elections, are created out-of-band.

**PM**
- `onboarding-a-new-community.mdx` / `customizing-pm-branding.mdx` — portfolio **Templates** (`/pm/portfolio/templates`) are gated to **Operations Plus only** (`plan-features.ts:120`); stated as universally available.
- `customizing-pm-branding.mdx` — **custom domain** is **Professional+** (`plan-features.ts:88,119`; `CustomDomainCard.tsx`), not on Essentials; not mentioned. Also references a non-existent "**Management Contact**" help page (broken cross-reference).
- `managing-multiple-communities.mdx` — calls the PM dashboard "**Portfolio**" and names a "Portfolio breadcrumb"; the nav item and page header are both "**Communities**" (`nav-config.ts:303-307`, `PmDashboardClient.tsx:106`) — this also violates the documented design rule (Communities, not Portfolio). Also lists "Timezone" as an Add-Community field; the modal has no timezone input (`add-community-modal.tsx`).

---

## LOW-severity findings (representative; not exhaustive)

Mostly label casing and frontmatter/keyword nits, none misleading:
- Button-label casing: "Save" vs **"Save Preferences"**; "New lease" vs **"New Lease"**; "Documents to sign" vs **"Documents to Sign"**; "Targeted" vs **"Total"** column in the emergency delivery report.
- Stray frontmatter keywords describing non-existent fields: `photo`/`avatar` (profile), `bedrooms`/`square footage`/`amenities` (units).
- `apartment/managing-units-and-buildings.mdx` omits the **Rent** column shown for apartment units.
- Convenience-fee omission in both payment articles (the UI surfaces a fee for `owner_pays` communities).
- A couple of unverified-but-plausible references worth a manual check before publishing: the feedback-widget "your community admin sees it" claim (welcome) — widget copy says it helps "improve help content," not that an admin reviews it; and "Help → Management Contact" (password-and-security).

---

## Coverage gaps — shipped features with no (or only tangential) help article

These are features that exist in the product (nav entries and/or API routes) but have **no dedicated help article**, so the help center does not fully "describe the available features":

1. **Amenities & Reservations.** The Operations tab includes a Reservations sub-tab gated by `hasAmenities` (`nav-config.ts:119`, `operations-hub.tsx:65-70`; routes `/api/v1/amenities`, `/api/v1/reservations`). No article covers booking/managing amenities or reservations.
2. **PM Portfolio Templates.** "Templates" is a top-level PM nav item (`PM_NAV_ITEMS`, `nav-config.ts:317-323`; routes under `/pm/portfolio/templates`). Only mentioned in passing by branding/onboarding articles (with the plan gate omitted); no standalone guide.
3. **Community-level Website / public site editor.** The community sidebar has a "Website" launcher into `/pm/settings/website` (`nav-config.ts:162-169`). Only the PM-branding article touches this surface; there is no resident/admin-facing article on the community website/site editor itself.
4. **Notifications center (bell) as a feature.** Read-state, the notifications page, and the bell dropdown are referenced inside other articles but have no dedicated article, despite being a primary cross-cutting surface.

(For contrast, `emergency/sending-an-emergency-broadcast.mdx` has no sidebar nav entry but *does* have an article and is accurate — that is fine, not a gap.)

---

## Cross-cutting patterns

1. **PM role-assignment is the biggest remaining accuracy cluster.** Three PM articles still teach "assign admin/board/CAM roles via Add Resident," which is impossible — the canonical path is the root-only **Roles & Access** screen. This is the single highest-impact fix.
2. **Plan-gating is under-disclosed in PM articles.** Portfolio Templates (Operations Plus) and custom domains (Professional+) are presented as universally available.
3. **Backend-exists / UI-absent.** Several articles describe actions whose API exists but whose UI does not (ARC decisions, work-order completion/reassignment, maintenance comments, FAQ reorder). These are accurate only as "not yet available in the UI" and should be phrased that way; they are also re-review triggers when the UI lands.
4. **Label/vocabulary drift** remains the most common low-severity issue (button casing, "Portfolio" vs "Communities", "Send Notice" vs "Send Violation Notice", KPI "Posting windows" vs "Due inside 7 days").
5. **Stale platform doc (not an article bug):** `CLAUDE.md` / `.claude/rules/api-patterns.md` advertise `/api/v1/calendar/meetings.ics` and `my-meetings.ics`, but no `.ics`/`text/calendar` route exists in the codebase. The `viewing-meetings` article is correct to tell users to copy details manually; the route catalog is what's stale.

---

## Prioritized fix list

**Tier 1 (HIGH — correctness/dead-ends):**
1. Rewrite the role-assignment flow in `pm/adding-cams-and-board-admins.mdx`, `pm/onboarding-a-new-community.mdx`, `pm/managing-multiple-communities.mdx` → Roles & Access.
2. Fix the forum scope framing in `forum/using-the-board-forum.mdx`.
3. Delete/rewrite the transparency-page section in `contracts/tracking-vendor-contracts.mdx`.
4. Resolve the Review-Notes contradiction in `violations/arc-acc-submissions.mdx`.
5. Remove the phantom Preview step in `announcements/creating-and-publishing-announcements.mdx`.
6. Remove/relabel the dead mobile-reorder path in `getting-started/managing-community-faqs.mdx`.
7. Correct the compliance filter buckets in `reviewing-the-compliance-dashboard.mdx` and the phantom requirements in `document-posting-requirements.mdx`.

**Tier 2 (MEDIUM — disclosure/precision):** plan-gate disclosures (PM templates, custom domain), the "Portfolio"→"Communities" rename, DOCX-preview correction, the elections attorney-review gate, the maintenance/work-order completion caveat, the Add-Resident field list, and the missing notification/Committee-type details listed above.

**Tier 3 (coverage):** author articles for Amenities/Reservations, PM Portfolio Templates, the community Website/site editor, and the Notifications center.

**Tier 4 (LOW):** label-casing sweep and frontmatter/keyword cleanup.

---

*No article files were modified in this pass. Evidence citations above are `file:line` against the repository at the time of audit (branch `claude/help-articles-audit-x3nwav`).*
