# Design System Conflict Analysis

> **Generated:** February 5, 2026
> **Purpose:** Identify conflicts between the existing design system and the proposed implementation plan

---

## Executive Summary

After reviewing the existing design system structure, I've identified **12 conflicts** across 5 severity levels. The most critical issue is that **two parallel token systems exist** (JS tokens in `/tokens/index.ts` and CSS custom properties in `/mockup/styles.css`), which will cause inconsistencies if both are used.

| Severity | Count | Resolution Effort |
|----------|-------|-------------------|
| Critical | 2 | High |
| High | 4 | Medium-High |
| Medium | 4 | Medium |
| Low | 2 | Low |

---

## Critical Conflicts

### 1. Dual Token Systems (Critical)

**Existing State:**
- `/tokens/index.ts` — JavaScript object tokens with 3-tier architecture
- `/mockup/styles.css` — CSS custom properties with shadcn-like HSL naming

**The Problem:**
These two systems define the SAME concepts with DIFFERENT values:

| Concept | JS Tokens | CSS Variables |
|---------|-----------|---------------|
| Primary color | `#2563EB` (blue-600) | `hsl(240 5.9% 10%)` (dark slate) |
| Border color | `#E5E7EB` (gray-200) | `hsl(240 5.9% 90%)` (lighter) |
| Base font size | `15px` | `14px` (0.875rem) |
| Border radius | `8px` | `0.5rem` (8px) ✓ Match |

**Conflict with Plan:**
The implementation plan proposes moving to CSS custom properties (matching Geist's approach), but the existing JS tokens are deeply integrated into all components.

**Resolution Options:**

| Option | Effort | Recommendation |
|--------|--------|----------------|
| A) Delete CSS file, keep JS tokens | Low | Not recommended — loses CSS benefits |
| B) Migrate JS tokens to CSS, update components | High | **Recommended for long-term** |
| C) Generate CSS from JS tokens at build time | Medium | Good compromise |
| D) Keep both, document which to use where | Low | Not recommended — causes confusion |

**Recommended Resolution:** Option C — Create a build step that exports JS tokens to CSS custom properties, giving you the best of both worlds.

```js
// scripts/export-tokens-to-css.js
const { semanticColors } = require('./tokens');

const css = `
:root {
  --color-text-primary: ${semanticColors.text.primary};
  --color-text-secondary: ${semanticColors.text.secondary};
  /* ... */
}
`;
```

---

### 2. Focus State Implementation (Critical — Accessibility)

**Existing State:**
`/components/Button/Button.tsx` lines 333, 354-356:

```tsx
// Line 333 - focus outline removed
outline: "none",

// Lines 354-356 - Attempted focus ring (BROKEN)
boxShadow: props["aria-pressed"] || document.activeElement === ref
  ? `0 0 0 2px ${semanticColors.surface.default}, 0 0 0 4px ${semanticColors.border.focus}`
  : undefined,
```

**The Problem:**
1. `outline: "none"` removes native focus indicator
2. The replacement logic is **broken**: `document.activeElement === ref` compares a DOM element to a React ref object — they will NEVER match
3. This means **buttons have NO focus indicator** currently

**Conflict with Plan:**
Plan Section 1.1 proposes CSS-based `:focus-visible` styles. This conflicts with the current inline style approach.

**Recommended Resolution:**
1. Remove `outline: "none"` from all components
2. Add global CSS for `:focus-visible` as specified in plan
3. Delete the broken boxShadow focus logic

**Files to Update:**
- `/components/Button/Button.tsx`
- `/components/Card/Card.tsx`
- `/patterns/DataRow.tsx`
- Add new `/tokens/focus.css`

---

## High Priority Conflicts

### 3. Typography Scale Mismatch (High)

**Existing State:**
`/tokens/index.ts` and `/README.md` state: "Modular scale (base 15px, ratio ~1.2)"

```ts
size: {
  xs: 11,    // 15 / 1.36
  sm: 13,    // 15 / 1.15
  base: 15,  // base
  lg: 18,    // 15 * 1.2
  xl: 22,    // 15 * 1.47 ← breaks scale
  "2xl": 28, // 15 * 1.87 ← breaks scale
  "3xl": 36, // 15 * 2.4  ← breaks scale
}
```

