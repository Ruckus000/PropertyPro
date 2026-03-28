# Admin Templates Library Design

## Goal

Add a new `Templates` page in the admin app for managing a global library of **public site templates** used by demos. The page includes:

- a template gallery/listing surface
- an editor surface with **side-by-side code and preview** (not tabbed)
- template naming/editing and publish workflow

This design intentionally mirrors the existing edit-demo code/preview behavior where appropriate while adapting it for global template management.

## Scope

### In Scope

- New top-level admin navbar destination: `Templates`
- Global template library (not community-scoped, not demo-scoped)
- Public site templates only. There is no mobile template library in this system; the tenant "mobile view" is just the existing tenant web app login.
- Gallery flow: browse/search/filter/create/open template
- Editor flow: edit template name + JSX, save draft, publish
- Side-by-side code/preview editor with resizable splitter
- UX hardening for edge cases called out during review

### Out of Scope

- Any tenant/mobile-specific templating surface or alternate login-shell templating
- Full template version-history UI
- Advanced branching/compare/merge template tooling
- Right-side metadata/config sidebar in editor (deferred)
- Schema redesign beyond what is needed for global templates

## Existing Context

Current relevant behavior in admin app:

- `JsxTemplateEditor` already supports JSX editing, draft save, publish, and preview iframe.
- Existing editor currently uses a tab toggle (`Code`/`Preview`) instead of side-by-side panes.
- Existing API patterns exist for site templates (`GET/PUT/publish`) in community-scoped routes.
- The tenant-facing "mobile view" is not a separate app shell or template surface; it is the existing tenant web app login and remains outside this feature.

The design reuses those interaction patterns while changing information architecture to a dedicated templates management page.

## Design Alignment Constraints

### Source of Truth

- `DESIGN.md`, `.claude/rules/design.md`, and `docs/design-system/` are authoritative for spacing, typography, surfaces, status treatment, component sizing, and state handling.
- The HTML mockups are layout/composition references only. Do **not** copy their raw hex values, ad-hoc pixel measurements, or font choices directly into production UI.

### shadcn/ui + Local Ownership Model

- Follow the repo's existing shadcn/ui philosophy: open code, local ownership, composable primitives, and predictable shared APIs.
- Reuse or extend project-owned source components before introducing page-specific abstractions.
- Preferred building blocks for this feature:
  - standard form controls and tabs from the local shadcn/ui layer
  - token-driven `Button`, `Card`, `Badge`, and related shared components from `packages/ui`
  - shared patterns such as `SectionHeader`, `AlertBanner`, and `EmptyState`
  - existing local resizable split behavior (`ResizableSplit` or an equivalent local primitive), not a one-off bespoke splitter implementation

### Visual Rules

- Use semantic CSS variables and design tokens only. No raw hex colors, one-off radii, or arbitrary spacing values in implementation.
- Preserve the system's border-first surface treatment. Default content surfaces should stay at E0/E1; overlay elevations are reserved for overlays only.
- Buttons, inputs, and interactive cards must respect the design-system size contracts and touch-target minimums.
- Body text must remain at `base` (16px) or larger; caption-sized text is metadata-only.
- Template lifecycle states (`Draft`, `Live`, `Needs publish`) should map through a shared semantic status treatment rather than ad-hoc badge colors created only for this page.

### Required View States

- The gallery and editor are data-dependent views and must each implement loading, empty, error, and success states using the project patterns (`Skeleton`, `EmptyState`, `AlertBanner`) rather than ad-hoc placeholders.
- Success and failure feedback for save/publish actions should use the same shared status language and styling patterns as the rest of the admin app.

## Audit-Driven Architecture Decisions

### Canonical Source of Truth

- Global **public** templates move to a platform-level database library. The admin Templates page is not a thin wrapper over `packages/shared/src/demo-templates`.
- Create a new platform-level table for the library: `public_site_templates`.
- `public_site_templates` is a platform-level table, not tenant-scoped. It must be treated like other platform tables:
  - service-role access only
  - add to `RLS_GLOBAL_TABLE_EXCLUSIONS`
  - do **not** add it to `RLS_TENANT_TABLES`
  - use admin/service-role access patterns documented for `apps/admin`
