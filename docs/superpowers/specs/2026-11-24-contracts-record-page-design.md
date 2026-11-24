# Contracts: a page for each contract — design

Approved by the owner on 2026-11-24 ("Approve design"), both questions as written. Asked for the same day: "Let's give it its own
page. Let's plan and implement this properly", verified against the Solution
Verification Checklist (last section).

## Why

Contracts today is one page. "Edit" and "Bids" on a row open a form or a bid
list in a card above the table. Root cause, not symptom: **a contract has no
address.** Everything else follows from that: nothing can link to a contract,
Back and refresh lose what was open, the table carries seven columns because
there is nowhere else to show them, and the list page ships the form and the
bid tracker to everyone who only wants to read the list.

## What a manager will see

1. **Contracts** (`/contracts`): a five-column table. Contract (vendor beneath,
   "Conflict declared" in words), Value, Ends (with time left), Status, Bids
   ("3 sealed" or "3 bids"). A row opens the contract. Expiring contracts stay
   listed in a notice above the table. "Add contract" is in the header.
2. **A contract** (`/contracts/[id]`): title, status beside it, Edit in the
   header. Sections: Summary (description, value, dates), Bids, Linked records
   (document, compliance item). Side panel: vendor, start, end, bidding closes,
   conflict of interest, who can see this.
3. **Bids**, on the contract's page: sealed until the closing time, exactly as
   now ("Bidding is sealed, 3 received, opens 12 Dec, 5:00 pm"); afterwards a
   table of vendor, amount, received, notes. "Add bid" opens a small form in
   that section.
4. **New** (`/contracts/new`) and **Edit** (`/contracts/[id]/edit`): the same
   form on its own page, Cancel in the header, Save at the foot.

Only managers of condo and HOA communities see any of this, as today.

## What changes in behaviour

| Change | Why |
|---|---|
| Each contract has a link | The point of the work |
| Money shows as `$12,500.00`, not `$12500` | Raw text today, on contracts and bids |
| Editing no longer shifts the bidding-close time | Real bug: each edit-and-save moves the stored time by the editor's offset from UTC (5 hours in Florida in winter). Verified in `ContractForm.tsx:44-46,75` |
| The form can set Status and a conflict-of-interest note | The database and API already accept both; the form never offered them, so a contract could not be marked terminated |
| End date must not be before start date; value must be a plain amount, with a message saying so | No check today; the server rejects `1,200` with a generic error |
| After saving an edit you land on the contract | Today the bid list pops open instead |

## What does not change

- Who can read or write contracts, and the condo/HOA-only rule.
- Sealed bids: details are withheld on the server until the closing time, for
  everyone, managers included.
- The audit entries for create, update and add-bid.
- The database. No migration.
- No delete. Contracts are association records; "Terminated" is the way to
  retire one.

## How it is built

- **One sealing rule, in one place.** `applyBidEmbargo` moves from the list
  route into `contract-service.ts`; the list route and the new record page both
  call it. A second copy is how sealed amounts would leak.
- **The record page loads on the server**, like an announcement's page:
  `page.tsx` checks sign-in, membership, the compliance feature and
  `requirePermission('contracts','read')`, then reads one contract and its bids
  through the scoped client and passes the already-sealed result to the view.
  An id from another community is "not found". No new API route is needed for
  reading.
- **Writes keep the existing API** (`POST`/`PATCH /api/v1/contracts`, add-bid).
  After a write the page refreshes its server data.
- New service read: bids for one contract (today's only read fetches every bid
  in the community).
- The list page and the three new pages gate with `requirePermission`, matching
  the API. Today the page checks "is an admin role" while the API checks the
  permission; they agree now, but only by coincidence.
- Pages use `PageLayout` (`list`, `detail`, `form`), `PageHeader`, the Section
  kit and shared `Table`, `Input`, `SelectTrigger`, as Announcements does.

## Everything else that must move with it

- Help article `content/help/manager/website/contracts.mdx`: steps reworded
  (words only; screenshots wait for the help refresh you scheduled).
- Help-capture manifest `scripts/help-capture/manifests/manager/website/contracts.json`:
  its clicks ("Add Contract", "Bids") point at controls that move.
