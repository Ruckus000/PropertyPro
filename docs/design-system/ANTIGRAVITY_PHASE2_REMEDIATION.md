# Anti-Gravity Prompt — Phase 2 Remediation + Design System Sync

## Authoritative References

Read these files **before making any changes:**
- `/docs/design-system/IMPLEMENTATION_PLAN.md` — The spec. Sections 2.1–2.6 define Phase 2.
- `/docs/design-system/ANTI_GRAVITY_PROMPT.md` — Non-negotiable constraints.
- `/docs/design-system/CONFLICT_ANALYSIS.md` — Known conflicts to avoid.

## Context

An audit of Phase 2 found three issues in the mockup (`PropertyProRedesign.jsx`) and a broader gap: none of the Phase 2 components were extracted into the design system docs (`docs/design-system/`). The design system docs are the reference architecture for when we build the real application — if a pattern isn't documented there, it will drift or get reimplemented incorrectly later.

This prompt has three jobs:
1. Fix three specific issues in the mockup
2. Extract all Phase 2 patterns into the design system docs
3. Verify the design system docs are complete and consistent with the mockup

---

## Job 1: Fix Three Issues in PropertyProRedesign.jsx

### Fix A — Progress Bar Coloring Thresholds (Section 2.6)

**Problem:** The HeroMetric status logic uses three thresholds instead of the four specified in the plan.

**Current (wrong):**
```jsx
status={compliancePct >= 100 ? "success" : compliancePct >= 80 ? "warning" : "danger"}
```

**Required (per IMPLEMENTATION_PLAN.md § 2.6):**

| Percentage | Color | Status Token |
|---|---|---|
| 100% | Green | `success` |
| 80–99% | Blue (brand) | `brand` or use `interactive.primary` |
| 50–79% | Amber | `warning` |
| < 50% | Red | `danger` |

**Steps:**
1. Update the status logic where HeroMetric is used (compliance dashboard section) to use four bands:
   ```jsx
   status={
     compliancePct >= 100 ? "success" :
     compliancePct >= 80 ? "brand" :
     compliancePct >= 50 ? "warning" :
     "danger"
   }
   ```
2. Make sure the HeroMetric component handles a `"brand"` status. If `semanticColors.status` doesn't have a `brand` entry, add one:
   ```javascript
   brand: {
     foreground: semanticColors.interactive.primary,   // blue-600
     background: semanticColors.interactive.subtle,    // blue-50
   }
   ```
3. Verify the progress bar inside HeroMetric renders with the correct color for each band. At 92% compliance (the demo data), it should be **blue**, not amber.

---

### Fix B — Status Pills Aggregation (Section 2.1)

**Problem:** The plan's wireframe shows aggregated status pill badges between the hero metric and the tab bar: `[1 Overdue] [1 Due Soon] [11 Complete]`. These are missing from the mockup.

**Required layout order (per IMPLEMENTATION_PLAN.md § 2.1 wireframe):**
```
Alert Banner (if overdue)
Hero Metric (92%, progress bar, trend)
Status Pills Row  ← MISSING
Tab Bar (Action Required | All Items | By Category)
Tab Content
```

**Steps:**
1. After the hero metric section and before the tab bar, add a horizontal row of status summary pills.
2. Calculate counts from the compliance data:
   - Overdue count (status === "overdue")
   - Due Soon / Pending count (status === "pending")
   - Complete / Compliant count (status === "compliant" or "completed")
3. Render as inline pill badges using the existing `StatusBadge` or `Badge` component. Each pill shows the count and label, colored by its status variant:
   ```jsx
   <HStack gap={semanticSpacing.inline.sm} style={{ justifyContent: "center" }}>
     {overdueCount > 0 && (
       <StatusBadge status="overdue">{overdueCount} Overdue</StatusBadge>
     )}
     {pendingCount > 0 && (
       <StatusBadge status="pending">{pendingCount} Due Soon</StatusBadge>
     )}
     <StatusBadge status="compliant">{compliantCount} Complete</StatusBadge>
   </HStack>
   ```
4. These pills should be clickable — clicking one should switch to the "Action Required" or "All Items" tab filtered by that status (if filtering is supported), or at minimum switch to the relevant tab.

---

### Fix C — Category Expansion State in URL (Section 2.3)

**Problem:** The `expandedCategories` state on the "By Category" tab is stored in `useState` only. The plan requires it to persist in the URL hash so that deep links and browser back/forward preserve which categories are expanded.

