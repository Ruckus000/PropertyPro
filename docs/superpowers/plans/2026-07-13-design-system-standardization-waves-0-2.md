# Design System Standardization — Waves 0–2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One token source of truth (fully generated `tokens.css`), a `guard:design-tokens` CI guard with a shrink-only baseline, and one canonical component layer (shadcn/CVA) with the Button/Card/status-config/EmptyState duplicates collapsed.

**Architecture:** `packages/tokens` already generates the *color* sections of `packages/ui/src/styles/tokens.css` in place; Wave 0 extends the generator to emit the **entire** file (static non-color token maps + structural CSS template) so the file stops being hand-maintained. Wave 1 adds a legacy-roles-style guard (per-file ceiling baseline, ban outside it). Wave 2 migrates the 15 `packages/ui` Button files and 13 compound-Card files to the shadcn layer, consolidates the 3 status configs + esign fork into one definition, and de-duplicates the docs.

**Tech Stack:** TypeScript, tsx (script runner), Next.js 15 / React 19, Tailwind + CVA, vitest.

**Spec:** `docs/superpowers/specs/2026-07-13-design-system-standardization-design.md`

---

## Deviations from spec (decided at plan time, with reasons)

1. **Canonical status config lives in `packages/ui/src/constants/status.ts`, not `apps/web/src/lib/constants/status.ts`.** The spec said StatusBadge "reads the canonical config", but StatusBadge lives in `packages/ui`, which cannot import from an app. Moving StatusBadge into the app would churn 29 import sites for zero user value. Instead: `packages/ui` holds the definition (upgraded to the superset — see drift bug below), and the web copy becomes a re-export shim so its ~14 import sites don't change.
2. **The `packages/ui` Badge family (Badge/StatusBadge/PriorityBadge) is NOT deprecated.** The spec prose said "Button/Card/Badge get @deprecated", but its own end-state table keeps StatusBadge, and StatusBadge is built on this Badge. This family *is* the status-badge system (28 files use it). Only **Button and Card** are deprecated. `badge.tsx` (shadcn) is documented as the generic metadata badge; `packages/ui` Badge as the status family.
3. **`TransparencyDisabledEmptyState` is not absorbed into `EmptyState`.** It is a full-page hero (`<main>`, eyebrow text, h1), not a data-area empty state; absorbing it would bloat EmptyState with page-layout props. It already uses semantic tokens. Only `ChartEmptyState` is absorbed (it becomes a thin wrapper over `EmptyState`).
4. **"Interaction-state tokens" are a no-op.** `--interactive-primary-hover/-active` and `--status-*-subtle` already exist in `tokens.css`. Nothing to add in Wave 0; Wave 3 (polish, separate plan) may tune values.

## Drift bugs this plan fixes (found during planning)

- **Status config fork:** `packages/ui/src/constants/status.ts` has only **9** keys; `apps/web/src/lib/constants/status.ts` has **23** and adds `getStatusClasses()`. Consequence today: `<StatusBadge status="rejected" />` (and `canceled`, `open`, `draft`, `review`, …) silently falls back to the gray "Neutral" badge. Task 9 unifies on the 23-key superset.
- **Hand-edit drift risk in tokens.css:** the generator only patches color regions, so 68 non-color vars are hand-maintained with no sync check. Tasks 1–3 eliminate the hand-maintained region and add a sync test.

## Verified inventories (2026-07-13, this branch)

**Button migration files (15)** — files importing `Button` from `@propertypro/ui`:

```
apps/web/src/app/sign/[submissionExternalId]/[slug]/page.tsx
apps/web/src/components/transparency/transparency-toggle.tsx
apps/web/src/components/calendar/day-detail-panel.tsx
apps/web/src/components/calendar/month-grid.tsx
apps/web/src/components/calendar/meeting-detail-modal.tsx
apps/web/src/components/esign/submission-detail.tsx
apps/web/src/components/esign/new-submission-form.tsx
apps/web/src/components/esign/esign-page-shell.tsx
apps/web/src/components/esign/signature-capture.tsx
apps/web/src/components/compliance/compliance-command-center.tsx
apps/web/src/components/meetings/meetings-page-shell.tsx
apps/web/src/components/meetings/meeting-form.tsx
apps/web/src/components/documents/DocumentViewerModal.tsx
apps/web/src/components/onboarding/founding-aha-panel.tsx
apps/web/src/components/violations/ViolationsAdminInbox.tsx
```

