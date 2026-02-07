# Phase 1 Final Fixes — ColumnHeader Semantics + Grid Consistency

## Context

A re-audit of Phase 1 found two remaining issues. Everything else is confirmed working. These are the last items before Phase 1 can be closed.

**Files to modify:**
1. `PropertyProRedesign.jsx` (project root) — the canonical mockup
2. `docs/design-system/patterns/DataRow.tsx` — the design system reference

**Files to read first:**
- `docs/design-system/IMPLEMENTATION_PLAN.md` — Section 1.3 (Semantic HTML)
- `docs/design-system/ANTI_GRAVITY_PROMPT.md` — Non-negotiable constraints

---

## Fix 1: ColumnHeader Must Render as `<th scope="col">`

### Problem

The `ColumnHeader` component accepts an `as` prop and conditionally adds `scope="col"` when `as="th"` — but **none of the 22 usage sites pass `as="th"`**, so every column header renders as a `<span>`. This is a WCAG semantic HTML violation: screen readers cannot identify table column headers.

### Changes Required

#### A. Update `PropertyProRedesign.jsx`

**Step 1 — Change the default `as` prop in the ColumnHeader component definition (line 1049):**

Before:
```jsx
const ColumnHeader = forwardRef(({ as: Component = "span", ...
```

After:
```jsx
const ColumnHeader = forwardRef(({ as: Component = "th", ...
```

**Step 2 — Ensure `scope="col"` is applied by default when rendering as `<th>` (line 1052):**

The existing conditional already handles this:
```jsx
{...(Component === "th" ? { scope: "col" } : {})}
```
No change needed here — it will now fire by default.

**Step 3 — Update `DataHeaderRow` to use `role="row"` (already present at line 1075). No change needed.**

**Step 4 — Verify all 4 usage sites.** No changes needed at usage sites since the default now handles it:
- Lines 2093-2099: Compliance "Action Required" table
- Lines 2161-2167: Compliance "All Items" table
- Lines 2304-2310: Compliance "By Category" table
- Lines 2442-2449: Maintenance table

#### B. Update `docs/design-system/patterns/DataRow.tsx`

**Step 1 — Change the ColumnHeader interface type (line 183):**

Before:
```typescript
interface ColumnHeaderProps extends HTMLAttributes<HTMLSpanElement> {
```

After:
```typescript
interface ColumnHeaderProps extends HTMLAttributes<HTMLTableCellElement> {
```

**Step 2 — Change the forwardRef type (line 205):**

Before:
```typescript
export const ColumnHeader = forwardRef<HTMLSpanElement, ColumnHeaderProps>(
```

After:
```typescript
export const ColumnHeader = forwardRef<HTMLTableCellElement, ColumnHeaderProps>(
```

**Step 3 — Change the rendered element from `<span>` to `<th>` with `scope="col"` (lines 207-223):**

Before:
```tsx
<span
  ref={ref}
  style={{
    width,
    flex,
    textAlign: align,
    fontSize: primitiveFonts.size.xs,
    fontWeight: primitiveFonts.weight.semibold,
    color: semanticColors.text.tertiary,
    textTransform: "uppercase",
    letterSpacing: primitiveFonts.letterSpacing.wider,
    ...style,
  }}
  {...props}
>
  {children}
</span>
```

After:
```tsx
<th
  ref={ref}
  scope="col"
  style={{
    width,
    flex,
    textAlign: align,
    fontSize: primitiveFonts.size.xs,
    fontWeight: primitiveFonts.weight.semibold,
    color: semanticColors.text.tertiary,
    textTransform: "uppercase",
    letterSpacing: primitiveFonts.letterSpacing.wider,
    fontVariantNumeric: "tabular-nums",
    ...style,
  }}
  {...props}
>
  {children}
</th>
```

**Step 4 — Add a note to `DataHeaderRow` docs (around line 240):**

Add to the JSDoc comment:
```typescript
/**
 * DataHeaderRow - Header row for data tables
 *
 * Children should be ColumnHeader components which render as <th scope="col">.
 * When used with DataRow, creates an accessible table structure.
 */
```

---

## Fix 2: Compliance Dashboard Grid — Confirm 3 Columns Is Intentional

### Analysis

Line 1943 in `PropertyProRedesign.jsx`:
```jsx
const metricColumns = bp?.isMobile ? "1fr" : "repeat(3, 1fr)";
```

