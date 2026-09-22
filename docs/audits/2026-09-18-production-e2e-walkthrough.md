# Production E2E walkthrough — 2026-09-18

**Date:** 2026-09-18, 08:14–08:28 EDT (12:14–12:28 UTC)
**Target:** live production (`https://www.getpropertypro.com`), not a local stack and not a preview.
**Account:** signed-in root manager “Test Ruckus” of two communities.
**Predecessor:** [`docs/LAUNCH-BLOCKERS.md`](../LAUNCH-BLOCKERS.md) (last re-verified 2026-09-09) and [`docs/audits/2026-08-07-pre-launch-readiness-audit.md`](2026-08-07-pre-launch-readiness-audit.md).

> This is a **click-through of the live product with a real session**, not a code audit and not a
> Playwright suite. Nothing was written to production: dialogs were opened and cancelled; no unit,
> resident, document, announcement, payment, or site publish was saved.

**Question asked:** can this account start using PropertyPro as intended, and what would stop it?

**Short answer:** the manager can sign in and operate both test communities. Almost every
authenticated surface renders. Neither community is ready for real owners: setup is 0–1 of 6, there
are no units and no other members, statutory records are 0/16, and the public sites are unpublished.
One URL crashes (elections). Admin nav is in the DOM but clipped below the fold. Checkout’s
**publishable** key is now live (`pk_live_…` as of this morning), which updates the 2026-09-09
LAUNCH-BLOCKERS reading of `pk_test_…` — secret-key / price-id alignment was not verified here.

---

## How this was verified

A headed Chromium window was attached to the operator’s machine. The operator signed in by hand.
The session then walked production as that user:

- **84 route visits** across both communities, PM portfolio, `/mobile/*`, marketing, and signup.
- A second pass opened **Add unit**, **Add Resident**, **Create Meeting**, **New Announcement**,
  **Upload Document**, command palette, notifications, profile menu, and the website editor.
- Guessed public hosts `sunset-towers.getpropertypro.com` and
  `breakaway-apartments.getpropertypro.com`.
- Read-only probes: `GET /api/health` on web and admin; signup-checkout chunk grep for the Stripe
  publishable key; Vercel runtime-error clusters for the last 7 days.

Screenshots and the machine-readable walk live under `tmp/e2e-screenshots/` and
`tmp/e2e-walk-results.json` in the worktree that ran the session. Those are session artifacts, not
the record of truth; this file is.

**Limits, stated plainly.**

- Viewport was **1440×900**. No phone pass. The 2026-09-14 responsive audit is the authority on
  overflow and touch targets.
- One persona: **root_manager**. Residents, tenants, board-only, and platform-admin were not
  driven. `apps/admin` was not opened.
- Classifier noise: after the elections crash, later pages inherited leftover `console-error` /
  `failed-request` flags. Do not treat the walk JSON `flags` array as a per-page defect list.
  Findings below are from screenshots and the page body, not from that classifier.
- Many `net::ERR_ABORTED` rows are Next.js RSC navigations cancelled by the next `goto`. They are
  not application failures.
- Local `HEAD` at writing was `291663fb`. Production is whatever Vercel had on
  `www.getpropertypro.com` at 12:14 UTC, which is not claimed to be that SHA.

---

## Account under test

| | Breakaway Apartments | Sunset Towers |
|---|---|---|
| `communityId` | 133 | 134 |
| Type | Apartment | Condo §718 |
| Plan (billing page) | Operations Plus, $499/mo, **Active** | Professional, $349/mo, **Active** |
| Role | Root manager | Root manager |
| City shown | **Mimi, FL** | Tampa, FL |
| Setup checklist | 0 of 6 | 0 of 6 at first dashboard load; 1 of 6 after visiting Compliance |
| Units | 0 | 0 |
| Other members | none | none (only the signed-in root manager) |

PM portfolio KPIs at `/pm/dashboard/communities`: Units 0, Occupancy 0%, Open maint. 0,
Compliance 0%, Delinquency $0. Banner: “Finish setting up your community website.”

---

## Verdict

| Question | Answer |
|---|---|
| Can the manager sign in and click around? | **Yes.** |
| Can a real association use this as their system of record today? | **No** — empty data, unpublished site, 0/16 statutory coverage. |
| Is the product down? | **No.** Web and admin `/api/health` both `"ok"` at 12:27 UTC. |
| What is the one hard crash? | Direct `/board/elections` → global error page. |
| What is still launch-policy, not a bug? | E-voting off until attorney review (`electionsAttorneyReviewed`). |

---

## Findings

Numbered so they can be cited. Severity is about **this account going live with owners**, not
about whether the code exists.