6 of these use `loading` (transparency-toggle, meeting-detail-modal, compliance-command-center, meeting-form, meetings-page-shell, ViolationsAdminInbox). 1 uses `leftIcon`/`rightIcon`/`fullWidth` (month-grid). 0 use the compound `Button.Icon/.Label` API. (Task 7 Step 5's grep catches any file the inventory missed.)

**Card compound-API files (13):**

```
apps/web/src/components/transparency/portal-status-section.tsx
apps/web/src/components/transparency/meeting-notice-table.tsx
apps/web/src/components/transparency/transparency-toggle.tsx
apps/web/src/components/transparency/document-checklist-section.tsx
apps/web/src/components/transparency/transparency-page.tsx
apps/web/src/components/transparency/minutes-availability-grid.tsx
apps/web/src/components/transparency/scope-notice.tsx
apps/web/src/components/calendar/meeting-detail-modal.tsx
apps/web/src/components/calendar/month-grid.tsx
apps/web/src/components/calendar/day-detail-panel.tsx
apps/web/src/components/meetings/meeting-form.tsx
apps/web/src/components/meetings/meetings-page-shell.tsx
apps/web/src/components/onboarding/founding-aha-panel.tsx
```

---

# WAVE 0 — Token truth

### Task 1: Static (non-color) token definitions in `packages/tokens`

**Files:**
- Create: `packages/tokens/src/static.ts`
- Modify: `packages/tokens/src/index.ts` (add export)
- Test: `packages/tokens/__tests__/static.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/tokens/__tests__/static.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { staticTokens } from "../src/static";

describe("static tokens", () => {
  it("spacing follows the 4px grid", () => {
    expect(staticTokens.spacing["1"]).toBe("4px");
    expect(staticTokens.spacing["6"]).toBe("24px");
    expect(staticTokens.spacing["20"]).toBe("80px");
  });

  it("radius scale matches DESIGN.md", () => {
    expect(staticTokens.radius.sm).toBe("6px");
    expect(staticTokens.radius.md).toBe("10px");
    expect(staticTokens.radius.full).toBe("9999px");
  });

  it("focus ring references primitive vars, not raw hex", () => {
    expect(staticTokens.focus["focus-ring-color"]).toBe("var(--blue-500)");
    expect(staticTokens.focus["focus-ring-color-danger"]).toBe("var(--red-500)");
  });

  it("elevation ladder is E0-none through E3", () => {
    expect(staticTokens.elevation.e0).toBe("none");
    expect(staticTokens.elevation.e3).toContain("0 10px 15px");
  });

  it("nav tokens resolve only to semantic vars (no raw hex)", () => {
    for (const value of Object.values(staticTokens.nav)) {
      expect(value).toMatch(/^var\(--/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @propertypro/tokens exec vitest run __tests__/static.test.ts`
Expected: FAIL — `Cannot find module '../src/static'`

- [ ] **Step 3: Create `packages/tokens/src/static.ts`**

Values transcribed exactly from the current `packages/ui/src/styles/tokens.css` (lines 99–166, 257–261, 353–371, 379–387):

```ts
/**
 * Static (non-color) design tokens.
 *
 * Unlike semantic color tokens (semantic.ts), these are plain values with no
 * primitive-reference indirection. They are the single source for the
 * spacing / radius / typography / motion / sizing / focus / elevation / nav
 * variable blocks in the generated tokens.css.
 */

export const staticTokens = {
  /** 4px base grid — key is the token suffix (--space-<key>) */
  spacing: {
    "1": "4px",
    "2": "8px",
    "3": "12px",
    "4": "16px",
    "5": "20px",
    "6": "24px",
    "8": "32px",
    "12": "48px",
    "16": "64px",
    "20": "80px",
  },

  radius: {
    sm: "6px",
    md: "10px",
    lg: "16px",
    xl: "20px",
    "2xl": "24px",
    full: "9999px",
  },

  fontFamily: {
    sans: `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`,
    mono: `"JetBrains Mono", "SF Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`,
  },

  /** value + px annotation for the generated comment */
  fontSize: {
    xs: { value: "0.75rem", px: "12px" },
    sm: { value: "0.875rem", px: "14px" },
    base: { value: "1rem", px: "16px" },
    lg: { value: "1.125rem", px: "18px" },
    xl: { value: "1.25rem", px: "20px" },
    "2xl": { value: "1.5rem", px: "24px" },
    "3xl": { value: "1.875rem", px: "30px" },
  },

  /** .large-text accessibility overrides (value + annotation) */
  fontSizeLargeText: {
    xs: { value: "0.875rem", note: "14px (default 12px)" },
    sm: { value: "1rem", note: "16px (default 14px)" },
    base: { value: "1.125rem", note: "18px (default 16px)" },
    lg: { value: "1.25rem", note: "20px (default 18px)" },
    xl: { value: "1.5rem", note: "24px (default 20px)" },
    "2xl": { value: "1.75rem", note: "28px (default 24px)" },
    "3xl": { value: "2.125rem", note: "34px (default 30px)" },
  },

  motionDuration: {
    instant: "0ms",
    micro: "100ms",
    quick: "150ms",
    standard: "250ms",
    slow: "350ms",
    expressive: "500ms",
  },

  ease: {
    standard: "cubic-bezier(0.4, 0, 0.2, 1)",
    enter: "cubic-bezier(0, 0, 0.2, 1)",
    exit: "cubic-bezier(0.4, 0, 1, 1)",
    bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  },

  /** Mobile-first sizing; overridden at >=768px by sizingDesktop */
  sizing: {
    "touch-target-min": "44px",
    "pointer-target-min": "36px",
    "component-padding": "var(--space-4)",
    "component-gap": "var(--space-3)",
    "input-height": "48px",
    "button-height": "48px",
  },

  /** @media (min-width: 768px) overrides */
  sizingDesktop: {
    "component-padding": "var(--space-3)",
    "component-gap": "var(--space-2)",
    "input-height": "40px",
    "button-height": "40px",
    "touch-target-min": "36px",
  },

  focus: {
    "focus-ring-color": "var(--blue-500)",
    "focus-ring-offset": "2px",
    "focus-ring-width": "2px",
    "focus-ring-style": "solid",
    "focus-ring-color-danger": "var(--red-500)",
    "focus-ring-color-inverse": "var(--gray-0)",
  },

  elevation: {
    e0: "none",
    e1: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
    e2: "0 4px 6px rgba(0,0,0,0.04), 0 2px 4px rgba(0,0,0,0.02)",
    e3: "0 10px 15px rgba(0,0,0,0.06), 0 4px 6px rgba(0,0,0,0.03)",
  },

  /** Sidebar nav tokens — resolve ONLY to semantic tokens, never raw hex */
  nav: {
    "nav-surface": "var(--surface-card)",
    "nav-text-active": "var(--text-primary)",
    "nav-text-inactive": "var(--text-secondary)",
    "nav-text-muted": "var(--text-tertiary)",
    "nav-bg-active": "var(--surface-muted)",
    "nav-bg-hover": "var(--surface-hover)",
    "nav-divider": "var(--border-subtle)",
    "nav-border-divider": "var(--border-default)",
    "nav-badge-bg": "var(--surface-muted)",
    "nav-badge-border": "var(--surface-card)",
    "nav-indicator": "var(--interactive-primary)",
  },
} as const;

export type StaticTokens = typeof staticTokens;
```

- [ ] **Step 4: Export from `packages/tokens/src/index.ts`**

Add to the existing exports:

```ts
export { staticTokens, type StaticTokens } from './static';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @propertypro/tokens exec vitest run __tests__/static.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/tokens/src/static.ts packages/tokens/src/index.ts packages/tokens/__tests__/static.test.ts
git commit -m "feat(tokens): static non-color token definitions (spacing/radius/type/motion/sizing/focus/elevation/nav)"
```

### Task 2: Generator emits the entire tokens.css (no hand-maintained region)

**Files:**
- Modify: `packages/tokens/scripts/build.ts` (replace the patch-in-place logic)
- Regenerates: `packages/ui/src/styles/tokens.css`, `packages/tokens/src/generated/tokens.css`

The current `build.ts` patches only the two color regions of the UI file (`updateUiTokensCSS`). Replace with full-file generation: variable blocks come from `primitiveColors` / `tokenDefinitions` / `staticTokens`; structural CSS (focus rules, skip-link, reduced-motion, responsive-density media queries, `.large-text`) is a template inside the generator.

**Acceptance criterion:** after running the new generator, `git diff packages/ui/src/styles/tokens.css` shows ONLY: (a) a new "GENERATED FILE" header comment, (b) removal of the now-false "this block is hand-maintained" NOTE in the nav section, (c) the `--font-mono` declaration normalized from two physical lines to one. Every variable name and value is byte-identical.

- [ ] **Step 1: Rewrite `packages/tokens/scripts/build.ts`**

Keep `buildPrimitiveBlock()` and `buildSemanticBlock()` exactly as they are (they already produce the color blocks). Delete `updateUiTokensCSS()` and `generateStandaloneCSS()`. Add block builders for static tokens and a full-file assembler, and export the assembler for the sync test:

```ts
/**
 * CSS token generator — emits the ENTIRE packages/ui/src/styles/tokens.css.
 *
 * Sources:
 *   - primitives.ts   → primitive color vars
 *   - semantic.ts     → semantic color vars
 *   - static.ts       → spacing/radius/typography/motion/sizing/focus/elevation/nav
 *   - this template   → structural CSS (focus rules, media queries, .large-text)
 *
 * Also writes the same content to packages/tokens/src/generated/tokens.css
 * (the `@propertypro/tokens/styles.css` export).
 */
import fs from "node:fs";
import path from "node:path";
import { primitiveColors } from "../src/primitives";
import { tokenDefinitions, toCssValue, type TokenRef } from "../src/semantic";
import { staticTokens } from "../src/static";

// … keep toKebab, buildSemanticVars, buildPrimitiveBlock, buildSemanticBlock unchanged …

function vars(prefix: string, map: Record<string, string>, indent = "  "): string {
  return Object.entries(map)
    .map(([k, v]) => `${indent}--${prefix}${k}: ${v};`)
    .join("\n");
}

function buildStaticPrimitivesBlock(): string {
  const s = staticTokens;
  const fontSizes = Object.entries(s.fontSize)
    .map(([k, { value, px }]) => `  --font-size-${k}: ${value};${" ".repeat(Math.max(1, 9 - value.length))}/* ${px} */`)
    .join("\n");
  const durations = vars("motion-duration-", s.motionDuration);
  const durationAliases = Object.keys(s.motionDuration)
    .map((k) => `  --duration-${k}: var(--motion-duration-${k});`)
    .join("\n");
  return [
    `  /* Spacing (4px base unit) */`,
    vars("space-", s.spacing),
    ``,
    `  /* Radius */`,
    vars("radius-", s.radius),
    ``,
    `  /* Typography */`,
    `  font-size: 16px;`,
    `  --font-sans: ${s.fontFamily.sans};`,
    `  --font-mono: ${s.fontFamily.mono};`,
    fontSizes,
    ``,
    `  /* Motion */`,
    durations,
    ``,
    durationAliases,
    ``,
    vars("ease-", s.ease),
    ``,
    `  /* Sizing — responsive density */`,
    vars("", s.sizing),
    ``,
    `  /* Focus */`,
    vars("", s.focus),
  ].join("\n");
}

