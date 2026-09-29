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
- **Built: `resident_contacts`.** These are community-scoped people who never
  sign in. `lease_residents` names either a user or a contact; a database CHECK
  enforces exactly one. Notices to a contact go by mail or hand delivery, and no
  portal invite is sent. When a contact later gets an email address, inviting
  them creates a real user and `linked_user_id` records the link. The lease
  history keeps pointing at the same contact row.
- **Switch:** `communities.community_settings.leasesAllowResidentsWithoutEmail`.
  It's read with a strict `=== true`, so it's **off by default**, and every
  community keeps today's behaviour until someone turns it on. With the switch
  off, the API rejects contact residents.
- `leases.resident_id` became nullable because a contact-only *primary* resident
  has no user id. It is always set when the primary resident is a user.

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
| D8 | **Start dates other than the 1st: kept OFF for now** (1st-of-month rule stays) | Nothing prorates today, and an archived migration suggests production may enforce it at the DB. Transfers and "starts the day after move-out" pre-leases therefore start on the 1st of the next month. Relaxing it is one line plus a production constraint check | **LOW — needs the client** / yes |
| D9 | A lease with unpaid obligations can't be cancelled, deleted or transferred (409 plus the list) | Safe under every billing option; avoids orphaned payable charges | High / yes |
| D10 | `lease_alert_windows` lives in `community_settings.leaseAlertWindows`, not a new column | It's per-community config, like the other settings keys | High / yes |

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