**The Problem:**
The scale is NOT a true 1.2 modular scale. The ratios vary from 1.15 to 1.47. This was identified in the design review.

**Conflict with Plan:**
Plan Section 3.3 proposes Major Third (1.25) scale with `rem` units:

```css
--font-size-xs: 0.64rem;   /* 10.24px */
--font-size-sm: 0.8rem;    /* 12.8px */
--font-size-base: 1rem;    /* 16px - different base! */
```

**Key Difference:** Plan uses 16px base (browser default), existing uses 15px base.

**Recommended Resolution:**
1. Decide on base size: 15px (existing) or 16px (standard)
2. If keeping 15px, adjust the plan's scale values
3. Convert to `rem` units regardless

**Suggested 1.25 scale with 15px base:**
```css
:root {
  font-size: 93.75%; /* 15px base */
}
--font-size-xs: 0.64rem;   /* 9.6px */
--font-size-sm: 0.8rem;    /* 12px */
--font-size-base: 1rem;    /* 15px */
--font-size-lg: 1.25rem;   /* 18.75px */
--font-size-xl: 1.563rem;  /* 23.4px */
--font-size-2xl: 1.953rem; /* 29.3px */
```

---

### 4. Typography Variants Explosion (High)

**Existing State:**
`/tokens/index.ts` defines **12 typography variants**:

```
display, heading1, heading2, heading3, body, bodyMedium,
bodySm, bodySmMedium, caption, captionBold, mono, monoMedium
```

**Conflict with Plan:**
Plan Section 3.2 proposes reducing to **6 variants**:

```
display, heading (with size prop), body, bodySmall, caption, mono
```

**The Problem:**
Reducing variants requires updating every usage in existing components. Components currently import specific variants:

```tsx
// Current pattern
<Text variant="bodySmMedium">...</Text>

// Proposed pattern
<Text variant="body" size="sm" weight="medium">...</Text>
```

**Recommended Resolution:**
1. Keep existing variants as deprecated aliases
2. Add new simplified API alongside
3. Migrate incrementally with console warnings

```tsx
// tokens/typography.ts
export const semanticTypography = {
  // New API
  body: { /* ... */ },

  // Deprecated aliases (console.warn in dev)
  /** @deprecated Use <Text variant="body" weight="medium"> instead */
  bodyMedium: { /* ... */ },
};
```

---

### 5. Hover/Press State Re-renders (High)

**Existing State:**
`/components/Button/Button.tsx` lines 299-300:

```tsx
const [isHovered, setIsHovered] = useState(false);
const [isPressed, setIsPressed] = useState(false);
```

With event handlers on lines 360-376 that update these states.

**Conflict with Plan:**
Plan Section 3.5 proposes removing these useState calls and using CSS:

```css
.button:hover { background: var(--button-bg-hover); }
.button:active { background: var(--button-bg-active); }
```

**The Problem:**
The current approach causes re-renders on every mouse enter/leave. With lists of buttons, this creates performance issues.

**Recommended Resolution:**
This is a significant refactor. Options:

| Option | Effort | Breaking Change |
|--------|--------|-----------------|
| A) Refactor to CSS (as plan suggests) | High | Yes — style prop consumers affected |
| B) Add CSS module alongside, deprecate inline | Medium | No — gradual migration |
| C) Keep current, optimize with useMemo | Low | No |

**Recommendation:** Option B — Add a `Button.module.css` file and new `className` approach. Keep inline styles working for backward compatibility.

---

### 6. Component CSS Files Missing (High)

**Existing State:**
```
components/
├── Button/
│   └── Button.tsx      ← Only JS, no CSS
├── Card/
│   └── Card.tsx
└── Badge/
    └── Badge.tsx
```

**Conflict with Plan:**
Plan proposes CSS files alongside each component:

```
components/
├── Button/
│   ├── Button.tsx
│   ├── Button.css      ← New
│   └── index.ts
```

**The Problem:**
Currently, all styles are inline in JS. Adding CSS files requires:
1. Deciding on CSS approach (CSS Modules, plain CSS, Tailwind)
2. Updating build configuration
3. Migrating styles incrementally

**Recommended Resolution:**
1. Use CSS Modules (`.module.css`) for component-scoped styles
2. Keep inline styles working during migration
3. Add CSS files as "progressive enhancement"