- First-run panel (`contracts-empty.tsx`): its button goes to `/contracts/new`.
- `scripts/page-template-baseline.json` (remove the route),
  `scripts/verify-operations-routes.ts` (allow the new paths if it requires),
  `scripts/verify-hook-requestjson.ts`, `scripts/responsive-geometry-baseline.json`
  (two raw tables go away), breadcrumbs (`new`, `edit` already labelled; the
  contract's title is the last crumb).
- Tests: the 36 route tests stay and gain the moved-function cases; the form
  and table tests are rewritten for the pages; new tests listed below.

## Tests that must exist

- A sealed contract's page: no bid vendor, amount or note reaches the client
  view's props or the rendered HTML; the count and closing time do.
- The same contract after closing: bids shown.
- A contract id from another community: not found. A non-manager: turned away.
  An apartment community: turned away.
- Bidding-close time round-trips through Edit unchanged, with the test running
  in a non-UTC timezone.
- End before start, and `1,200` as a value: refused with the stated message,
  on the server and in the form.
- Status and conflict note save and show.
- Money formatting; five columns; row link; each empty, loading and error state.
- A revert-check for each.

## Left alone on purpose

- **The list still loads every contract and every bid** to count them. Fine at
  tens of contracts. `ponytail:` marker with the trigger: a community passes
  200 contracts, or the list request takes over one second.
- **The linked document is still typed in as a number.** There is no document
  picker in the app to reuse. The record page shows the linked document's title
  and a link, which removes most of the pain. Trigger to build a picker: a
  manager asks how to find a document's number.
- **Bids can still be added after bidding closes** and the closing time can
  still be edited (the edit is audited with old and new values). These are
  record-keeping choices for the association, not ours to block without asking.
- **No bid edit, delete or award.** None exists today; not asked for.
- No emails about expiring contracts (none today).

## Questions for the owner

1. Status and the conflict-of-interest note in the form: included above. Say
   if you would rather leave the form's fields exactly as they are.
2. Adding a bid after bidding has closed: left allowed. Say if it should be
   refused instead.

## Solution Verification Checklist

### Root cause and research
- **Root cause, not symptoms.** A contract has no address; see "Why". The
  seven-column table and the inline cards are symptoms.
- **Industry best practice.** A record with its own URL, list → detail → edit,
  is the standard shape and the one this app already uses for announcements,
  alerts and violations. Sealed bids withheld until a stated opening time, with
  changes to that time logged, is standard procurement practice and is what the
  server already does. Florida's condo act has rules on competitive bidding and
  on conflicts of interest (§718.3026, §718.3027) and on posting contracts and
  bid summaries; I cite these from memory and did **not** look them up today.
  The design adds no statutory logic, so nothing here depends on their detail.
- **Existing codebase patterns.** Read: the contracts page, three components,
  hook, route and its contract file, service, both tables, RLS policies, RBAC
  rows, nav, breadcrumbs, help article and manifest, 53 tests; and the
  Announcements and Emergency record pages this copies.
- **Additional research.** Verified against `main` myself: the contracts files
  are unchanged by today's work; the time-shift bug; sealing is server-side;
  no by-id route, no delete route.

### Architecture and design
- **Current architecture fit.** Fits without new machinery: server-loaded
  record pages, existing write API, scoped client, existing kit.
- **Recommended changes.** Move the sealing rule into the service; gate pages
  by permission; one new single-contract bids read.
- **Technical debt.** Pays down: two raw tables, duplicate record types, the
  page/API gate mismatch, the time bug. Leaves, with triggers: unpaginated
  list, numeric document id.
- **Challenged patterns.** The polymorphic `POST` (create contract or add bid
  by an `action` field) is poor design; I am **not** splitting it, because that
  is a contract-shape change with 36 tests behind it and no user benefit now.
  The form's "paste a document ID" is poor; see "Left alone".
- **Honest assessment.** The owner chose a page over the side panel I
  recommended. The page is the better long-term choice (links, Back, room for
  bids) and costs about three times the work. The risk that matters is the
  sealing rule being copied; the design forbids that and tests it.

### Solution quality
- **CLAUDE.md compliant.** Scoped client only; no table imports in pages;
  `requirePermission`; audit unchanged; page kit; tokens; guards listed above.
- **Simple, no redundancy.** No new API route, no migration, no new kit part,
  one form component used by New and Edit.
- **100% complete.** Help text, manifest, first-run panel, baselines and tests
  are in scope, not follow-ups. Screenshots in the help article are the one
  thing deferred, by your earlier decision.
- **Best solution, trade-offs.** Alternatives: side panel (cheaper, no links);
  client-loaded page with a new GET route (more code, a second place sealed
  data is shaped). Rejected for those reasons.
- **Long-term maintainability.** One sealing function, one form, pages that
  match every other record in the app.

### Security and safety
- **No new vulnerabilities.** No new write surface. The one new read is
  tenant-scoped and gated.
- **Input validation.** Server Zod gains end ≥ start; value regex and lengths
  unchanged; the form mirrors them. Text is rendered as text (no HTML).
- **Authentication and authorization.** Sign-in, membership, feature and
  permission checks on every page, server-side; cross-community id → not found.
- **Sensitive data.** Sealed bid details never leave the server before the
  closing time; tested at the props and HTML level. Nothing new is logged; the
  audit payloads are unchanged and contain no secrets.
- **OWASP.** Broken access control and IDOR: covered by the scoped read and
  tests. Injection: parameterised queries via Drizzle. No file handling, no
  redirects built from input.

### Integration and testing
- **Upstream and downstream.** Nav (prefix match already covers sub-pages),
  breadcrumbs, search entry (unchanged href), first-run panel, help, capture
  manifest, export (unchanged), admin console (no dependency).
- **All affected files.** Listed under "Everything else that must move".
- **Consistent with valuable patterns.** Copies Announcements.
- **Fully integrated.** The list links in, the pages link back, the first-run
  panel and help point at the new pages.
- **Tests with edge cases.** Listed under "Tests that must exist".

### Technical completeness
- **Environment variables.** None.
- **Database and storage rules.** None; RLS and the write trigger already
  cover both tables.
- **Utilities.** Money: reuse the dollar formatter the finance pages use; if
  none takes a decimal string, add one small function with a test. Dates: the
  community-timezone helpers already used elsewhere.
- **Performance.** Record page: two indexed reads. List route unchanged. The
  list page's bundle shrinks (form and bid tracker leave it); the new pages are
  small. `perf-check` runs in CI on the pull request.
