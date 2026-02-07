# Phase 3: Medium Priority Refinements

## References

- **Spec:** `docs/design-system/IMPLEMENTATION_PLAN.md` — Sections 3.1 through 3.6
- **Constraints:** `docs/design-system/ANTI_GRAVITY_PROMPT.md`
- **Canonical mockup:** `PropertyProRedesign.jsx` (project root)
- **Design system docs:** `docs/design-system/`

Read all four before starting.

## What's Already Done

These Phase 3 items were completed during earlier phases — **do not redo them:**

- **3.3 (Modular Scale):** Font sizes already use 1.2 Minor Third scale in rem. `primitiveFonts.size` is `{ xs: "0.694rem", sm: "0.833rem", ... }`. Root is `html { font-size: 93.75% }`. Done.
- **3.6 (Status Mapping):** `statusConfig` object exists in the mockup (line ~751). `docs/design-system/constants/status.ts` exists with typed `STATUS_CONFIG` and `getStatusConfig()`. Done.

## What Needs To Be Done

Four items remain. Apply each to **both** `PropertyProRedesign.jsx` and the corresponding design system doc file.

---

### 3.1 — Token Architecture: Migrate Colors to CSS Custom Properties

**Goal:** Colors currently flow as JS hex strings through `semanticColors.text.primary` → inline `style={{ color: ... }}`. Migrate to CSS custom properties so colors can be inspected in DevTools and swapped via a class change for theming.

**In PropertyProRedesign.jsx:**

1. Expand the existing `<style>` block (the `injectedGlobalStyles` constant) to include all primitive and semantic color tokens as `:root` CSS custom properties. Follow the exact variable names from IMPLEMENTATION_PLAN.md § 3.1:

   ```css
   :root {
     /* Primitives */
     --blue-50: #EFF6FF;
     --blue-600: #2563EB;
     --blue-700: #1D4ED8;
     --gray-0: #FFFFFF;
     --gray-50: #F9FAFB;
     --gray-600: #4B5563;
     --gray-900: #111827;
     /* ... all colors from primitiveColors object */

     /* Semantic */
     --text-primary: var(--gray-900);
     --text-secondary: var(--gray-600);
     --text-tertiary: var(--gray-600);
     --surface-page: var(--gray-50);
     --surface-card: var(--gray-0);
     --interactive-primary: var(--blue-600);
     --interactive-primary-hover: var(--blue-700);
     --status-success: var(--green-700);
     --status-warning: var(--amber-700);
     --status-danger: var(--red-700);
     --status-brand: var(--blue-600);
     /* ... all semantic mappings */

     /* Spacing */
     --space-1: 4px;
     --space-2: 8px;
     --space-3: 12px;
     --space-4: 16px;
     --space-6: 24px;
     --space-8: 32px;

     /* Radius */
     --radius-sm: 4px;
     --radius-md: 8px;
     --radius-lg: 12px;
     --radius-full: 9999px;
   }
   ```

2. Update the JS `semanticColors` object so its values reference CSS variables instead of hex strings:
   ```javascript
   text: {
     primary: "var(--text-primary)",
     secondary: "var(--text-secondary)",
     tertiary: "var(--text-tertiary)",
     // ...
   }
   ```
   This way, components that already use `style={{ color: semanticColors.text.primary }}` will now emit `color: var(--text-primary)` instead of `color: #111827`. No component changes needed.

3. Do the same for `semanticColors.surface`, `semanticColors.interactive`, `semanticColors.status`, and `semanticColors.border`.

4. Keep the `primitiveColors` object as-is (raw hex values) for any place that needs literal values (like calculations).

**In design system docs:**

5. Create `docs/design-system/tokens/primitives.css` with all primitive color, spacing, and radius custom properties.
6. Create `docs/design-system/tokens/semantic.css` with all semantic alias custom properties.
7. Update `docs/design-system/tokens/index.css` to import the two new files.
8. Update `docs/design-system/tokens/index.ts` so `semanticColors` values reference `var(--token-name)` strings instead of hex literals (same pattern as step 2).

---

### 3.2 — Typography: Reduce Variants

