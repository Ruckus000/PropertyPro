# Website builder v4: phased plan (revised with the ponytail ladder)

**Source design:** claude.ai/design project `820470cb-7102-4d05-b9c9-339e17468c44`,
file `Website Builder v4.dc.html`. Read on 2026-09-29.

**Baseline:** the v3 editor at `apps/web/src/components/pm/site-editor-v3/`, route
`/pm/website-editor`. v4 redesigns that surface; it does not rewrite it. Every data
path and invariant in v3 stays.

## How this plan was cut

The first draft of this plan treated the design as a spec for new UI in six phases.
Rev 2 runs each phase through the ponytail ladder, and only after reading the code
each phase would touch. The ladder asks, in order: does it need to exist, is it
already in this codebase, is it stdlib, is it native to the platform, is it an
installed dependency, and only then what is the least code that works.

Validation, security and accessibility are never cut. Anything below marked **cut**
is the recommended default, pending the user's call. The design asks for all of it,
and "user insists on the full version → build it" applies.

## What already exists (evidence, 2026-09-29)

| v4 surface | Already in the repo | Consequence |
|---|---|---|
| Device preview | `/pm/site-preview` renders the **draft** (`includeDrafts: true`) as a real page. The wizard already iframes it (`WizardLivePreview`). `PhoneFrame` exists in `packages/ui`. | Use an iframe: its viewport breakpoints respond to the frame width. No container queries, no new dependency, no change to the public site. `PreviewDialog`'s note that the only URL is the published site is **stale**. |
| Page picker popover | `components/ui/popover.tsx` (Radix) | Done in PR #1231. The hand-rolled version was built on a stale 700 KiB budget (the real hard budget is 1,220 KiB, with 228 KiB headroom). |
| Required-section checks | Publish `Issue` model with `'error' \| 'warning'` severity and a "Fix this" slot hand-off (`packages/shared/src/site-diff`). Statute references are in `compliance/templates.ts`. | One new `site-diff` check function, added to the existing issues array. The publish sheet's "Checks" and "Fix this" come for free. |
| Colours and templates | `LayoutChooser` and `PresetChooser` in the onboarding wizard, plus `PATCH /pm/onboarding/website` | Pass the hook's values in as props so the wizard and a Design panel share one picker. Don't build a second one. |
| Documents | `components/documents/` (~2,750 lines): statutory coverage, a public/owners toggle, the redaction (PII) attestation, and a 50 MB limit | **Don't build a second documents UI in the builder.** The top bar links to it. Real gaps go into the existing library, if wanted: multi-file upload, duplicate detection, and replacing a file. |
| Help | `HelpPanel` shows every MDX article tagged `/pm/website-editor`, and none exists yet | Write articles. Don't build the design's second help system of hard-coded guides and screenshots, because screenshots go stale with every UI change. |

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

### Phase 1b: device preview (small)
Add a `pageId` param to `/pm/site-preview`. The reader is community-scoped, so a
page from another community cannot resolve. Add a computer/tablet/phone toggle that
shows that route in an iframe at 1120/820/390px, using `PhoneFrame` for the phone
size. Known ceiling: it shows the last **saved** draft, so a keystroke still inside
the autosave debounce isn't visible yet.

### Phase 2: Florida-required sections
- One pure function in `packages/shared`, `requiredSectionTypes(communityType)`.
- One `site-diff` check that warns when no visible section of a required type
  exists on any page. It is advisory, which matches the design's "you can still
  publish", so the server publish gate is untouched.
- A top-bar pill reads the same function.
- Remove and Duplicate are locked for required types in the toolbar and in
  SectionList. Hiding a required section asks for confirmation first.
- **Cut:** a server guard against deleting the last required section. The PM is
  authorised to make that edit and publishing is allowed anyway, so the guard would
  enforce a rule the UI deliberately does not.

### Phase 3: guidance (cut down from "guided mode")
- **Build:** a "Next steps" panel in the rail. It is a checklist computed from facts
  that already exist: required sections, whether onboarding is finished, whether the
  site has been published, and whether the phone preview has been viewed. It opens
  by default until the first publish.
- **Build:** MDX help articles tagged `/pm/website-editor`, shown by the existing
  HelpPanel.
- **Cut:** the Guided/Free mode system, the first-run chooser, the 4-step tour and
  the help drawer. Two editor modes means every future panel is built and tested
  twice, and there are no users yet to say which one they want.

### Phase 4: Design panel
Colour and template pickers reuse the wizard's `LayoutChooser` and `PresetChooser`,
with the hook's values passed in as props. Saving goes through the existing endpoint.
The Essentials plan lock uses the existing plan feature. **Cut:** "Use the
template's pages too". It would need a new destructive server operation that
replaces the page set, and "Change the look only" covers the stated need.

### Phase 5: Settings view — **cut**
Site settings and Address already live in the rail and work. The design's new
Settings items would each be a new product feature with new schema:
- changing the subdomain (this breaks URLs, and it interacts with cookie domains
  and custom domains)
- per-page SEO
- a toggle for the Owner-login button
- taking the site offline

Build each one only when an association asks for it.

### Phase 6: Documents view — **replaced by a link**
The top bar gets a "Documents" link to `/communities/[id]/documents`. Gaps in that
library (multi-file upload, duplicate detection, replacing a file) are separate
decisions for the library itself, not for the builder.

### Deferred
- A full undo/redo stack. It needs a design for reversing changes on the server.
- A server-side insert-at operation, replacing the client append-then-move (see the
  `ponytail:` marker in `editor-context.tsx`).
