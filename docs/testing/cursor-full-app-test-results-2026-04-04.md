# PropertyPro Full Application Test — Live Findings

**Date:** 2026-04-04  
**Tester:** Cursor AI (browser MCP + curl verification)  
**Plan:** [cursor-full-app-test-prompt.md](./cursor-full-app-test-prompt.md)  
**Branch context:** Merge base with `origin/main` = `19648e3baefff2e24a727ef49dad4d989a1fb8ad`. HEAD adds/edits primarily docs (e.g. multi-community billing design); no blocking app changes identified from that diff for this audit.

---

## Environment


| Item           | Status                                                                                                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Demo seed      | `./scripts/with-env-local.sh pnpm seed:demo` completed successfully                                                                                                                                                                                                |
| Web dev server | `apps/web`: `NEXT_PUBLIC_APP_URL=http://localhost:3000 pnpm exec next dev --port 3000` (required so `/dev/agent-login` redirects stay on localhost; default `.env.local` `NEXT_PUBLIC_APP_URL` pointed at production and dropped session on cross-origin redirect) |
| Evidence       | Accessibility snapshots from MCP browser (screenshots not persisted as image files)                                                                                                                                                                                |
| Viewport       | Desktop phases: 1440×900; mobile phase: 375×812                                                                                                                                                                                                                    |


---

## Executive summary


| Metric                              | Count                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| Phases covered                      | 1–6 (all sections exercised; depth varies—see gaps)                                   |
| Clear pass (UI loaded, core checks) | Majority of routes under `board_president` / `pm_admin` / `owner`                     |
| Failures / high-severity issues     | 2–3 (elections UX, seed/agent-login for several roles)                                |
| Warnings                            | Payments/finance/env-dependent, mobile hub loading snapshot, API “not found” behavior |


---

## Phase 1 — Board President (Sunset Condos, `communityId=1`)

Auth: `GET /dev/agent-login?as=board_president&communityId=1` with localhost `NEXT_PUBLIC_APP_URL`.


| Step                  | Result                              | Notes                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 Dashboard         | **PASS**                            | “Sunset Condos”, “Welcome, Sam”, widgets: announcements empty state, meetings, four violations, Documents to Sign (proxy), header search/notifications/avatar                                                                                                                                                                                                                                  |
| Onboarding checklist  | **PASS**                            | “Finish setting up your community”, 1 of 6, six rows with actions. Dismiss: X overlapped nav once; **Dismiss checklist** worked                                                                                                                                                                                                                                                                |
| 1.2 Sidebar           | **PASS** (drawer)                   | MCP viewport often shows **Open navigation** (hamburger) rather than persistent desktop sidebar; all expected links present when drawer open: Dashboard, Documents, Meetings, Announcements, Board, Operations, Packages, Visitors, Payments (+ expand), Report Violation (+ expand), Compliance, Residents, Contracts, E-Sign, Audit Trail. **Collapse/expand** not re-verified after restart |
| 1.3 Documents         | **PASS**                            | Canonical URL `/communities/1/documents`: heading “Documents”, Search / E-Sign / Upload, empty-library CTA, “Select a document to preview”                                                                                                                                                                                                                                                     |
| 1.4 Meetings          | **PASS**                            | Calendar, **Create Meeting** opens form: Title, Meeting Type, Start, End, Location. **Cancel** closed without submit. Plan asked for description field—not visible in a11y snapshot                                                                                                                                                                                                            |
| 1.5 Announcements     | **PARTIAL**                         | Redirects to `/announcements?communityId=1`, “No announcements yet”. **No** “Create”/“New announcement” control in accessibility tree (may be visual-only or missing)                                                                                                                                                                                                                          |
| 1.6 Board             | **PARTIAL**                         | **Polls**: empty state, **Create Poll** present. **Forum**: “New Thread”, empty state. **Elections** (`/communities/1/board/elections`): **FAIL** — see bugs (ForbiddenError during render → error overlay / hydration noise in dev)                                                                                                                                                           |
| 1.7 Operations        | **PASS** (earlier session)          | Tabs All / Requests / Work Orders / Reservations, “Operations” hub                                                                                                                                                                                                                                                                                                                             |
| 1.8 Packages          | **PASS**                            | `/dashboard/packages?communityId=1`: “Package Logging”, filters, **Log Package**                                                                                                                                                                                                                                                                                                               |
| 1.9 Visitors          | **PASS**                            | “Visitor Management”, tabs, **Register Visitor**                                                                                                                                                                                                                                                                                                                                               |
| 1.10 Payments         | **PARTIAL**                         | `/communities/1/payments`: error UI “We couldn't load your payment data” + Retry — likely Stripe/env (see known limitations)                                                                                                                                                                                                                                                                   |
| 1.10b Assessments     | **PASS**                            | `/communities/1/assessments`: seeded assessments, **Create Assessment**                                                                                                                                                                                                                                                                                                                        |
| 1.10c Finance         | **PARTIAL**                         | `/communities/1/finance`: long loading / “Collected This Month --” in snapshot — not fully verified                                                                                                                                                                                                                                                                                            |
| 1.11 Report Violation | **PASS** (via `/violations/report`) | Form fields category, description, severity, photo; seeded “Your Reports” list; banner about unit assignment for this user                                                                                                                                                                                                                                                                     |
| 1.12 Compliance       | **PASS**                            | Score copy, “13 of 16”, filter pills, category accordions, checklist rows, Export, Recent Activity                                                                                                                                                                                                                                                                                             |
| 1.13 Residents        | **PASS**                            | Search, list, **Add Resident**, access requests section                                                                                                                                                                                                                                                                                                                                        |
| 1.14 Contracts        | **PASS**                            | “Contracts & Vendors” heading                                                                                                                                                                                                                                                                                                                                                                  |
| 1.15 E-Sign           | **PASS**                            | Hub with Documents / Templates link, filters; `/esign/submissions?communityId=1` heading present                                                                                                                                                                                                                                                                                               |
| 1.16 Audit Trail      | **PASS**                            | Filters + **Export CSV**                                                                                                                                                                                                                                                                                                                                                                       |
| 1.17 Notifications    | **PASS**                            | Bell opens popover; **View all notifications** link; list loads                                                                                                                                                                                                                                                                                                                                |
| 1.18 Search           | **PASS**                            | Command palette; typed **board** — results (Dashboard, Meetings, Community Board)                                                                                                                                                                                                                                                                                                              |
| 1.19 Settings         | **PASS**                            | `/settings?communityId=1`: Account, Payment Configuration, Billing, toggles. Sub-routes: `/settings/account`, `/settings/billing` (no plan), `/settings/transparency` (loading), `/settings/export` (Data Export heading)                                                                                                                                                                      |
| 1.20 Emergency        | **PARTIAL**                         | `/emergency?communityId=1`: “Emergency Alerts” heading; content still loading in snapshot                                                                                                                                                                                                                                                                                                      |
| 1.21 Direct URLs      | **PARTIAL**                         | See “Routing & API” below                                                                                                                                                                                                                                                                                                                                                                      |