---

## Medium Priority Conflicts

### 7. Responsive Breakpoints Defined But Unused (Medium)

**Existing State:**
`/tokens/index.ts` line 173-179:

```ts
export const primitiveBreakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;
```

**The Problem:**
These are defined but no components use them. The mockup has zero responsive behavior.

**Conflict with Plan:**
Plan Section 1.5 proposes the same breakpoints but with actual implementation via `useBreakpoint` hook and CSS media queries.

**Recommended Resolution:**
No conflict in values — just need to implement. Add:
1. `hooks/useBreakpoint.ts` as specified in plan
2. CSS media queries in new component CSS files
3. Responsive grid in layout components

---

### 8. Card Component Missing Footer (Medium)

**Existing State:**
`/README.md` shows Card.Footer in examples:

```tsx
<Card>
  <Card.Header>...</Card.Header>
  <Card.Body>...</Card.Body>
  <Card.Footer>       ← Documented
    <Button>Save</Button>
  </Card.Footer>
</Card>
```

But `/components/Card/Card.tsx` likely doesn't export `Card.Footer`.

**Conflict with Plan:**
Plan doesn't mention Card.Footer — it's missing from specifications.

**Recommended Resolution:**
1. Verify if Card.Footer exists in Card.tsx
2. If not, add it to match documentation
3. Add to plan's Component Specifications section

---

### 9. Box Primitive Not Used in Mockup (Medium)

**Existing State:**
`/primitives/Box.tsx` exists and is exported, but the mockup (`PropertyProRedesign.jsx`) doesn't use it — only uses `Stack`, `VStack`, `HStack`, and `Text`.

**The Problem:**
Maintaining an unused primitive adds cognitive overhead.

**Conflict with Plan:**
Plan doesn't mention Box primitive — proposes keeping only Stack and Text.

**Recommended Resolution:**
Review if Box provides value beyond Stack. If not, consider deprecating.

**Box vs Stack comparison:**
```tsx
// Box usage
<Box padding="md" background="surface">

// Stack can do the same
<Stack padding="md" style={{ background: semanticColors.surface.default }}>
```

If Box is just Stack without flex, it might be redundant.

---

### 10. EmptyState Variants Inconsistent (Medium)

**Existing State:**
`/patterns/index.ts` exports:

```ts
export {
  EmptyState,
  NoResults,  // ← Variant
  NoData,     // ← Variant
} from "./EmptyState";
```

**Conflict with Plan:**
Plan Section 4.2 defines specific empty states by scenario (new association, no owners, API error, etc.) but doesn't mention `NoResults` or `NoData` as separate exports.

**Recommended Resolution:**
Align the exports with the plan's scenario-based approach:

```ts
// Option A: Keep variants as pre-configured EmptyStates
export const NoResults = (props) => (
  <EmptyState
    icon={SearchIcon}
    title="No results found"
    description="Try adjusting your search or filters."
    {...props}
  />
);

// Option B: Remove variants, use EmptyState directly with props
<EmptyState variant="noResults" />
```

---

## Low Priority Conflicts

### 11. Motion Token Naming (Low)

**Existing State:**
```ts
duration: {
  instant: 0,
  micro: 100,
  quick: 150,
  standard: 250,
  slow: 350,
  expressive: 500,  // ← exists
}
```

**Conflict with Plan:**
Plan Section 4.1 lists:
```css
--duration-instant: 0ms;
--duration-fast: 100ms;     // ← different name
--duration-normal: 200ms;   // ← different name & value
--duration-slow: 300ms;     // ← different value
```

**Recommended Resolution:**
Keep existing naming (micro, quick, standard) — it's more descriptive than generic (fast, normal). Update plan to match.

---

### 12. Index Export Organization (Low)

**Existing State:**
`/index.ts` exports everything from one file, mixing primitives, components, tokens.

**Conflict with Plan:**
Plan suggests separate entry points:

```ts
import { Button } from '@propertypro/design-system/components';
import { Stack } from '@propertypro/design-system/primitives';
import { semanticColors } from '@propertypro/design-system/tokens';
```

**Recommended Resolution:**
Support both patterns:
1. Keep main `index.ts` for convenience
2. Add sub-path exports in `package.json`:

