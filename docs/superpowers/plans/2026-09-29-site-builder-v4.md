# Website builder v4: phased plan (revised with the ponytail ladder)

**Source design:** claude.ai/design project `820470cb-7102-4d05-b9c9-339e17468c44`,
file `Website Builder v4.dc.html`. Read on 2026-09-29.

**Baseline:** the v3 editor at `apps/web/src/components/pm/site-editor-v3/`, route
`/pm/website-editor`. v4 redesigns that surface; it does not rewrite it. Every data
path and invariant in v3 stays.

## How this plan was cut

Rev 2 ran each phase through the ponytail ladder. That surfaced two things: parts of
the design already exist in this repo (the table below), and some parts looked cuttable.
**The user reviewed the proposed cuts on 2026-09-29 and declined them: the whole
design is built.** The ladder still governs HOW each piece is built (reuse what exists,
native before dependency, minimum code), never WHETHER. Validation, security and
accessibility are never cut.

## What already exists (evidence, 2026-09-29)

| v4 surface | Already in the repo | Consequence |
|---|---|---|
| Device preview | `/pm/site-preview` renders the **draft** (`includeDrafts: true`) as a real page. The wizard already iframes it (`WizardLivePreview`). `PhoneFrame` exists in `packages/ui`. | Use an iframe: its viewport breakpoints respond to the frame width. No container queries, no new dependency, no change to the public site. `PreviewDialog`'s note that the only URL is the published site is **stale**. |
| Page picker popover | `components/ui/popover.tsx` (Radix) | Done in PR #1231. The hand-rolled version was built on a stale 700 KiB budget (the real hard budget is 1,220 KiB, with 228 KiB headroom). |
| Required-section checks | Publish `Issue` model with `'error' \| 'warning'` severity and a "Fix this" slot hand-off (`packages/shared/src/site-diff`). Statute references are in `compliance/templates.ts`. | One new `site-diff` check function, added to the existing issues array. The publish sheet's "Checks" and "Fix this" come for free. |
| Colours and templates | `LayoutChooser` and `PresetChooser` in the onboarding wizard, plus `PATCH /pm/onboarding/website` | Pass the hook's values in as props so the wizard and a Design panel share one picker. Don't build a second one. |
| Documents | `components/documents/` (~2,750 lines): statutory coverage, a public/owners toggle, the redaction (PII) attestation, and a 50 MB limit | The builder's Documents view is built on these pieces (API, categories, attestation, validation). The missing capabilities (multi-file upload, duplicates, replacing a file, a draft state) go into the shared documents layer, so they exist once. |
| Help | `HelpPanel` shows every MDX article tagged `/pm/website-editor`, and none exists yet | The design's Help drawer is built. Its guide content is also published as tagged MDX, so it exists once and both surfaces show it. |

## Legal-copy rule (every phase)

Don't state "$50 per day". That figure is not established for §718.111(12)(g)
website posting; the $50/day minimum damages concern records-inspection requests.
Also, `florida-compliance.md` says we give no legal advice. Use neutral copy. The
set of required sections depends on community type: condos (§718, 25+ units), HOAs
(§720, 100+ parcels), and none for apartments.

## Phases

### Phase 1: builder chrome (PR #1231)
Tool rail, a closable panel, the Editing-page picker (on the existing Popover), the
Publish count, and "Add section here" / add-to-end. The toolbar adds Hide and
Duplicate, and hidden sections get a placeholder whose copy comes from the published
state (`describeHiddenSection`). A `ponytail:` marker on `placeAdded` records the
append-then-move ceiling.

### Phase 1b: device preview
Add a `pageId` param to `/pm/site-preview`. The reader is community-scoped, so a
page from another community cannot resolve. Add a computer/tablet/phone toggle that
shows that route in an iframe at 1120/820/390px, using `PhoneFrame` for the phone
size. Known ceiling: it shows the last **saved** draft, so a keystroke still inside
the autosave debounce isn't visible yet.

### Phase 2: Florida-required sections
- One pure function in `packages/shared`, `requiredSectionTypes(communityType)`,
  shared by the canvas, the toolbar, the pill and the publish checks.
- One `site-diff` check that warns when no visible section of a required type exists
  on any page. It plugs into the existing publish `Issue` model, which provides the
  sheet's "Checks" and "Fix this".
- A top-bar requirements pill and popover with one-click fixes.
- Remove and Duplicate are locked for required types in the toolbar and in
  SectionList. Hiding a required section asks for confirmation first.
- A server guard refuses to delete the last required section of a type (defence in
  depth).