### F1. Both communities are unonboarded — this is what would stop a real association

**Severity:** blocker for “use as intended,” not a code outage.

Sunset Towers dashboard, first load: **Finish setting up your community — 0 of 6 complete**

1. Upload your first compliance document
2. Add your units
3. Add a board member or resident
4. Review your compliance score
5. Post your first announcement
6. Customize your portal

Breakaway Apartments is the same list with apartment copy (“Upload your community rules”).

Until units exist:

- Violation report: **Resident’s Unit** = “No units available”; File is disabled in practice.
- Add Resident requires a **Unit ID** with nothing to pick.

Until governing docs exist, the product’s statutory promise is empty (F2).

### F2. Sunset Towers compliance is 0/16, already overdue

**Severity:** expected for a new condo; the product is working. Still the reason this community
cannot be shown to an owner or a regulator as “in use.”

- Documents timeline: **16 statutory records · 0 covered · 0 on the public site.** Every governing
  record is **Missing**.
- Compliance: **0 of 16 items satisfied**, Action needed 12, **Overdue 11**. Getting-started queue
  leads with Declaration, Bylaws, Articles, Rules & Regulations.

Visiting this page appears to have ticked “Review your compliance score” (checklist later read
**1 of 6**). Viewing is not posting.

### F3. Public sites are unpublished — guessed hosts 404

**Severity:** blocker for owner-facing use.

Website editor (`/pm/website-editor?communityId=134`): “Your site is using default settings. Run
the 5-step onboarding wizard…” Home has no sections.

Direct visits:

| URL | Body |
|---|---|
| `https://sunset-towers.getpropertypro.com/` | “Community not found.” |
| `https://breakaway-apartments.getpropertypro.com/` | “Community not found.” |

Those slugs were guessed from the display names. A wrong slug and an unpublished site look the
same from outside. Either way, no public portal is reachable for these two communities yet.
`/transparency` on www still explains the intended `[slug].getpropertypro.com` pattern.

### F4. `/board/elections` crashes instead of showing the attorney-review gate

**Severity:** product bug. The *feature* being off is deliberate (LAUNCH-BLOCKERS: e-voting gated,
migration `0062_secret_ballot` unapplied). The *URL* should not 500.

- `/communities/134/board` (polls): “Polls and forum discussions live here. **Elections appear
  after attorney review is complete.**” Only Polls / Forum tabs. This is the intended UX.
- `/communities/134/board/elections`: full-page **Something went wrong** / “We couldn’t load this
  page.” Console: Server Components render error (message omitted in production).

Cause in code, not inferred from the screenshot: `requireElectionsEnabled`
(`apps/web/src/lib/elections/common.ts`) throws `ForbiddenError` when
`electionsAttorneyReviewed` is false. The page calls it during RSC render
(`communities/[id]/board/elections/page.tsx`). `apps/web/src/app/error.tsx` is a generic
boundary — it does not map that forbid to the copy the Board chrome already has.

### F5. Admin nav is present and clipped; scrollbar is hidden

**Severity:** UX. Pages are reachable by URL and ⌘K; a manager who only uses the rail will miss
Compliance, Residents, Units, Contracts, E-Sign, ARC, Audit Trail.

Measured on Sunset Towers dashboard at 1440×900:

```
rail scrollHeight 1180
rail clientHeight  727
canScroll          true
```

`NavRail` uses `overflow-y-auto` with `scrollbar-width: none` and webkit scrollbar hidden
(`packages/ui/src/components/NavRail.tsx`). The Admin section label is visible only after
scrolling; on the apartment dashboard it peeks as “ADMIN” above Collapse. Clicking the Admin
header collapsed a section that was already open in the DOM but off-screen.

### F6. Breakaway checklist still offers a compliance step apartments cannot open

**Severity:** copy / onboarding bug.

Apartment dashboard includes “Review your compliance score.”
`/communities/133/compliance` (and contracts / violations) redirected to

```
/select-community?returnTo=%2Fdashboard%3Freason%3Dfeature-not-available
```

Apartments are excluded from the statutory engine. The checklist should not send an apartment
root manager into a feature-not-available bounce.

### F7. City string “Mimi, FL” on Breakaway Apartments

**Severity:** data. Community picker and card copy. Almost certainly Miami. Fix in community
profile, not in code.

### F8. First paint of a few management surfaces is skeleton-only

**Severity:** polish / possible hang; not re-waited to completion.

- `/settings/roles`: heading “Roles & Access”, body three empty skeleton blocks at screenshot
  time.