- Existing `packages/shared/src/demo-templates` may be used only as a one-time bootstrap/import source for initial public templates if that reduces migration risk.
- After bootstrap/import, the database library is the runtime canonical source for public demo templates. The code registry is not part of steady-state runtime reads for this system.

### Library Record Requirements

- Each global public template needs:
  - immutable stable identifier/slug
  - `communityType`
  - mutable admin-facing metadata: name, best-for/summary, tags, and thumbnail descriptor
  - editable draft JSX source
  - last published compiled HTML snapshot
  - publication metadata: `version`, `sourceHash`, `publishedAt`, `publishedBy`
  - standard created/updated timestamps and soft-delete/archive support
- The row should represent one logical template item. Do not model the library itself as anonymous draft/published duplicate rows without a stable template identity.

### Lifecycle Semantics

- The library must distinguish three lifecycle states:
  - `draft_only` — never published
  - `published_current` — published and no saved unpublished draft changes
  - `published_with_unpublished_changes` — a live published version exists and a newer saved draft also exists
- Fixed user-facing lifecycle labels:
  - `draft_only` -> `Draft`
  - `published_current` -> `Live`
  - `published_with_unpublished_changes` -> `Needs publish`
- Fixed lifecycle helper copy:
  - `Draft`: `Not available for new demos yet.`
  - `Live`: `Available for new demos.`
  - `Needs publish`: `Saved changes are not live yet.`
- UI copy and filtering should reflect those states. A simple `Draft` / `Published` binary badge is insufficient once saved-but-unpublished changes exist.
- Preferred gallery filters:
  - `All`
  - `Live`
  - `Needs publish`
- `Needs publish` includes both never-published templates and templates with saved unpublished changes.
- Lifecycle treatment should use shared icon + text + color semantics, preferably by extending the existing shared status mapping rather than inventing page-local badge logic.

### Demo Integration Strategy

- Demo wizard public template selection reads only from `public_site_templates`.
- The tenant/mobile login experience is outside this templating system and is unaffected by this work.
- Demo creation must snapshot the selected public template into the seeded community's `site_blocks` row at creation time. Public anonymous/demo render paths continue to render from community `site_blocks`, not from the global library.
- Phase one does **not** auto-propagate later library edits into existing demos. Existing demos keep their snapshotted public template until explicitly regenerated.
- Preserve provenance when the snapshot is created. At minimum, the demo/public-site snapshot must carry the originating global template ID and published version. The demo record should also persist the selected global public template reference/version so downstream admin workflows do not need to reverse-infer it from `site_blocks`.

### Preview Execution Model

- Preview and publish must use the same server-side compile/sanitize service.
- The browser preview must not evaluate admin-authored JSX with browser-side Babel, `eval`, or `Function`.
- The editor sends the current draft to a preview compile endpoint that returns sanitized compiled HTML plus structured compile errors.
- The preview iframe renders compiled HTML only.
- If a script is still required inside the iframe for trusted styling/runtime assets (for example the existing Tailwind runtime path), the iframe sandbox must be `allow-scripts` only. Do **not** include `allow-same-origin`.
- Normalize preview, publish, and public/demo render paths around a shared compiled-template render helper so sanitization and theming behavior do not drift across surfaces.

### Concurrency And Draft Safety

- Save and publish must use optimistic concurrency (`updatedAt` or version precondition).
- If a stale editor tries to save or publish over a newer server version, the API should return a conflict response and the UI should show a reload/overwrite resolution flow.
- The editor should warn on browser/tab exit when dirty, matching the existing unsaved-progress pattern already used elsewhere in the admin app.

## UX Audit Decisions

- The editor is a page with three stacked regions:
  - page header
  - template details
  - template workspace
- The page header contains:
  - back navigation
  - page title
  - lifecycle indicator
  - actions
