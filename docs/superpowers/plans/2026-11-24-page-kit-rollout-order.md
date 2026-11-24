# Moving the rest of the app onto the new page design: order and batches

Written 2026-11-24 for the owner to approve. This sets the order only. Each
batch gets its own build plan when it starts.

**Spec:** `docs/superpowers/specs/2026-11-21-page-anatomy-design.md` (rollout in §17).

## Where things stand

- On the new design, live for everyone: Packages, Visitors, Emergency Alerts,
  and the Violations list and report form.
- Still on the old layout: **86 pages**, counted from
  `scripts/page-template-baseline.json` on `main` at `9999f8ee5`. The batches
  below add up to 86.
- The sidebar and top bar are still the old ones.

## One change from the original order, and why

The spec says: new sidebar and top bar first, then dashboard and settings,
then every other page. I recommend the other way round for the first four
batches:

- Batches 1 to 4 need only parts that already exist and that you have already
  approved on Packages, Visitors and Alerts. They can start now.
- The sidebar and top bar change every page at once and have the most that can
  go wrong. Dashboards and Settings need new parts that are not built yet.
  Doing those after four batches of ordinary pages means the new parts are
  designed with more real pages to check them against.

The cost: for a few weeks, redesigned pages sit inside the old sidebar, as
Packages does today.

## The batches, in order

| # | Batch | Pages | What you will see change |
|---|---|---|---|
| 1 | Announcements, Notifications, Directory, Audit Trail | 7 | The most-visited everyday lists |
| 2 | Day-to-day management: Contracts, Leases, Move In/Out, Operations, Assessments, the two import pages, the single-violation page | 8 | Manager work lists and the import forms |
| 3 | Board work: ARC requests, Elections, Polls, Forum | 6 | Board and owner participation pages |
| 4 | Documents and E-Sign | 11 | Document library, document page and editor, templates and signing requests |
| 5 | Money: Payments, Finance, Reserves, Insurance, Storm Damage | 8 | Includes the payment-success page |
| 6 | Sidebar and top bar | 0 pages, every screen | New navigation, fixed coral action colour, "Next deadline" in the top bar |
| 7 | Dashboards and overview pages: Dashboard, Compliance, Meetings, and the portfolio pages for management companies | 12 | Key-figure bands, calendars, the time-left chip |
| 8 | Settings and Join a Community | 10 | One settings layout; the old private one is deleted |
| 9 | Community picker, Welcome, Claim ownership | 3 | The single-column pages with no sidebar |
| 10 | Help: help center, statutes, contact, and the pop-up dialogs | 8 | The help side panel is retired; one help window |
| 11 | Pages outside the signed-in app: sign up, log in, password reset, invite, the public signing page, print view, website editor, demo pages, public transparency page | 13 | |
| 12 | Help articles and example content refresh (your decision of 2026-11-24: after the pages move) | | 103 articles, new screenshots |

## How each batch is delivered

- The preview switch is gone, so a merged page is live for every customer at
  once. Before I ask you to merge a batch, I show you screenshots of each page
  at laptop and desktop width, with real rows, from a local copy of the app.
- Each batch is a few small pull requests, one section each, so one page can
  be held back without holding the rest.
- Every pull request is code-reviewed and security-reviewed before it opens,
  and nothing merges without your go-ahead.
- Wide tables get the Visitors treatment: fewer columns, no sideways scroll.
  Where a table has more than about six columns I will show you which ones I
  propose to drop.
- Each page keeps what it can do today. A change to what a page does (as with
  alert scheduling) is a separate request.

## Decisions I need from you

1. **Order.** Decided 2026-11-24: pages first, as above ("Approve order").
2. **Login page (batch 11, spec decision 12).** Keep the photo panel, or
   replace it with a plain text margin. Can wait until batch 11.
3. **Control borders (spec decision 13).** Decided 2026-11-24: yes, as its own
   pull request before batch 1, with before-and-after screenshots.

## Not in this plan

The phone screens under `/mobile`, emails, and the admin console (spec §19).
