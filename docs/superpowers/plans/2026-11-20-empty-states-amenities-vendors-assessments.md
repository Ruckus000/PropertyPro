# Empty states: Amenities, Vendors, Assessments

Status: **approved 2026-11-20, with the amenities system added** ("Let's build the amenities system"). Two PRs: PR 1 Assessments + Contracts empty states; PR 2 the amenities system (§7). Continues
[`2026-11-20-empty-states-guided-blueprint.md`](2026-11-20-empty-states-guided-blueprint.md) (P0–P8), whose
ledger still applies. Spec: [`empty-states.md`](../../design-system/patterns/empty-states.md) §8 lists these three
under "Hero · Setup".

Planned the ponytail way: reuse first, then the platform, then the minimum new code. Shortcuts carry
`ponytail: <limit>. Trigger: <observable>`.

## 1. Where each one actually renders (measured, not assumed)

| Spec name | Where it ships | Who reaches it | Types · plans | Empty today |
|---|---|---|---|---|
| **Assessments** | `/communities/[id]/payments?tab=assessments` → `AdminPaymentsTabs` → `AssessmentManager`. `/assessments` and `/communities/[id]/assessments` are only redirects. | property and root managers. Residents get `PaymentPortal` (already given its scenes in P7). | condo, HOA, apartment (`hasFinance`) · Professional, Operations Plus. Essentials sees the `FeatureGate` upgrade. | An `h2` header with a filled "Create Assessment", then a bordered box "No assessments created yet." with a second link, "Create your first assessment". No scene, two CTAs. |
| **Vendors** | The **Contracts & Vendors** page, `/contracts?communityId=` → `ContractTableContainer` → `ContractTable` (nav "Contracts", subtitle "Vendor tracking"). | Managers only (`isAdminRole`). | condo, HOA (`hasCompliance`) · Essentials and Professional. Apartments are redirected. | Plain text "No contracts found. Create one to get started." under a filled "Add Contract". Loading is the text "Loading contracts...", an error is red text. |
| **Amenities** | The **Reservations** tab of Operations, `/communities/[id]/operations?tab=reservations`. Amenities exist only as the picker in `ReservationCreateSheet`. | Managers, owners and tenants (`amenities: read` for all three). Residents see only their own reservations. | all three · Professional, Operations Plus. Essentials sees the upgrade gate. | The hub's generic "Nothing in operations right now" with a wrench and no action. The header's filled "Reserve Amenity" opens a sheet whose amenity list is **empty**, so submitting fails with "Amenity, date, start time, and end time are required." |

### Not shipped, so not designed

- **Amenity management.** `POST /api/v1/amenities` and `PATCH /api/v1/amenities/[id]` exist, but nothing in
  `apps/web` or `apps/admin` calls them, and `seed-demo.ts` creates no amenities. Every community, demos
  included, has zero amenities, so **nobody can make a reservation today**. Building an amenities manager is
  a feature, not an empty state: proposed as a follow-up (§5).
- **A vendor directory** (the `vendors` table used by work orders). Its only reader is the work-order sheet's
  optional picker, which already defaults to "(Assign later)", so an empty list is not a dead end. Nothing to
  design. The vendors people see are on Contracts & Vendors (free-text vendor names), which this plan covers.

## 2. Decision ledger