**Current (wrong):**
```jsx
const [expandedCategories, setExpandedCategories] = useState(
  Object.fromEntries(complianceData.categories.map(c => [c.id, true]))
);
```

**Required (per IMPLEMENTATION_PLAN.md § 2.3):**
URL parameter like `#view=compliance&tab=by_category&expanded=financial,meetings`

**Steps:**
1. Read expanded state from URL hash params via `useHashParams`:
   ```jsx
   const expandedParam = params.expanded;
   const expandedFromUrl = expandedParam
     ? expandedParam.split(",")
     : complianceData.categories.map(c => c.id); // default: all expanded
   ```
2. Convert to the object format the component expects:
   ```jsx
   const expandedCategories = Object.fromEntries(
     complianceData.categories.map(c => [c.id, expandedFromUrl.includes(c.id)])
   );
   ```
3. Update `toggleCategory` to write back to the URL:
   ```jsx
   const toggleCategory = (id) => {
     const current = expandedFromUrl.includes(id)
       ? expandedFromUrl.filter(x => x !== id)
       : [...expandedFromUrl, id];
     setParam("expanded", current.length > 0 ? current.join(",") : null);
   };
   ```
4. Remove the `useState` for `expandedCategories` — it's now derived from URL state.
5. Verify: expanding/collapsing a category updates the URL hash. Pasting a URL with `&expanded=financial` only expands that one category.

---

## Job 2: Extract Phase 2 Components into Design System Docs

The mockup has working Phase 2 code that is NOT documented in `docs/design-system/`. Extract each pattern into its proper location so the design system docs serve as the complete reference for the real build.

**Follow the file structure defined in IMPLEMENTATION_PLAN.md § "Design System File Structure."**

### Components to Create

#### `docs/design-system/components/Metrics/HeroMetric.tsx`
Extract from PropertyProRedesign.jsx. Must include:
- All props: `value`, `format`, `label`, `context`, `status`, `trend`, `trendValue`
- The four-band status coloring logic (from Fix A above)
- Built-in progress bar with semantic coloring
- TypeScript types for all props
- Export from a new `index.ts`

#### `docs/design-system/components/Metrics/MetricCard.tsx`
If a simpler metric card pattern exists in the mockup (non-hero), extract it here.

#### `docs/design-system/components/Navigation/Tabs.tsx`
Extract the tab component pattern. Must include:
- Props: `tabs` (array of `{ id, label, count? }`), `activeTab`, `onTabChange`
- Active tab indicator styling
- Badge count display on tabs
- Keyboard navigation between tabs (arrow keys)

#### `docs/design-system/components/Progress/ProgressBar.tsx`
Extract the progress bar. Must include:
- Props: `value`, `max`, `size`, `color`, `label`, `showLabel`
- Semantic coloring based on percentage thresholds
- Accessible `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`

#### `docs/design-system/components/Alert/DeadlineAlert.tsx`
Extract the deadline alert component. Must include:
- Props: `title`, `days` (negative = overdue), `date`, `action`
- Status-aware styling (overdue = red, urgent = amber, upcoming = neutral)
- Icon (Clock)
- Optional action button slot

#### `docs/design-system/components/Navigation/NavRail.tsx`
Extract the sidebar navigation component. Must include:
- Props: `items`, `activeView`, `onViewChange`, `expanded`, `onToggle`
- Badge counts on nav items with variant coloring
- Collapse/expand toggle with ChevronLeft rotation
- Collapsed state shows icon-only with dot badge indicator
- Expanded state shows label + full badge count

### Patterns to Create

#### `docs/design-system/patterns/ComplianceHero.tsx`
The composed hero section showing:
- Alert banner (if overdue items)
- HeroMetric
- Status pills row
- Documentation/comments explaining the layout composition

#### `docs/design-system/patterns/StatusPills.tsx`
The aggregated status count display. Document the pattern of counting items by status and rendering as a horizontal pill row.

### Hooks to Create

#### `docs/design-system/hooks/useHashParams.ts`
Extract from PropertyProRedesign.jsx (lines ~300-336). Must include:
- `params` object (current hash parameters)
- `setParam(key, value)` — set single param
- `setParamsMultiple(obj)` — set multiple params at once
- Listens to `hashchange` event for browser back/forward
- SSR-safe (checks `typeof window`)
- TypeScript types