function buildElevationBlock(): string {
  return ["  /* Elevation */", vars("elevation-", staticTokens.elevation)].join("\n");
}

const STRUCTURAL_TAIL = `/* ═══════════════════════════════════════════════════════════════════════════
   RESPONSIVE DENSITY
   ═══════════════════════════════════════════════════════════════════════════ */

@media (min-width: 768px) {
  :root {
${vars("", staticTokens.sizingDesktop, "    ")}
  }
}

/* … FOCUS / MOTION sections … */
`;
// NOTE for implementer: STRUCTURAL_TAIL must contain, verbatim from the current
// tokens.css lines 278–387: the FOCUS section (:focus-visible rule, skip-link,
// forced-colors), the MOTION reduced-motion section, the NAVIGATION :root block
// (emitted via vars("", staticTokens.nav) with its explanatory comment, MINUS the
// "hand-maintained" NOTE sentence), and the LARGE TEXT MODE block (emitted from
// staticTokens.fontSizeLargeText with its comments). Copy the exact text; only
// variable declarations are interpolated.

export function generateFullCSS(): string {
  return [
    `/* PropertyPro Design System — CSS Custom Properties */`,
    ``,
    `/* GENERATED FILE — do not edit by hand.`,
    `   Source: packages/tokens (primitives.ts / semantic.ts / static.ts).`,
    `   Regenerate: pnpm --filter @propertypro/tokens generate */`,
    ``,
    `/* ═══════════════════════════════════════════════════════════════════════════`,
    `   PRIMITIVES`,
    `   ═══════════════════════════════════════════════════════════════════════════ */`,
    ``,
    `:root {`,
    buildPrimitiveBlock().replace("  /* Primitive Colors */", "  /* Colors */"),
    ``,
    buildStaticPrimitivesBlock(),
    `}`,
    ``,
    `/* ═══════════════════════════════════════════════════════════════════════════`,
    `   SEMANTIC TOKENS`,
    `   ═══════════════════════════════════════════════════════════════════════════ */`,
    ``,
    `:root {`,
    buildSemanticBlock(),
    ``,
    buildElevationBlock(),
    `}`,
    ``,
    STRUCTURAL_TAIL,
  ].join("\n");
}

// ── Main (skipped when imported by tests) ──
if (require.main === module) {
  const tokensDir = path.resolve(__dirname, "..");
  const generatedCssPath = path.resolve(tokensDir, "src/generated/tokens.css");
  const uiCssPath = path.resolve(tokensDir, "../../packages/ui/src/styles/tokens.css");
  const css = generateFullCSS();
  fs.mkdirSync(path.dirname(generatedCssPath), { recursive: true });
  fs.writeFileSync(generatedCssPath, css, "utf-8");
  fs.writeFileSync(uiCssPath, css, "utf-8");
  console.log(`  Generated: ${generatedCssPath}`);
  console.log(`  Generated: ${uiCssPath}`);
}
```

The implementer fills `STRUCTURAL_TAIL` by copying the current file's sections verbatim (they are structural CSS, not variables — the only interpolations are the three `vars(...)` blocks noted above). Iterate against Step 2's diff until only the three allowed differences remain.

- [ ] **Step 2: Generate and inspect the diff**

Run: `pnpm --filter @propertypro/tokens generate && git diff packages/ui/src/styles/tokens.css`
Expected: diff contains ONLY (a) the GENERATED header, (b) removed "hand-maintained" NOTE sentence, (c) `--font-mono` single-line normalization. If any variable line changed, fix the builders — never the values.

- [ ] **Step 3: Verify generated standalone file and existing tests**

Run: `pnpm --filter @propertypro/tokens test`
Expected: PASS — the parity test asserts `src/generated/tokens.css` contains every primitive and semantic value; the full file is a superset, so it still passes. If the indentation test fails, match two-space indentation in the builders.

- [ ] **Step 4: Confirm nothing imports the standalone CSS with color-only expectations**

Run: `grep -rn "tokens/styles.css\|@propertypro/tokens/styles" apps packages --include="*.{ts,tsx,css,json}" | grep -v node_modules | grep -v "packages/tokens/package.json"`
Expected: no output (audit found no importers). If any appear, list them in the PR description and verify they tolerate the full file (it now includes `:focus-visible` rules etc.).

- [ ] **Step 5: Visual smoke check**

Start the dev server (`preview_start("web")`), load `/dashboard` via `/dev/agent-login?as=founding_admin`, and confirm zero visual change (colors, spacing, focus ring on tab). Take one screenshot for the PR.

- [ ] **Step 6: Commit**

```bash
git add packages/tokens/scripts/build.ts packages/tokens/src/generated/tokens.css packages/ui/src/styles/tokens.css
git commit -m "feat(tokens): generator emits entire tokens.css — hand-maintained region eliminated"
```

### Task 3: Sync test — the checked-in CSS always matches the generator

**Files:**
- Create: `packages/tokens/__tests__/sync.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { generateFullCSS } from "../scripts/build";

