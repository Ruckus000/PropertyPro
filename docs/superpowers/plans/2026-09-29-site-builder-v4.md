# Website builder v4 — phased implementation plan

**Source design:** claude.ai/design project `820470cb-7102-4d05-b9c9-339e17468c44`,
file `Website Builder v4.dc.html` (imports `Site Block.dc.html` and the
PropertyPro design-system bundle). Read 2026-09-29.

**Baseline:** the v3 editor at `apps/web/src/components/pm/site-editor-v3/`, route
`/pm/website-editor` (see memory `project_website_editor_v3`). v4 is a redesign of
that surface, **not** a rewrite: every data path, invariant and hard-won guard in v3
stays. Re-read the long comments in `EditorRoot.tsx` before moving anything — most
of them document a production bug.

**Decisions taken with the user (2026-09-29):**

- Build the whole design, as a sequence of reviewable PRs.
- Device-width preview (computer / tablet / phone): **yes**, in Phase 1.
- Full undo/redo stack: **deferred**. v3 saves per block to the server, so undo
  needs a server-side inverse design. The existing time-boxed undo toast for
  removals stays.

## Where v4 already has a backend

| v4 surface | Exists today | Gap |
|---|---|---|
| Hide a section | `hiddenSchema` (`packages/shared/src/site-blocks/types.ts`) — content, drafts & publishes | UI only (toolbar + hidden placeholder on canvas) |
| Colours & fonts (6 presets) | `THEME_PRESETS` in `packages/theme` — same six names as the design's `LOOKS` | Picker UI in a Design panel |
| Templates (Tidewater / Boulevard / Sable) | `LAYOUT_IDS`, `layouts/registry.ts`, `layout-resolver.ts` | Picker in editor; "use the template's pages too" |
| Pages & menu | `site_pages`, `PagesPanel` (in-nav, rename, slug, reorder, redirects) | Restyle to v4 rows |
| Urgent notice | `UrgentNoticePanel`, `/pm/site/urgent-notice` | Duration presets (verify expiry support) |
| Search title/description, share image | `SitePanel` + `SerpPreview` | Per-page overrides (new) |
| Custom domain | `DomainPanel`, `/pm/site/domain*` | Move into Settings view |
| Publish review | `PublishSheet` (diff, issues, schedule) | Florida "Checks" section |
| Documents | app-wide documents API + `/documents` | Builder-embedded view, upload queue, category health |

## Legal-copy rule (applies to every phase)

The design's copy repeatedly states "your association can be fined **$50 per day**".
That figure is not established for §718.111(12)(g) website posting (the $50/day
minimum-damages language in ch. 718 concerns *records-inspection* requests), and
`florida-compliance.md` says PropertyPro gives no legal advice. **Ship neutral copy**
("Florida law requires condominium associations to post this on their website")
and do not state a penalty amount unless counsel signs off. Tracked as an open
question for the user.

"Required" must be **community-type aware**: §718.111(12)(g) applies to condos
(25+ units); HOAs fall under §720.303 (100+ parcels); apartments have no statutory
website requirement. The requirement set is a pure function of community type in
`packages/shared` so the canvas, toolbar, pill and publish checks share one answer.

## Phases

### Phase 1 — builder chrome (this PR)
- Top bar: back to dashboard; **Editing page** menu (switch page, "Add or manage
  pages" → Pages tool); device toggle (computer / tablet / phone); save status;
  Help; Preview; Publish with change count.
- Left **rail** (84px, vertical, labelled icons) replacing the horizontal tab strip.
  Tool order: Add · Pages · Design · Notice · Help, then Site and Address until
  Phase 5 moves them into the Settings view (they must not disappear before their
  replacement exists). Sections tool folds into the canvas (selection + toolbar).
- Canvas: framed page at the chosen device width; selected-section label chip;
  section toolbar = Settings · Move up · Move down · Hide · Remove; hidden sections
  render as a dashed "hidden from visitors" placeholder with **Show again**;
  "Add section here" between sections and "Add a section to the end" at the bottom,
  wiring insert position into the Add panel.
- Keep: phone gate, page-repair logic, staged-page banner, bundle budget (route is
  near its 700 KiB hard budget — every new panel stays `dynamic()`).

### Phase 2 — Florida-required sections
- `requiredSectionsFor(communityType)` in `packages/shared`.
- Required sections: lock chip, no Remove/Duplicate, Hide asks for confirmation.
- Top-bar requirements pill (green "all set" / red "missing") + popover with one-click
  fixes; same checks in the publish sheet ("Checks"), publish still allowed.
- Server: reject deleting the last required section of a type (defence in depth).

### Phase 3 — guided mode, tour, help drawer
- First-run chooser (Guide me / Let me edit freely); mode switch in top bar + Help.
- Guided: left panel with tabs Next steps · Pages · Design · Help; Next-steps
  checklist (required items first, progress bar, "Need to warn residents now?").
- 4-step tour; right-side Help drawer with searchable guides and screenshots.
- Mode + checklist progress persisted per user (decide: preference table vs.
  localStorage — localStorage only if losing it is harmless).

### Phase 4 — Design panel
- Template cards (live mini-render of the hero), colour & font preset grid,
  Essentials plan lock on non-default presets.
- Template switch dialog: "Change the look only" vs "Use the template's pages too"
  (the latter needs a server op that stages the page set as drafts).

### Phase 5 — Settings view (top-bar view switch: Website · Documents · Settings)
- General (site name, favicon), Address & domain (subdomain change + existing custom
  domain flow), Search & sharing (existing SEO + **new** per-page overrides),
  Access (Owner-login button toggle, take site offline — **new** columns/migration).
- Remove Site and Address from the rail.

### Phase 6 — Documents view
- Category list with health tiers (calm / aware / urgent / critical), search,
  per-document edit sheet (replace file, public toggle with warning, PII attestation,
  unpost/delete with last-in-category warning), multi-file upload queue (size/type
  errors, duplicate replace-or-keep, draft vs post).
- Reuse the existing documents API; verify PII attestation storage requirement.

### Deferred
- Full undo/redo stack.
- Offline / edit-conflict / save-failed / publish-failed banners beyond what v3 has
  (design's `edgeCase` states) — fold into the phase that owns each surface.
</content>
</invoke>