**Legacy URL note:** First browser visit to `/documents?communityId=1` sent the session to **login** (no cookies yet). After session established, **curl with cookie jar** returned **200** for `/documents?communityId=1`. Prefer canonical `/communities/:id/...` for automation.

---

## Phase 2 — Owner mobile (`/mobile?communityId=1`)

Auth: `as=owner&communityId=1`.


| Step               | Result       | Notes                                                                                                                                                     |
| ------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 Mobile home    | **PARTIAL**  | Header “Sunset Condos”, “Miami, FL” visible; **status remained “Loading mobile page”** in a11y tree after waits — hub cards not fully exposed to snapshot |
| 2.2–2.6            | **PARTIAL**  | `/mobile/documents` showed full document list; other routes not all re-walked after time                                                                  |
| 2.7–2.10           | **NOT DONE** | `/mobile/notifications`, `/mobile/search`, `/mobile/more`, `/mobile/settings`, `/mobile/settings/security` — not visited in this run                      |
| 2.11 Owner desktop | **NOT DONE** | Resize + owner sidebar comparison not executed                                                                                                            |


---

## Phase 3 — PM admin

`agent-login` JSON (curl): **3 communities** for `pm_admin` — Palm Shores, Sunset Condos, Sunset Ridge.


| Step                | Result       | Notes                                                                                                                                                                     |
| ------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 Multi-community | **PASS**     | `/dashboard?communityId=1` and `/dashboard/apartment?communityId=3`                                                                                                       |
| 3.2 PM dashboard    | **PARTIAL**  | `/pm/dashboard/communities?communityId=1` stayed at “Loading…” in snapshot (slow or client issue)                                                                         |
| 3.3 Drill-down      | **NOT DONE** | —                                                                                                                                                                         |
| 3.4 PM reports      | **NOT DONE** | `/pm/reports?communityId=1`                                                                                                                                               |
| 3.5 Branding        | **NOT DONE** | `/pm/settings/branding?communityId=1`                                                                                                                                     |
| 3.6 Apartment       | **PASS**     | Sidebar: Documents, Meetings, Announcements, Board, Operations, **Leases**, Packages, Visitors, Payments, Residents, E-Sign, Audit Trail — **no** Compliance / Violations |


---

## Phase 4 — Additional roles


| Role           | `allCommunities` (curl JSON) | Result                                           |
| -------------- | ---------------------------- | ------------------------------------------------ |
| `cam`          | **0**                        | **Seed / DB issue** — plan expects Sunset Condos |
| `board_member` | **0**                        | **Seed / DB issue**                              |
| `tenant`       | **0**                        | **Seed / DB issue**                              |
| `site_manager` | **0**                        | **Seed / DB issue**                              |