- Document **Upload Document**: panel opened with “Loading upload settings…”
- E-Sign Templates tab: three skeleton rows (walk clicked tabs immediately).
- `/welcome` redirected at dashboard and was captured mid-skeleton.

These may be slow, not broken. They were not given a second wait.

### F9. CSP noise on every authenticated page

Login and subsequent pages blocked:

```
https://favicon.ico.getpropertypro.com/
```

against `img-src 'self' data: blob: https://<project>.supabase.co`. Cosmetic. The host looks
like a malformed favicon URL, not a real asset.

A Google Fonts stylesheet was also blocked on at least one apartment page
(`style-src 'self' 'unsafe-inline'`). Theme font links that go off-origin will not apply.

### F10. Checkout publishable key is live as of this morning

**Severity:** updates LAUNCH-BLOCKERS item 1; does **not** close it by itself.

Re-ran the runbook’s outside check on 2026-09-18:

```bash
chunk=$(curl -s https://www.getpropertypro.com/signup/checkout \
  | grep -oE '/_next/static/[^"]+signup/checkout/page-[a-f0-9]+\.js' | head -1)
curl -sg "https://www.getpropertypro.com$chunk" \
  | grep -oE 'pk_(test|live)_[A-Za-z0-9]{6}'
# -> pk_live_51Syt6
```

LAUNCH-BLOCKERS measured `pk_test_51Syt6` on 2026-09-09. The **publishable** key in the signup
checkout chunk is now live. This session did not: charge a card, inspect `STRIPE_SECRET_KEY` on
Vercel, confirm live price IDs, or complete Stripe Connect. Payment Settings still shows
**Connect with Stripe** (not clicked — that starts a real onboarding). Owner assessment
collection remains a separate Connect cutover.

---

## What loaded cleanly (empty states, not errors)

Sunset Towers (134), Professional:

| Surface | What was on screen |
|---|---|
| Dashboard | Welcome + setup checklist |
| Documents | Timeline of 16 missing statutory records; List/Board/Timeline; Upload / Author / E-Sign |
| Meetings | Calendar / Schedule / Minutes; Create Meeting; 48-hour notice warning on same-day default |
| Announcements | Empty; New announcement form (title, rich text, audience) |
| Board | Polls empty; Forum; elections **tab omitted** (see F4 for the URL) |
| Operations | Empty; tabs All / Requests / Work Orders / Reservations; Reserve Amenity |
| Insurance | Add master policy + wind mitigation empty |
| Reserves | “Build your reserve register” + legal disclaimer |
| Storm damage | Empty report list |
| Payments | Overview / Assessments / Delinquency / Ledger (ledger empty) |
| Compliance | See F2 |
| Residents | Only the signed-in root manager; Add Resident dialog |
| Units | “No units yet”; Add unit dialog (number / building / floor) |
| Contracts | Empty |
| E-Sign | Requests / Waiting on / Templates |
| Violations | Empty inbox; report form blocked on units (F1) |
| ARC | Empty counts |
| Audit trail | System “Data Repair” rows on `document_categories`, 2026-09-14 11:23 AM |
| Website editor | Default-settings banner, no sections (F3) |
| Emergency | Empty alerts; compose page reached |
| Settings | Account, notifications, billing (Professional Active), payments (Connect CTA), transparency, export |
| Help / statutes / contact | Help Center with PM orientation cards |
| Notifications | “You’re all caught up” |

Breakaway Apartments (133), Operations Plus — apartment-specific:

| Surface | What was on screen |
|---|---|
| Dashboard / apartment dashboard | Occupancy 0%, Lease expirations 0, Monthly revenue $0, Maintenance 0 |
| Leases | Empty; + New Lease |
| Packages | Empty; + Log Package |
| Visitors | Empty |
| Move in/out | Reached |
| Billing | Operations Plus $499/mo Active |

PM portfolio: communities grid, add-community card, templates empty, reports maintenance KPIs at 0
with Compliance / Occupancy / Violations / Delinquency tabs.

Marketing: homepage, contact, resources, signup form, `/transparency`. Signup form is the
account + community capture; billing checkout was not driven.

Command palette (⌘K): “Getting Started” actions — Upload Document, Residents, Schedule Meeting.

Create Meeting dialog correctly warns that a start of 09:18/2026 09:00 is inside the **48-hour
notice window** and that Florida law grants no extension for short notice.

---

## Redirects that are feature gates, not crashes

Requested while pinned to Breakaway (`communityId=133`):

