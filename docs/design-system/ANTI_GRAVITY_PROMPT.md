# PropertyPro Design System — Anti-Gravity Implementation Prompt

## Your Authoritative Source

**Follow the implementation plan exactly:**
`/docs/design-system/IMPLEMENTATION_PLAN.md`

This plan has been verified against authoritative sources (shadcn/ui, Vercel Geist, WCAG 2.1 AA, Linear design philosophy). Do not deviate from its specifications without explicit user approval.

**Understand existing conflicts before changing code:**
`/docs/design-system/CONFLICT_ANALYSIS.md`

This documents 12 conflicts between the current codebase and the implementation plan. Read this before modifying any file to understand what's broken and why.

---

## How to Use the Implementation Plan

1. **Read the full plan** before starting any work
2. **Follow the 4-phase structure** — complete Phase 1 (Critical) before moving to Phase 2
3. **Check the conflict analysis** before modifying any existing file
4. **Verify changes against the source references** listed in the plan's appendix

---

## Non-Negotiable Constraints

These are hard requirements that must not be violated under any circumstances:

### Accessibility (WCAG 2.1 AA)
- **Never** use `outline: none` without providing `:focus-visible` replacement
- **Always** ensure 4.5:1 contrast ratio for text
- **Always** make interactive elements keyboard-accessible (Enter + Space)
- **Always** use semantic HTML (`<button>`, `<table>`, `<th scope>`)

### Typography
- **Must** use Minor Third (1.2) scale — not Major Third (1.25)
- **Must** use rem units, never px for font sizes
- **Must** set base via `font-size: 93.75%` on `:root` (not px)

### Token Architecture
- **Must** use CSS custom properties as the runtime source of truth
- **Must** provide TypeScript types for IDE support
- **Do not** create deeply nested token objects (`semanticSpacing.inline.xs`)

### Performance
- **Never** use useState for hover/active visual states — use CSS
- **Never** create components that re-render on mouse movement

---

## Decision Points Requiring User Input

The conflict analysis identifies several decisions that need user confirmation before proceeding. **Stop and ask** when you encounter:

1. Base font size preference: 15px (current) vs 16px (browser default)
2. Token export method: CSS-only vs CSS+JS hybrid
3. Backward compatibility: Support old token paths or break them
4. Box primitive: Keep, refactor, or remove

---

## File References

| Document | Path | Purpose |
|----------|------|---------|
| Implementation Plan | `/docs/design-system/IMPLEMENTATION_PLAN.md` | Authoritative spec — follow this |
| Conflict Analysis | `/docs/design-system/CONFLICT_ANALYSIS.md` | What's broken in current code |
| Current Tokens | `/docs/design-system/tokens/index.ts` | Existing token system (has issues) |
| Current Button | `/docs/design-system/components/Button/Button.tsx` | Example of broken patterns |
| CSS Tokens | `/mockup/styles.css` | Parallel token system (conflicts) |
| Original Mockup | `/mockup/PropertyProRedesign.jsx` | Reference for intended UI |

---

## Verification Checklist

Before marking any phase complete, verify:

- [ ] All focus states visible via keyboard navigation
- [ ] No `outline: none` without `:focus-visible` replacement
- [ ] Font sizes use rem, not px
- [ ] Interactive elements respond to Enter and Space
- [ ] Changes match specifications in IMPLEMENTATION_PLAN.md
- [ ] No regressions introduced (check CONFLICT_ANALYSIS.md for known issues)

---

## When in Doubt

1. **Consult the implementation plan** — it has the verified answer
2. **Check the source references** — linked in the plan's appendix
3. **Ask the user** — especially for decision points listed above

Do not invent solutions. The plan exists to prevent drift.
