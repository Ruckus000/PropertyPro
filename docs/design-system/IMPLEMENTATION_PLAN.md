# PropertyPro Design System — Implementation Plan

> **Version:** 1.1.0
> **Last Updated:** February 5, 2026
> **Author:** Design Review Team
> **Status:** Revised — Source-Verified
>
> **Revision Notes (v1.1.0):**
> - Corrected typography scale from 1.25 to 1.2 (Minor Third better for dashboards)
> - Updated focus state CSS pattern per WCAG 2.4.7 guidance
> - Clarified token architecture as hybrid CSS+JS approach (per shadcn/ui theming)
> - Retained existing motion token naming (micro/quick/standard)
> - Added source verification citations throughout
>
> **Revision Notes (v1.2.0) — February 6, 2026:**
> - Added Project Architecture section clarifying canonical mockup file
> - Added Phase 1 Audit Results documenting integration gap
> - Phase 1 design system files (tokens, hooks) are complete but NOT yet integrated into the mockup
> - Phase 1 status changed from "Complete" to "Partially Complete — Integration Required"

---

## Project Architecture

> **IMPORTANT — Read before implementing any phase.**

**Canonical Mockup:** `PropertyProRedesign.jsx` (project root)
This is the single-file React component that renders the full PropertyPro dashboard. It is self-contained — all tokens, components, and styles are defined inline within this one file. This is the file that must be modified for every phase.

**Design System Reference:** `docs/design-system/`
This directory contains extracted design system files (CSS tokens, TypeScript hooks, component modules). These serve as the **target architecture** — the patterns and values that should be ported INTO `PropertyProRedesign.jsx`. They are NOT automatically imported by the mockup. There is no build system, bundler, or package.json.

**Deprecated:** `PropertyProElevated.jsx` (project root)
This is the previous version of the mockup. It is superseded by `PropertyProRedesign.jsx` and should not be modified.

**Integration Rule:** When a phase says "create `focus.css`" or "create `useKeyboardClick` hook," the implementation is only complete when those patterns are **working inside `PropertyProRedesign.jsx`**. Creating the reference file alone is insufficient.

---

## Phase 1 Audit Results (February 6, 2026)

An audit of the Phase 1 implementation found that the design system reference files (`docs/design-system/`) were correctly created but **not integrated** into the canonical mockup (`PropertyProRedesign.jsx`). Specific findings:

