# Phase 4: Polish & Enhancement

## References

Read before starting:
- `docs/design-system/IMPLEMENTATION_PLAN.md` — Sections 4.1 through 4.4
- `docs/design-system/ANTI_GRAVITY_PROMPT.md` — Non-negotiable constraints

**Canonical mockup:** `PropertyProRedesign.jsx` (project root)
**Design system docs:** `docs/design-system/`

Apply all changes to **both** the mockup and the design system docs.

---

## 4.1 — Motion Tokens + Reduced Motion Support

The mockup already has `primitiveMotion` (durations + easings) as a JS object and a `createTransition()` helper used in ~20 places. What's missing: CSS custom properties for motion tokens, and a `prefers-reduced-motion` media query.

**In PropertyProRedesign.jsx:**

1. Add motion CSS custom properties to the existing injected `<style>` block's `:root`:
   ```css
   --duration-instant: 0ms;
   --duration-micro: 100ms;
   --duration-quick: 150ms;
   --duration-standard: 250ms;
   --duration-slow: 350ms;
   --duration-expressive: 500ms;

   --ease-default: cubic-bezier(0.4, 0, 0.2, 1);
   --ease-in: cubic-bezier(0.4, 0, 1, 1);
   --ease-out: cubic-bezier(0, 0, 0.2, 1);
   --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
   ```

2. Add the reduced motion media query to the `<style>` block:
   ```css
   @media (prefers-reduced-motion: reduce) {
     *, *::before, *::after {
       animation-duration: 0.01ms !important;
       animation-iteration-count: 1 !important;
       transition-duration: 0.01ms !important;
       scroll-behavior: auto !important;
     }
   }
   ```

3. Keep the existing `primitiveMotion` JS object and `createTransition()` helper as-is. They still work for inline style transitions.

**In design system docs:**

4. Create `docs/design-system/tokens/motion.css` with the duration variables, easing variables, reduced motion media query, and the `animate-fade-in` utility class — all exactly as specified in IMPLEMENTATION_PLAN.md § 4.1.
5. Add `@import "./motion.css";` to `docs/design-system/tokens/index.css`.

---

## 4.2 — Empty States: Comprehensive Coverage

The mockup has an `EmptyState` component and uses it in a few places. Expand coverage to all scenarios from the plan.

**In PropertyProRedesign.jsx:**

Add empty states for each scenario in the table below. Wire them into the appropriate view, gated by the relevant data condition.

| Scenario | Condition | Title | Description | Action Button |
|---|---|---|---|---|
| 0% compliance (new association) | `compliancePct === 0` or `totalCount === 0` | "Let's get you compliant" | "Upload your first document to start tracking Florida Statute compliance." | "Upload Document" |
| No maintenance requests | `maintenanceRequests.length === 0` | "All clear!" | "There are no open maintenance requests. Residents can submit requests through the portal." | None |
| API error | Add an `error` state variable | "Something went wrong" | "We couldn't load this data. Please try again." | "Retry" |
| Offline | Add an `isOffline` state (listen to `navigator.onLine` / `online`/`offline` events) | "You're offline" | "Check your internet connection and try again." | "Retry" |

The compliance "Action Required" tab already shows an empty state when no items need action. Verify it exists and has appropriate copy.

**In design system docs:**

6. Verify `docs/design-system/patterns/EmptyState.tsx` exists and matches the mockup's component API (icon, title, description, action, size). Update if it's out of date.
7. Add a `docs/design-system/constants/empty-states.ts` file documenting all scenario configs (title, description, action label, icon) so they're reusable in the real build.

---

## 4.3 — Loading States: Skeleton Screens

The mockup currently renders data instantly (no loading simulation). Add a `Skeleton` component and demonstrate it in at least one view.

**In PropertyProRedesign.jsx:**

1. Create a `Skeleton` component:
   ```jsx
   const Skeleton = forwardRef(({ width, height, variant = "text", style, ...props }, ref) => (
     <div
       ref={ref}
       aria-hidden="true"
       style={{
         width: width || (variant === "text" ? "100%" : undefined),
         height: height || (variant === "text" ? "1em" : variant === "circle" ? width : undefined),
         borderRadius: variant === "circle" ? primitiveRadius.full : primitiveRadius.sm,
         background: semanticColors.surface.muted,
         ...style
       }}
       data-pp-skeleton
       {...props}
     />
   ));
   ```

2. Add a shimmer animation to the `<style>` block:
   ```css
   @keyframes skeleton-shimmer {
     0% { opacity: 1; }
     50% { opacity: 0.4; }
     100% { opacity: 1; }
   }
   [data-pp-skeleton] {
     animation: skeleton-shimmer 1.5s ease-in-out infinite;
   }
   @media (prefers-reduced-motion: reduce) {
     [data-pp-skeleton] { animation: none; opacity: 0.6; }
   }
   ```

3. Add an `isLoading` state to the main `PropertyProApp` component (default `false`). Wire a simulated 1.5-second loading delay on mount using `useEffect` + `setTimeout` so the skeleton states are visible on initial render.

