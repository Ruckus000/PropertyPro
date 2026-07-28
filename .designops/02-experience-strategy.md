# Experience strategy — draft

Status: draft; not approved for implementation.

## Problem framing

The Website item is reachable from the community sidebar, but the target route begins with `/pm/`. The app shell uses that prefix to replace the community navigation with a PM-only navigation. For an operator who clicked “Website” as a task inside the current community, this feels like the app changed modes unexpectedly. The editor itself then presents a long single-column stack of forms, while the public-site preview lives on a separate route.

## Strategy hypothesis

Keep Website editing inside a stable community workspace. Make the selected community, Website state, editor sections, live preview, and publish status visible in one coherent frame. If portfolio-level tools are needed, expose them as an explicit secondary escape hatch rather than letting a route prefix silently replace the global nav.

## Primary jobs to support

1. Edit one community's welcome content, sections, styling, and domain while staying oriented.
2. See the public-site result alongside or immediately adjacent to the editor.
3. Distinguish saved draft changes from what is live and publish intentionally.
4. Move back to the portfolio or community workspace without a surprise navigation replacement.

These are repository- and stakeholder-derived tasks, not validated research findings.

## Proposed information architecture for the demo

- Stable community sidebar with Website selected.
- Page header: community name, Website title, Live / Draft status, Preview link, and one primary Publish action.
- Compact editor index: Welcome, Content, Appearance, Domain.
- Main editor surface: one focused section at a time with progressive disclosure for advanced controls.
- Persistent preview surface: representative public-site render with a clear “Preview draft” label.
- Bottom/side draft state: pending count, discard, and publish affordances grouped together.

## Design principles

- Preserve the documented PropertyPro Florida Modern system: warm page surface, semantic borders, coral primary action, teal informational state, Inter body text, Fraunces display where appropriate.
- Make the navigation behavior explicit and stable; never make a URL prefix silently feel like a new product.
- Use one primary publish action for the page; local Save buttons remain contextual and secondary.
- Pair state with icon + text + color; “Live,” “Draft,” and “Not published” are not color-only signals.
- Keep the preview legible but subordinate to the editing task; it should prove the relationship between content and outcome, not compete with the form.
- Preserve the existing domain/content/plan-gate states as content-state requirements rather than flattening them into a happy-path mockup.

## Success criteria for human review

- A reviewer can explain why the Website tab is active and still find the community's normal navigation.
- A reviewer can find the active editor section, see a representative public result, and identify Publish Website without scrolling through the entire settings page.
- Draft, live, gated, error, and preview concepts are distinguishable at a glance.
- The draft looks like PropertyPro's existing system, not a new unrelated admin product.

## Evidence boundary

No screenshot, analytics, operator research, or explicit preference for split preview versus collapsible preview is available. This strategy produces a reversible hypothesis and a separate HTML demo, not a final production specification.