- Header action hierarchy is fixed:
  - primary: `Publish`
  - secondary: `Save Draft`
  - overflow: `Duplicate`
- The UI must explain publish semantics in all key moments:
  - persistent neutral info banner below the header
  - first-use empty state
  - publish success feedback
- Fixed publish helper copy:
  - `Publishing makes this template available for future demos. Existing demos keep their current version until regenerated.`
- Metadata is edited in a dedicated `Template details` section above the workspace, not packed into the page header.
- Preview viewport presets are authoring controls only. They never change stored template data.
- `Used by N demos` is aggregate read-only metadata in v1. Do not add a usage explorer UI in this pass.

## Information Architecture

### Navigation

- Add `Templates` item to admin navbar.
- Route opens a dedicated templates management screen.

### Screen Model

1. **Template Screen (Gallery/List)**
   - Search input using the shared input field pattern
   - Community-type filter (`All`, `Condo`, `HOA`, `Apartment`)
   - Lifecycle filters (`All`, `Live`, `Needs publish`) using an existing tabs/segmented-control pattern with keyboard support
   - Result count
   - `Clear filters` when any search or filter is active
   - `New Template` action
   - Template cards/list rows with name, community type, lifecycle label, version, summary, `Used by N demos`, and last updated date
2. **Template Editor**
   - `Page header`
     - Back-to-templates affordance
     - Page title
     - Lifecycle badge/indicator rendered with icon + text + color
     - Actions with fixed hierarchy: `Publish`, `Save Draft`, overflow `Duplicate`
   - Persistent info banner with the publish helper copy
   - `Template details` section
     - `Name`
     - `Summary`
     - `Tags`
     - `Community type`
     - `Thumbnail descriptor`
     - read-only `Used by N demos`
   - `Template workspace` section
     - left pane: code editor
     - right pane: live preview iframe
     - pane header controls for preview viewport presets
     - drag resize divider between panes

## UX Requirements

### Core Interaction Rules

- Code and preview remain visible simultaneously.
- Divider drag resizes pane widths with min-width constraints.
- Divider supports keyboard resizing (`ArrowLeft`/`ArrowRight`) and reset gesture.
- `Publish` remains visible at all breakpoints.
- `Save Draft` is the secondary action.
- `Duplicate` moves into an overflow menu.
- Template metadata is edited in the `Template details` section rather than inline inside the page header.
- After a successful `Save Draft`, publish becomes available without requiring another edit cycle.
- Publish is blocked while there are unsaved changes.
- Save clears dirty state; publish only available when clean/valid.
- On narrow widths:
  - search remains visible
  - gallery filters collapse behind a `Filters` disclosure/drawer
  - editor actions collapse with `Publish` still visible
- `Community type` is editable only while the template is `draft_only`.
- After a template has ever been published, `Community type` becomes read-only.
- `Duplicate` creates `Copy of {Template Name}` and focuses/selects the name field.
- Auto-preview refresh must never steal focus from the code editor.

### Validation + Feedback

- Template name required with minimum length (3 chars).
- Name field shows immediate validation state.
- Field label remains visible, with helper text and validation messaging rendered directly below the input.
- Character count may be shown as supporting metadata, but not as a replacement for the helper/error text.
- Unsaved-change banner appears when dirty.
- Preview refresh contract:
  - debounce by 500ms after typing stops
  - refresh immediately on `Save Draft`
  - refresh immediately on `Publish`
  - cancel stale in-flight preview requests
- If preview fails and a previous valid preview exists:
  - keep the last successful preview visible
  - show an inline alert above it
- If preview fails and no successful preview exists:
  - replace the preview pane with a full error state
- Error messages must always explain what happened and what the user can do next.
- Publish errors must move focus to the error summary.

### Loading / Empty / Error States

- Gallery loading: use skeleton rows/cards sized to the eventual layout.
- Editor loading: use skeleton treatment for header controls and editor/preview panes.
- Empty gallery: use the shared `EmptyState` pattern with:
  - title: `Create your first public template`
  - description: `Templates define the public demo website used for future demos. Publishing makes a template available for new demos only.`
  - action: `Create Template`