**Working references:** `board_president` and `owner` return non-empty `allCommunities` from the same endpoint.

---

## Phase 5 — Public pages

Tested in a **separate tab** without overlapping authenticated flows where possible.


| Step                             | Result          | Notes                                                                                                                   |
| -------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 5.1 Landing `/`                  | **PASS**        | Hero, Features, Compliance timeline, Pricing, footer, nav links                                                         |
| 5.2 Login                        | **PARTIAL**     | Authenticated session redirected `/auth/login` → **select-community**; unauthenticated behavior not isolated in browser |
| 5.3 Forgot password              | **PASS** (curl) | `GET /auth/forgot-password` → **200** (unauthenticated)                                                                 |
| 5.4 Signup `/signup`             | **PASS**        | All listed fields + plan buttons + subdomain + checkbox + disabled Create until valid                                   |
| 5.5 Legal                        | **PASS** (curl) | `GET /legal/privacy` and `GET /legal/terms` → **200**                                                                   |
| 5.6 Transparency `/transparency` | **PASS** (curl) | `GET /transparency` → **200**                                                                                           |


**Unauthenticated curl (no cookies):** `/mobile/`*, `/pm/reports`, `/pm/settings/branding` return **307** (redirect to auth) — expected without a session. Browser testing of these requires an authenticated flow (not fully re-walked for every sub-route in this run).

---

## Phase 6 — Cross-cutting


| Step                    | Result              | Notes                                                       |
| ----------------------- | ------------------- | ----------------------------------------------------------- |
| 6.1 Responsive          | **PARTIAL**         | Resized 1440 / 375; no full tablet pass                     |
| 6.2 Sidebar collapse    | **NOT DONE**        | —                                                           |
| 6.3 Expandable nav      | **NOT DONE**        | —                                                           |
| 6.4 Error states        | **PARTIAL**         | See routing; no dedicated 404 page when unauthenticated     |
| 6.5 Session persistence | **PARTIAL**         | Not formally re-tested after restart                        |
| 6.6 Community switching | **PASS** (observed) | `/select-community` lists three communities with PM session |


---

## Routing & API


| Request                                              | Result                                                           |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| `GET /api/v1/nonexistent` (no auth)                  | **401** `{"error":"Unauthorized"}` — not a JSON “not found” body |
| `GET /dashboard/nonexistent?communityId=1` (no auth) | **307** → `/auth/login?...`                                      |


---

## Bugs & issues (severity)

1. **[P1] Board elections route** (`/communities/1/board/elections`): Server throws `ForbiddenError: Elections are not available until attorney review is complete` during render. In dev this surfaces as a **runtime error overlay** and hydration warnings instead of a clean **403/forbidden** page. Dev server logs show repeated errors and Fast Refresh reloads after visiting this route.
2. **[P1] Seed / `agent-login` for `cam`, `board_member`, `tenant`, `site_manager`:** `allCommunities` is **empty** in JSON responses — plan expects these roles to have communities. Blocks Phase 4 as written.
3. **[P2] Announcements (manager):** Empty state may lack an accessible “Create announcement” action (not in snapshot).
4. **[P2] Payments hub:** Error state loading payment data (Stripe/configuration) — expected in many dev setups; document env requirements.
5. **[P2] Mobile home:** Persistent “Loading mobile page” in a11y snapshot while child routes (e.g. documents) render — may be loading gate or snapshot timing.
6. **[P2] Meetings create form:** Description field not observed in accessibility tree (may exist visually).
7. **[P3] Dev-only:** Visiting elections polluted dev HMR state; **restarting** `next dev` cleared follow-on errors.

---

## Known limitations (from plan)

- File uploads, Stripe checkout, email/SMS, PDF rendering, exports: **not** end-to-end verified (buttons/shell only).
- **Screenshots:** Not saved as files; evidence is MCP snapshots + server logs.

---

## Recommendations

1. Fix or seed `**user_roles`** (or equivalent) so `cam`, `board_member`, `tenant`, and `site_manager` demo users resolve communities in `findUserCommunitiesUnscoped` / `agent-login`.
2. Replace **throw** on elections page with a **dedicated forbidden** UI (and matching HTTP status) to avoid hydration/dev overlay cascades.
3. Document `**NEXT_PUBLIC_APP_URL=http://localhost:3000`** for local browser/agent testing when production URL is set.
4. Re-run **Phase 2 mobile hub**, **Phase 4 roles**, **Phase 5 unauthenticated** (incognito or cookie-clear), and **Phase 6** after fixes.

---

## Appendix — Commands used

```bash
./scripts/with-env-local.sh pnpm seed:demo
cd apps/web && NEXT_PUBLIC_APP_URL=http://localhost:3000 pnpm exec next dev --port 3000
curl -s -H "Accept: application/json" "http://localhost:3000/dev/agent-login?as=<role>&communityId=1"
```

---

*End of report — 2026-04-04.*