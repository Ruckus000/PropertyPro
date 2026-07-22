# Design System Wave 3 — Stripe Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the spec §3 visual policy — tinted elevation ladder, `tabular-nums` + DESIGN.md-compliant density in data tables, and the primary-button-scarcity rule — as token/component changes that land everywhere at once, gated on user screenshot sign-off.

**Architecture:** All visual change flows through two chokepoints established in Waves 0–2: token values in `packages/tokens/src/static.ts` (regenerated into `tokens.css`) and the canonical components in `apps/web/src/components/ui/`. The Tailwind `boxShadow` config currently *duplicates* elevation values — this plan repoints it to `var(--elevation-*)` so the ladder has one source and the default `shadow-sm`/`shadow` utilities (11 usages in ui components) join it.

**Tech Stack:** TypeScript, packages/tokens generator, Tailwind, shadcn table component.

**Spec:** `docs/superpowers/specs/2026-07-13-design-system-standardization-design.md` §3 (visual policy) + §6 (verification: before/after screenshots, user sign-off before merge).

**Prerequisite:** PR #776 (Waves 0–2) merged; branch off fresh `main`.

---

## Scope notes (verified against the codebase 2026-07-14)

- **"Ink, not black" is already satisfied:** `--text-primary` resolves to `gray-900 #111827`, which *is* deep slate ink (Tailwind's cool-gray ramp). Task 3 documents this; no value change.
- **Focus rings are already token-driven and visible** (`--focus-ring-color: var(--blue-500)`, 2px, offset 2px, `:focus-visible` global rule). No change; documented.
- **Interaction-state tokens already exist** (`--interactive-primary-hover/-active`, `--status-*-subtle`). No change.
- What actually changes visually: shadow tint (barely perceptible warm-up of elevation), table digits align, table cells gain 4px padding (8→12px per DESIGN.md's own spec), table row rules soften to `border-edge-subtle`.

---

### Task 1: Slate-tinted elevation ladder, single-sourced

**Files:**
- Modify: `packages/tokens/src/static.ts` (elevation values)
- Modify: `apps/web/tailwind.config.ts` (boxShadow block)
- Regenerates: `packages/ui/src/styles/tokens.css`, `packages/tokens/src/generated/tokens.css`

- [ ] **Step 1: Update elevation values in `static.ts`**

Replace the `elevation` map (slate-950 `#0F172A` = rgb(15,23,42) tint, alpha nudged up to compensate — Stripe-style tinted rather than pure-black shadows):

```ts
  elevation: {
    e0: "none",
    e1: "0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)",
    e2: "0 4px 6px rgba(15,23,42,0.06), 0 2px 4px rgba(15,23,42,0.04)",
    e3: "0 10px 15px rgba(15,23,42,0.08), 0 4px 6px rgba(15,23,42,0.05)",
  },
```

- [ ] **Step 2: Regenerate and inspect**

Run: `pnpm --filter @propertypro/tokens generate && git diff packages/ui/src/styles/tokens.css`
Expected: exactly the 3 elevation-value lines change (e1/e2/e3). Run `pnpm --filter @propertypro/tokens test` — sync + parity tests pass.

- [ ] **Step 3: Repoint Tailwind `boxShadow` to the tokens (kills the duplicate values) and fold the default utilities into the ladder**

In `apps/web/tailwind.config.ts`, replace the `boxShadow` block:

```ts
      boxShadow: {
        // Elevation ladder — values live in packages/tokens (static.ts).
        e0: "var(--elevation-e0)",
        e1: "var(--elevation-e1)",
        e2: "var(--elevation-e2)",
        e3: "var(--elevation-e3)",
        // Fold Tailwind's default utilities into the ladder so existing
        // shadow-sm / shadow / shadow-md / shadow-lg usages obey E0–E3.
        sm: "var(--elevation-e1)",
        DEFAULT: "var(--elevation-e1)",
        md: "var(--elevation-e2)",
        lg: "var(--elevation-e3)",
        xl: "var(--elevation-e3)",
        "2xl": "var(--elevation-e3)",
        none: "none",
      },
```

CAUTION: `boxShadow.none` must stay `"none"`. Do NOT remove `inner` implicitly — grep first: `grep -rn "shadow-inner" apps/web/src` → if used, keep `inner: "inset 0 2px 4px rgba(15,23,42,0.05)"`.

- [ ] **Step 4: Audit overlay components against the ladder**

Run: `grep -rn "shadow-md\|shadow-lg\|shadow-xl" apps/web/src/components/ui/*.tsx` — dropdowns/popovers/dialogs/sheets should land on md/lg (→ e2/e3, correct). Cards/inputs/buttons on sm/DEFAULT (→ e1). Fix any ui component using an overlay-tier shadow for a non-overlay surface (report, don't silently change others).

- [ ] **Step 5: Verify + commit**

Run: `pnpm --filter web typecheck && pnpm guard:token-coverage && pnpm guard:design-tokens && pnpm --filter web exec vitest run __tests__/components`
Expected: green (`var(--elevation-*)` in config is not a banned pattern).

```bash
git add packages/tokens/src/static.ts packages/ui/src/styles/tokens.css packages/tokens/src/generated/tokens.css apps/web/tailwind.config.ts
git commit -m "feat(design-system): slate-tinted elevation ladder, single-sourced through tokens"
```

### Task 2: Data tables — tabular figures + DESIGN.md density

**Files:**
- Modify: `apps/web/src/components/ui/table.tsx`

- [ ] **Step 1: Apply the changes**

Three surgical class edits (current classes verified 2026-07-14):

1. `Table` root: `"w-full caption-bottom text-sm"` → `"w-full caption-bottom text-sm tabular-nums"` (aligns every digit in every table — currency, counts, dates; no effect on non-numeric glyphs).
2. `TableHead`: `"h-10 px-2 …"` → `"h-10 px-3 …"` (12px cell padding per DESIGN.md's table spec; height stays 40px per spec).
3. `TableCell`: `"p-2 …"` → `"px-3 py-3 …"` (12px padding per spec).
4. `TableRow`: `"border-b …"` → `"border-b border-edge-subtle …"` (minimal row rules); `TableHeader`: `"[&_tr]:border-b"` → `"[&_tr]:border-b [&_tr]:border-edge"` (the header split stays one step stronger than row rules — "clear header split").

- [ ] **Step 2: Verify + commit**

Run: `pnpm --filter web typecheck && pnpm --filter web exec vitest run` (tests asserting table classes get updated in the same commit — report which).
Preview spot-check: `/esign?communityId=1` submissions table and one PM report table — digits aligned, rows read denser-but-airier, header rule visibly stronger than row rules.

```bash
git add apps/web/src/components/ui/table.tsx apps/web/__tests__
git commit -m "feat(design-system): tabular figures + spec density in canonical table"
```

### Task 3: Scarcity rule + polish no-ops documented

**Files:**
- Modify: `DESIGN.md`
- Modify: `.claude/rules/design.md`

- [ ] **Step 1: DESIGN.md**

Add to the visual-policy area (near the token-enforcement section):

```markdown
### Accent scarcity

- **One filled primary button per view region.** Everything else in that
  region is `outline`, `ghost`, or `link`. A "region" is a card, modal,
  page header, or form footer. (Review-checklist rule — not lint-enforceable.)
- Brand blue appears only on primary actions, focus rings, and active nav.
- Ink, not black: `--text-primary` is deep slate (#111827) by design — never
  introduce pure-black text.
- Shadows are slate-tinted and single-sourced from the elevation ladder
  (`--elevation-e0..e3`); Tailwind's `shadow-sm/md/lg` map onto E1/E2/E3.
  E2/E3 are overlays only.
```

- [ ] **Step 2: .claude/rules/design.md**

In the Colors & Surfaces section add: `- One filled primary button per view region (card/modal/header/form footer); everything else outline/ghost/link.` Update the elevation bullet to mention that Tailwind `shadow-sm/md/lg` now resolve to the E1/E2/E3 ladder.

- [ ] **Step 3: Commit**

```bash
git add DESIGN.md .claude/rules/design.md
git commit -m "docs(design-system): accent-scarcity rule; elevation/ink policy reflects Wave 3"
```

### Task 4: Before/after screenshot evidence

- [ ] **Step 1: Capture AFTER screenshots** (dev server + `/dev/agent-login?as=cam`, viewport 1280×720) of: `/dashboard`, `/esign` (table), one PM report with charts+table (`/pm/reports/...` as pm_admin or the dashboard reports section), `/meetings`, `/communities/1/documents`, one modal open (meeting detail). Save to the session scratchpad.
- [ ] **Step 2: Capture BEFORE screenshots** by checking out `main` in a temp worktree (`git worktree add /tmp/before-wave3 main`) and running its dev server on another port — same pages, same viewport. (If running two servers is impractical, capture BEFORE first, then the branch.)
- [ ] **Step 3: Assemble pairs** into the PR description (upload via `gh` or reference committed files under `docs/audits/wave3-polish-screenshots/` — prefer the PR-only route; do not commit binaries unless asked).

### Task 5: USER SIGN-OFF GATE (blocking) → PR

- [ ] **Step 1: Present the before/after pairs to the user** with a one-line description of each delta (shadow tint, digit alignment, table density). **STOP and wait for explicit approval. Do not open/merge the PR without it** — this gate is required by spec §6 for the visual-change wave.
- [ ] **Step 2: After approval:** `pnpm typecheck && pnpm lint && pnpm test && pnpm build` full gate, then push branch + `gh pr create` titled `feat(design-system): Wave 3 — Stripe polish (tinted elevation, tabular tables, accent scarcity)` with the screenshot pairs embedded.

---

## Not in this plan

- Wave 4 drain (raw-palette leaks, spinners→Skeleton, PageHeader adoption) — separate plan; worklist = `tsx scripts/verify-design-tokens.ts --report`.
- Any admin/mobile changes (baseline-frozen).
- Dark mode (no token theming exists; out of scope per spec).