### Phase 2b: the statutes' size thresholds
Phase 2 keyed requirements on community type alone, so a 20-unit condo saw "Required"
badges the statute does not apply to. Signup and "Add community" always collected a unit
count and dropped it before the insert.
- Migration 0081 adds nullable `communities.unit_count` (NULL = unknown), backfilled exactly
  from `provisioning_jobs` → `pending_signups`. Both creation paths now write it.
- `requirementLevel({ communityType, unitCount })` in `packages/shared`: `required` at 25+
  units (condo) or 100+ parcels (HOA), `recommended` below, `none` for apartments. An
  unknown count counts as `required`, and the pill asks for it.
- `recommended` is a badge only: no locks, no hide confirmation, no publish warnings, and no
  server refusal.
- `PATCH /api/v1/community/unit-count` (admin-only, audited) backs the pill's count field.
- Signup and "Add community" no longer pre-fill the count with 1. Since 0081, that default
  would have marked an association exempt without anyone answering the question.

Follow-up: Compliance now agrees with the builder. Every "overdue" the checklist derives is
the website-posting clock (the 30-day deadline in `calculatePostingDeadline` and the rolling
posting windows). So `postingClockApplies(subject)` in `packages/shared` is false exactly when
`requirementLevel` is `recommended`, and the clock is switched off in the three places it
reaches people:
- the Compliance API, whose rows go out with no deadline or rolling window, so they are never
  overdue or "due soon";
- the daily overdue email, which is not sent;
- the public transparency page, where an unposted item reads "Not required".

The Compliance page says why in one banner. Rows and scores are unchanged: the duty to keep
official records still applies, and scores count satisfied ÷ applicable.

Deferred, each with its trigger:
- **PM portfolio "urgent / critical" counts** (`lib/queries/cross-community.ts`,
  `packages/db/src/queries/pm-portfolio.ts`) and the admin console's per-item status still read
  raw deadlines. Only staff and PMs see them; none are public, and none send email. Trigger: a
  PM or admin managing a sub-threshold association.
- **The PATCH response from `/api/v1/compliance`** still carries the stored deadline. The client
  discards it and refetches. Trigger: a client that reads it.
- **The 25 / 100 thresholds also appear in marketing prose** (`compliance-checker.tsx`,
  `faq-section.tsx`, `who-section.tsx`). Trigger: the statute's threshold changes.
- **Draft-wins merge has four hand-written copies** (see the `ponytail:` comment in
  `site-pages-service.ts`). Trigger: a bug fixed in one copy but not the others.