| Requested | Landed |
|---|---|
| `/communities/133/compliance` | `/select-community?returnTo=/dashboard?reason=feature-not-available` |
| `/contracts?communityId=133` | same picker |
| `/violations?communityId=133` | same picker |
| `/violations/report?communityId=133` | same picker |
| `/mobile`, `/mobile/documents`, `/mobile/more`, `/mobile/settings` | `/select-community` (no community pin on those URLs) |

`/welcome?communityId=134` and `/dashboard/claim-root?communityId=134` rendered into the dashboard
/ claim-root flow rather than an error page.

---

## Production backend scars (not reproduced in this click-through)

Vercel runtime-error clusters for **property-pro-web**, last 7 days, read 2026-09-18 ~12:14 UTC.
These did **not** fire on the pages walked today. They are the failures a next real user might hit.

| Cluster | Count | Window | Notes |
|---|---|---|---|
| `pending_signups` query → `EMAXCONN` max client connections (limit 200) | 864 | 2026-09-11, `/api/v1/auth/confirm-verification` | One user, twelve seconds. Capacity, not a logic bug. |
| Invalid refresh token | 56 | 2026-09-11–13, middleware | Stale cookies. |
| Task timed out after 300s | 9 | 2026-09-14, `/dashboard/apartment` | 7 users. Breakaway uses that dashboard. |
| `@sparticuz/chromium-min` bin missing | 3 | 2026-09-14, `POST /api/v1/documents/drafts/[id]/publish` | Author-and-publish PDF will 500 until the lambda bundle includes Chromium. |
| Statement timeout on `document-categories` / `user_roles` | 2+1 | 2026-09-14 | Same minute as scheduled-site-publish. |

Admin app: 4 invalid-refresh-token events on 2026-09-14. Not opened in this session.

---

## What this session did not do

- Submit any write (unit, resident invite, document upload, announcement, meeting, publish, pay).
- Stripe Checkout with a card, Customer Portal, or Connect OAuth.
- `apps/admin` (tickets, inbox, health, billing, onboarding).
- Resident / tenant / board-only personas.
- Tenant-host login on a real subdomain after publish.
- `/mobile` with a community already selected.
- Attorney-enable elections or apply `0062_secret_ballot`.
- Re-run `pnpm lint`, unit tests, or the Playwright suite.

---

## What else is needed before these two communities are “in use”

Do this in order, per community, in the product — not in a migration:

1. Fix Breakaway’s city if it is Miami (F7).
2. **Add units**, then **invite residents / board**.
3. **Upload governing documents** so Sunset Towers is not 0/16 overdue.
4. Run the **website wizard and publish**. Confirm the real slug, do not guess.
5. Post a first announcement. Schedule meetings **outside** the 48-hour window unless they are
   emergencies.
6. Treat **elections as unavailable**. If the URL must exist, F4 should render the same copy as
   the Board chrome, not `error.tsx`.
7. Stripe Connect / owner payments only if this association will collect assessments in-app.
8. Decide whether Admin should default collapsed, or the rail should show a scrollbar (F5).
9. Drop the apartment checklist’s compliance step (F6).

Platform-level, still not closed by this walk:

- LAUNCH-BLOCKERS item 1: live **secret** key, live price IDs, live webhook, live Customer Portal
  — the publishable key alone (F10) is not the cutover.
- Document-draft publish Chromium on Vercel (cluster above) before anyone authors a PDF from the
  documents UI.
- Connection-pool headroom (EMAXCONN on 2026-09-11).

---

## Appendix — route inventory (requested → what rendered)

84 visits. “OK” means the destination rendered a real page, including empty states. “Gate”
means a feature/community redirect. “Crash” means the global error page.

### Sunset Towers (`communityId=134`)