**Goal:** Collapse 10+ typography variants into 6 by using `size` and `weight` props instead of separate variant names.

**In PropertyProRedesign.jsx:**

1. Update the `Text` component to accept a simplified variant set: `display`, `heading`, `body`, `bodySmall`, `caption`, `mono`.

2. Add `size` prop to `heading` variant: `"sm" | "md" | "lg"` mapping to the old heading3/heading2/heading1 styles.

3. Add `weight` prop to `body` variant: `"normal" | "medium"` replacing the old `bodyMedium`.

4. Merge `bodySm` and `bodySmMedium` into `bodySmall` with a `weight` prop.

5. Keep backward compatibility: old variant names (`heading1`, `heading2`, `heading3`, `bodySm`, `bodySmMedium`, `bodyMedium`) should still work but resolve to the new variants internally. This avoids breaking all ~56 existing usages at once.

6. Migrate usages where practical — at minimum update the design-system-internal components (SectionHeader, AlertBanner, etc.) to use the new API. Existing dashboard content can keep old names via the compatibility layer.

**In design system docs:**

7. Update `docs/design-system/primitives/Text.tsx` to match the new variant API.
8. Update `docs/design-system/tokens/index.ts` `semanticTypography` to reflect the reduced set.

---

### 3.4 — Button API: Add Simple Shorthand

**Goal:** Support `leftIcon` and `rightIcon` props for the common case, while keeping the compound `Button.Icon` / `Button.Label` pattern for complex layouts.

**In PropertyProRedesign.jsx:**

1. Add `leftIcon` and `rightIcon` props to the Button component.

2. Detection logic: if `children` contains `Button.Icon` or `Button.Label` sub-components, render in compound mode (current behavior). Otherwise, if `leftIcon` or `rightIcon` is provided, render in simple mode.

3. Simple mode rendering:
   ```jsx
   <button ...>
     {leftIcon && <span aria-hidden="true" style={iconStyles}>{leftIcon}</span>}
     <span>{children}</span>
     {rightIcon && <span aria-hidden="true" style={iconStyles}>{rightIcon}</span>}
   </button>
   ```

4. Do NOT migrate existing `Button.Icon`/`Button.Label` usages. Both APIs should work side by side.

**In design system docs:**

5. Update `docs/design-system/components/Button/Button.tsx` to support `leftIcon`/`rightIcon` props alongside the compound pattern.

---

### 3.5 — State Management: Remove useState for Hover/Active

**Goal:** Button, Card, and DataRow currently use `useState` for `isHovered`/`isPressed`, causing re-renders on every mouse movement. Replace with pure CSS.

**In PropertyProRedesign.jsx:**

1. **Button (around line 561):** Delete `isHovered` and `isPressed` useState. Delete the `onMouseEnter`, `onMouseLeave`, `onMouseDown`, `onMouseUp` handlers. Move the hover/active color logic into CSS rules in the injected `<style>` block using the existing `--button-bg-hover` / `--button-bg-active` custom property pattern. The Button already sets these as inline CSS vars — just make sure the CSS `:hover` and `:active` selectors reference them.

2. **Card (around line 865):** Delete `isHovered` useState. Delete `onMouseEnter`/`onMouseLeave`. Move the hover shadow to CSS:
   ```css
   [data-pp-card][data-interactive="true"]:hover {
     box-shadow: var(--shadow-lg);
   }
   ```
   Add `data-pp-card` and `data-interactive` data attributes to the Card element if not already present.

3. **DataRow (around line 985):** Delete `isHovered` useState. Delete `onMouseEnter`/`onMouseLeave`. Move hover background to CSS:
   ```css
   [data-pp-datarow]:hover {
     background: var(--surface-subtle);
   }
   ```

4. **Keep useState** for `loading`, `disabled`, `expanded`, and any state that changes the component's children or structure.

**In design system docs:**

5. Verify `docs/design-system/components/Button/Button.css` already handles `:hover`/`:active` via CSS (it does). Confirm `Button.tsx` does not use useState for hover.
6. Update `docs/design-system/components/Card/Card.css` and `Card.tsx` to match the same pattern.
7. Update `docs/design-system/patterns/DataRow.css` and `DataRow.tsx` to match.