| Requirement | Design System Files | Mockup (PropertyProRedesign.jsx) | Status |
|---|---|---|---|
| 1.1 Focus Indicators | focus.css ✅ correct | ❌ 3x `outline: "none"` remain, no focus rings | **Not Integrated** |
| 1.2 Keyboard Navigation | useKeyboardClick.ts ✅ correct | ❌ Hook not used; no onKeyDown on interactive elements | **Not Integrated** |
| 1.3 Semantic HTML | DataRow.tsx ✅ uses `<button>` | ❌ Still uses `<div role="button">`; Badge adds role="status" | **Not Integrated** |
| 1.4 Color Contrast | tokens/index.ts ✅ gray-600 | ❌ Still references gray-500 (#6B7280) | **Not Integrated** |
| 1.5 Responsive Breakpoints | breakpoints.css + useBreakpoint.ts ✅ | ❌ No media queries; hardcoded 4-column grids | **Not Integrated** |
| 1.6 Touch Targets | sizing.css ✅ correct | ❌ CSS class not applied to any elements | **Not Integrated** |
| 1.7 Fluid Typography | typography.css ✅ rem values | ❌ All font sizes still in raw pixel numbers | **Not Integrated** |

**Action Required:** All Phase 1 patterns must be applied directly within `PropertyProRedesign.jsx` before Phase 1 can be considered complete.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Design Principles](#design-principles)
3. [Phase 1: Critical Fixes](#phase-1-critical-fixes)
4. [Phase 2: High Priority Improvements](#phase-2-high-priority-improvements)
5. [Phase 3: Medium Priority Refinements](#phase-3-medium-priority-refinements)
6. [Phase 4: Polish & Enhancement](#phase-4-polish--enhancement)
7. [Design System File Structure](#design-system-file-structure)
8. [Token Architecture Revision](#token-architecture-revision)
9. [Component Specifications](#component-specifications)
10. [Testing & Validation Checklist](#testing--validation-checklist)

---

## Executive Summary

This plan addresses 15 categories of issues identified in the PropertyPro dashboard mockup review. The implementation is organized into four phases based on severity:

| Phase | Focus | Duration | Effort |
|-------|-------|----------|--------|
| Phase 1 | Critical (Accessibility, Responsive) | Week 1 | High |
| Phase 2 | High Priority (Cognitive Load, IA) | Week 2 | High |
| Phase 3 | Medium Priority (Tokens, Typography) | Week 3 | Medium |
| Phase 4 | Polish (Motion, Edge Cases) | Week 4 | Low |

**Key Outcomes:**
- WCAG 2.1 AA compliance for all interactive elements
- Responsive design supporting 320px → 1920px viewports
- Simplified token architecture (3-tier → 2-tier)
- Reduced cognitive load through progressive disclosure
- URL-synchronized navigation state
- Proper keyboard navigation throughout

---

## Design Principles

These principles are derived from the reviewed sources and will guide all implementation decisions.

### From shadcn/ui
> *Source: [shadcn/ui Core Principles](https://app.studyraid.com/en/read/11919/379805/core-principles-and-philosophy-of-shadcnui)*

1. **Code Ownership** — Components live in your codebase, not node_modules. Full modification rights.
2. **Composition Over Configuration** — Use compound components only when they provide real flexibility benefits.
3. **Minimalist Aesthetics** — "Less is more." Remove unnecessary ornamentation.
4. **Accessibility First** — WCAG compliance, keyboard navigation, screen reader support, reduced motion.

### From Vercel Geist
> *Source: [Vercel Geist Design System](https://vercel.com/geist/introduction), [Design Systems Surf Analysis](https://designsystems.surf/design-systems/vercel)*

1. **Precision** — Every pixel has purpose. No arbitrary spacing or sizing.
2. **Clarity** — Information hierarchy through typography, not decoration.
3. **Simplicity** — Reduce options. One way to do things correctly.
4. **No Design Tokens** — Geist explicitly chose against design tokens. Per source: *"Vercel maintains design assets including brand guidelines, but they do not use design tokens in their system."*

> **Important Nuance:** While Geist avoids tokens, [shadcn/ui](https://ui.shadcn.com/docs/theming) (which Vercel promotes) DOES use CSS custom properties for theming. Our hybrid approach aligns with shadcn's practical implementation rather than Geist's purist stance.

### From Linear Design Philosophy
> *Source: [Linear Design: The SaaS Design Trend](https://blog.logrocket.com/ux-design/linear-design/)*

1. **Reduction** — Cut features and UI elements ruthlessly. What remains must be essential.
2. **Focus** — One primary action per screen. Clear visual hierarchy.
3. **Speed** — Performance is a feature. Optimistic updates, minimal re-renders.
4. **Monochrome Tendency** — Limit accent colors. Let content be the color.

### From Dashboard Design Best Practices
> *Source: [UXPin Dashboard Design Principles](https://www.uxpin.com/studio/blog/dashboard-design-principles/)*

1. **7±2 Rule** — Humans process 7±2 chunks of information simultaneously.
2. **Progressive Disclosure** — Show summary first, details on demand. Reduces cognitive load by 40%.
3. **F-Pattern Scanning** — Critical metrics in top-left quadrant (40% more attention).
4. **3-Second Rule** — Users determine dashboard value within 3-5 seconds.

---

## Phase 1: Critical Fixes

### 1.1 Accessibility — Focus Indicators

**Problem:** Focus outlines removed with `outline: "none"` and no replacement provided.

**Solution:** Implement visible focus rings using the `:focus` / `:focus-visible` pattern per [WCAG 2.4.7](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html).

> **Source Verification:** Per [WCAG guidance](https://www.digitala11y.com/focus-visible-understanding-sc-2-4-7/): *"It's not required to have a visible focus indicator for mouse/pointer users, but the WCAG Understanding doc for 2.4.7 suggests it as a best practice. This is where the `:focus-visible` pseudo-class comes in."*
>
> The pattern below shows focus rings only during keyboard navigation, not mouse clicks — balancing usability with accessibility.

```css
/* design-system/tokens/focus.css */
:root {
  --focus-ring-color: #3B82F6;
  --focus-ring-offset: 2px;
  --focus-ring-width: 2px;
}

/*
 * WCAG 2.4.7 Focus Visible Pattern
 * Step 1: Remove default focus for ALL focus (mouse + keyboard)
 * Step 2: Add custom focus ONLY for keyboard navigation (:focus-visible)
 */

/* Remove default browser focus ring */
button:focus,
a:focus,
[tabindex]:focus {
  outline: none;
}

/* Add visible focus ring ONLY during keyboard navigation */
button:focus-visible,
a:focus-visible,
[tabindex]:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

/* Custom focus ring should meet 3:1 contrast per WCAG 2.4.13 (AAA) */
/* #3B82F6 on white = 4.5:1 ✓ */
/* #3B82F6 on gray-50 = 4.3:1 ✓ */

/* High contrast mode support */
@media (forced-colors: active) {
  button:focus-visible,
  a:focus-visible,
  [tabindex]:focus-visible {
    outline: 3px solid CanvasText;
  }
}

/* For dark backgrounds (sidebar), use lighter ring */
.dark-surface button:focus-visible,
.dark-surface a:focus-visible,
.dark-surface [tabindex]:focus-visible {
  --focus-ring-color: #93C5FD; /* blue-300 */
}
```

**Why This Pattern (Not Just `:focus-visible` Alone):**

| Approach | Mouse Click | Keyboard Tab | Recommendation |
|----------|-------------|--------------|----------------|
| `:focus` only | Shows ring ❌ | Shows ring ✓ | Not ideal |
| `:focus-visible` only | No ring ✓ | Shows ring ✓ | Works but browser support varies |
| `:focus` reset + `:focus-visible` | No ring ✓ | Shows ring ✓ | **Recommended** — explicit control |

**Component Changes:**

| Component | Current | Updated |
|-----------|---------|---------|
| `Button` | `outline: "none"` | Remove; let CSS handle focus |
| `Card` (interactive) | `outline: "none"` | Add `focus-visible` styles |
| `DataRow` | No focus style | Add `focus-visible` with status-aware ring |
| `NavRail` buttons | `outline: "none"` | Light focus ring on dark background |
| `Tabs` | No focus style | Add pill-shaped focus indicator |

**Acceptance Criteria:**
- [ ] Tab through entire dashboard without losing visual focus
- [ ] Focus ring visible on all interactive elements
- [ ] Focus ring color meets 3:1 contrast ratio against backgrounds
- [ ] Works with Windows High Contrast Mode

---

### 1.2 Accessibility — Keyboard Navigation

**Problem:** Interactive cards have `tabIndex={0}` but no `onKeyDown` handler.

**Solution:** Create a `useKeyboardClick` hook and apply consistently.

```typescript
// design-system/hooks/useKeyboardClick.ts
export function useKeyboardClick(onClick?: () => void) {
  return {
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick?.();
      }
    },
    onClick,
    tabIndex: onClick ? 0 : undefined,
    role: onClick ? 'button' : undefined,
  };
}
```

**Component Changes:**

| Component | Change |
|-----------|--------|
| `Card` (interactive) | Add `onKeyDown` handler via hook |
| `DataRow` (clickable) | Add `onKeyDown` handler via hook |
| `SectionHeader` (collapsible) | Already a button — verify Enter works |

**Acceptance Criteria:**
- [ ] All clickable cards activate on Enter and Space
- [ ] All clickable rows activate on Enter and Space
- [ ] Escape closes any open modals/dropdowns (future)

---

### 1.3 Accessibility — Semantic HTML

**Problem:** `DataRow` uses `role="button"` on a `<div>` when interactive.

**Solution:** Use `<button>` for interactive rows, `<div role="row">` for static.

```tsx
// Updated DataRow component
const DataRow = forwardRef(({ onClick, ...props }, ref) => {
  const Component = onClick ? 'button' : 'div';
  const role = onClick ? undefined : 'row'; // button is implicit

  return (
    <Component
      ref={ref}
      role={role}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      {...props}
    />
  );
});
```

**Additional Semantic Fixes:**

| Issue | Fix |
|-------|-----|
| `Badge role="status"` | Remove role (static content, not live region) |
| `ColumnHeader` as `<span>` | Change to `<th scope="col">` within table context |
| Data tables | Wrap in `<table role="grid">` or use proper `<table>` |

---

### 1.4 Accessibility — Color Contrast

**Problem:** Tertiary text (#6B7280) on page background (#F9FAFB) is ~4.6:1, barely AA.

**Solution:** Darken tertiary text to ensure 4.5:1 minimum for normal text.

```css
/* Updated semantic colors */
:root {
  /* Before: gray-500 (#6B7280) — 4.6:1 ratio */
  /* After: gray-600 (#4B5563) — 7.0:1 ratio */
  --color-text-tertiary: #4B5563;

  /* Status colors — add icons, don't rely on color alone */
  --color-status-danger: #DC2626;
  --color-status-warning: #D97706;
  /* These are distinguishable but we'll add icons for colorblind users */
}
```

**Pattern for Colorblind Safety:**
All status indicators must include either:
- An icon (checkmark, warning triangle, X)
- A text label ("Compliant", "Overdue")
- A pattern/shape difference (not just color)

Current `StatusBadge` already does this — verify all usages follow suit.

---

### 1.5 Responsive Design — Breakpoint System

**Problem:** Zero responsive breakpoints. Fixed 4-column grids, fixed sidebar.

**Solution:** Implement mobile-first breakpoint system.

```css
/* design-system/tokens/breakpoints.css */
:root {
  --breakpoint-sm: 640px;   /* Large phones */
  --breakpoint-md: 768px;   /* Tablets */
  --breakpoint-lg: 1024px;  /* Small laptops */
  --breakpoint-xl: 1280px;  /* Desktops */
  --breakpoint-2xl: 1536px; /* Large screens */
}

/* Usage with CSS container queries (preferred) or media queries */
@media (min-width: 640px) { /* sm and up */ }
@media (min-width: 768px) { /* md and up */ }
@media (min-width: 1024px) { /* lg and up */ }
```

**Layout Adaptations:**

| Viewport | Sidebar | Metrics Grid | Data Table |
|----------|---------|--------------|------------|
| < 640px | Hidden (hamburger) | 1 column, stacked | Card list view |
| 640-767px | Collapsed (icons) | 2 columns | Card list view |
| 768-1023px | Collapsed (icons) | 2 columns | Horizontal scroll |
| 1024-1279px | Expanded | 3 columns | Full table |
| ≥ 1280px | Expanded | 4 columns | Full table |

**Implementation Approach:**

```tsx
// design-system/hooks/useBreakpoint.ts
const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
};

export function useBreakpoint() {
  const [width, setWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );

  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return {
    isMobile: width < breakpoints.sm,
    isTablet: width >= breakpoints.sm && width < breakpoints.lg,
    isDesktop: width >= breakpoints.lg,
    breakpoint: Object.entries(breakpoints)
      .reverse()
      .find(([, value]) => width >= value)?.[0] ?? 'xs',
  };
}
```

---

### 1.6 Responsive Design — Touch Targets

**Problem:** Small buttons (32px height) fail Apple's 44pt minimum for touch.

**Solution:** Enforce minimum touch target sizes on mobile.

```css
/* design-system/tokens/sizing.css */
:root {
  --touch-target-min: 44px;
  --button-height-sm: 32px;
  --button-height-md: 40px;
  --button-height-lg: 48px;
}

/* On touch devices, enforce minimum */
@media (pointer: coarse) {
  .button-sm {
    min-height: var(--touch-target-min);
    min-width: var(--touch-target-min);
  }
}
```

**Component Updates:**
- `Button size="sm"` → 44px min-height on touch devices
- Icon-only buttons → 44x44px touch target (can use padding)
- `DataRow` → Increase padding on mobile for easier tapping

---

### 1.7 Responsive Design — Fluid Typography

**Problem:** Font sizes are pixel-based, ignoring user preferences.

**Solution:** Use `rem` units with a fluid scale. **Retain 15px base** (existing system) while ensuring accessibility.

> **Source Verification:** [Dashboard typography research](https://www.numberanalytics.com/blog/typography-in-dashboard-design) confirms: *"The ideal font size for dashboard text typically ranges between 12px and 16px"* and *"For interaction-heavy designs (apps, feeds, forms, lists, tables, visualizations), the main font size will be 14-20px."*
>
> The existing 15px base is within the recommended range for dashboards and should be retained. However, it must be converted to `rem` units to respect user accessibility settings.

**Base Font Size Decision:**

| Option | Value | Pros | Cons |
|--------|-------|------|------|
| Keep 15px | `font-size: 93.75%` | No visual change, maintains existing design | Slightly unusual root percentage |
| Switch to 16px | `font-size: 100%` | Browser default, simpler math | Requires redesigning all spacing |
| **Recommendation** | **Keep 15px** | Minimal disruption, visually tested | — |

```css
/* design-system/tokens/typography.css */
:root {
  /*
   * Base size: 15px (existing) via percentage
   * This respects user's browser font size setting while maintaining design
   * User sets browser to 20px → our "15px" becomes 18.75px (proportional scaling)
   */
  font-size: 93.75%; /* 15/16 = 0.9375 */

  /*
   * Type scale using rem (now relative to 15px base)
   * All values scale proportionally with user preferences
   */
  --font-size-xs: 0.694rem;   /* 10.4px — captions, metadata */
  --font-size-sm: 0.833rem;   /* 12.5px — secondary text, labels */
  --font-size-base: 1rem;     /* 15px — body text */
  --font-size-lg: 1.2rem;     /* 18px — card titles */
  --font-size-xl: 1.44rem;    /* 21.6px — section titles */
  --font-size-2xl: 1.728rem;  /* 25.9px — page titles */
  --font-size-3xl: 2.074rem;  /* 31.1px — hero metrics */
}

/* Fluid scaling for headings on larger screens (optional enhancement) */
@media (min-width: 1280px) {
  :root {
    --font-size-2xl: clamp(1.728rem, 1.5vw + 1rem, 2rem);
    --font-size-3xl: clamp(2.074rem, 2vw + 1rem, 2.5rem);
  }
}
```

**Accessibility Compliance:**
- ✅ Uses relative units (`rem`) — scales with user preferences
- ✅ Base ≥14px — meets minimum readability guidelines
- ✅ Users can zoom 200% without content loss (test required)

---

## Phase 2: High Priority Improvements

### 2.1 Cognitive Load — Reduce Above-Fold Information

**Problem:** ~25 data points visible simultaneously, exceeding 7±2 guideline.

**Solution:** Implement a "hero metric" pattern with progressive disclosure.

**New Dashboard Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│ [Alert Banner - only if overdue items exist]                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│    ┌─────────────────────────────────────────────────┐     │
│    │         92%                                      │     │
│    │    COMPLIANT                                     │     │
│    │    11 of 13 requirements met                     │     │
│    │    ████████████████████░░  [progress bar]       │     │
│    │                                                  │     │
│    │    [1 Overdue]  [1 Due Soon]  [11 Complete]    │     │
│    └─────────────────────────────────────────────────┘     │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ [Tab Bar: Action Required | All Items | By Category]        │
├─────────────────────────────────────────────────────────────┤
│ [Content based on selected tab]                             │
└─────────────────────────────────────────────────────────────┘
```

**Key Changes:**
1. **Single hero metric** (92%) dominates the visual hierarchy
2. **Contextual fraction** (11 of 13) explains the percentage
3. **Status pills** replace 4 separate metric cards
4. **Tab-based views** replace all-at-once display
5. **"Action Required" default tab** shows only items needing attention

**Information Architecture:**

| Tab | Content | Default State |
|-----|---------|---------------|
| Action Required | Overdue + Due Soon items only | **Selected by default** |
| All Items | Flat list of all 13 items, sortable | Hidden |
| By Category | Current accordion view | Hidden |

---

### 2.2 Cognitive Load — Progressive Disclosure for Deadlines

**Problem:** All deadlines shown at once, no prioritization.

**Solution:** Show only the most urgent deadline prominently; others on demand.

**New Deadline Pattern:**

```tsx
// Show only the most critical deadline in the hero section
<DeadlineAlert
  title="Insurance Policy Renewal"
  daysOverdue={6}
  action={<Button>Upload Now</Button>}
/>

// "View all deadlines" link expands to show the rest
<Collapsible>
  <CollapsibleTrigger>
    View 2 upcoming deadlines
  </CollapsibleTrigger>
  <CollapsibleContent>
    {/* Secondary deadlines */}
  </CollapsibleContent>
</Collapsible>
```

---

### 2.3 Information Architecture — URL-Synchronized State

**Problem:** Navigation state isn't in URL. Can't bookmark or share.

**Solution:** Implement URL-based routing with Next.js App Router patterns.

```typescript
// app/dashboard/[view]/page.tsx
export default function DashboardView({ params }: { params: { view: string } }) {
  // View is now in URL: /dashboard/compliance, /dashboard/maintenance
}

// For tab state within views
// /dashboard/maintenance?status=in_progress
export default function MaintenanceView({ searchParams }) {
  const status = searchParams.status ?? 'all';
}
```

**URL Structure:**

| Current | Proposed |
|---------|----------|
| `/#` (hash routing, implicit) | `/dashboard/compliance` |
| Tab state lost on nav | `/dashboard/maintenance?status=in_progress` |
| Category expansion lost | `/dashboard/compliance?expanded=financial,meetings` |

---

### 2.4 Navigation — Collapsible Sidebar with Toggle

**Problem:** `navExpanded` state exists but no UI to toggle it.

**Solution:** Add collapse toggle button and persist preference.

```tsx
// In NavRail component
<button
  onClick={() => setNavExpanded(!navExpanded)}
  aria-label={navExpanded ? "Collapse sidebar" : "Expand sidebar"}
  className="nav-collapse-toggle"
>
  <ChevronLeft
    style={{
      transform: navExpanded ? 'rotate(0)' : 'rotate(180deg)',
      transition: 'transform 150ms ease'
    }}
  />
</button>
```

**Persistence:**
```typescript
// Store preference in localStorage
useEffect(() => {
  const saved = localStorage.getItem('nav-expanded');
  if (saved !== null) setNavExpanded(JSON.parse(saved));
}, []);

useEffect(() => {
  localStorage.setItem('nav-expanded', JSON.stringify(navExpanded));
}, [navExpanded]);
```

---

### 2.5 Navigation — Badge Counts

**Problem:** No indication of pending items in nav without clicking through.

**Solution:** Add badge counts to nav items with pending actions.

```tsx
const navItems = [
  { id: "compliance", label: "Compliance", icon: Shield, badge: overdueCount > 0 ? overdueCount : null, badgeVariant: "danger" },
  { id: "maintenance", label: "Maintenance", icon: Wrench, badge: openRequestsCount, badgeVariant: "neutral" },
  // ...
];

// In NavRail
{item.badge && (
  <span className={`nav-badge nav-badge--${item.badgeVariant}`}>
    {item.badge}
  </span>
)}
```

---

### 2.6 Data Visualization — Contextual Metrics

**Problem:** "92% compliant" lacks context. Is that good?

**Solution:** Add comparative context and smart coloring.

```tsx
<HeroMetric
  value={92}
  format="percent"
  label="Overall Compliance"
  context={
    compliancePct === 100
      ? "You're fully compliant!"
      : `${13 - compliantCount} items need attention`
  }
  trend={compliancePct >= lastMonthPct ? 'up' : 'down'}
  trendValue={Math.abs(compliancePct - lastMonthPct)}
  // Color based on thresholds, not arbitrary
  status={
    compliancePct >= 100 ? 'success' :
    compliancePct >= 80 ? 'warning' :
    'danger'
  }
/>
```

**Progress Bar Semantic Coloring:**

| Percentage | Color | Meaning |
|------------|-------|---------|
| 100% | Green | Fully compliant |
| 80-99% | Blue (brand) | Good, minor items pending |
| 50-79% | Amber | Needs attention |
| < 50% | Red | Critical |

---

## Phase 3: Medium Priority Refinements

### 3.1 Token Architecture — Hybrid CSS + JS Approach

**Problem:** Dual token systems exist (JS in `tokens/index.ts`, CSS in `mockup/styles.css`) causing inconsistency.

**Solution:** Adopt shadcn/ui's hybrid approach — CSS custom properties as the runtime system, with JS maintaining type safety.

> **Source Verification:** [shadcn/ui theming docs](https://ui.shadcn.com/docs/theming) confirm: *"shadcn/ui uses CSS variables for styling. This allows you to easily change the colors of components... Because components reference CSS variables rather than specific values, theme switching requires only updating the class on the root element."*
>
> However, [Vercel Geist](https://designsystems.surf/design-systems/vercel) notably does NOT use design tokens at all. For PropertyPro, we'll adopt a middle ground: CSS variables with a JS type layer for developer experience.

**Recommended Hybrid Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│  SOURCE OF TRUTH: tokens/index.ts (TypeScript)              │
│  - Type definitions                                         │
│  - Constants for reference in JS when needed                │
│  - Exported to CSS at build time                            │
├─────────────────────────────────────────────────────────────┤
│  RUNTIME: tokens/*.css (CSS Custom Properties)              │
│  - Actually used by components                              │
│  - Inspectable in DevTools                                  │
│  - Supports theming via class swap                          │
├─────────────────────────────────────────────────────────────┤
│  COMPONENTS: Reference CSS variables                        │
│  - background: var(--surface-card)                          │
│  - color: var(--text-primary)                               │
└─────────────────────────────────────────────────────────────┘
```

**New Structure:**

```typescript
// tokens/index.ts — TYPE DEFINITIONS + BUILD EXPORT
export const tokens = {
  colors: {
    blue: { 50: "#EFF6FF", 600: "#2563EB", 700: "#1D4ED8" },
    // ...
  },
  spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32 },
  radius: { sm: 4, md: 8, lg: 12, full: 9999 },
} as const;

// Semantic mappings (for documentation + build)
export const semanticTokens = {
  'surface-page': 'var(--gray-50)',
  'surface-card': 'var(--gray-0)',
  'text-primary': 'var(--gray-900)',
  // ...
} as const;

// Type exports for components
export type ColorToken = keyof typeof tokens.colors;
export type SpacingToken = keyof typeof tokens.spacing;
```

```css
/* tokens/primitives.css — GENERATED OR MANUALLY SYNCED */
:root {
  /* Colors */
  --blue-50: #EFF6FF;
  --blue-600: #2563EB;
  --blue-700: #1D4ED8;
  --gray-0: #FFFFFF;
  --gray-50: #F9FAFB;
  --gray-900: #111827;
  /* ... */

  /* Spacing (4px base unit) */
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

```css
/* tokens/semantic.css — SEMANTIC ALIASES */
:root {
  /* Surfaces */
  --surface-page: var(--gray-50);
  --surface-card: var(--gray-0);
  --surface-elevated: var(--gray-0);

  /* Text */
  --text-primary: var(--gray-900);
  --text-secondary: var(--gray-600);
  --text-muted: var(--gray-500);

  /* Interactive */
  --interactive-primary: var(--blue-600);
  --interactive-primary-hover: var(--blue-700);

  /* Status */
  --status-success: var(--green-600);
  --status-warning: var(--amber-600);
  --status-danger: var(--red-600);
}

/* Dark theme variant (future) */
.dark {
  --surface-page: var(--gray-950);
  --surface-card: var(--gray-900);
  --text-primary: var(--gray-50);
  /* ... */
}
```

**What Changes:**
- **Keep** `tokens/index.ts` for TypeScript types and build-time reference
- **Add** CSS files that mirror the JS structure
- **Delete** `componentTokens` object (move to component CSS)
- **Delete** `semanticSpacing.inline.xs` nesting (flatten to `--space-inline-xs`)
- **Deprecate** direct primitive usage in components (use semantic CSS vars)

**Migration Path:**
1. Create CSS files that match existing JS tokens
2. Update components to use `var(--token-name)` instead of `semanticColors.text.primary`
3. Keep JS exports for backward compatibility during transition
4. Delete JS primitives once all components migrated

---

### 3.2 Typography — Reduce Variants

**Problem:** 10 typography variants with unclear use cases.

**Solution:** Reduce to 6 essential variants.

| Keep | Rename/Merge | Remove |
|------|--------------|--------|
| `display` | — | — |
| `heading` | Merge heading1/2/3 into size prop | `heading1`, `heading2`, `heading3` |
| `body` | — | — |
| `bodySmall` | Merge bodySm/bodySmMedium | `bodySm`, `bodySmMedium` |
| `caption` | — | `bodyMedium` (use weight prop) |
| `mono` | — | — |

**New API:**

```tsx
<Text variant="heading" size="lg">Large Heading</Text>
<Text variant="heading" size="md">Medium Heading</Text>
<Text variant="body" weight="medium">Medium weight body</Text>
<Text variant="caption">Small uppercase text</Text>
```

---

### 3.3 Typography — Proper Modular Scale

**Problem:** Font sizes use arbitrary ratios (1.15, 1.18, 1.2, etc.).

**Solution:** Implement **1.2 Minor Third scale** (optimal for data-heavy dashboards).

> **Source Verification:** [Typography scale research](https://cieden.com/book/sub-atomic/typography/different-type-scale-types) confirms: *"Minor Third (1.2) offers subtle contrast, suitable for text-heavy interfaces"* and *"if you're designing the interface of a medical dashboard with tons of little displays, buttons, icons, labels—you've got a lot of information that needs to stand out... So you don't need big, dramatic changes."*
>
> The original recommendation of 1.25 (Major Third) was incorrect for this use case. Minor Third provides better differentiation for dense compliance data without overwhelming visual hierarchy.

**Why 1.2 Minor Third (Not 1.25 Major Third):**

| Scale | Ratio | Best For | PropertyPro Fit |
|-------|-------|----------|-----------------|
| Minor Third | 1.2 | Data dashboards, text-heavy UI, forms | ✅ Optimal |
| Major Third | 1.25 | Marketing sites, balanced interfaces | ❌ Too dramatic |
| Perfect Fourth | 1.333 | Editorial, strong hierarchy | ❌ Way too dramatic |

```css
/* Minor Third (1.2) scale — CORRECTED */
:root {
  /* Base: 15px (existing) converted to rem for accessibility */
  /* Using 93.75% root = 15px base while respecting user preferences */

  --font-size-xs: 0.694rem;   /* 10.4px — captions, metadata */
  --font-size-sm: 0.833rem;   /* 12.5px — secondary text */
  --font-size-base: 1rem;     /* 15px — body text */
  --font-size-lg: 1.2rem;     /* 18px — card titles, heading3 */
  --font-size-xl: 1.44rem;    /* 21.6px — section titles, heading2 */
  --font-size-2xl: 1.728rem;  /* 25.9px — page titles, heading1 */
  --font-size-3xl: 2.074rem;  /* 31.1px — hero metrics, display */
}

/* Root font size preserves existing 15px base */
:root {
  font-size: 93.75%; /* 15px when browser default is 16px */
}
```

**Comparison with Existing System:**

| Token | Existing (px) | New (rem @ 15px) | Change |
|-------|---------------|------------------|--------|
| xs | 11px | 10.4px | -0.6px (negligible) |
| sm | 13px | 12.5px | -0.5px (negligible) |
| base | 15px | 15px | — |
| lg | 18px | 18px | — |
| xl | 22px | 21.6px | -0.4px (negligible) |
| 2xl | 28px | 25.9px | -2.1px (tighter, intentional) |
| 3xl | 36px | 31.1px | -4.9px (tighter, intentional) |

The tighter large sizes are intentional — dashboards benefit from less dramatic headline scaling to maintain information density.

---

### 3.4 Component API — Simplify Button

**Problem:** Compound Button API is verbose for simple cases.

**Solution:** Support both simple and compound patterns.

```tsx
// Simple (most common)
<Button variant="primary" leftIcon={<Upload />}>
  Upload Document
</Button>

// Compound (when needed for complex layouts)
<Button variant="primary">
  <Button.Icon><Upload /></Button.Icon>
  <Button.Content>
    <span>Upload Document</span>
    <span className="text-xs opacity-70">PDF, DOC up to 50MB</span>
  </Button.Content>
</Button>
```

**Implementation:**

```tsx
const Button = forwardRef(({
  leftIcon,
  rightIcon,
  children,
  ...props
}, ref) => {
  // If children are compound components, render as-is
  const hasCompoundChildren = /* detection logic */;

  if (hasCompoundChildren) {
    return <ButtonRoot ref={ref} {...props}>{children}</ButtonRoot>;
  }

  // Otherwise, use simple API
  return (
    <ButtonRoot ref={ref} {...props}>
      {leftIcon && <ButtonIcon>{leftIcon}</ButtonIcon>}
      <span>{children}</span>
      {rightIcon && <ButtonIcon position="end">{rightIcon}</ButtonIcon>}
    </ButtonRoot>
  );
});
```

---

### 3.5 State Management — Reduce Re-renders

**Problem:** Hover/pressed state in buttons causes re-renders on mouse movement.

**Solution:** Use CSS for hover/active states, not React state.

> **Source Verification:** [React hover state best practices](https://dev.to/jitheshpoojari/comparing-dropdown-implementations-in-react-usestate-vs-tailwind-css-hover-1jm8) confirm: *"CSS classes are the go-to solution for static styles and when you want to leverage the full power of CSS, including hover states, transitions, and animations."*
>
> Additionally: *"Inline styles can lead to excessive re-rendering if not optimized properly"* and *"Inline styles are defined as objects, and any change in the style object will trigger a re-render of the component."*

**When to Use CSS vs useState for Hover:**

| Scenario | Use CSS | Use useState |
|----------|---------|--------------|
| Button color change on hover | ✅ | ❌ |
| Showing a tooltip on hover | ❌ | ✅ (controls visibility) |
| Dropdown menu on hover | ❌ | ✅ (controls children) |
| Card shadow on hover | ✅ | ❌ |
| Triggering animation on hover | ✅ (CSS animations) | Maybe (if JS-based) |

```css
/* Button states via CSS, not useState */
.button {
  background: var(--button-bg);
  transition: background var(--duration-micro) var(--ease-default);
}

.button:hover {
  background: var(--button-bg-hover);
}

.button:active {
  background: var(--button-bg-active);
}

/* For more complex states, use data attributes */
.button[data-loading="true"] {
  opacity: 0.7;
  pointer-events: none;
}
```

**What to Remove from Button.tsx:**
```tsx
// DELETE these useState calls from Button
const [isHovered, setIsHovered] = useState(false);
const [isPressed, setIsPressed] = useState(false);

// DELETE these event handlers
onMouseEnter={() => setIsHovered(true)}
onMouseLeave={() => { setIsHovered(false); setIsPressed(false); }}
onMouseDown={() => setIsPressed(true)}
onMouseUp={() => setIsPressed(false)}
```

**Keep useState For:**
- `loading` state (affects children rendering)
- `disabled` state (if controlled externally)
- Any state that affects component tree structure

---

### 3.6 Data Handling — Type-Safe Status Mapping

**Problem:** Status is untyped string, mapping is duplicated.

**Solution:** Create single source of truth with TypeScript.

```typescript
// design-system/constants/status.ts
export const STATUS_CONFIG = {
  compliant: {
    variant: 'success',
    label: 'Compliant',
    icon: 'check',
    priority: 0,
  },
  pending: {
    variant: 'warning',
    label: 'Due Soon',
    icon: 'clock',
    priority: 1,
  },
  overdue: {
    variant: 'danger',
    label: 'Overdue',
    icon: 'alert',
    priority: 2,
  },
  // ...
} as const;

export type StatusKey = keyof typeof STATUS_CONFIG;

// Usage - single source of truth
export function getStatusConfig(status: StatusKey) {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG.neutral;
}
```

---

## Phase 4: Polish & Enhancement

### 4.1 Motion — Reduced Motion Support

**Problem:** No `prefers-reduced-motion` support.

**Solution:** Wrap all transitions in media query check. **Retain existing token naming** (micro/quick/standard is more descriptive than fast/normal).

> **Conflict Resolution:** The original plan proposed renaming motion tokens (fast, normal, slow). Per the conflict analysis, we'll **keep the existing naming** (micro, quick, standard, expressive) as it's more semantically meaningful.

```css
/* design-system/tokens/motion.css */
:root {
  /* Duration — KEPT FROM EXISTING SYSTEM */
  --duration-instant: 0ms;
  --duration-micro: 100ms;    /* Hover states, micro-interactions */
  --duration-quick: 150ms;    /* Expanding/collapsing, focus rings */
  --duration-standard: 250ms; /* Page transitions, modals */
  --duration-slow: 350ms;     /* Complex animations */
  --duration-expressive: 500ms; /* Celebratory animations */

  /* Easing */
  --ease-default: cubic-bezier(0.4, 0, 0.2, 1);  /* Standard Material easing */
  --ease-in: cubic-bezier(0.4, 0, 1, 1);         /* Accelerate */
  --ease-out: cubic-bezier(0, 0, 0.2, 1);        /* Decelerate */
  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1); /* Playful overshoot */
}

/* Disable animations for users who prefer reduced motion */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* Utility class for motion-safe animations */
@media (prefers-reduced-motion: no-preference) {
  .animate-fade-in {
    animation: fadeIn var(--duration-standard) var(--ease-out);
  }
}
```

---

### 4.2 Empty States — Comprehensive Coverage

**Problem:** Only filtered maintenance has an empty state.

**Solution:** Create empty states for all scenarios.

| Scenario | Title | Description | Action |
|----------|-------|-------------|--------|
| New association (0% compliance) | "Let's get you compliant" | "Upload your first document to start tracking Florida Statute compliance." | "Upload Document" |
| No owners registered | "Add your first owner" | "Import owners via CSV or add them manually to enable portal access." | "Add Owners" |
| No announcements | "Keep your community informed" | "Post announcements to notify owners about meetings, updates, and community news." | "Create Announcement" |
| No maintenance requests | "All clear!" | "There are no open maintenance requests. Residents can submit requests through the portal." | — |
| API error | "Something went wrong" | "We couldn't load this data. Please try again." | "Retry" |
| Offline | "You're offline" | "Check your internet connection and try again." | "Retry" |

---

### 4.3 Loading States — Skeleton Screens

**Problem:** No loading states; data appears instantly (unrealistic).

**Solution:** Add skeleton components for async content.

```tsx
// design-system/components/Skeleton.tsx
export const Skeleton = ({ width, height, variant = 'text' }) => (
  <div
    className={`skeleton skeleton--${variant}`}
    style={{ width, height }}
    aria-hidden="true"
  />
);

// Usage
<Card>
  {isLoading ? (
    <>
      <Skeleton variant="text" width="60%" />
      <Skeleton variant="text" width="40%" />
      <Skeleton variant="rect" height={200} />
    </>
  ) : (
    <ActualContent />
  )}
</Card>
```

---

### 4.4 100% Compliance Celebration

**Problem:** No special state when compliance is 100%.

**Solution:** Add a celebratory empty state.

```tsx
{compliancePct === 100 && (
  <Card className="compliance-success">
    <SuccessIllustration />
    <Text variant="heading" size="lg">
      You're fully compliant!
    </Text>
    <Text variant="body" color="secondary">
      All Florida Statute §718.111(12)(g) requirements are met.
      Keep your documents up to date to maintain compliance.
    </Text>
    <Button variant="secondary" leftIcon={<Download />}>
      Download Compliance Report
    </Button>
  </Card>
)}
```

---

## Design System File Structure

```
design-system/
├── README.md                    # Overview and usage guide
├── CHANGELOG.md                 # Version history
│
├── tokens/
│   ├── index.css               # Imports all token files
│   ├── primitives.css          # Raw values (colors, spacing, etc.)
│   ├── semantic.css            # Intent-based aliases
│   ├── typography.css          # Font families, sizes, weights
│   ├── breakpoints.css         # Responsive breakpoints
│   ├── motion.css              # Animation durations, easings
│   └── focus.css               # Focus ring styles
│
├── components/
│   ├── index.ts                # Exports all components
│   │
│   ├── primitives/
│   │   ├── Stack.tsx           # Flexbox layout primitive
│   │   ├── Text.tsx            # Typography primitive
│   │   └── Icon.tsx            # Icon wrapper with sizing
│   │
│   ├── Button/
│   │   ├── Button.tsx          # Main component
│   │   ├── Button.css          # Styles
│   │   ├── Button.test.tsx     # Tests
│   │   └── index.ts            # Export
│   │
│   ├── Card/
│   │   ├── Card.tsx
│   │   ├── Card.css
│   │   └── index.ts
│   │
│   ├── Badge/
│   │   ├── Badge.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── PriorityBadge.tsx
│   │   └── index.ts
│   │
│   ├── DataTable/
│   │   ├── DataTable.tsx       # New: proper table component
│   │   ├── DataRow.tsx
│   │   ├── ColumnHeader.tsx
│   │   └── index.ts
│   │
│   ├── Alert/
│   │   ├── AlertBanner.tsx
│   │   └── index.ts
│   │
│   ├── Progress/
│   │   ├── ProgressBar.tsx
│   │   └── index.ts
│   │
│   ├── Navigation/
│   │   ├── NavRail.tsx
│   │   ├── TopBar.tsx
│   │   ├── Tabs.tsx
│   │   └── index.ts
│   │
│   ├── Feedback/
│   │   ├── EmptyState.tsx
│   │   ├── Skeleton.tsx
│   │   ├── Spinner.tsx
│   │   └── index.ts
│   │
│   └── Metrics/
│       ├── HeroMetric.tsx      # New: single large metric
│       ├── MetricCard.tsx
│       └── index.ts
│
├── patterns/
│   ├── PageContainer.tsx       # Standard page layout
│   ├── SectionHeader.tsx       # Section title + actions
│   ├── ComplianceHero.tsx      # New: hero compliance display
│   └── index.ts
│
├── hooks/
│   ├── useBreakpoint.ts        # Responsive breakpoint detection
│   ├── useKeyboardClick.ts     # Keyboard activation for custom buttons
│   ├── useLocalStorage.ts      # Persist state to localStorage
│   └── index.ts
│
├── constants/
│   ├── status.ts               # Status configurations
│   ├── florida-compliance.ts   # Statute requirements (from original)
│   └── index.ts
│
└── utils/
    ├── cn.ts                   # Class name merger (like clsx)
    ├── formatters.ts           # Date, number formatting
    └── index.ts
```

---

## Token Architecture Revision

### Before (Current — 250+ lines JS)

```javascript
// Nested, verbose, JS-only
const primitiveColors = { blue: { 50: "#EFF6FF", ... } };
const semanticColors = { text: { primary: primitiveColors.gray[900] } };
const componentTokens = { button: { height: { sm: 32 } } };
```

### After (Proposed — CSS Custom Properties)

```css
/* primitives.css — ~60 lines */
:root {
  --blue-50: #EFF6FF;
  --blue-600: #2563EB;
  --gray-900: #111827;
  --space-4: 16px;
  --radius-md: 8px;
}

/* semantic.css — ~40 lines */
:root {
  --text-primary: var(--gray-900);
  --surface-card: white;
  --interactive-primary: var(--blue-600);
}

/* Component-specific values stay in component CSS */
/* Button.css */
.button--sm { height: 32px; }
.button--md { height: 40px; }
```

**Benefits:**
1. **Browser DevTools** can inspect and modify tokens live
2. **Theming** becomes trivial (swap CSS file or set properties)
3. **No JS bundle cost** for token definitions
4. **Follows Geist's approach** of avoiding token abstraction

---

## Component Specifications

### Button

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'danger' \| 'link'` | `'primary'` | Visual style |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Height and padding |
| `leftIcon` | `ReactNode` | — | Icon before label |
| `rightIcon` | `ReactNode` | — | Icon after label |
| `loading` | `boolean` | `false` | Shows spinner, disables interaction |
| `disabled` | `boolean` | `false` | Disables interaction |
| `fullWidth` | `boolean` | `false` | Expands to container width |

**Sizes:**

| Size | Height | Padding X | Font Size | Icon Size |
|------|--------|-----------|-----------|-----------|
| `sm` | 32px (44px touch) | 12px | 13px | 14px |
| `md` | 40px | 16px | 14px | 16px |
| `lg` | 48px | 20px | 16px | 18px |

---

### Card

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `padding` | `'none' \| 'sm' \| 'md' \| 'lg'` | `'md'` | Internal padding |
| `elevated` | `boolean` | `false` | Adds shadow |
| `interactive` | `boolean` | `false` | Enables hover/focus states |
| `status` | `StatusKey` | — | Adds left border accent |
| `selected` | `boolean` | `false` | Selected state styling |

---

### StatusBadge

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `status` | `StatusKey` | required | Determines color and icon |
| `size` | `'sm' \| 'md'` | `'md'` | Badge size |
| `showIcon` | `boolean` | `true` | Display status icon |
| `showLabel` | `boolean` | `true` | Display text label |

---

### HeroMetric (New)

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `number` | required | The metric value |
| `format` | `'number' \| 'percent' \| 'currency'` | `'number'` | Display format |
| `label` | `string` | required | Metric name |
| `context` | `string` | — | Explanatory subtext |
| `status` | `'success' \| 'warning' \| 'danger' \| 'neutral'` | `'neutral'` | Color coding |
| `trend` | `'up' \| 'down' \| 'flat'` | — | Trend indicator |
| `trendValue` | `number` | — | Change amount |

---

## Testing & Validation Checklist

### Accessibility Testing

- [ ] **Keyboard Navigation**
  - [ ] Tab through entire app without mouse
  - [ ] All interactive elements reachable
  - [ ] Focus order is logical (left→right, top→bottom)
  - [ ] No focus traps
  - [ ] Escape closes modals/dropdowns

- [ ] **Focus Indicators**
  - [ ] Visible on all interactive elements
  - [ ] Meets 3:1 contrast ratio
  - [ ] Works in Windows High Contrast Mode

- [ ] **Screen Reader**
  - [ ] Test with VoiceOver (Mac) or NVDA (Windows)
  - [ ] All images have alt text
  - [ ] Form inputs have labels
  - [ ] Status changes announced (live regions)
  - [ ] Navigation landmarks present (`<nav>`, `<main>`, etc.)

- [ ] **Color**
  - [ ] All text meets 4.5:1 contrast (AA)
  - [ ] Large text meets 3:1 contrast
  - [ ] Information not conveyed by color alone
  - [ ] Test with colorblindness simulator

- [ ] **Motion**
  - [ ] Test with `prefers-reduced-motion: reduce`
  - [ ] No vestibular-triggering animations

### Responsive Testing

- [ ] **Breakpoints**
  - [ ] 320px (small phone)
  - [ ] 375px (iPhone)
  - [ ] 768px (tablet portrait)
  - [ ] 1024px (tablet landscape / small laptop)
  - [ ] 1280px (desktop)
  - [ ] 1920px (large desktop)

- [ ] **Touch Targets**
  - [ ] All buttons ≥44px on touch devices
  - [ ] Adequate spacing between targets

- [ ] **Content**
  - [ ] No horizontal scroll on mobile
  - [ ] Text readable without zooming
  - [ ] Images scale appropriately

### Functional Testing

- [ ] **Navigation**
  - [ ] All nav items work
  - [ ] URL updates on navigation
  - [ ] Browser back/forward works
  - [ ] Deep links work (direct URL access)

- [ ] **State Persistence**
  - [ ] Tab selections persist across navigation
  - [ ] Sidebar expanded/collapsed persists
  - [ ] Filter selections persist

- [ ] **Empty States**
  - [ ] All views have appropriate empty states
  - [ ] Error states display correctly
  - [ ] Loading states show skeletons

### Performance Testing

- [ ] **Load Time**
  - [ ] First Contentful Paint < 1.5s
  - [ ] Largest Contentful Paint < 2.5s
  - [ ] Time to Interactive < 3.5s

- [ ] **Runtime**
  - [ ] No layout shifts (CLS < 0.1)
  - [ ] Smooth scrolling (60fps)
  - [ ] No jank on interactions

---

## Implementation Timeline

| Week | Phase | Deliverables |
|------|-------|--------------|
| 1 | Phase 1 | Focus indicators, keyboard nav, semantic HTML, responsive grid |
| 2 | Phase 2 | Hero metric, progressive disclosure, URL routing, nav improvements |
| 3 | Phase 3 | Token refactor, typography cleanup, simplified APIs |
| 4 | Phase 4 | Motion polish, empty states, loading states, testing |

---

## Appendix: Source References

### Core Design Systems

| Principle | Source | Verified |
|-----------|--------|----------|
| CSS variable theming | [shadcn/ui Theming Docs](https://ui.shadcn.com/docs/theming) | ✅ |
| Semantic color naming | [shadcn/ui Theming (Medium)](https://medium.com/@enayetflweb/theming-in-shadcn-ui-customizing-your-design-with-css-variables-bb6927d2d66b) | ✅ |
| No design tokens approach | [Vercel Geist Design System](https://vercel.com/geist/introduction) | ✅ |
| Geist architecture analysis | [Design Systems Surf](https://designsystems.surf/design-systems/vercel) | ✅ |

### Typography

| Principle | Source | Verified |
|-----------|--------|----------|
| Minor Third (1.2) for dashboards | [Cieden Typography Scales](https://cieden.com/book/sub-atomic/typography/different-type-scale-types) | ✅ |
| Scale selection guidance | [Design+Code Typographic Scales](https://designcode.io/typographic-scales/) | ✅ |
| Dashboard font size (14-16px) | [Typography in Dashboard Design](https://www.numberanalytics.com/blog/typography-in-dashboard-design) | ✅ |
| Accessibility font requirements | [WCAG Font Size Requirements](https://font-converters.com/accessibility/font-size-requirements) | ✅ |

### Accessibility

| Principle | Source | Verified |
|-----------|--------|----------|
| Focus-visible pattern | [WCAG 2.4.7 Understanding](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html) | ✅ |
| Focus indicator design | [Sara Soueidan Focus Guide](https://www.sarasoueidan.com/blog/focus-indicators/) | ✅ |
| Keyboard focus management | [TPGi Focus Indicators](https://www.tpgi.com/managing-focus-and-visible-focus-indicators-practical-accessibility-guidance-for-the-web/) | ✅ |
| WCAG 2.4.13 (AAA) guidance | [WCAG Designers Guide](https://www.wcag.com/designers/2-4-13-focus-appearance/) | ✅ |

### React Patterns

| Principle | Source | Verified |
|-----------|--------|----------|
| CSS vs useState for hover | [DEV.to Dropdown Comparison](https://dev.to/jitheshpoojari/comparing-dropdown-implementations-in-react-usestate-vs-tailwind-css-hover-1jm8) | ✅ |
| Hover state optimization | [Squash.io Inline Styles](https://www.squash.io/implementing-hover-state-in-reactjs-with-inline-styles/) | ✅ |
| Performance best practices | [DhiWise React Hover Tutorial](https://www.dhiwise.com/post/elevate-your-ui-with-react-style-hover-developers-handbook) | ✅ |

### Dashboard UX

| Principle | Source | Verified |
|-----------|--------|----------|
| 7±2 cognitive limit | [UXPin Dashboard Principles](https://www.uxpin.com/studio/blog/dashboard-design-principles/) | ✅ |
| Progressive disclosure | [Cognitive Design Guidelines](https://uxmag.com/articles/four-cognitive-design-guidelines-for-effective-information-dashboards) | ✅ |
| Dashboard trends 2026 | [Design Rush Principles](https://www.designrush.com/agency/ui-ux-design/dashboard/trends/dashboard-design-principles) | ✅ |

---

## Appendix: Conflict Resolution Summary

| Conflict | Original Plan | Corrected Plan | Source |
|----------|---------------|----------------|--------|
| Typography scale | 1.25 Major Third | **1.2 Minor Third** | Cieden, Design+Code |
| Base font size | Unspecified | **Keep 15px** | Dashboard typography research |
| Token architecture | Pure CSS | **Hybrid CSS+JS** | shadcn/ui theming |
| Motion token naming | fast/normal/slow | **Keep micro/quick/standard** | Conflict analysis |
| Focus CSS pattern | Simple :focus-visible | **:focus reset + :focus-visible** | WCAG 2.4.7 |

---

*Document generated from design review findings. All recommendations verified against cited sources on February 5, 2026.*
