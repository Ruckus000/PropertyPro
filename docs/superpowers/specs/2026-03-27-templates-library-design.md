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
- Public site templates only (no mobile templates in this phase)
- Gallery flow: browse/search/filter/create/open template
- Editor flow: edit template name + JSX, save draft, publish
- Side-by-side code/preview editor with resizable splitter
- UX hardening for edge cases called out during review

### Out of Scope

- Mobile template variants
- Full template version-history UI
- Advanced branching/compare/merge template tooling
- Right-side metadata/config sidebar in editor (deferred)
- Schema redesign beyond what is needed for global templates

## Existing Context

Current relevant behavior in admin app:

- `JsxTemplateEditor` already supports JSX editing, draft save, publish, and preview iframe.
- Existing editor currently uses a tab toggle (`Code`/`Preview`) instead of side-by-side panes.
- Existing API patterns exist for site templates (`GET/PUT/publish`) in community-scoped routes.

The design reuses those interaction patterns while changing information architecture to a dedicated templates management page.

## Information Architecture

### Navigation

- Add `Templates` item to admin navbar.
- Route opens a dedicated templates management screen.

### Screen Model

1. **Template Screen (Gallery/List)**
   - Search input
   - Status filters (`All`, `Published`, `Drafts`)
   - `New Template` action
   - Template cards/list rows with status and summary
2. **Template Editor**
   - Back-to-templates affordance
   - Editable template name
   - Status badge (`Draft` / `Published`)
   - Actions: `Duplicate`, `Save Draft`, `Publish`
   - Side-by-side panes:
     - left: code editor
     - right: live preview iframe
   - Drag resize divider between panes

## UX Requirements

### Core Interaction Rules

- Code and preview remain visible simultaneously.
- Divider drag resizes pane widths with min-width constraints.
- Divider supports keyboard resizing (`ArrowLeft`/`ArrowRight`) and reset gesture.
- Template name is editable inline in the editor top bar.
- Publish is blocked while there are unsaved changes.
- Save clears dirty state; publish only available when clean/valid.

### Validation + Feedback

- Template name required with minimum length (3 chars).
- Name field shows immediate validation state.
- Character count/validation helper shown near the field.
- Unsaved-change banner appears when dirty.

### Empty/Error/No-Result States

- Empty gallery: show call-to-action (`Create your first template`).
- Search no results: show `No templates found` and clear-filters action.
- Preview compile/runtime error: inline error surface in preview pane.
- API save/publish failures: persistent inline error alert with retry path.

### Responsive Behavior

- Desktop: side-by-side panes with draggable divider.
- Narrow widths: panes stack vertically; splitter hidden.
- Toolbar actions wrap gracefully without clipping.

## Functional Requirements

### Template Gallery

- List global public templates sorted by recent update.
- Search by name (and optionally slug/tags if available).
- Filter by draft/published.
- Open template into editor.
- Create new template from default JSX scaffold.

### Template Editor

- Load selected template draft source (fallback to published/default).
- Edit JSX and template name.
- Save draft updates without publishing.
- Publish action persists compiled output as published version.
- Duplicate creates a new draft template prefilled from current template.

### Preview

- Uses existing safe preview rendering pattern (iframe + sandbox).
- Refresh/update behavior should avoid laggy rerenders while typing.
- Preview clearly indicates when current code has compile/runtime errors.

## Data Flow Design

### Read Flow

1. Templates page loads template list metadata.
2. User opens template.
3. Editor fetches template content (draft first, published fallback).
4. Editor initializes code and name fields.

### Write Flow (Draft)

1. User edits name/code.
2. Dirty state flips true.
3. `Save Draft` persists name + source.
4. Dirty state clears on success.

### Publish Flow

1. Publish requires clean + valid state.
2. Publish persists currently saved draft as published.
3. Editor and gallery status update to published metadata.

## State Model

Minimum explicit UI states:

- `loading` (list/editor fetch)
- `ready`
- `dirty`
- `valid` / `invalid`
- `savingDraft`
- `publishing`
- `error`

Derived controls:

- `canSave = dirty && valid && !savingDraft && !publishing`
- `canPublish = !dirty && valid && !savingDraft && !publishing`

## Accessibility

- Divider is keyboard focusable and operable.
- Inputs, actions, and status messages have accessible labels.
- Validation and error feedback are visible and screen-reader friendly.
- Action buttons include disabled states with clear reason via nearby messaging.

## Security + Safety

- Preserve sandbox behavior for preview iframe.
- Treat template content as privileged admin-authored code but still isolate preview execution.
- Keep server-side compile/sanitize pipeline consistent with existing publish path.

## Testing Strategy

### Unit/Component

- Gallery filtering/search state behavior
- Dirty/valid derived button-enable logic
- Name validation and helper messaging
- Splitter resize math and keyboard behavior

### Integration

- Create template -> edit -> save draft -> publish happy path
- Unsaved changes block publish
- Save/publish error handling UI
- No-results/empty states render correctly

### Regression

- Existing demo edit flow remains unchanged
- Existing template compile/publish behavior remains intact

## Risks and Mitigations

- **Risk:** Duplicate logic between old and new editors
  - **Mitigation:** Extract shared editor behaviors into reusable units.
- **Risk:** Publish inconsistencies between dirty and saved code
  - **Mitigation:** enforce clean-state publish gate.
- **Risk:** Preview performance degradation on large templates
  - **Mitigation:** controlled refresh strategy (not full rebuild each keystroke).

## Open Decisions (For Planning Phase)

- Exact backend shape for global templates (new table vs extension of existing model)
- Whether to include slug editing in v1 UI
- Default preview refresh mode (manual refresh only vs debounced auto-refresh)

These are implementation decisions to lock in the plan, not blockers for the approved UX direction.

## Approved Visual Direction

Reference mockups:

- `docs/superpowers/specs/2026-03-27-templates-page-mockup-v2.html`
- `docs/superpowers/specs/2026-03-27-templates-page-mockup.html` (earlier iteration)

The v2 mockup is the primary design source for implementation.