- **No regression test for the top bar's fit.** It was measured in Chromium at 768–1440px
  (#1252), and a class-name test would be the "layout inferred from text" guess that
  `guard:responsive-geometry` refuses. Trigger: a new control added to the top bar
  (re-measure).

### Phase 3: guided mode, tour, help drawer
- A first-run chooser (Guide me / Let me edit freely), plus a mode switch in the top
  bar and in Help. The mode and the checklist progress are persisted per user.
- Guided mode: a 380px panel with the tabs Next steps · Pages · Design · Help. The
  Next-steps checklist puts required items first and has a progress bar and "Need to
  warn residents now?".
- A 4-step tour.
- A right-side Help drawer with searchable guides and figures. Guide content is also
  published as MDX tagged `/pm/website-editor`, so the existing HelpPanel and the help
  center show it too.

### Phase 4: Design panel (decided 2026-10-01)
These decisions were made against what the product actually has. The design assumed
more than exists.

**Decisions:**
- **Design changes are drafts.** The look sits in `communities.branding`, outside
  `site_blocks`, so it used to go live on save. The design says "Nothing goes live
  until you publish", so the look now has a draft layer.
- **Six templates, look only.** The design's templates each bring a page set, and the
  product has none. Even the design never decided pages for the HOA and apartment
  templates. So the six templates are named layout + colour-set pairs, and "Use the
  template's pages too" is deferred.
- **No Essentials lock.** Essentials users can already pick any colour set in the
  wizard, and a lock would take that away.
- **The Pro "Colours" panel merges into Design.** Its custom colours override any
  colour set, so as a separate panel a colour-set pick could silently do nothing.

**Built in 4a (server):**
- `branding.draftLook` holds only `SITE_LOOK_FIELDS`. It needs no migration, because
  live readers read named fields only and never see it.
- `site-design-service` and `/api/v1/pm/site/design` write the draft with one
  `jsonb_set`.
- Choosing a colour set writes its colours and fonts. This fixes the wizard bug where
  the choice never reached the live site, because only the slug was saved and
  `resolveTheme` ignores it.
- Publish promotes the draft in its transaction, counts a design-only change,
  records the look in the history snapshot and labels it.
- Discard drops the draft. Revert restores a recorded look as the draft.
- The diff has one `style` change.
- `/pm/site-preview` and preview requests show the draft look; live pages never do.
- The wizard's look fields go to the draft and go live on its final Publish.

**4b (UI):** the Design panel, replacing the "Colours" tool. The canvas restyles from
the draft.

Deferred, each with its trigger:
- **"Use the template's pages too".** Trigger: page sets exist for every community type.
- **Other branding writers still change the look live:** the admin app, applying a
  portfolio template, and the default seeding at community creation. (The old
  branding form and copy-branding dialog were deleted in #1274.) Trigger: a manager
  reports a design change made outside the editor going live without Publish.
- **The public header background ignores custom colours** (`PublicSiteHeader.tsx`,
  inline `theme.primaryColor`). This predates Phase 4. Trigger: the next public-header
  change.
- **The publish concurrency token is `MAX(site_blocks.published_at)`**, so a
  design-only publish doesn't advance it. That is the same benign limitation as a
  removal-only publish (see `publishCommunitySite`). Trigger: two managers report
  overwriting each other's design.
- **Only the design PATCH refuses a demo in its grace window.** `/api/v1/pm/site/design`
  calls `assertNotDemoGrace`, as `/api/v1/pm/branding` did for the look. The other
  `pm/site/*` writes (blocks, pages, settings, drafts, publish, revert, schedule, hero,
  urgent notice) and the onboarding wizard's PATCH never have, and nothing checks it
  centrally. Trigger: a decision that grace-window demos are read-only for the whole
  site, then one check in the shared access helper.
- **Colour sets' fonts are not checked against `ALLOWED_FONTS`.** They come from the
  platform catalog, and `resolveTheme` drops unknown fonts at render. Trigger: the
  catalog becomes editable by anyone but platform admins.

### Phase 5: Settings view (top-bar view switch: Website · Documents · Settings)
- **General:** site name and favicon. These exist in SitePanel; move them here.
- **Address & domain:**
  - Subdomain change: **new**. It needs slug-change handling for cookie domains,
    custom domains and redirects from the old address.
  - The custom-domain flow: existing DomainPanel logic.
- **Search & sharing:**
  - Site SEO and the share image: existing.
  - Per-page SEO: **new** — columns on `site_pages`, a migration, and wiring into
    the public-site metadata.
- **Access:**
  - Owner-login button toggle: **new**. A branding field, read by all four layouts.
  - Take the site offline: **new**. A community flag, plus a "temporarily
    unavailable" gate in the public-site render path.
- Site and Address then leave the rail.

### Phase 6: Documents view
A Documents view inside the builder, built per the design:
- category health tiers, search and the per-document sheet
- a multi-file upload queue with draft or post
- duplicate handling, replacing a file, and the PII attestation

It reuses the existing documents API, statutory categories, the redaction-attestation
component and file validation. The capabilities that don't exist yet are built once,
in the shared documents layer, so the app's documents library can use them too:
- multi-file upload
- duplicate detection
- replacing an uploaded file
- a draft state for uploaded documents

### Deferred
- A full undo/redo stack (the user's decision). It needs a design for reversing
  changes on the server.
- A server-side insert-at operation replacing the client append-then-move (see the
  `ponytail:` marker in `editor-context.tsx`).

### Phase 6 (thin), as built
The thin Phase 6 decided on 2026-10-02 (see the Phase 6 revision):
- **A Documents tool on the editor rail** (`panels/DocumentsPanel.tsx`) shows one row
  per records group. Each row's status is read from the compliance checklist by
  `summarizeRecords` (`lib/site-editor/records-status.ts`), so nothing about
  "required" is computed a second time:
  - **Nothing posted:** no record, or the record was deleted.
  - **Saved, not posted:** a draft is linked; the row links to it with `?doc=<id>`.
  - **Out of date:** posted, but older than the item's rolling window.
  - **Up to date:** otherwise. A file posted after its deadline is still on the
    website, so it counts as up to date here, even though Compliance shows it as
    overdue.
- **The rail shows a count** of groups that are not up to date.
- **Below the size threshold** the tool uses the builder's "recommended" wording.
  Apartments get a link to the library only, and no checklist request (the route
  refuses them).
- **`GET /api/v1/compliance` rows carry `documentState`** (`posted | draft | deleted |
  null`). `status` alone reads a draft and a deleted file the same way, but one
  needs posting and the other a new upload.
- **The last-document guard is in the library.** Deleting the posted record of an
  applicable requirement says that the requirement will show as missing until the
  file is restored or another is linked. Taking a document off the site already said
  so (`unpostConfirmation`).

Deferred, each with its trigger:
- **The PATCH response's `documentState` is always `null`.** It derives without the
  linked-file lookup, the same as its stale deadline (see Phase 2b). Trigger: a
  client that reads the PATCH response.