| # | Question | Decision | Why |
|---|---|---|---|
| A1 | Assessments shape | **Hero, single action, no step row** (`EmptyState size="hero"`, `PropScene prop="coins"`). While empty the header row (`h2` + filled button) is hidden and the hero owns the one filled **"Create Assessment"**, which opens the existing dialog. Same label as today, so `phase1-roadmap-smoke` and the help article still match. | Spec §4.1 single-action rule; D19. The tab fills the page column, so the hero's context column fits. |
| A2 | Assessments context column | "What an assessment has" (the dialog's real fields: Title, per-unit Amount, Frequency Monthly / Quarterly / Annual / One-Time, Due day, Late fee and Grace days, 15 by default, added only while online payments are on). "When units are charged" (recurring ones on the 1st of each month they fall due, to every unit in the Directory, with a Directory link; One-Time is not charged by the monthly run). "Who sees it" (unit owners, in Payments; tenants don't). Help: *Create dues and special assessments*, *Set up online payments*. | All copy is lifted from `create-assessment.mdx` and the code it describes, so the two can't disagree. No numbers, no example amounts. |
| A3 | Units dependency | Not checked. Copy says charges go to the units in the Directory and links there. | `ponytail: no unit-count read for the assessments hero. Trigger: a "Your Directory has no units yet" 422 from generate-assessments in Sentry or cron_runs (worded "no units found" before 2026-11-21).` |
| A4 | Contracts & Vendors shape | **Hero, single action, no step row** (`PropScene prop="clipboard"`). While empty the toolbar "Add Contract" is hidden and the hero owns the filled **"Add Contract"**, which opens the existing `ContractForm`. Context: "What a contract has" (Title, Vendor name and Start date required; Description, Contract value, End date, Bidding closes at, Conflict of interest), "Warnings you'll get" (Expiration Alerts at 90, 60 and 30 days and when expired, which needs an End date), "The signed copy" (upload in Documents, then enter its ID). Help: *Track vendor contracts*. | Same rules as A1; copy from `contracts.mdx` and the form. |
| A5 | Contracts loading and error | Loading becomes `Skeleton`, an error becomes `AlertBanner` danger. | Spec §2 state table; two lines each, same file. |
| A6 | Reservations shape | **Section** (it is a tab panel, the hub's P7/P8 precedent), `PropScene prop="calendar"`. Only the Reservations tab changes; Requests, Work Orders and All keep `no_operations_items`. | Spec §3: a tab is Section size. |
| A7 | Knowing whether anything can be booked | The hub calls the existing `useAmenities` **only while the Reservations tab is selected**. It shares the sheet's query key, so opening the sheet costs no second fetch. The tab counts as loading until both lists load; an amenities error shows the hub's existing danger banner. | Reuse; one GET, only where it matters. |
| A8 | Amenities exist, no reservations | "No reservations yet". The description names the community's **real amenities** ("You can book Pool and Clubhouse."), then "Your reservations appear here." for residents or "Reservations appear here as residents book them." for managers. Action: "Reserve Amenity" as **outline**; the header keeps the filled one. | Rule 1 (the finished shape from real data). The announcements precedent for a header that already holds the filled primary. |
| A9 | No amenities at all | The header's "Reserve Amenity" is **hidden** on this tab (it only opens a dead form). Title "Nothing to book yet". Residents: "When your association lists spaces you can book, you'll reserve them here." Managers: see Q1. **No action**, because no screen exists to add one. | Rule 6 (honest), and no button into a dead end. |
| A10 | The sheet with no amenities | When the list loads empty, a compact calendar `EmptyState` ("Nothing to book yet") replaces the form, covering `?create=reservation` deep links and the command palette's "Reserve Amenity". | A form that can't be submitted is a dead end. |
| A11 | Bundle | Each new empty-state component is its own file loaded with `next/dynamic`. No new props in the kit (coins, clipboard, calendar exist). No API change, no migration. | perf-check lesson from P5. |
| A12 | PRs | **One PR.** Three disjoint file sets, well under 600 lines. | Fewer CI rounds; nothing to sequence. |

## 3. Files

- `components/finance/assessment-manager.tsx` + new `components/finance/assessments-empty.tsx`
- `components/contracts/ContractTable.tsx` + new `components/contracts/contracts-empty.tsx`
- `components/operations/operations-hub.tsx`, `ReservationCreateSheet.tsx` + new `components/operations/reservations-empty.tsx`
- Tests: `__tests__/finance/assessment-manager.test.tsx`, `__tests__/contracts/contract-table.test.tsx`,
  `__tests__/components/operations/operations-hub.test.tsx`, `components/operations/__tests__/ReservationCreateSheet.test.tsx`,
  plus one axe file for the two heroes.

## 4. Tests and checks

1. Unit, each with a revert-check (delete the one production line, show exactly one named test go red):
   - Assessments: empty shows the hero and exactly one "Create Assessment". Revert: the empty guard on the header.
   - Contracts: empty shows the hero and exactly one "Add Contract". Revert: the empty guard on the toolbar button.
   - Hub: Reservations with zero amenities has no "Reserve Amenity". Revert: the amenity check on the CTA.
   - Hub: with amenities, their names render. Sheet: zero amenities renders no form. Revert: the sheet's empty branch.
   - `await findBy…` for the dynamically loaded components.
2. Axe on both heroes, each case first asserting its `h2` rendered, with one anti-vacuity probe per case.
3. `pnpm lint`, `pnpm typecheck`; `git diff --name-only origin/main -- packages/db` is empty.
4. Local perf: temp worktree, CI's stub env, `pnpm build`, `pnpm perf:check`.
5. Sandbox only: fresh `agent-*` condo and apartment fixtures, manager and resident, 1440 and 375, no overflow.
6. Independent code and security review (subagent, ponytail-review format) before the PR merges; required
   checks and e2e green on the head; then confirm the Deploy run and the Vercel deployment at the merge SHA.

## 5. Follow-ups (not built here)

- **Amenities manager**: add and edit amenities (name, location, capacity, bookable, booking rules) on the
  existing API, so Reservations works at all. Needs a product decision on where it lives.
- **One-Time assessments never produce charges in the app** (the monthly run skips them and no screen calls
  `POST /api/v1/assessments/[id]/generate`; the help article says to contact support). A "Generate charges"
  button on the existing route.

## 6. Open question

- ~~Q1~~ Moot: managers now get "Add amenity" (§7).

## 7. The amenities system (PR 2)

What exists: `amenities` (name, description, location, capacity, `is_bookable`, `booking_rules` jsonb),
`GET/POST /api/v1/amenities`, `PATCH /api/v1/amenities/[id]`, reserve (rejects past starts, non-bookable
amenities, overlaps), cancel, list, schedule. What is missing, measured:

1. No screen adds or edits an amenity (above).
2. **Booking rules are stored but never enforced.** `createReservationForCommunity` checks bookable, past
   and overlap only; `minDurationMinutes`, `maxDurationMinutes`, `advanceBookingDays` and `blackoutDates`
   are ignored. A form that lets a manager set them would promise something false.
3. Reservation rows read "Reservation #12" with no amenity name, and `useCancelReservation` has no button.
4. The booking sheet lists non-bookable amenities (booking then fails 422) and asks residents for a raw
   "Unit ID" the server already fills in for them.

| # | Question | Decision | Why |
|---|---|---|---|
| B1 | Where amenities live | A new **Amenities** tab in the Operations hub, shown wherever Reservations is (`hasAmenities` + `amenities:read`). Managers add and edit; residents browse what they can book, with "Reserve" preselecting it. | The hub already gates plan, type and role. No new route, nav item or page budget. |
| B2 | The form | `SlideOverPanel` (the hub's sheet pattern): Name*, Location, Capacity, Description, "Open for booking", Shortest and Longest booking (hours, stored as minutes), Book up to N days ahead, Blackout dates (date + Add, removable chips). Create `POST`, edit `PATCH`, both existing. | Every field is one the API already accepts. |
| B3 | Enforcing rules | A pure `lib/amenities/booking-rules.ts` `checkBookingRules(rules, start, end, now, timeZone)` called by `createReservationForCommunity` before the overlap check, throwing 422 with a plain sentence. Blackouts compare every community-local date the booking touches. Both contracts refuse shortest > longest. | Server-side, so the rule holds for any client. Pure, so every rule has a direct test. |
| B4 | Removing an amenity | Not built. "Open for booking" off hides it from booking and keeps its history. | `ponytail: no amenity delete. Trigger: a manager asks to remove a duplicate or mistyped amenity.` |
| B5 | Reservation rows | The amenity's name, the time, the status, and **Cancel** on confirmed future bookings (own for residents, any for managers, which the route already enforces), behind an `AlertDialog`. | Reuses the existing hook and route. |
| B6 | The booking sheet | Lists bookable amenities only, preselects `?amenityId=`, shows the chosen one's limits under the picker, hides "Unit ID" for residents. Managers keep the field. | `ponytail: managers still type a unit ID. Trigger: a manager books for a resident's unit and asks which number to enter.` |
| B7 | Empty states | Amenities tab: manager **section** setup "List the spaces residents can book" with filled "Add amenity"; resident waiting "Spaces you can book appear here". Reservations tab per A8; with no amenities a manager gets "Add amenity" (opens the Amenities tab's form), a resident the A9 waiting copy. `PropScene prop="calendar"`. | Spec §3 (a tab is Section), §4.4. |
| B8 | Bundle | The Amenities panel and the form sheet load with `next/dynamic`. | perf-check. |

Tests: every rule in `checkBookingRules` (inside and just outside each limit, blackout across midnight in
`America/New_York`, DST day); the service calls it (revert-check: drop the call); the form posts the API's
shape (hours → minutes); resident vs manager controls; cancel confirms before calling.