---

## Testing Checklist

Run through every item after all changes are complete.

### 3.1 — Token Architecture
- [ ] The injected `<style>` block in PropertyProRedesign.jsx contains `:root` with all primitive color custom properties (--blue-50 through --blue-950, --gray-0 through --gray-950, --green-*, --amber-*, --red-*).
- [ ] The `<style>` block contains semantic aliases (--text-primary, --surface-card, --interactive-primary, --status-success, etc.).
- [ ] `semanticColors.text.primary` resolves to the string `"var(--text-primary)"`, NOT a hex like `"#111827"`.
- [ ] Components still render with correct colors — no visual change from before.
- [ ] `docs/design-system/tokens/primitives.css` exists and contains all primitive custom properties.
- [ ] `docs/design-system/tokens/semantic.css` exists and contains all semantic aliases.
- [ ] `docs/design-system/tokens/index.css` imports primitives.css and semantic.css.
- [ ] `docs/design-system/tokens/index.ts` semanticColors values are `var(--*)` strings.

### 3.2 — Typography Variants
- [ ] `Text` component accepts `variant="heading"` with `size="sm" | "md" | "lg"`.
- [ ] `Text` component accepts `variant="body"` with `weight="normal" | "medium"`.
- [ ] `Text` component accepts `variant="bodySmall"` with `weight="normal" | "medium"`.
- [ ] Old variant names (`heading1`, `heading2`, `heading3`, `bodySm`, `bodySmMedium`, `bodyMedium`) still work without errors.
- [ ] No visual regressions — all text in the dashboard renders identically to before.
- [ ] `docs/design-system/primitives/Text.tsx` matches the new API.

### 3.4 — Button Shorthand
- [ ] `<Button leftIcon={<Upload />}>Upload</Button>` renders correctly with icon before text.
- [ ] `<Button rightIcon={<ArrowRight />}>Next</Button>` renders correctly with icon after text.
- [ ] Existing compound `<Button><Button.Icon>...</Button.Icon><Button.Label>...</Button.Label></Button>` still works.
- [ ] `docs/design-system/components/Button/Button.tsx` supports both APIs.

### 3.5 — No useState for Hover
- [ ] Search `PropertyProRedesign.jsx` for `isHovered` — **zero matches**.
- [ ] Search `PropertyProRedesign.jsx` for `isPressed` — **zero matches**.
- [ ] Search `PropertyProRedesign.jsx` for `onMouseEnter` — **zero matches** (except in components that legitimately need it like tooltips or dropdowns, if any exist).
- [ ] Button hover changes background color on mouse hover (verify visually or trace CSS).
- [ ] Card hover adds shadow on mouse hover.
- [ ] DataRow hover changes background on mouse hover.
- [ ] All three work via CSS only — no React re-renders on hover.
- [ ] `docs/design-system/components/Button/Button.tsx` has no isHovered/isPressed useState.
- [ ] `docs/design-system/components/Card/Card.tsx` has no isHovered useState.
- [ ] `docs/design-system/patterns/DataRow.tsx` has no isHovered useState.

### Regression Checks
- [ ] Focus rings still visible on all interactive elements via keyboard.
- [ ] Responsive layout still works (mobile stacks, tablet adapts, desktop shows full layout).
- [ ] Sidebar toggle, localStorage persistence, and nav badges still work.
- [ ] URL hash sync still works for views, tabs, and category expansion.
- [ ] Hero metric, status pills, and deadline progressive disclosure still work.
- [ ] Touch targets still enforced on coarse pointer devices.

---

## Rules

1. Apply changes to **both** `PropertyProRedesign.jsx` and the corresponding design system doc files.
2. **Do not break existing visuals.** Every change should be invisible to the user — same colors, same sizes, same hover effects. The difference is in how they're implemented.
3. **Backward compatibility for typography variants.** Old names must still resolve. Migration can happen gradually.
4. **Keep the file self-contained.** PropertyProRedesign.jsx has no build system. Everything must work inline.
5. **Run the full testing checklist** before declaring Phase 3 complete.