#### `docs/design-system/hooks/useLocalStorage.ts`
Create a reusable localStorage hook. Pattern:
```typescript
export function useLocalStorage<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  // Read from localStorage on mount (SSR-safe)
  // Write to localStorage on update
  // Return [value, setValue]
}
```
This replaces the manual localStorage logic currently in PropertyProRedesign.jsx for sidebar persistence.

### Constants to Create

#### `docs/design-system/constants/status.ts`
Extract the `statusConfig` object. Must include:
- All status keys: `compliant`, `completed`, `pending`, `overdue`, `neutral`, `brand`
- Each with: `variant`, `label`, `icon`, `priority` (for sorting)
- TypeScript `StatusKey` type export
- `getStatusConfig(status)` helper function

### Index Files to Update

After creating all the above, update these barrel exports:

- `docs/design-system/components/index.ts` — Add HeroMetric, Tabs, ProgressBar, DeadlineAlert, NavRail
- `docs/design-system/patterns/index.ts` — Add ComplianceHero, StatusPills
- `docs/design-system/hooks/index.ts` — Add useHashParams, useLocalStorage
- `docs/design-system/index.ts` — Add new exports from all of the above

---

## Job 3: Verify Design System Docs Are Complete

After completing Jobs 1 and 2, do a final pass. For every component, pattern, hook, and constant that exists in `PropertyProRedesign.jsx`, confirm a corresponding file exists in `docs/design-system/` with matching behavior.

### Checklist

**Components (docs/design-system/components/):**
- [ ] Button — exists ✓ (verify still matches mockup)
- [ ] Card — exists ✓ (verify still matches mockup)
- [ ] Badge/StatusBadge — exists ✓ (verify still matches mockup)
- [ ] HeroMetric — created in Job 2
- [ ] Tabs — created in Job 2
- [ ] ProgressBar — created in Job 2
- [ ] DeadlineAlert — created in Job 2
- [ ] NavRail — created in Job 2

**Patterns (docs/design-system/patterns/):**
- [ ] DataRow — exists ✓
- [ ] SectionHeader — exists ✓
- [ ] AlertBanner — exists ✓
- [ ] EmptyState — exists ✓
- [ ] ComplianceHero — created in Job 2
- [ ] StatusPills — created in Job 2

**Hooks (docs/design-system/hooks/):**
- [ ] useKeyboardClick — exists ✓
- [ ] useBreakpoint — exists ✓
- [ ] useHashParams — created in Job 2
- [ ] useLocalStorage — created in Job 2

**Constants (docs/design-system/constants/):**
- [ ] status.ts — created in Job 2

**Primitives (docs/design-system/primitives/):**
- [ ] Box — exists ✓
- [ ] Stack — exists ✓
- [ ] Text — exists ✓

**Tokens (docs/design-system/tokens/):**
- [ ] index.css — exists ✓
- [ ] breakpoints.css — exists ✓
- [ ] focus.css — exists ✓
- [ ] sizing.css — exists ✓
- [ ] typography.css — exists ✓
- [ ] index.ts — exists ✓ (verify "brand" status color added)

### Cross-Check Rules
- Every component in the design system docs must use CSS custom properties (not hardcoded hex values) where tokens exist
- Every interactive component must include `useKeyboardClick` integration
- Every component must have TypeScript prop types
- Every component file must have a corresponding export in its parent `index.ts`
- The `docs/design-system/index.ts` master export must include all sub-exports

---

## Rules

1. **Read IMPLEMENTATION_PLAN.md and CONFLICT_ANALYSIS.md before starting.**
2. **Fix the mockup first (Job 1), then extract to docs (Job 2), then verify (Job 3).**
3. **Do not skip Job 1.** The mockup must be correct before extracting patterns from it.
4. **Design system component files should be self-contained TypeScript/React modules** that could be imported into a real Next.js project. Use proper `import`/`export` syntax, TypeScript types, and CSS module or CSS-in-JS patterns consistent with the existing design system files.
5. **Match existing file conventions.** Look at how `Button.tsx`, `Card.tsx`, and `DataRow.tsx` are structured in the docs. Follow the same patterns for new files.
6. **Do not modify Phase 1 files** (focus.css, useKeyboardClick.ts, useBreakpoint.ts, breakpoints.css, typography.css, sizing.css) unless fixing a bug discovered during this work.
7. **The statusConfig "brand" status entry is new.** Add it to both the mockup's inline token objects AND to `docs/design-system/constants/status.ts` AND to `docs/design-system/tokens/index.ts` semantic colors.