- Search no results: use a no-results empty state with:
  - title: `No templates match these filters`
  - description: `Try a different search or clear filters to see more templates.`
  - action: `Clear filters`
- Gallery count text:
  - default: `{total} templates`
  - filtered/searching: `{filtered} of {total} templates`
- Empty/no-results copy should stay constructive and align with the tone of `docs/design-system/constants/empty-states.ts`.
- Preview compile/runtime error: show a structured inline error surface inside the preview pane, distinguishing compile vs runtime failures when that data is available.
- API save/publish failures: use a persistent `AlertBanner`-style inline error with retry guidance.

### Responsive Behavior

- Desktop: side-by-side panes with draggable divider.
- Narrow widths: panes stack vertically; splitter hidden.
- Preview pane supports viewport presets:
  - `Desktop` = 1440px
  - `Tablet` = 768px
  - `Phone` = 390px
- Default preview preset is `Desktop`.
- Preview presets are session-local UI state only and are not stored in the template record.
- Preview uses fit-to-pane scaling.
- In stacked layout, viewport presets remain available.
- Gallery/mobile toolbar behavior:
  - non-search filters collapse behind `Filters`
  - `New Template` remains visible
  - result count remains visible
- Interactive controls and cards continue to meet the mobile/desktop touch-target minimums.
- Macro page/section spacing stays consistent across breakpoints; only component-internal density adapts.

## Functional Requirements

### Template Gallery

- List global public templates sorted by recent update.
- Search by name, slug, and tags.
- Filter by community type and lifecycle state.
- Show count text that reflects default vs filtered results.
- Show `Clear filters` whenever search or filters are active.
- Open template into editor.
- Create new template from default JSX scaffold.
- Show the lifecycle label using the fixed user-facing mapping:
  - `draft_only` -> `Draft`
  - `published_current` -> `Live`
  - `published_with_unpublished_changes` -> `Needs publish`
- Show lifecycle helper copy:
  - `Draft`: `Not available for new demos yet.`
  - `Live`: `Available for new demos.`
  - `Needs publish`: `Saved changes are not live yet.`
- Show the currently published version number, whether unpublished saved changes exist, `Used by N demos`, and last updated date.

### Template Editor

- Load selected template working draft plus published snapshot metadata.
- Edit JSX and template metadata in the `Template details` section (`name`, summary/best-for text, tags, thumbnail descriptor, community type where allowed by business rules).
- Save draft updates without publishing.
- Publish action persists compiled output as the new published version and increments the template version.
- Duplicate creates a new draft template prefilled from current template.
- Duplicate creates a new logical template item with a new stable identity; it does not fork into implicit version history.
- Show read-only `Used by N demos` metadata in the editor. This is aggregate metadata only in v1.

### Preview

- Uses a server-backed preview compile endpoint and an iframe sandboxed render surface.
- Preview pane header contains viewport preset controls.
- Refresh/update behavior should avoid laggy rerenders while typing and should debounce preview compilation.
- Preview clearly indicates when current code has compile/runtime errors.
- Last successful preview is preserved across preview compile failures.
- Preview iframe title format:
  - `Preview: {Template Name} ({Viewport Preset})`
- Preview response may include structured diagnostics:
  - `stage`
  - `message`
  - `line`
  - `column`
  - `excerpt`
- Preview output must match the publish pipeline's compile/sanitize behavior.
- Preview remains an authoring aid only; it does not mutate template data.

## Data Flow Design

### Read Flow

1. Templates page loads template list metadata.
2. User opens template.
3. Editor fetches the logical template item, including working draft fields, publication metadata, `usageCount`, and concurrency token.
4. Editor initializes code, metadata fields, and lifecycle state.

### Write Flow (Draft)

1. User edits metadata/code.
2. Dirty state flips true.
3. `Save Draft` persists editable fields plus the current concurrency token.
4. Dirty state clears on success.
5. If the server copy changed since load, the API returns a conflict instead of silently overwriting.

### Publish Flow