describe("tokens.css sync", () => {
  it("packages/ui/src/styles/tokens.css is exactly the generator output (no hand edits)", () => {
    const uiCss = fs.readFileSync(
      path.resolve(__dirname, "../../ui/src/styles/tokens.css"),
      "utf-8",
    );
    expect(uiCss).toBe(generateFullCSS());
  });

  it("src/generated/tokens.css is exactly the generator output", () => {
    const genCss = fs.readFileSync(
      path.resolve(__dirname, "../src/generated/tokens.css"),
      "utf-8",
    );
    expect(genCss).toBe(generateFullCSS());
  });
});
```

- [ ] **Step 2: Run to verify it passes** (it must, right after Task 2)

Run: `pnpm --filter @propertypro/tokens test`
Expected: PASS. Then hand-edit one char in `packages/ui/src/styles/tokens.css`, re-run, verify FAIL, revert the edit (`git checkout -- packages/ui/src/styles/tokens.css`).

- [ ] **Step 3: Commit**

```bash
git add packages/tokens/__tests__/sync.test.ts
git commit -m "test(tokens): sync test pins tokens.css to generator output"
```

### Task 4: Consumption-coverage guard (`guard:token-coverage`)

**Files:**
- Create: `scripts/verify-token-coverage.ts`
- Modify: root `package.json` (add `guard:token-coverage` script; append to `lint` chain after `guard:legacy-roles`)

- [ ] **Step 1: Write the script**

```ts
/**
 * Token consumption-coverage guard.
 *
 * Collects every CSS custom property REFERENCED (`var(--x)`) in app source and
 * Tailwind configs, and every property DEFINED (`--x:`) in any repo CSS file or
 * TS/TSX inline style, then fails if a referenced property has no definition.
 * Catches "the generator dropped a variable some page relies on".
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REFERENCE_ROOTS = ['apps/web/src', 'apps/admin/src', 'packages/ui/src'];
const REFERENCE_EXTRA = ['apps/web/tailwind.config.ts', 'apps/admin/tailwind.config.ts'];
const DEFINITION_ROOTS = ['apps', 'packages'];

// Properties defined at runtime or by third parties — never flag.
const DYNAMIC_PREFIXES = ['--tw-', '--theme-', '--radix-', '--rt-'];
// Individual known-dynamic vars (populate from --report output during rollout).
const DYNAMIC_ALLOWLIST = new Set<string>([]);

function* walk(dir: string, exts: RegExp): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry.startsWith('.') || entry === 'dist') continue;
    if (statSync(full).isDirectory()) yield* walk(full, exts);
    else if (exts.test(entry)) yield full;
  }
}

const REF_RE = /var\(\s*(--[a-zA-Z0-9-]+)/g;
const DEF_RE = /(--[a-zA-Z0-9-]+)\s*:/g;

const referenced = new Map<string, string[]>(); // var -> example files
for (const root of REFERENCE_ROOTS) {
  for (const file of walk(root, /\.(ts|tsx|css)$/)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(REF_RE)) {
      const v = m[1]!;
      if (!referenced.has(v)) referenced.set(v, []);
      const files = referenced.get(v)!;
      if (files.length < 3) files.push(file);
    }
  }
}
for (const file of REFERENCE_EXTRA) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(REF_RE)) {
    const v = m[1]!;
    if (!referenced.has(v)) referenced.set(v, []);
    referenced.get(v)!.push(file);
  }
}

const defined = new Set<string>();
for (const root of DEFINITION_ROOTS) {
  for (const file of walk(root, /\.(css|ts|tsx)$/)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(DEF_RE)) defined.add(m[1]!);
  }
}

const missing = [...referenced.entries()].filter(
  ([v]) =>
    !defined.has(v) &&
    !DYNAMIC_ALLOWLIST.has(v) &&
    !DYNAMIC_PREFIXES.some((p) => v.startsWith(p)),
);

if (process.argv.includes('--report')) {
  missing.forEach(([v, files]) => console.log(`${v}\n    ${files.join('\n    ')}`));
  console.log(`\n${missing.length} referenced-but-undefined properties`);
  process.exit(0);
}

if (missing.length > 0) {
  console.error('guard:token-coverage — CSS custom properties referenced but defined nowhere:');
  missing.forEach(([v, files]) => console.error(`  ${v}  (e.g. ${files[0]})`));
  console.error('Define the token in packages/tokens, or add to DYNAMIC_ALLOWLIST with a comment.');
  process.exit(1);
}
console.log(`guard:token-coverage OK — ${referenced.size} referenced properties all defined.`);
```

- [ ] **Step 2: Run `--report` and triage**

Run: `tsx scripts/verify-token-coverage.ts --report`
Expected: a (possibly empty) list. For each hit, either it's a genuine missing definition (fix in `packages/tokens`) or a runtime-injected var (add to `DYNAMIC_ALLOWLIST` with a `// <file>: injected by <what>` comment). Iterate until the plain run exits 0.

- [ ] **Step 3: Wire into `package.json`**

Add to `scripts`: `"guard:token-coverage": "tsx scripts/verify-token-coverage.ts"`, and append `&& pnpm guard:token-coverage` to the `lint` script chain.

- [ ] **Step 4: Verify and commit**

Run: `pnpm guard:token-coverage`
Expected: `guard:token-coverage OK`.

```bash
git add scripts/verify-token-coverage.ts package.json
git commit -m "feat(guard): token consumption-coverage guard (guard:token-coverage)"
```

**Wave 0 gate:** `pnpm typecheck && pnpm lint && pnpm test` all green; open PR titled `feat(design-system): Wave 0 — single generated token source`.

---

# WAVE 1 — `guard:design-tokens`

### Task 5: Guard script with shrink-only baseline

**Files:**
- Create: `scripts/verify-design-tokens.ts`
- Create: `scripts/design-token-baseline.json` (generated)
- Modify: root `package.json` (script + lint chain)

- [ ] **Step 1: Write the script**

Model: `scripts/verify-legacy-roles.ts` (per-file ceilings, ban outside allowlist, `--report`, slack hint). Baseline lives in JSON because it will span hundreds of files.

```ts
/**
 * guard:design-tokens — bans raw colors / arbitrary values in app code.
 *
 * Rules (per line, in .ts/.tsx/.css under apps/{web,admin}/src):
 *   raw-hex          #RRGGBB / #RGB[A] color literals
 *   raw-palette      Tailwind palette classes (bg-blue-500, text-gray-600, …)
 *   arbitrary-color  bg-[#…] / text-[#…] / border-[#…] / ring-[…rgb…]
 *   arbitrary-font   text-[NNpx]
 *   arbitrary-space  p-[NNpx] / m-[NNpx] / gap-[NNpx] etc.
 *
 * Baseline: scripts/design-token-baseline.json — { file: { rule: count } }.
 * A file may not exceed its baselined count per rule; unbaselined files must be
 * clean. Renamed/moved files must arrive clean OR update the baseline in the
 * same PR (the diff makes this reviewable). Baseline only shrinks over time.
 *
 * Escape hatch: a line containing `design-tokens:exempt` is skipped (use for
 * email-template hex, chart/canvas internals — always append a reason).
 *
 * Run `--selftest` (also runs first in CI mode) to check the rules against
 * embedded fixtures. `--report` prints violations; `--write-baseline` rewrites
 * the baseline from current state (initial adoption / reviewed shrinks only).
 */
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['apps/web/src', 'apps/admin/src'];
const BASELINE_PATH = 'scripts/design-token-baseline.json';

const PALETTE_NAMES =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const CLASS_PREFIXES =
  'bg|text|border|ring|fill|stroke|divide|outline|decoration|accent|caret|shadow|from|via|to';

const RULES: Record<string, RegExp> = {
  'raw-hex': /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g,
  'raw-palette': new RegExp(
    `\\b(?:${CLASS_PREFIXES})-(?:${PALETTE_NAMES})-(?:25|50|100|200|300|400|500|600|700|800|900|950)\\b`,
    'g',
  ),
  'arbitrary-color': new RegExp(`\\b(?:${CLASS_PREFIXES})-\\[(?:#|rgb|hsl|oklch)`, 'g'),
  'arbitrary-font': /\btext-\[\d+(?:\.\d+)?px\]/g,
  'arbitrary-space': /\b(?:p|px|py|ps|pe|pt|pr|pb|pl|m|mx|my|ms|me|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y)-\[\d+(?:\.\d+)?px\]/g,
};

type Counts = Record<string, number>;

function scanContent(src: string): Counts {
  const counts: Counts = {};
  for (const line of src.split('\n')) {
    if (line.includes('design-tokens:exempt')) continue;
    for (const [rule, re] of Object.entries(RULES)) {
      const n = (line.match(re) ?? []).length;
      if (n > 0) counts[rule] = (counts[rule] ?? 0) + n;
    }
  }
  return counts;
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx|css)$/.test(entry)) yield full;
  }
}

// ── Selftest ──
function selftest(): void {
  const cases: Array<[string, string, number]> = [
    ['raw-hex', `const c = '#2563eb';`, 1],
    ['raw-hex', `border: 1px solid #d1d5db; color: #fff`, 2],
    ['raw-palette', `<div className="bg-blue-500 text-gray-600 dark:bg-red-50">`, 3],
    ['raw-palette', `<div className="bg-surface-card text-content">`, 0],
    ['arbitrary-color', `className="bg-[#0f0f0f] text-[rgb(0,0,0)]"`, 2],
    ['arbitrary-font', `className="text-[13px] text-sm"`, 1],
    ['arbitrary-space', `className="p-[13px] mt-[7px] gap-4"`, 2],
    ['raw-hex', `const c = '#2563eb'; // design-tokens:exempt — email template`, 0],
  ];
  for (const [rule, input, expected] of cases) {
    const got = scanContent(input)[rule] ?? 0;
    if (got !== expected) {
      console.error(`SELFTEST FAIL [${rule}] expected ${expected}, got ${got} for: ${input}`);
      process.exit(1);
    }
  }
}
selftest();
if (process.argv.includes('--selftest')) {
  console.log('guard:design-tokens selftest OK');
  process.exit(0);
}

// ── Scan ──
const current = new Map<string, Counts>();
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const counts = scanContent(readFileSync(file, 'utf8'));
    if (Object.keys(counts).length > 0) current.set(file, counts);
  }
}

if (process.argv.includes('--write-baseline')) {
  const sorted = Object.fromEntries([...current.entries()].sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE_PATH, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`Baseline written: ${BASELINE_PATH} (${current.size} files)`);
  process.exit(0);
}

