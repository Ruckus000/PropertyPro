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
  (#1252), and re-measured when Phase 5 added the view switch. A class-name test
  would be the "layout inferred from text" guess that `guard:responsive-geometry`
  refuses. Trigger: a new control added to the top bar (re-measure).

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

### Phase 3a, as built (groundwork; no editor chrome)
Split from 3b on 2026-10-03, because #1293 and #1294 (Phase 5) rewrite the same chrome files
(`EditorShell`, `EditorTopBar`, `tools.ts`, `ToolRail`, `EditorRoot`). 3a touches none of them.
- **Per-user state:** `GET/PATCH /api/v1/pm/site-editor/preferences`. It stores the mode (`guided` |
  `free`, `null` until the chooser is answered), `tourDone`, hand-ticked steps (`welcome`, `photo`) and
  visited tools (`design`, `pages`, `phone`).
  - It uses `user_preferences`, so no migration. `site_editor_mode` is per user;
    `site_editor_checklist:<communityId>` is per user per community.
  - Values are stored FLAT and written with `mergeUserPreference` (one jsonb `||` upsert). That way
    two quick clicks can't overwrite each other.
- **Checklist logic:** `lib/site-editor/next-steps.ts` (`buildNextSteps`) is pure. The rules group
  comes from `RequiredSectionStatus` and `summarizeRecords` and can't be ticked by hand. It reads
  "recommended" below the size threshold and is absent for apartments. The setup group has the
  design's six steps.
- **The design's "$50 per day" line is not used** (legal-copy rule). The law line is
  `requiredSectionLaw`'s sentence.
- **Guides:** 7 MDX articles in `content/help/manager/website/` tagged `/pm/website-editor`:
  edit-words-and-photos, website-sections, website-pages, website-design, urgent-notice,
  publish-website and florida-website-rules. The design's `docs` guide is the existing
  `upload-document` article, rewritten for the upload queue, drafts and Replace file.
- **The guides describe the product, not the design.** The design's guide text assumes typing directly
  on the page, dragging photos onto it, a "Change the look only" prompt, a per-page menu switch and
  an Undo button. None of these exist. Titles, grouping and order follow the design.

Left for 3b, each with its reason:
- The `around`, `domain` and `seo` guides describe the top bar and the Settings view (#1293/#1294).
- `undo` is not written: the undo stack is deferred.
- Screenshots are captured after the chrome settles.
- `website-branding` (stale since 4a: it still says colours go live right away) is replaced by the
  `domain` guide.
- The contextual Help list is capped at 8, and `/pm/website-editor` now has exactly 8 articles. The
  3b drawer lists by group, not through that cap.

### Phase 3b, part 1, as built: the Help drawer
- **The drawer.** `site-editor-v3/help/HelpDrawer.tsx` is code-split and opened from the top bar's
  **Help** button or the rail's Help tile. It replaces the Help tool panel, which is deleted.
  - It is not modal: focus moves in and back out, and Escape closes an enlarged figure first.
  - A guide renders in the drawer through the help modal's `HelpArticleBody`.
  - `help/guides.ts` holds only editor code: group, the views a guide is listed first in, and its
    "Show me" action.
- **The cap.** `/api/v1/help/contextual` takes an optional `limit` (1–20). The drawer asks for 20;
  other callers keep 8.
- **Guides.** `website-editor-overview`, `website-domain` and `website-search` are written, with no
  screenshots yet. `upload-document` is tagged for the editor.
- **Corrections to `website-pages` and `website-sections`.** Pages can't be dragged; rename and
  **Show in navigation** are behind the gear; a never-published page is deleted with no undo;
  Payments sections can't be restored.
- **`website-branding`.** Left to #1296, which rewrites it rather than replacing it. The drawer lists
  it under "Editing your site".
- **The support line promises no reply time.** "Within one business day" is stated only for sales
  enquiries.
- **Budget.** The drawer's wiring cost 1.3 KiB of first-load JS, and the aggregate sat at 1490.0 of
  1490. To make room, the requirements pill's popover body (the explanation, the fixes and the
  unit-count form) is now code-split into `RequirementsDetails.tsx`, loaded on first open. Result:
  1485.7 KiB, down from 1488.7 on `main`.
- **Top bar.** Measured in Chromium with the production CSS and a long community name. With the Help
  button added, Publish ran past the edge at 768px and the name shrank to nothing at 1280px. So on
  the Website view the top-bar Help shows only from 1536px; the rail's Help tile is always there.
  Settings has no rail but room to spare, so it shows Help at every width, icon-only below 1536px.

Still to come in 3b: the chooser, the mode switch, the Guided panel with Next steps, and the tour.
Then screenshots for every editor guide.

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

### Phase 5: Settings view (decided 2026-10-02)
These decisions were made against what the product has. Most of the design's
Settings view already existed in the rail's Site and Address panels.

**Decisions:**
- **The view switch has two areas, Website and Settings.** The design's third,
  Documents, would be the in-editor library Phase 6 chose not to build. Documents
  stays a rail tool.
- **Settings stay live on save, not drafts**, exactly as the panels they replace
  were. Every card says so.
- **The site name is the community name, shown read-only.** There is no separate
  site name. The web app has no page for editing the community name, so there is
  no "Edit community profile" link.
- **Only part of the Access tab is built.** It explains who sees what and links
  to Documents. There is no Owner-login toggle and no offline switch.

**Built in 5a:**
- **The top bar has a `Website · Settings` switch.** In Settings, the page picker,
  device toggle, rail, canvas and inspector give way to the code-split
  `SettingsView`.
- **Settings has four tabs:**
  - **General:** the site name, the site icon, photo storage and the footer.
  - **Address & domain:** the PropertyPro address with a Copy button, and the
    existing custom-domain flow.
  - **Search & sharing:** search results and the new sharing image.
  - **Access & visibility.**
- **The Site and Address tools left the rail.** With no Pro tool left on it,
  `TOOL_PLAN_FEATURE` and `ProToolAccess` are gone. `hasSiteCustomDomain` is a
  plain prop.
- **SitePanel became two forms** (`part: 'search' | 'footer'`). Each sends only its
  own fields and resyncs only on its own stored values.
- **A sharing image.** It was a real defect: `buildCommunityMetadata` took a
  `heroImageUrl` that no caller passed, so every shared link went out with no
  image. Now `siteSettings.shareImage` is one 1200×630 JPEG (JPEG so that every
  link preview renders it), written by `/api/v1/site/images/finalize-share-image`.
  That route works like the favicon's: it charges the quota and records the
  image's bytes, so a replacement releases exactly the old image's bytes, and
  only once its delete succeeds. It refuses a demo in its grace window.

**Built in 5b: per-page search title and description.**
- **Storage.** Migration 0086 adds nullable `site_pages.seo_title` and
  `seo_description`, with no backfill. NULL means the page keeps its default.
- **Saving.** `updateSitePage` caps and normalises both fields with the
  site-level rules (`normalizeSettingText`, 60 and 160 code points). They save
  live on the existing page PATCH, like a rename, and are audited with it.
- **Public metadata.** A sub-page uses its own title and description when set.
  A page without overrides emits exactly what it did before, including the
  social card.
- **Editor.** A "Page by page" card in Search & sharing, for sub-pages only (the
  home page's text is the site's). Its placeholders show the real defaults.
- **One serialiser.** The pages routes and the editor's seed each had their own
  hand-written row serialiser; they now share `toSitePageSummary`.

Deferred, each with its trigger:
- **Changing the PropertyPro address, with 90-day forwarding.** This needs a
  slug-history table, a middleware lookup, a hold on the old name and cache
  invalidation. The middleware's five-minute slug cache also caches misses, so a
  new name can be unreachable for minutes. Trigger: a manager asks to change
  their address.
- **Taking the site offline.** This needs a gate across the page, its metadata,
  the sitemap and document downloads, plus a decision about the transparency page.
  The design's "$50 per day" copy is rejected under the legal-copy rule. Trigger:
  a manager needs the site down, for example during a dispute or a migration.
- **The Owner-login toggle.** Hiding it makes the owner portal harder to find.
  Trigger: a manager asks to hide it.
- **A site name separate from the community name.** Trigger: a community wants
  the two to differ.
- **The home hero photo as a fallback sharing image.** It would need a block read
  in every public page's metadata. Trigger: managers don't set a sharing image.
- **Removing a sharing image, or a site icon.** Today they can only be replaced;
  no favicon-removal path was ever wired either. Trigger: a manager asks.

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

**Revised 2026-10-02.** Those four capabilities have since shipped in the documents
library (#1253, #1260, #1261). Rebuilding the library inside the editor would give the
same records two interfaces that drift apart. So Phase 6 is now thin: a Documents tool
that reports each category's status from the compliance checklist (which already follows
the size thresholds) and links into the library, plus the design's last-document guard,
added to the library itself.

The design's fine copy ("$50 per day") is not used, per the legal-copy rule above, and
neither is its hard-coded "Due soon".

**Fixed first: the website's records section never showed a document.**
- The section filters by fixed values (`budget`, `minutes`, `financial`, `rules`, `other`).
- The reader compared those to the community's category *names* as strings
  ("Financial Records"…), which matched nothing.
- Every condo and HOA starter site therefore got an empty records section.
- They are now matched by meaning, through `normalizeCategoryName`
  (`documentMatchesSectionCategories`).

Deferred, with its trigger:
- **The section has no "governing documents" value.** The declaration, bylaws and
  articles, first on the §718.111(12)(g) list, can't be selected. Adding one means an
  additive schema value plus updating the condo and HOA starter-pack rows. Trigger: the
  next change to the records section, or a board asking where its declaration is.

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