The compliance hero section (lines 1963-2003) renders exactly **3 items** in this grid:
1. `HeroMetric` (overall compliance percentage)
2. `DeadlineAlert` (most urgent deadline)
3. A card with status pills + additional context

The maintenance view (line 2365) uses `repeat(4, 1fr)` because it has **4 metric cards**.

### Decision

**If there are exactly 3 items in the compliance grid, `repeat(3, 1fr)` is correct — do not change it.** A 4-column grid with 3 items would leave an awkward empty column.

**However**, add a tablet breakpoint for consistency with the maintenance view:

Before:
```jsx
const metricColumns = bp?.isMobile ? "1fr" : "repeat(3, 1fr)";
```

After:
```jsx
const metricColumns = bp?.isMobile ? "1fr" : bp?.isTablet ? "1fr" : "repeat(3, 1fr)";
```

This stacks all 3 items vertically on tablet (where 3 columns would be cramped) and only fans out to 3 columns on desktop.

**Update the same pattern in `docs/design-system/patterns/ComplianceHero.tsx`** if it contains a grid layout — ensure the tablet breakpoint is documented there too.

---

## Testing Checklist

After making changes, verify every item below. Do NOT mark Phase 1 complete until all pass.

### ColumnHeader Semantics

- [ ] **Inspect the DOM** (or mentally trace the render): Every `<ColumnHeader>` in the compliance tables renders as `<th scope="col">`, NOT `<span>`.
- [ ] **Inspect the DOM**: Every `<ColumnHeader>` in the maintenance table renders as `<th scope="col">`.
- [ ] **Check for regressions**: Column headers still display correctly (uppercase, tertiary color, xs font size, wider letter-spacing). The `<th>` element should inherit the same visual styling as the old `<span>`.
- [ ] **Check for browser default `<th>` styles bleeding through**: Browsers apply `font-weight: bold` and `text-align: center` to `<th>` by default. Verify the inline styles override these (they should — `fontWeight: semibold` and `textAlign: align` are explicitly set).
- [ ] **Design system file matches mockup**: `docs/design-system/patterns/DataRow.tsx` ColumnHeader renders as `<th scope="col">` with the same props and styles as `PropertyProRedesign.jsx`.

### Grid Consistency

- [ ] **Desktop (≥1024px)**: Compliance hero section shows 3 columns side by side.
- [ ] **Tablet (640–1023px)**: Compliance hero section stacks items in a single column.
- [ ] **Mobile (<640px)**: Compliance hero section stacks items in a single column.
- [ ] **Maintenance view unchanged**: Still uses 1→2→4 column progression across breakpoints.

### Regression Checks (Nothing Else Broke)

- [ ] **Focus rings**: Tab through the dashboard — blue focus ring visible on every interactive element.
- [ ] **Keyboard activation**: Press Enter/Space on any card or data row — it activates correctly.
- [ ] **Typography**: All text uses rem units (check a few elements in the DOM or trace through the token chain).
- [ ] **Color contrast**: Tertiary text is `#4B5563` (gray-600), not `#6B7280` (gray-500).
- [ ] **Touch targets**: On touch devices (or `@media (pointer: coarse)` simulation), small buttons are at least 44px tall.
- [ ] **Sidebar**: Collapses/expands, persists to localStorage, hidden on mobile.
- [ ] **URL sync**: Switching tabs updates the URL hash. Pasting a URL with `#view=compliance&tab=by_category&expanded=financial` restores the correct state.
- [ ] **Status pills**: Visible between hero metric and tab bar, showing correct counts.
- [ ] **Progress bar**: At 92% compliance, the hero metric progress bar is blue (brand), not amber.

### File Consistency

- [ ] `PropertyProRedesign.jsx` ColumnHeader default is `"th"`.
- [ ] `docs/design-system/patterns/DataRow.tsx` ColumnHeader renders as `<th scope="col">`.
- [ ] Both files produce identical visual output for column headers.
- [ ] `docs/design-system/patterns/DataRow.tsx` TypeScript types reference `HTMLTableCellElement`, not `HTMLSpanElement`.

---

## Rules

1. Only modify `PropertyProRedesign.jsx` and `docs/design-system/patterns/DataRow.tsx`. No other files.
2. Do not change any Phase 2 or Phase 3 code.
3. Preserve all existing visual appearance — the only visible change should be the tablet stacking behavior for the compliance grid.
4. Run through the full testing checklist above before declaring done. If any item fails, fix it before moving on.