const baseline: Record<string, Counts> = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  : {};

if (process.argv.includes('--report')) {
  let total = 0;
  for (const [file, counts] of [...current.entries()].sort()) {
    const summary = Object.entries(counts).map(([r, n]) => `${r}:${n}`).join(' ');
    const base = baseline[file] ? '' : '  NOT BASELINED';
    console.log(`${file}  ${summary}${base}`);
    total += Object.values(counts).reduce((a, b) => a + b, 0);
  }
  console.log(`\nTOTAL: ${total} violations in ${current.size} files`);
  process.exit(0);
}

const violations: string[] = [];
for (const [file, counts] of current) {
  const base = baseline[file] ?? {};
  for (const [rule, n] of Object.entries(counts)) {
    const ceiling = base[rule] ?? 0;
    if (n > ceiling) {
      violations.push(
        `  ${file} [${rule}]: ${n} > baseline ${ceiling}. Use semantic tokens ` +
          `(see .claude/rules/design.md), or append "// design-tokens:exempt — <reason>".`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error('guard:design-tokens — raw colors / arbitrary values exceed the baseline:');
  console.error(violations.join('\n'));
  process.exit(1);
}

// Slack hint — files now below baseline (a drain happened): tighten when convenient.
const slack: string[] = [];
for (const [file, base] of Object.entries(baseline)) {
  const cur = current.get(file) ?? {};
  for (const [rule, ceiling] of Object.entries(base)) {
    if ((cur[rule] ?? 0) < ceiling) slack.push(`  ${file} [${rule}]: now ${cur[rule] ?? 0}, baseline ${ceiling}`);
  }
}
if (slack.length > 0) {
  console.log('guard:design-tokens — baseline slack (run --write-baseline in a reviewed PR to tighten):');
  slack.slice(0, 20).forEach((s) => console.log(s));
  if (slack.length > 20) console.log(`  … and ${slack.length - 20} more`);
}
console.log(`guard:design-tokens OK — ${current.size} files within baseline.`);
```

- [ ] **Step 2: Selftest**

Run: `tsx scripts/verify-design-tokens.ts --selftest`
Expected: `guard:design-tokens selftest OK`. Fix regexes if any fixture fails.

- [ ] **Step 3: Generate baseline and sanity-check the totals**

Run: `tsx scripts/verify-design-tokens.ts --write-baseline && tsx scripts/verify-design-tokens.ts --report | tail -5`
Expected: baseline JSON written; totals in the ballpark of the audit (web ~414 raw-palette + 77 hex + ~130 arbitrary-font; admin ~1190 raw-palette + 22 hex). Skim the report for obvious false positives (e.g. hex in non-color contexts like ids/urls); if found, refine the rule regex and regenerate.

- [ ] **Step 4: Verify guard passes, then fails on new violation**

Run: `tsx scripts/verify-design-tokens.ts`
Expected: `guard:design-tokens OK`.
Then add `className="bg-blue-500"` to any clean file, re-run, expect exit 1 with that file named; revert.

- [ ] **Step 5: Wire into `package.json`**

Add `"guard:design-tokens": "tsx scripts/verify-design-tokens.ts"` and append `&& pnpm guard:design-tokens` to `lint`.

- [ ] **Step 6: Update `.claude/rules/design.md`**

Add under a new `## Token enforcement` heading:

```markdown
- `pnpm guard:design-tokens` bans raw hex, raw Tailwind palette classes
  (`bg-blue-500`), arbitrary colors (`bg-[#…]`), arbitrary font sizes
  (`text-[13px]`), and arbitrary pixel spacing (`p-[13px]`) in `apps/*/src`.
- Existing violations are frozen in `scripts/design-token-baseline.json`
  (shrink-only; per-file, per-rule ceilings). New code must be clean.
- Escape hatch: `// design-tokens:exempt — <reason>` on the offending line
  (email-template hex, chart/canvas internals).
- Renamed/moved files must arrive clean or update the baseline in the same PR.
```

- [ ] **Step 7: Full lint + commit**

Run: `pnpm lint`
Expected: all guards green including the new one.

```bash
git add scripts/verify-design-tokens.ts scripts/design-token-baseline.json package.json .claude/rules/design.md
git commit -m "feat(guard): guard:design-tokens — raw color/arbitrary-value ban with shrink-only baseline"
```

**Wave 1 gate:** open PR titled `feat(design-system): Wave 1 — guard:design-tokens`. Drift is now stopped.

---

# WAVE 2 — Component collapse

### Task 6: `loading` prop on the canonical shadcn Button

**Files:**
- Modify: `apps/web/src/components/ui/button.tsx`
- Test: `apps/web/__tests__/components/ui/button.test.tsx` (create; follow the existing test layout under `apps/web/__tests__/`)

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Button } from "@/components/ui/button";

describe("Button loading", () => {
  it("disables the button and shows a spinner when loading", () => {
    render(<Button loading>Save</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("data-loading")).toBe("true");
    expect(btn.querySelector("svg.animate-spin")).not.toBeNull();
  });

  it("renders children and no spinner when not loading", () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole("button");
    expect(btn).not.toBeDisabled();
    expect(btn.querySelector("svg.animate-spin")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run __tests__/components/ui/button.test.tsx`
Expected: FAIL — `loading` prop not recognized / no spinner rendered.

- [ ] **Step 3: Implement**

In `apps/web/src/components/ui/button.tsx`, add `Loader2` and the prop (spinner only in the non-`asChild` path — `Slot` requires exactly one child):

```tsx
import { Loader2 } from "lucide-react"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Shows a spinner and disables the button. Ignored when asChild. */
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        data-loading={loading ? "true" : "false"}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
            {children}
          </>
        )}
      </Comp>
    )
  }
)
```

(`[&_svg]:size-4` in `buttonVariants` base classes sizes the spinner automatically.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web exec vitest run __tests__/components/ui/button.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/button.tsx apps/web/__tests__/components/ui/button.test.tsx
git commit -m "feat(ui): loading prop on canonical Button"
```

### Task 7: Migrate the 15 packages/ui Button files

**Files:** the 15 files inventoried above (edit imports + call sites only).

**Transformation recipe (apply per call site):**

| packages/ui | shadcn canonical |
|---|---|
| `import { Button } from '@propertypro/ui'` | `import { Button } from '@/components/ui/button'` (keep other `@propertypro/ui` named imports — Badge, StatusBadge, Card until Task 8 — in a separate import line) |
| `variant="primary"` / no variant | `variant="default"` / omit |
| `variant="secondary"` | `variant="outline"` (pp secondary = bordered transparent → shadcn `outline`, NOT shadcn `secondary` which is filled) |
| `variant="ghost"` | `variant="ghost"` |
| `variant="danger"` | `variant="destructive"` (visual change: subtle red → filled red; expected, matches Stripe policy) |
| `variant="link"` | `variant="link"` |
| `size="sm"` | `size="sm"` |
| `size="md"` / no size | omit (`default`) |
| `size="lg"` | `size="lg"` |
| `fullWidth` | `className="w-full"` (merge into existing className) |
| `leftIcon={<X />}` | `<X aria-hidden="true" />` as first child (auto-sized by `[&_svg]:size-4`) |
| `rightIcon={<X />}` | `<X aria-hidden="true" />` as last child |
| `loading={x}` | `loading={x}` (Task 6 prop) |

**Worked example** (shape found in `transparency-toggle.tsx`):

```tsx
// BEFORE
import { Button, Card } from '@propertypro/ui';
<Button variant="secondary" size="sm" loading={isPending} onClick={toggle}>
  {enabled ? 'Disable' : 'Enable'}
</Button>

// AFTER
import { Card } from '@propertypro/ui';
import { Button } from '@/components/ui/button';
<Button variant="outline" size="sm" loading={isPending} onClick={toggle}>
  {enabled ? 'Disable' : 'Enable'}
</Button>
```

- [ ] **Step 1: Migrate batch A — esign + sign page (5 files)**
  `esign/submission-detail.tsx`, `esign/new-submission-form.tsx`, `esign/esign-page-shell.tsx`, `esign/signature-capture.tsx`, `app/sign/[submissionExternalId]/[slug]/page.tsx`
- [ ] **Step 2: Typecheck + spot-check batch A**
  Run: `pnpm --filter web typecheck`. Then in the preview (`/dev/agent-login?as=founding_admin`, then `/esign/templates` and an esign submission page): buttons render, click targets work, no layout break. Buttons are ~4px shorter (40→36px) — expected per spec.
- [ ] **Step 3: Migrate batch B — calendar + meetings (5 files)**
  `calendar/day-detail-panel.tsx`, `calendar/month-grid.tsx` (also `fullWidth`/`leftIcon` here), `calendar/meeting-detail-modal.tsx`, `meetings/meetings-page-shell.tsx`, `meetings/meeting-form.tsx`
- [ ] **Step 4: Migrate batch C — remaining (5 files)**
  `transparency/transparency-toggle.tsx`, `compliance/compliance-command-center.tsx`, `documents/DocumentViewerModal.tsx`, `onboarding/founding-aha-panel.tsx`, `violations/ViolationsAdminInbox.tsx`
- [ ] **Step 5: Verify no Button imports from @propertypro/ui remain in web**

Run: `grep -rn "import {[^}]*\bButton\b[^}]*} from '@propertypro/ui'" apps/web/src --include="*.tsx"`
Expected: no output.

- [ ] **Step 6: Full verification + commit**

Run: `pnpm --filter web typecheck && pnpm --filter web test && pnpm guard:design-tokens`
Expected: green (existing unit tests that assert pp-button classes will need their assertions updated to the shadcn classes — update them in the same commit).

```bash
git add -A apps/web/src apps/web/__tests__
git commit -m "refactor(web): migrate 15 files from packages/ui Button to canonical shadcn Button"
```

### Task 8: Migrate the 13 compound-Card files

**Files:** the 13 files inventoried above.

**Transformation recipe:**

| packages/ui compound | shadcn canonical (`@/components/ui/card`) |
|---|---|
| `<Card>` | `<Card>` (padding: pp `p-5` at md → shadcn slots carry `p-6`; minor visual shift, accepted) |
| `<Card.Header bordered>` | `<CardHeader className="flex-row items-center justify-between border-b border-edge-subtle">` (shadcn CardHeader is a column by default — pp Header was a row) |
| `<Card.Title>` | `<CardTitle>` |
| `<Card.Subtitle>` | `<CardDescription>` |
| `<Card.Actions>` | `<div className="flex shrink-0 items-center gap-2">` |
| `<Card.Body>` | `<CardContent>` |
| `<Card.Footer bordered>` | `<CardFooter className="justify-end border-t border-edge-subtle">` |
| `<Card.Section>` | `<div className="border-t border-edge-subtle p-6">` |
| `<Card status="danger">` | `<Card className="border-l-[3px] border-l-status-danger">` (arbitrary *width* is allowed; color is a semantic class) |
| `<Card interactive onClick={f}>` | `<Card role="button" tabIndex={0} onClick={f} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); f(); } }} className="cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">` |
| `<Card selected>` | `<Card className="border-interactive bg-interactive-subtle">` |
| `<Card elevated>` | `<Card className="shadow-sm">` |
| `<Card noPadding>` / `size` prop | drop (shadcn Card root has no padding; slots carry it) |

- [ ] **Step 1: Inventory actual prop usage per file** (before editing)

Run: `grep -n "Card[ .]" apps/web/src/components/transparency/*.tsx apps/web/src/components/calendar/*.tsx apps/web/src/components/meetings/*.tsx apps/web/src/components/onboarding/founding-aha-panel.tsx | grep -E "status=|interactive|selected|elevated|noPadding|size="`
Record which files use which props; only those need the recipe's className translations.

- [ ] **Step 2: Migrate batch A — transparency (7 files)**, typecheck, preview-check `/transparency` pages.
- [ ] **Step 3: Migrate batch B — calendar + meetings + onboarding (6 files)**, typecheck, preview-check `/calendar` and `/meetings`.
- [ ] **Step 4: Verify no compound Card usage remains in web**

Run: `grep -rn "Card\.\(Header\|Section\|Footer\|Body\|Title\|Subtitle\|Actions\)" apps/web/src --include="*.tsx"`
Expected: no output. Also: `grep -rn "import {[^}]*\bCard\b[^}]*} from '@propertypro/ui'" apps/web/src --include="*.tsx"` → no output.

- [ ] **Step 5: Full verification + commit**

Run: `pnpm --filter web typecheck && pnpm --filter web test && pnpm guard:design-tokens && pnpm guard:breadcrumbs`

```bash
git add -A apps/web/src apps/web/__tests__
git commit -m "refactor(web): migrate 13 files from packages/ui compound Card to canonical shadcn Card"
```

### Task 9: Status config consolidation (fixes the 9-vs-23-key fork)

**Files:**
- Modify: `packages/ui/src/constants/status.ts` (becomes the canonical superset)
- Modify: `packages/ui/src/index.ts` (export the constants)
- Modify: `apps/web/src/lib/constants/status.ts` (becomes a re-export shim)
- Modify: `apps/web/src/components/esign/esign-status-config.ts` (labels/variants move; icons stay)
- Modify: `apps/web/src/lib/constants/status.ts` gains `ESIGN_STATUS_CONFIG` entries
- Delete: `docs/design-system/constants/status.ts` → replaced by a pointer note in `docs/design-system/README.md`

- [ ] **Step 1: Upgrade `packages/ui/src/constants/status.ts` to the superset**

Replace its 9-key map with the web copy's full 23-key `STATUS_CONFIG`, `StatusConfigEntry` interface, `getStatusConfig`, AND `getStatusClasses` — exactly the current content of `apps/web/src/lib/constants/status.ts` (shown in full below), with one change: `StatusVariant` comes from `../tokens/colors` (the 8-variant type incl. `owner`/`board`) instead of a local 6-variant declaration:

```ts
/**
 * Status configuration — THE single source of truth for status display.
 * Consumed by StatusBadge (packages/ui) and re-exported to apps via
 * apps/web/src/lib/constants/status.ts.
 */
import type { StatusVariant } from "../tokens/colors";

export type { StatusVariant };
export type StatusIconKey = "success" | "warning" | "danger" | "info" | "neutral";

export interface StatusConfigEntry {
  variant: StatusVariant;
  label: string;
  icon: StatusIconKey;
  priority: number;
}

export const STATUS_CONFIG = {
  compliant: { variant: "success", label: "Compliant", icon: "success", priority: 40 },
  completed: { variant: "success", label: "Completed", icon: "success", priority: 50 },
  satisfied: { variant: "success", label: "Satisfied", icon: "success", priority: 45 },
  certified: { variant: "success", label: "Certified", icon: "success", priority: 48 },

  pending: { variant: "warning", label: "Due Soon", icon: "warning", priority: 10 },
  due_soon: { variant: "warning", label: "Due Soon", icon: "warning", priority: 10 },
  assigned: { variant: "warning", label: "Assigned", icon: "warning", priority: 18 },
  in_progress: { variant: "warning", label: "In Progress", icon: "warning", priority: 20 },
  review: { variant: "warning", label: "Under Review", icon: "warning", priority: 15 },

  overdue: { variant: "danger", label: "Overdue", icon: "danger", priority: 0 },
  rejected: { variant: "danger", label: "Rejected", icon: "danger", priority: 5 },
  canceled: { variant: "danger", label: "Canceled", icon: "danger", priority: 3 },
  cancelled: { variant: "danger", label: "Cancelled", icon: "danger", priority: 3 },

  submitted: { variant: "info", label: "Submitted", icon: "info", priority: 30 },
  created: { variant: "info", label: "Created", icon: "info", priority: 22 },
  confirmed: { variant: "info", label: "Confirmed", icon: "info", priority: 24 },
  open: { variant: "info", label: "Open", icon: "info", priority: 25 },
  closed: { variant: "neutral", label: "Closed", icon: "neutral", priority: 55 },
  draft: { variant: "neutral", label: "Draft", icon: "neutral", priority: 12 },

  brand: { variant: "brand", label: "Good", icon: "info", priority: 60 },
  not_applicable: { variant: "neutral", label: "N/A", icon: "neutral", priority: 100 },
  neutral: { variant: "neutral", label: "Neutral", icon: "neutral", priority: 999 },
} as const satisfies Record<string, StatusConfigEntry>;

export type StatusKey = keyof typeof STATUS_CONFIG;

export function getStatusConfig(status: StatusKey | string): StatusConfigEntry {
  return (
    (STATUS_CONFIG as Record<string, StatusConfigEntry>)[status] ?? STATUS_CONFIG.neutral
  );
}

/** Maps a StatusVariant to Tailwind semantic token classes. */
export function getStatusClasses(variant: StatusVariant) {
  return {
    text: `text-status-${variant}`,
    bg: `bg-status-${variant}-bg`,
    border: `border-status-${variant}-border`,
    subtle: `bg-status-${variant}-subtle`,
  } as const;
}
```

- [ ] **Step 2: Export from `packages/ui/src/index.ts`**

Add: `export { STATUS_CONFIG, getStatusConfig, getStatusClasses, type StatusConfigEntry, type StatusIconKey, type StatusVariant } from './constants/status';`
(`StatusKey` is already re-exported via `Badge.tsx`, and `StatusVariant` may already be exported from the tokens barrel — check `packages/ui/src/index.ts` for duplicate-export conflicts and keep exactly one export of each name.)

- [ ] **Step 3: Turn the web copy into a shim + add the esign domain map**

Replace the whole of `apps/web/src/lib/constants/status.ts` with:

```ts
/**
 * Re-export of the canonical status config (packages/ui/src/constants/status.ts)
 * plus web-only domain maps. Do not define status colors/variants here.
 */
export {
  STATUS_CONFIG,
  getStatusConfig,
  getStatusClasses,
  type StatusConfigEntry,
  type StatusIconKey,
  type StatusKey,
  type StatusVariant,
} from '@propertypro/ui';

import type { StatusVariant as V } from '@propertypro/ui';

/** E-sign domain statuses — labels differ from the generic map (e.g. pending
 *  means "Pending", not "Due Soon"). Icons live with the esign components. */
export const ESIGN_STATUS_CONFIG = {
  pending: { label: 'Pending', variant: 'warning' },
  processing: { label: 'Processing', variant: 'info' },
  processing_failed: { label: 'Processing Failed', variant: 'danger' },
  opened: { label: 'Opened', variant: 'info' },
  completed: { label: 'Completed', variant: 'success' },
  declined: { label: 'Declined', variant: 'danger' },
  expired: { label: 'Expired', variant: 'neutral' },
  cancelled: { label: 'Cancelled', variant: 'neutral' },
} as const satisfies Record<string, { label: string; variant: V }>;
```

- [ ] **Step 4: Slim `esign-status-config.ts` to iconography that derives from the domain map**

```ts
/**
 * E-sign status ICONS + event icons. Labels/variants come from the canonical
 * domain map in @/lib/constants/status (ESIGN_STATUS_CONFIG).
 */
import { ESIGN_STATUS_CONFIG } from '@/lib/constants/status';
import {
  Clock, CheckCircle2, XCircle, AlertTriangle, Eye, Loader2, Ban,
  FileSignature, Send, Download,
} from 'lucide-react';

const STATUS_ICONS: Record<keyof typeof ESIGN_STATUS_CONFIG, typeof Clock> = {
  pending: Clock,
  processing: Loader2,
  processing_failed: AlertTriangle,
  opened: Eye,
  completed: CheckCircle2,
  declined: XCircle,
  expired: AlertTriangle,
  cancelled: Ban,
};

export interface EsignStatusConfigEntry {
  label: string;
  variant: (typeof ESIGN_STATUS_CONFIG)[keyof typeof ESIGN_STATUS_CONFIG]['variant'];
  icon: typeof Clock;
}

export const ESIGN_STATUS_DISPLAY: Record<string, EsignStatusConfigEntry> =
  Object.fromEntries(
    Object.entries(ESIGN_STATUS_CONFIG).map(([k, v]) => [
      k,
      { ...v, icon: STATUS_ICONS[k as keyof typeof ESIGN_STATUS_CONFIG] },
    ]),
  );

/** @deprecated import ESIGN_STATUS_DISPLAY */
export const ESIGN_STATUS_CONFIG_LEGACY = ESIGN_STATUS_DISPLAY;

export const EVENT_ICONS = { /* … keep the existing EVENT_ICONS map verbatim … */ };
```

Update the two consumers (`esign/submission-list.tsx:22`, `esign/submission-detail.tsx:23`) from `ESIGN_STATUS_CONFIG` to `ESIGN_STATUS_DISPLAY` (same entry shape — `label`/`variant`/`icon`).

- [ ] **Step 5: Delete the docs copy, point docs at code**

```bash
git rm docs/design-system/constants/status.ts
```

Add to `docs/design-system/README.md` (constants section): `Status config: canonical source is packages/ui/src/constants/status.ts (re-exported to apps via apps/web/src/lib/constants/status.ts). The copy formerly here was removed 2026-07 — do not recreate.`
Also check `docs/design-system/constants/empty-states.ts` stays (handled in Task 10) and nothing in `apps/` imports the deleted file: `grep -rn "design-system/constants/status" apps packages` → expect no code imports (docs links are fine).

- [ ] **Step 6: Verify the fork bug is fixed**

Run: `pnpm --filter @propertypro/ui typecheck && pnpm --filter web typecheck && pnpm --filter web test && pnpm --filter @propertypro/ui test`
Expected: green. Manual check in preview: an esign submission list renders the same badges as before; a `StatusBadge status="rejected"` (violations inbox) now renders a red "Rejected" badge instead of gray "Neutral" — this is the bug fix, note it in the PR.

- [ ] **Step 7: Commit**

```bash
git add -A packages/ui apps/web/src docs/design-system
git commit -m "refactor(design-system): one canonical status config (fixes 9-vs-23-key StatusBadge fork)"
```

### Task 10: EmptyState — absorb ChartEmptyState

**Files:**
- Modify: `apps/web/src/components/shared/chart-empty-state.tsx` (becomes a thin wrapper)
- No API change for consumers.

- [ ] **Step 1: Rewrite ChartEmptyState as a wrapper over EmptyState**

```tsx
import { BarChart3, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';

interface ChartEmptyStateProps {
  type: 'empty' | 'error';
  message?: string;
  onRetry?: () => void;
  className?: string;
}

const defaults = {
  empty: {
    icon: BarChart3,
    title: 'No data for the selected period',
    description: 'Try adjusting your date range or community filters',
  },
  error: {
    icon: AlertCircle,
    title: 'Failed to load report data',
    description: undefined,
  },
} as const;

function ChartEmptyState({ type, message, onRetry, className }: ChartEmptyStateProps) {
  const config = defaults[type];
  return (
    <EmptyState
      size="sm"
      icon={config.icon}
      title={message ?? config.title}
      description={config.description}
      className={cn('h-full min-h-[200px] justify-center', className)}
      action={
        type === 'error' && onRetry ? (
          <Button size="sm" onClick={onRetry}>Retry</Button>
        ) : undefined
      }
    />
  );
}

export { ChartEmptyState, type ChartEmptyStateProps };
```

- [ ] **Step 2: Verify consumers + visuals**

Run: `pnpm --filter web typecheck && pnpm --filter web test`
Preview-check a PM report chart with no data (`pm` dashboard reports) — the state renders centered in the chart area as before.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/shared/chart-empty-state.tsx
git commit -m "refactor(web): ChartEmptyState delegates to canonical EmptyState"
```

### Task 11: Deprecate packages/ui Button + Card

**Files:**
- Modify: `packages/ui/src/components/Button.tsx`, `packages/ui/src/components/Card.tsx`

- [ ] **Step 1: Add deprecation JSDoc** to both components' top-level doc comments:

```ts
/**
 * @deprecated Web app: use `@/components/ui/button` (canonical shadcn layer).
 * This component remains ONLY for apps/admin until its migration program.
 * Do not add new imports in apps/web — guard:component-api rules and PR review
 * enforce this. See docs/superpowers/specs/2026-07-13-design-system-standardization-design.md.
 */
```

(equivalent wording for Card.)

- [ ] **Step 2: Verify web has zero remaining imports**

Run: `grep -rn "from '@propertypro/ui'" apps/web/src --include="*.tsx" | grep -E "\bButton\b|\bCard\b"`
Expected: no output (Tasks 7–8 removed them). Badge/StatusBadge/PlanBadge/NavRail/PhoneFrame/editor imports remain — correct.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/Button.tsx packages/ui/src/components/Card.tsx
git commit -m "chore(ui): deprecate packages/ui Button and Card for web (admin-only until its migration)"
```

### Task 12: Docs de-duplication (keep .md, delete parallel implementations)

**Files:**
- Delete: `.tsx`/`.css`/`.ts` implementation files under `docs/design-system/patterns/`, `docs/design-system/components/`, `docs/design-system/primitives/`, `docs/design-system/hooks/`, `docs/design-system/tokens/*.css`, and `docs/design-system/constants/empty-states.ts`
- Modify: `docs/design-system/README.md` (pointer table)

- [ ] **Step 1: Audit admin doc-link targets BEFORE deleting**

Run: `grep -rn "docHref\|DOC_BASE\|docs/design-system" apps/admin/src --include="*.ts*"`
Confirm every referenced path is a `.md` file or a directory (`block-registry.ts:153` builds `docs/design-system/patterns/<type>-block.md`; `DocumentationHubs.tsx:22` links the folder). List every `.md` those hrefs can produce and verify each exists: `ls docs/design-system/patterns/*.md`. **Do not delete any `.md`.**

- [ ] **Step 2: Delete implementation files**

```bash
git rm docs/design-system/patterns/*.tsx docs/design-system/patterns/*.css 2>/dev/null
git rm -r docs/design-system/components docs/design-system/primitives docs/design-system/hooks
git rm docs/design-system/tokens/*.css
git rm docs/design-system/constants/empty-states.ts
# keep: all *.md, docs/design-system/blocks/, docs/design-system/templates/, DESIGN_LAWS.md
```

Then verify nothing in apps/packages imports the deleted paths:
`grep -rn "docs/design-system/\(patterns\|components\|primitives\|hooks\|tokens\|constants\)" apps packages scripts --include="*.{ts,tsx,css,json}" | grep -v "\.md"`
Expected: only doc-link strings ending in `.md` (allowed) or nothing. There is one known test referencing docs (audit noted "a test") — if it asserts existence of a deleted file, update it to the new canonical path.

- [ ] **Step 3: Add a pointer table to `docs/design-system/README.md`**

```markdown
## Where the code actually lives (canonical paths)

The reference implementations formerly duplicated here were removed (2026-07).
| Thing | Canonical source |
|---|---|
| Tokens (all) | `packages/tokens/` → generated `packages/ui/src/styles/tokens.css` |
| Buttons, Cards, inputs, dialogs… | `apps/web/src/components/ui/` (shadcn/CVA — canonical) |
| StatusBadge / Badge (status family) | `packages/ui/src/components/Badge.tsx` |
| Status config | `packages/ui/src/constants/status.ts` |
| EmptyState / AlertBanner / PageHeader | `apps/web/src/components/shared/` |
| Empty-state copy configs | `apps/web/src/lib/constants/empty-states.ts` |
```

- [ ] **Step 4: Verify + commit**

Run: `pnpm typecheck && pnpm lint && pnpm --filter web test`

```bash
git add -A docs/design-system
git commit -m "docs(design-system): remove duplicated implementations; docs now point at canonical code"
```

### Task 13: Update DESIGN.md + .claude/rules/design.md to match reality

**Files:**
- Modify: `DESIGN.md`
- Modify: `.claude/rules/design.md`

- [ ] **Step 1: DESIGN.md edits**

1. **Token source section:** replace "truth lives in `packages/ui/src/tokens/` and `packages/ui/src/styles/tokens.css`" with: tokens are DEFINED in `packages/tokens` (`primitives.ts`/`semantic.ts`/`static.ts`) and GENERATED into `packages/ui/src/styles/tokens.css` (never hand-edited; sync-tested).
2. **Component dimensions table — Button row:** change to `sm(32px) default(36px) lg(40px) icon(36px)` with a note: "denser scale adopted 2026-07 (Wave 2); canonical component: `apps/web/src/components/ui/button.tsx`".
3. **Component layers section:** state that `apps/web/src/components/ui/` (shadcn/CVA) is the canonical layer for standard controls; `packages/ui` provides the status Badge family, NavRail, PhoneFrame, editor, and layout primitives; `packages/ui` Button/Card are deprecated (admin-only).
4. Add the enforcement paragraph (same content as Task 5 Step 6).

- [ ] **Step 2: .claude/rules/design.md edits**

Update the "Component Tooling" bullet list: mark `packages/ui` Button/Card deprecated for web; note the canonical status config path (`packages/ui/src/constants/status.ts`, re-exported via `@/lib/constants/status`); update the Button dimensions line from `sm(36px) md(40px) lg(48px)` to `sm(32px) default(36px) lg(40px)`; update the reference to `docs/design-system/constants/status.ts` (now deleted) to the canonical path.

- [ ] **Step 3: Commit**

```bash
git add DESIGN.md .claude/rules/design.md
git commit -m "docs: DESIGN.md + design rules reflect Wave 0-2 reality (token generation, canonical layer, button scale)"
```

### Task 14: Wave 2 final verification

- [ ] **Step 1: Full local gate**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all green. (`pnpm lint` now includes `guard:design-tokens` + `guard:token-coverage`.)

- [ ] **Step 2: Screenshot spot-checks (button/card hotspots)**

Dev server + `/dev/agent-login?as=founding_admin`; screenshot and eyeball: `/dashboard`, `/compliance`, `/meetings`, `/calendar`, `/esign/templates`, one esign submission detail, `/transparency` settings, `/violations`. Confirm: buttons uniformly 36px (default), danger buttons now filled red, card headers still read as headers, status badges unchanged (except the fixed fork statuses now colored correctly).

- [ ] **Step 3: Baseline tightening**

Run: `tsx scripts/verify-design-tokens.ts` — if migrations created slack, run `--write-baseline` and include the shrunken baseline in the final commit.

- [ ] **Step 4: Commit + PR**

```bash
git add scripts/design-token-baseline.json
git commit -m "chore(guard): tighten design-token baseline after Wave 2 migrations"
```

Open PR titled `feat(design-system): Wave 2 — component collapse (Button/Card/status/EmptyState)` with the before/after screenshots and the StatusBadge bug-fix note.

---

## Not in this plan (subsequent plans)

- **Wave 3 — Stripe polish** (token value tuning, `tabular-nums` tables, elevation/focus refinement): planned after Wave 2 merges; visual changes need user screenshot sign-off per spec §6.
- **Wave 4 — Drain** (414 raw-palette leaks, esign hex palettes, spinners→Skeleton, PageHeader adoption): batch mechanics use the Wave 1 baseline report as the worklist.
