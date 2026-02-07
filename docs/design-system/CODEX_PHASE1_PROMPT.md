# Codex Prompt — Phase 1 Integration into PropertyProRedesign.jsx

## Context

You previously completed Phase 1 of the PropertyPro design system implementation plan (`docs/design-system/IMPLEMENTATION_PLAN.md`). You created the correct design system reference files under `docs/design-system/` (CSS tokens, hooks, extracted components). However, **none of those changes were integrated into the canonical mockup file.**

The canonical mockup is **`PropertyProRedesign.jsx`** in the project root. This is a single self-contained React component with all tokens, components, and styles defined inline. There is no build system, no bundler, no CSS imports — everything must live inside this one JSX file.

Your design system reference files are correct. Now you need to **port those patterns into `PropertyProRedesign.jsx`** so they actually take effect at render time.

## What Must Change in PropertyProRedesign.jsx

Apply all 7 Phase 1 requirements directly within the file. Do NOT create new external files. Do NOT modify files under `docs/design-system/`. Only modify `PropertyProRedesign.jsx`.

---

### 1.1 — Focus Indicators

Your `docs/design-system/tokens/focus.css` is correct. Now apply it:

- **Remove** every instance of `outline: "none"` from inline styles (ButtonRoot, CardRoot, DataRow — there are 3 occurrences).
- **Add** a `<style>` block (or inject via a style constant at the top of the file) containing the focus CSS rules from `focus.css`:
  - `:focus` reset for `button`, `a`, `[tabindex]`
  - `:focus-visible` with `outline: 2px solid #3B82F6` and `outline-offset: 2px`
  - `@media (forced-colors: active)` fallback
  - `.dark-surface` variant with `#93C5FD`
- **Verify** that no interactive element suppresses the browser's default focus ring without providing a replacement.

### 1.2 — Keyboard Navigation

Your `docs/design-system/hooks/useKeyboardClick.ts` is correct. Now apply it:

- **Add** the `useKeyboardClick` function directly inside `PropertyProRedesign.jsx` (since there's no import system).
- **Apply** it to every element that has `role="button"` and/or `tabIndex={0}` but no `onKeyDown`:
  - `CardRoot` when `interactive={true}`
  - `DataRow` when `onClick` is provided
  - Any other clickable non-button elements
- **Test pattern**: Every element with `tabIndex={0}` must respond to Enter and Space keys.

### 1.3 — Semantic HTML

- **DataRow**: When `onClick` is provided, render as `<button>` instead of `<div role="button">`. When static, use `<div role="row">`. Follow the pattern from your `docs/design-system/patterns/DataRow.tsx`.
- **CardRoot**: When `interactive={true}` and `onClick` is provided, render as `<button>` instead of `<div role="button">`.
- **StatusBadge**: **Remove** `role="status"` from the Badge element. It's static content, not a live region.
- **ColumnHeader**: Change from `<span>` to `<th scope="col">` when used within a table context.
- **Add** `type="button"` to all `<button>` elements that are not form submit buttons.

### 1.4 — Color Contrast

- **Change** the tertiary text color from `primitiveColors.gray[500]` (which is `#6B7280`) to `primitiveColors.gray[600]` (which is `#4B5563`).
- This is in the `semanticColors` object, `text.tertiary` property.
- One-line fix. Verify all downstream usages inherit the change automatically through the token reference.

### 1.5 — Responsive Breakpoints

- **Add** the `useBreakpoint` hook function directly inside `PropertyProRedesign.jsx` (copy the logic from your `docs/design-system/hooks/useBreakpoint.ts`).
- **Use it** in the main dashboard layout to control:
  - **Grid columns**: 1 column on mobile, 2 on tablet, 4 on desktop (replace every hardcoded `gridTemplateColumns: "repeat(4, 1fr)"`)
  - **Sidebar visibility**: Hidden on mobile (show hamburger), collapsed icons on tablet, expanded on desktop
  - **Data tables**: Switch to card-based layout on mobile (below 640px)
- **Add** a `<style>` block with the CSS media queries from `breakpoints.css` if needed for any CSS-level responsive behavior.

### 1.6 — Touch Targets

- **Add** `@media (pointer: coarse)` rules to your injected `<style>` block:
  - All small buttons (`size="sm"`) get `min-height: 44px; min-width: 44px`
  - DataRow gets increased padding on touch devices
- **Increase** padding on mobile for DataRow tap targets.

### 1.7 — Fluid Typography

- **Convert** the `primitiveFonts.size` object from pixel numbers to rem strings:
  ```javascript
  // BEFORE (current — broken for accessibility):
  size: { xs: 11, sm: 13, base: 15, lg: 18, xl: 22, "2xl": 28, "3xl": 36 }

  // AFTER (correct — scales with user preferences):
  size: { xs: "0.694rem", sm: "0.833rem", base: "1rem", lg: "1.2rem", xl: "1.44rem", "2xl": "1.728rem", "3xl": "2.074rem" }
  ```
- **Set** the root font-size to `93.75%` (15px base) in your injected `<style>` block: `html { font-size: 93.75%; }`
- **Update** any place where font sizes are used as numbers in calculations (e.g., `fontSize: primitiveFonts.size.sm`) — they are now strings, so arithmetic won't work. Fix any such usages.

---

## Rules

1. **Only modify `PropertyProRedesign.jsx`.** Do not create new files.
2. **Preserve all existing visual design and functionality.** The dashboard should look and behave identically on desktop after these changes, except for the addition of focus rings during keyboard navigation.
3. **Inject CSS via a `<style>` JSX element** at the top of the component's render output for rules that cannot be expressed as inline styles (`:focus-visible`, `@media` queries, etc.).
4. **Keep the file self-contained.** All hooks, utilities, and styles must be defined within the file.
5. **Do not break the existing token reference chain.** Components that reference `semanticColors.text.tertiary` should continue to work — just with the updated value.
6. **Test mentally**: After your changes, a user should be able to:
   - Tab through every interactive element and see a blue focus ring
   - Press Enter or Space on any card/row to activate it
   - Resize to 375px wide and see a usable single-column layout
   - Set their browser font size to "Very Large" and see all text scale proportionally