1. Publish requires clean + valid state.
2. Publish compiles the saved draft through the shared compile/sanitize service.
3. Publish persists the new compiled HTML, increments the template version, updates source hash/publication metadata, and clears the "needs publish" lifecycle state.
4. Editor and gallery refresh to the new published metadata/version.

### Preview Response Shape

- Preview endpoint response:
  - `html?: string`
  - `errors?: Array<{ stage: 'compile' | 'runtime'; message: string; line?: number; column?: number; excerpt?: string }>`
  - `compiledAt: string`

### Demo Consumption Flow

1. Demo wizard loads public template options from `public_site_templates`.
2. Demo preview compiles the selected public library template through the shared preview/publish service.
3. Demo creation snapshots the selected public template's published version into the seeded community's public `site_blocks` row, with provenance metadata attached.
4. Public/demo runtime rendering continues to read only from the community snapshot, not from the global library.

## Interface Requirements

- Template list/detail payloads should include:
  - `lifecycleState`
  - `version`
  - `hasUnpublishedChanges`
  - `usageCount`
  - `updatedAt`
- Preview compile payload should return structured diagnostics as defined above.
- Do not add a usage explorer, rollback API, or full version history API in this pass.

## State Model

Minimum explicit UI states:

- `loading` (list/editor fetch)
- `ready`
- `dirty`
- `valid` / `invalid`
- `savingDraft`
- `publishing`
- `conflict`
- `error`
- `activeViewportPreset`
- `lastSuccessfulPreviewHtml`
- `showFiltersDrawer` for narrow layouts if needed

Logical lifecycle state:

- `draft_only`
- `published_current`
- `published_with_unpublished_changes`

Derived controls:

- `canSave = dirty && valid && !savingDraft && !publishing`
- `canPublish = !dirty && valid && !savingDraft && !publishing && !conflict`
- `hasUsablePreview = Boolean(lastSuccessfulPreviewHtml)`

## Accessibility

- Divider is keyboard focusable and operable.
- Inputs, actions, and status messages have accessible labels.
- Validation and error feedback are visible and screen-reader friendly.
- Action buttons include disabled states with clear reason via nearby messaging.
- Add a polite live region that announces:
  - `Draft saved`
  - `Template published`
  - `Preview updated`
  - `Preview error`
- Workspace regions are explicitly labeled:
  - `Template details`
  - `Code editor`
  - `Preview`
