# Leases v3 — decisions, options and open questions

Companion to `docs/superpowers/plans/2026-09-29-leases-v3.md`. Source design:
the Claude Design handoff "Leases page redesign" (Leases Roster v3). This file
records what was decided, what was deferred behind a switch, and what still
needs the client, a CPA or counsel.

**How the Florida citations were checked.** Statute text below came from
search-engine extracts of flsenate.gov pages; the build environment's network
blocked the primary sources. Treat every § reference as unverified until counsel
reads the statute itself.

---

## 1. Rent billing — options for the client (Q3)

### What the code does today

Established from the code at `d043b0f`, not from the design:

- **Nothing creates rent charges.** No service, route or cron inserts into
  `rent_obligations`. The app only reads obligations and flips them to `paid`
  or `pending` from the Stripe webhook (`finance-service.ts` ~2172 and ~2396).
  Any obligations in production were inserted outside the app.
- **No proration anywhere.** New leases must start on the 1st
  (`leases/route.ts` `validateLeaseDateWindow`).
- **Charges are never written to the ledger, but payments are.** So every rent
  payment pushes the unit's ledger balance into credit. This bug exists today,
  whatever the leases work does.
- **Ending a lease leaves its charges payable.** Terminating or soft-deleting a
  lease does not touch its obligations, and the payment path refuses only
  `paid` and `waived` ones.
- **Production constraints may differ from the repo (unverified).** An archived
  migration had `amount_cents > 0` and `UNIQUE(lease_id, period_start)` on
  obligations. The current baseline has neither. Run the query below against
  production:
  `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'rent_obligations'::regclass;`

**Consequence.** Leases v3 cannot break billing, because billing isn't built
yet. The client's billing choices decide how the future rent generator behaves;
they don't block this project. Leases v3 ships one guard, which holds under every
option: **a lease with unpaid obligations can't be cancelled, deleted or
transferred.** The API returns 409 and lists the obligations. Nothing is voided
automatically.

### Options per event

Recommended defaults are marked ★. Vendor behaviour comes from help-centre
summaries and is marked where it couldn't be confirmed.

**1. Pre-lease cancelled before move-in**

| | Option | Notes |
|---|---|---|
| ★ A | Void unpaid charges (new `voided` status); refund or credit paid ones | Simplest to explain; matches "the lease never happened". |
| B | A, plus an early-termination fee | §83.595 caps it at 2 months' rent and requires a separate signed addendum. Opt-in only where the addendum is on file. |
| C | Manual | The lease is flagged and staff waive or refund each item. This is what v3 does until a generator exists. |

Open for counsel: whether §83.49's refund clock applies when the tenant never
took possession. The safe default is to refund within 15 days.

**2. $0-rent leases (staff, courtesy officer, rent-free agreement)**

| | Option | Notes |
|---|---|---|
| A | Skip — no charges | Hides lost income from owner reports. |
| B | $0 charges | Fails if production has `amount_cents > 0` (see above). |
| ★ C | Charge market rent plus an offsetting concession line (net $0) | Keeps the rent roll and vacancy-loss honest, and records the value a CPA needs. |

For a CPA: rent-free *employee* housing is tax-free only if it is on premises,
for the employer's convenience and a condition of employment (IRC §119, Pub
15-B). A non-employee who trades services for rent: the landlord reports the
fair value as rental income (Pub 527). Whether that also counts toward the 1099
threshold is unconfirmed. v3 records the reason (`zero_rent_reason`) either way.

**3. Renewal changes the rent**

| | Option | Notes |
|---|---|---|
| A | Per-lease billing: each lease bills only its own date range | Needs no special renewal logic. |
| ★ A+B | A, and when a renewal is saved, regenerate *pending* charges dated on or after its start; paid periods get a difference line staff approve; a back-dated renewal needs explicit confirmation | Covers late-recorded renewals. |
| C | Effective-dated rent steps on a lease | Needed only if mid-term rent changes become common. |

A rent increase for periods already billed needs the tenant's signed agreement.
Don't serve a §83.56 notice on an amount that was never agreed.

**4. Transfer to another unit mid-lease**

| | Option | Notes |
|---|---|---|
| ★ A | End the old lease and open a new one; prorate both units for the transfer month; carry the deposit by signed addendum | Buildium documents the same deposit carry-over. Needs start dates other than the 1st (see §3 below). |
| B | Full move-out and new move-in, with the deposit refunded and collected again | Clearly starts the §83.49(3) clock on the old unit. |
| C | Move the lease row to the new unit | Rejected. Obligations, payments, the overlap check and the rent trigger are all keyed by unit, so moving the row corrupts history. |

Open for counsel: whether carrying a deposit to a new lease counts as
"vacating" (which starts the 15/30-day clock) or as a change of holding (which
needs a new 30-day notice).

**Prerequisites for any generator:** idempotent `(lease_id, period_start)` keys;
daily proration (§83.46 "uniformly apportionable from day to day"); a `voided`
status; charges posted to the ledger.

---

## 2. Residents without an email address (Q4) — built as a switch

The client hasn't decided, so the design keeps both paths open.