4. In the compliance dashboard, render skeleton cards when `isLoading` is true:
   ```jsx
   {isLoading ? (
     <VStack gap={semanticSpacing.stack.md}>
       <Skeleton variant="rect" height={120} />
       <Skeleton variant="text" width="60%" />
       <Skeleton variant="text" width="40%" />
     </VStack>
   ) : (
     <HeroMetric ... />
   )}
   ```

5. In the maintenance view, render skeleton rows when `isLoading` is true.

**In design system docs:**

6. Create `docs/design-system/components/Feedback/Skeleton.tsx` with TypeScript types and the same variants (text, rect, circle).
7. Create `docs/design-system/components/Feedback/Spinner.tsx` — a simple SVG loading spinner (can reuse the existing `ButtonSpinner` pattern).
8. Export both from `docs/design-system/components/Feedback/index.ts`.
9. Add Feedback exports to `docs/design-system/components/index.ts` and `docs/design-system/index.ts`.

---

## 4.4 — 100% Compliance Celebration

When compliance is 100%, replace the normal dashboard with a celebratory state.

**In PropertyProRedesign.jsx:**

1. In the compliance dashboard, add a conditional block before the tabs:
   ```jsx
   {compliancePct === 100 && (
     <Card elevated style={{ textAlign: "center", padding: semanticSpacing.section.lg }}>
       <VStack align="center" gap={semanticSpacing.stack.lg}>
         {/* Simple checkmark circle illustration */}
         <div style={{
           width: 80, height: 80,
           borderRadius: primitiveRadius.full,
           background: semanticColors.status.success.background,
           display: "flex", alignItems: "center", justifyContent: "center"
         }}>
           <CheckCircle size={40} color={semanticColors.status.success.foreground} />
         </div>
         <Text variant="heading" size="lg">You're fully compliant!</Text>
         <Text variant="body" color="secondary">
           All Florida Statute §718.111(12)(g) requirements are met.
           Keep your documents up to date to maintain compliance.
         </Text>
         <Button variant="secondary" leftIcon={<Download size={16} />}>
           Download Compliance Report
         </Button>
       </VStack>
     </Card>
   )}
   ```

2. The hero metric context text already says "You're fully compliant!" at 100% — keep that. The celebration card is an additional visual element, not a replacement.

3. Note: this uses the `leftIcon` shorthand from Phase 3.4.

**In design system docs:**

4. Document this as a pattern in `docs/design-system/patterns/ComplianceCelebration.tsx` showing the composed layout.

---

## Testing Checklist

### 4.1 — Motion
- [ ] `:root` in the `<style>` block contains `--duration-micro`, `--duration-quick`, `--duration-standard`, `--duration-slow`, `--duration-expressive`.
- [ ] `:root` contains `--ease-default`, `--ease-in`, `--ease-out`, `--ease-bounce`.
- [ ] `@media (prefers-reduced-motion: reduce)` rule exists and kills all transitions/animations.
- [ ] Existing transitions (sidebar expand, chevron rotation, button hover, card hover) still animate normally when reduced motion is NOT set.
- [ ] `docs/design-system/tokens/motion.css` exists with matching content.
- [ ] `docs/design-system/tokens/index.css` imports `motion.css`.

### 4.2 — Empty States
- [ ] Setting compliance data to 0 items shows "Let's get you compliant" empty state.
- [ ] Setting maintenance requests to empty array shows "All clear!" empty state.
- [ ] Setting error state shows "Something went wrong" with Retry button.
- [ ] Setting offline state shows "You're offline" with Retry button.
- [ ] `docs/design-system/constants/empty-states.ts` exists.

### 4.3 — Loading States
- [ ] `Skeleton` component defined in mockup.
- [ ] Skeleton shimmer animation plays.
- [ ] Skeleton shimmer respects `prefers-reduced-motion` (no animation, static opacity).
- [ ] On initial load, skeletons appear for ~1.5 seconds before real content.
- [ ] Compliance dashboard shows skeleton cards during loading.
- [ ] Maintenance view shows skeleton rows during loading.
- [ ] `docs/design-system/components/Feedback/Skeleton.tsx` exists.
- [ ] `docs/design-system/components/Feedback/Spinner.tsx` exists.
- [ ] Both exported from Feedback/index.ts, components/index.ts, and main index.ts.

### 4.4 — 100% Compliance Celebration
- [ ] Setting `compliancePct` to 100 shows celebration card with checkmark, heading, description, and "Download Compliance Report" button.
- [ ] Button uses `leftIcon` shorthand (not compound Button.Icon).
- [ ] Celebration card appears above the tab bar.
- [ ] `docs/design-system/patterns/ComplianceCelebration.tsx` exists.

### Regression Checks
- [ ] All Phase 1-3 functionality still works (focus rings, keyboard nav, responsive layout, URL sync, CSS tokens, typography variants, button shorthand, no hover useState).
- [ ] No visual regressions on desktop at 1280px.