- No interactive element suppresses the shared `:focus-visible` ring treatment.
- Lifecycle status indicators never rely on color alone; they must expose icon + text + color in both gallery and editor views.
- Any motion used for resize feedback, save states, or preview refresh must respect `prefers-reduced-motion`.
- Focus never jumps on auto-preview refresh.
- Error summary receives focus on save/publish failure.
- Pane/tab order remains stable across responsive layout changes.
- The splitter must follow the WAI-ARIA separator/window-splitter pattern closely enough to expose `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, an accessible name tied to the primary pane, and `aria-controls` for the controlled pane.

## Security + Safety

- Template content remains privileged super-admin-authored code, but preview still runs inside an isolated iframe and must not get same-origin iframe privileges.
- Preview and publish use the same server-side compile/sanitize pipeline. Do not maintain a separate browser-side preview compiler.
- Sanitization is mandatory on the compiled HTML output. CSP is defense-in-depth, not a replacement for sanitization.
- Compile/preview endpoints must validate input size and return structured compile errors without leaking stack traces or sensitive internals.
- Public/demo render paths must consume the stored compiled HTML snapshot, not raw JSX.
- Global library data is platform-level and must use platform-admin authorization and service-role DB access patterns only.

## Testing Strategy

### Unit/Component

- Gallery filtering/search state behavior
- Gallery/editor loading, empty, and error states
- Dirty/valid derived button-enable logic
- Name validation and helper messaging
- Splitter resize math and keyboard behavior
- Status badge semantics (icon + label present, not color-only)
- Lifecycle derivation (`draft_only`, `published_current`, `published_with_unpublished_changes`)
- Conflict-state UI and disabled-control logic
- Gallery count text for default and filtered states
- `Clear filters` visibility/behavior
- Header action hierarchy across breakpoints
- `Community type` becomes read-only after first publish
- Duplicate flow creates `Copy of {Template Name}` and focuses the name field
- Viewport preset state and rendered preview width behavior
- Last successful preview remains visible after compile failure
- Live-region announcements for save/publish/preview events

### Integration

- Create template -> edit -> save draft -> publish happy path
- Unsaved changes block publish
- Save/publish error handling UI
- No-results/empty states render correctly
- Save/publish conflict handling when another admin updates the same template
- Publish helper copy appears in:
  - editor info banner
  - first-use empty state
  - publish success feedback
- Demo wizard public-template selection reads from `public_site_templates`
- Demo creation snapshots the selected public template version/provenance into `site_blocks` and demo metadata
- Updating a global template does not silently mutate already-created demos
- Filters collapse correctly on narrow layouts
- Publish failure moves focus to the error summary
- Tenant login/mobile view remains unchanged because it is not template-driven by this system

### Security

- Compile/publish rejects or neutralizes malicious payloads including:
  - `<script>`
  - event handler attributes
  - `javascript:` URLs
  - `<form>` with external action
  - `<iframe>`, `<object>`, and `<embed>`
  - SVG/MathML or other non-allowlisted markup paths if they are not explicitly supported
- Preview iframe sandbox configuration regression test ensures `allow-same-origin` is not reintroduced.
- Preview and publish parity tests ensure the server-backed preview output matches published output for the same saved draft.
- Render-surface regression tests cover all public/demo entry points that consume compiled HTML.

### Regression

- Existing demo edit flow remains unchanged
- Existing tenant web app login/mobile experience remains unchanged because it is outside this system
- Existing community-scoped template compile/publish behavior remains intact until intentionally migrated to the shared pipeline

## Risks and Mitigations

- **Risk:** Duplicate logic between old and new editors
  - **Mitigation:** Extract shared editor behaviors into reusable units.
- **Risk:** Publish inconsistencies between dirty and saved code
  - **Mitigation:** enforce clean-state publish gate.
- **Risk:** Preview performance degradation on large templates
  - **Mitigation:** controlled refresh strategy (not full rebuild each keystroke).
- **Risk:** Bootstrap/import logic lingers and becomes a shadow source of truth beside the database library
  - **Mitigation:** treat `packages/shared/src/demo-templates` as one-time import input only, then remove ongoing runtime reads for admin/demo template selection.
- **Risk:** Silent drift between preview and publish behavior
  - **Mitigation:** one shared server-side compile/sanitize service for preview and publish.
- **Risk:** Global library changes unexpectedly altering existing demos
  - **Mitigation:** snapshot template output into demo/community `site_blocks` with explicit provenance and no automatic propagation.

## Resolved Decisions

- Backend shape: new platform-level `public_site_templates` table with service-role access and explicit publication metadata.
- Public-template runtime source of truth: database library.
- Tenant "mobile view": not a template surface; it remains the existing tenant web app login.
- Preview model: server-backed compile preview, debounced auto-refresh, shared compile/publish pipeline.
- Preview presets: `Desktop` 1440px, `Tablet` 768px, `Phone` 390px, stored as session-local UI state only.
- Existing demos: snapshot-based, no automatic propagation from later library edits.
- Concurrency model: optimistic concurrency with conflict handling.
- Slug editing in v1: no user-facing slug editing. Slugs are created once and treated as stable identifiers.

## Approved Visual Direction

Reference mockups:

- `docs/superpowers/specs/2026-03-27-templates-page-mockup-v2.html`
- `docs/superpowers/specs/2026-03-27-templates-page-mockup.html` (earlier iteration)

The v2 mockup is the primary **layout and information-architecture** reference. For production implementation, the authoritative source for visual styling, component behavior, accessibility, and state treatment is the project's design system (`DESIGN.md`, `.claude/rules/design.md`, and `docs/design-system/`).