- **Not chosen: making `users.email` nullable.** `users.id` mirrors Supabase
  `auth.users.id`, so every `users` row is a login account. A user with no
  email would affect sign-in, invitations and every notification path on the
  whole platform.
- **Built: lease parties from `unit_occupants`.** Main added household members
  with no portal login (Directory, migration 0085) while this project was in
  flight, so v3 uses them instead of its own `resident_contacts` table.
  `lease_residents` names either a user or a household member; a database
  CHECK enforces exactly one, and a composite FK keeps both in the lease's
  community. Notices to them go to the unit by mail or hand delivery.
- **Switch:** `communities.community_settings.leasesAllowResidentsWithoutEmail`
  (menu label **Allow household members on leases**). It's read with a strict
  `=== true`, so it's **off by default**. With it off, the API refuses a lease
  that names a household member. Turning it off later doesn't touch existing
  leases, but a renewal or transfer that carries a household member is then
  refused too: turn it back on to renew them.
- `leases.resident_id` became nullable because a household-member *primary*
  resident has no user id. It is always set when the primary resident is a user.

### Erasure vs. lease records (open — needs the client and counsel)

Main's Directory **Remove** hard-deletes a household member, because the audit
log can never be erased and household members are often children (#1303). A
lease that names someone is a record of who held the unit, so v3:

- makes `lease_residents.occupant_id` **ON DELETE RESTRICT**, and
- has Directory **Remove** answer **409** while any lease (current or past)
  names the person.

So an erasure request for someone on a lease is a manual records-retention
decision, not a click. If the client wants erasure to win, the alternative is
to redact the household member's name in place (keep the row, blank the PII)
instead of deleting it. Not built.

---

## 3. Other decisions made in this project

| # | Decision | Why | Confidence / reversible |
|---|---|---|---|
| D1 | Leases with no rent stay `NULL` and are shown as "Rent not recorded"; no fake $0 is written | The client chose this (Q5). `$0` must mean something | High / yes |
| D2 | `notice_days` is not back-filled | The value is in each signed lease; defaulting everyone to 60 is a legal guess | High / yes |
| D3 | No `lease_events` table. History uses the existing `logAuditEvent` (compliance audit log) and undo uses it plus `leases.version` | The proposal duplicated an audit trail the route already writes. The audit log also survives lease deletion, which `lease_events ON DELETE CASCADE` would not | Medium / yes |
| D4 | CHECKs on existing lease rows are `NOT VALID` | They bind new writes now. Existing production rows get validated after inspection (plan step "Validate") | High / yes |
| D5 | New tables use `tenant_admin_write` with an **admin-tier SELECT** | Deposits, home addresses and offers are the neighbour-data class that 0077 closed. Residents read their own data through the API | High / yes |
| D6 | Composite `(x_id, community_id)` FKs on every child table | Makes a cross-community link impossible even if the service layer is bypassed | High / yes |
| D7 | Resident read access comes from `lease_residents`, not `leases.resident_id` | A co-tenant must see their own lease. Security review: a resident sees a lease only through a current row naming them | High / yes |
| D8 | **New leases start on the 1st** (rule kept); **renewals are exempt** and start the day after the current term | Nothing prorates today, and an archived migration suggests prod may enforce the 1st at the DB — check before deploying (plan "Validate"). Requiring the 1st for renewals blocked renewing any lease ending mid-month, so it was dropped for renewals during the build. Transfers and pre-leases after a mid-month move-out still start on the next 1st | **LOW — confirm with the client**; also confirm prod has no start-date CHECK / yes |
| D9 | A lease with unpaid obligations can't be cancelled, deleted or transferred (409 plus the list) | Safe under every billing option; avoids orphaned payable charges | High / yes |
| D10 | `lease_alert_windows` lives in `community_settings.leaseAlertWindows`, not a new column | It's per-community config, like the other settings keys | High / yes |
| D11 | **Apartment occupancy comes from leases.** A current lease → rented; none → vacant; an offline unit → neither (null, out of vacancy counts). The stored `units.occupancy` is not read or written for apartments; the units routes refuse a value (400) and the CSV import refuses it per row | Main added a manual occupancy (0083) while v3 made leases decide unit state, and the two could disagree. The client chose leases (2026-10-04). Condos and HOAs keep the manual value | High / yes (stored column untouched) |
| D12 | Carried household members keep their Directory unit on a transfer | Moving them silently would change Directory behind the manager's back; the transfer dialog doesn't ask | Medium / yes |

## 4. Still open

- **Counsel:** §83.49 (notice wording, holding deposits, transfer carry-over),
  §83.57 (month-to-month notice), §83.575 (60-day cap), §83.58 (holdover), and
  every statute sentence in the help articles.
- **Client:** the billing options above (only when the rent generator is
  scheduled), D8 (start dates other than the 1st), and whether to turn on
  residents without email.
- **Production check before migrating:** the `rent_obligations` constraints
  query above, the D4 validation queries in the plan, and whether `leases`
  already has a start-date CHECK.
- **Existing bug, out of scope:** `units.rent_amount` is recomputed only when a
  lease row is written, so a renewal that starts on its date doesn't update the
  unit's rent until something touches the lease. It needs a daily job. Noted,
  not fixed here.