```json
{
  "exports": {
    ".": "./index.ts",
    "./tokens": "./tokens/index.ts",
    "./primitives": "./primitives/index.ts",
    "./components": "./components/index.ts"
  }
}
```

---

## Conflict Resolution Priority Matrix

| # | Conflict | Severity | Blocks Plan Phase | Resolution Effort |
|---|----------|----------|-------------------|-------------------|
| 2 | Focus State Broken | Critical | Phase 1 | Low |
| 1 | Dual Token Systems | Critical | Phase 3 | High |
| 5 | Hover State Re-renders | High | Phase 3 | Medium |
| 6 | Missing CSS Files | High | Phase 1-4 | High |
| 3 | Typography Scale | High | Phase 3 | Medium |
| 4 | Typography Variants | High | Phase 3 | Medium |
| 7 | Breakpoints Unused | Medium | Phase 1 | Low |
| 8 | Card.Footer Missing | Medium | — | Low |
| 9 | Box Unused | Medium | — | Low |
| 10 | EmptyState Variants | Medium | Phase 4 | Low |
| 11 | Motion Naming | Low | Phase 4 | Trivial |
| 12 | Export Organization | Low | — | Low |

---

## Recommended Implementation Order

Based on conflicts and dependencies:

### Week 1: Foundation (Phase 1 + Conflict Resolution)

1. **Fix Critical Accessibility (Conflict #2)**
   - Add `/tokens/focus.css`
   - Remove `outline: "none"` from all components
   - Test keyboard navigation

2. **Add CSS Infrastructure (Conflict #6)**
   - Decide on CSS approach (recommend CSS Modules)
   - Create first CSS file: `Button.module.css`
   - Update build config if needed

3. **Implement Responsive (Conflicts #6, #7)**
   - Add `useBreakpoint` hook
   - Add responsive grid to metric cards

### Week 2: Information Architecture (Phase 2)

No major conflicts — proceed as planned.

### Week 3: Token Consolidation (Phase 3 + Conflicts #1, #3, #4, #5)

1. **Resolve Dual Token Systems (Conflict #1)**
   - Create token export script
   - Generate CSS custom properties from JS tokens
   - Update `/mockup/styles.css` to use generated tokens

2. **Fix Typography Scale (Conflict #3)**
   - Decide on base size
   - Update token values
   - Verify visual consistency

3. **Deprecate Verbose Typography (Conflict #4)**
   - Add deprecation warnings
   - Create migration guide

4. **Refactor Hover States (Conflict #5)**
   - Add CSS for hover/active states
   - Keep JS approach for backward compat (Phase 2)
   - Remove in future version

### Week 4: Polish (Phase 4)

No major conflicts — proceed as planned.

---

## Files Requiring Updates

| File | Conflicts Addressed | Changes |
|------|---------------------|---------|
| `/tokens/index.ts` | #3, #4, #11 | Typography scale, deprecation notices |
| `/tokens/focus.css` | #2 | **New file** |
| `/components/Button/Button.tsx` | #2, #5 | Remove outline:none, add focus styles |
| `/components/Button/Button.module.css` | #5, #6 | **New file** — CSS hover states |
| `/components/Card/Card.tsx` | #2, #8 | Focus styles, add Footer |
| `/patterns/DataRow.tsx` | #2 | Focus styles |
| `/patterns/EmptyState.tsx` | #10 | Align variants with plan |
| `/hooks/useBreakpoint.ts` | #7 | **New file** |
| `/mockup/styles.css` | #1 | Migrate to use JS token exports |
| `package.json` | #12 | Add subpath exports |

---

## Decision Points Requiring Your Input

Before proceeding, please clarify:

1. **Base font size:** Keep 15px (existing) or adopt 16px (browser default)?

2. **CSS approach:** CSS Modules, plain CSS with BEM, or Tailwind?

3. **Backward compatibility:**
   - Strict (no breaking changes, long deprecation)
   - Moderate (deprecation warnings, remove in v2)
   - Aggressive (breaking changes allowed)

4. **Token export:**
   - Build-time generation (requires build step)
   - Runtime CSS injection (simpler but less performant)
   - Manual sync (error-prone)

5. **Box primitive:** Keep or deprecate?

---

*This analysis should be reviewed alongside `IMPLEMENTATION_PLAN.md` before beginning work.*