| id | path | result |
|---|---|---|
| condo-dashboard | `/dashboard?communityId=134` | OK |
| condo-documents | `/communities/134/documents` | OK |
| condo-meetings | `/communities/134/meetings` | OK |
| condo-announcements | `/announcements?communityId=134` | OK |
| condo-board | `/communities/134/board` | OK (polls) |
| condo-board-polls | `/communities/134/board/polls` | OK |
| condo-board-forum | `/communities/134/board/forum` | OK |
| condo-board-elections | `/communities/134/board/elections` | **Crash (F4)** |
| condo-operations | `/communities/134/operations?tab=requests` | OK |
| condo-operations-work | `…?tab=work-orders` | OK |
| condo-operations-amen | `…?tab=amenities` | OK (Reservations tab) |
| condo-insurance | `/communities/134/insurance` | OK |
| condo-insurance-wind | `/communities/134/insurance/wind-mitigation` | OK |
| condo-reserves | `/communities/134/reserves` | OK |
| condo-storm | `/communities/134/storm-damage` | OK |
| condo-payments | `/communities/134/payments` | OK |
| condo-finance | `/communities/134/finance` | OK |
| condo-assessments | `/communities/134/assessments` | OK |
| condo-compliance | `/communities/134/compliance` | OK (F2) |
| condo-residents | `/dashboard/residents?communityId=134` | OK |
| condo-import-residents | `/dashboard/import-residents?communityId=134` | OK |
| condo-units | `/dashboard/units?communityId=134` | OK |
| condo-contracts | `/contracts?communityId=134` | OK |
| condo-esign | `/esign?communityId=134` | OK |
| condo-esign-templates | `/esign/templates?communityId=134` | OK (skeleton at capture) |
| condo-esign-submissions | `/esign/submissions?communityId=134` | OK |
| condo-violations | `/violations?communityId=134` | OK |
| condo-violations-report | `/violations/report?communityId=134` | OK (no units) |
| condo-arc | `/arc-requests?communityId=134` | OK |
| condo-arc-new | `/arc-requests/new?communityId=134` | OK |
| condo-audit | `/audit-trail?communityId=134` | OK |
| condo-website | `/pm/website-editor?communityId=134` | OK (unpublished, F3) |
| condo-emergency | `/emergency?communityId=134` | OK |
| condo-emergency-new | `/emergency/new?communityId=134` | OK |
| condo-join-requests | `/admin/join-requests?communityId=134` | OK |
| condo-notifications | `/notifications?communityId=134` | OK |
| condo-settings | `/settings?communityId=134` | OK |
| condo-settings-account | `/settings/account?communityId=134` | OK |
| condo-settings-roles | `/settings/roles?communityId=134` | OK heading, skeleton body (F8) |
| condo-settings-billing | `/settings/billing?communityId=134` | OK |
| condo-settings-payments | `/settings/payments?communityId=134` | OK |
| condo-settings-transparency | `/settings/transparency?communityId=134` | OK |
| condo-settings-export | `/settings/export?communityId=134` | OK |
| condo-help | `/help?communityId=134` | OK |
| condo-help-contact | `/help/contact?communityId=134` | OK |
| condo-help-statutes | `/help/statutes?communityId=134` | OK |
| condo-welcome | `/welcome?communityId=134` | redirected / skeleton (F8) |
| condo-claim-root | `/dashboard/claim-root?communityId=134` | OK |

### Breakaway Apartments (`communityId=133`)

| id | path | result |
|---|---|---|
| apt-dashboard | `/dashboard?communityId=133` | OK |
| apt-apartment | `/dashboard/apartment?communityId=133` | OK (same apartment dashboard) |
| apt-documents | `/communities/133/documents` | OK |
| apt-meetings | `/communities/133/meetings` | OK |
| apt-announcements | `/announcements?communityId=133` | OK |
| apt-board | `/communities/133/board/polls` | OK |
| apt-operations | `/communities/133/operations?tab=requests` | OK |
| apt-leases | `/dashboard/leases?communityId=133` | OK |
| apt-packages | `/dashboard/packages?communityId=133` | OK |
| apt-visitors | `/dashboard/visitors?communityId=133` | OK |
| apt-moveinout | `/dashboard/move-in-out?communityId=133` | OK |
| apt-payments | `/communities/133/payments` | OK |
| apt-compliance | `/communities/133/compliance` | **Gate (F6)** |
| apt-residents | `/dashboard/residents?communityId=133` | OK |
| apt-units | `/dashboard/units?communityId=133` | OK |
| apt-contracts | `/contracts?communityId=133` | **Gate** |
| apt-violations | `/violations?communityId=133` | **Gate** |
| apt-violations-report | `/violations/report?communityId=133` | **Gate** |
| apt-website | `/pm/website-editor?communityId=133` | OK |
| apt-settings | `/settings?communityId=133` | OK |
| apt-settings-billing | `/settings/billing?communityId=133` | OK |

### Cross-community / public

| id | path | result |
|---|---|---|
| select-community | `/select-community` | OK |
| pm-communities | `/pm/dashboard/communities` | OK |
| pm-communities-new | `/pm/dashboard/communities/new` | OK |
| pm-templates | `/pm/portfolio/templates` | OK |
| pm-reports | `/pm/reports` | OK |
| account-join | `/account/join-community` | OK |
| mobile-* | `/mobile`, `/documents`, `/more`, `/settings` | Gate to picker |
| marketing-home / contact / resources | `/`, `/contact`, `/resources` | OK |
| signup | `/signup` | OK |
| public guessed slugs | `sunset-towers.` / `breakaway-apartments.` | **Community not found (F3)** |
| transparency | `/transparency` | OK |
