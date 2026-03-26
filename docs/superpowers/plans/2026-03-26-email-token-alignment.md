# Email Token Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `packages/tokens` as the single source of truth for color tokens, consumed by both `packages/ui` (CSS vars) and `packages/email` (resolved hex), eliminating color drift between web and email.

**Architecture:** Source-first token package with discriminated union refs (`PrimitiveRef | ThemeRef`), shared resolvers (`toHex`/`toCssValue`), a CSS generator that writes directly into UI's `tokens.css`, and a flat email entry point. Both generated files committed to git with CI staleness guard.

**Tech Stack:** TypeScript, tsup, vitest, React Email, CSS custom properties

**Spec:** `docs/superpowers/specs/2026-03-26-email-token-alignment-design.md`

---

### Task 1: Scaffold `packages/tokens` package

**Files:**
- Create: `packages/tokens/package.json`
- Create: `packages/tokens/tsconfig.json`
- Create: `packages/tokens/tsup.config.ts`
- Create: `packages/tokens/vitest.config.ts`
- Create: `packages/tokens/src/index.ts`

- [ ] **Step 1: Create `packages/tokens/package.json`**

```json
{
  "name": "@propertypro/tokens",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./email": "./src/email.ts",
    "./styles.css": "./src/generated/tokens.css"
  },
  "scripts": {
    "generate": "tsx scripts/build.ts",
    "build": "pnpm generate && tsup",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "clean": "rm -rf dist .turbo"
  },
  "devDependencies": {
    "tsup": "^8.3.0",
    "tsx": "^4.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/tokens/tsconfig.json`**

Match `@propertypro/theme` pattern — `rootDir: "."` (not `./src`) since this is source-first and tests live outside `src/`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": ".",
    "types": ["vitest/globals"]
  },
  "include": ["src/**/*.ts", "scripts/**/*.ts", "__tests__/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `packages/tokens/tsup.config.ts`**

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/email.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  onSuccess: "cp src/generated/tokens.css dist/styles.css",
});
```

- [ ] **Step 4: Create empty `packages/tokens/src/index.ts`**

```ts
// Barrel export — populated in subsequent tasks
export {};
```

- [ ] **Step 5: Create `packages/tokens/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts"],
  },
});
```

- [ ] **Step 6: Create `packages/tokens/src/generated/` directory**

```bash
mkdir -p packages/tokens/src/generated
```

- [ ] **Step 7: Install dependencies**

```bash
pnpm install
```

- [ ] **Step 8: Verify package is recognized by workspace**

```bash
pnpm --filter @propertypro/tokens typecheck
```

Expected: Passes (empty package compiles)

- [ ] **Step 9: Commit**

```bash
git add packages/tokens/
git commit -m "chore: scaffold packages/tokens package"
```

---

### Task 2: Write `primitives.ts` with tests

**Files:**
- Create: `packages/tokens/src/primitives.ts`
- Create: `packages/tokens/__tests__/primitives.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/tokens/__tests__/primitives.test.ts
import { describe, it, expect } from "vitest";
import { primitiveColors } from "../src/primitives";

describe("primitiveColors", () => {
  it("exports all required color scales", () => {
    expect(Object.keys(primitiveColors)).toEqual(
      expect.arrayContaining(["blue", "gray", "green", "amber", "red", "orange"])
    );
  });

  it("blue scale has all 11 steps", () => {
    const steps = Object.keys(primitiveColors.blue).map(Number);
    expect(steps).toEqual([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]);
  });

  it("gray scale has all 13 steps", () => {
    const steps = Object.keys(primitiveColors.gray).map(Number);
    expect(steps).toEqual([0, 25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]);
  });

  it("all values are uppercase hex strings", () => {
    for (const scale of Object.values(primitiveColors)) {
      for (const hex of Object.values(scale)) {
        expect(hex).toMatch(/^#[0-9A-F]{6}$/);
      }
    }
  });

  it("matches current UI primitives exactly", () => {
    // Core palette values that must not drift
    expect(primitiveColors.blue[600]).toBe("#2563EB");
    expect(primitiveColors.gray[900]).toBe("#111827");
    expect(primitiveColors.green[700]).toBe("#047857");
    expect(primitiveColors.amber[700]).toBe("#B45309");
    expect(primitiveColors.red[700]).toBe("#B91C1C");
  });

  it("includes new scales for email migration", () => {
    expect(primitiveColors.red[900]).toBe("#7F1D1D");
    expect(primitiveColors.orange[600]).toBe("#EA580C");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @propertypro/tokens test
```

Expected: FAIL — `primitives` module not found

- [ ] **Step 3: Write `primitives.ts`**

Copy the exact `primitiveColors` object from the spec (Section 1, lines 58-87), including the new `red.900` and `orange` scale.

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @propertypro/tokens test
```

Expected: All 6 assertions PASS

- [ ] **Step 5: Commit**

```bash
git add packages/tokens/src/primitives.ts packages/tokens/__tests__/primitives.test.ts
git commit -m "feat(tokens): add primitive color palette with tests"
```

---

### Task 3: Write `semantic.ts` with resolvers and tests

**Files:**
- Create: `packages/tokens/src/semantic.ts`
- Create: `packages/tokens/__tests__/semantic.test.ts`
- Modify: `packages/tokens/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/tokens/__tests__/semantic.test.ts
import { describe, it, expect } from "vitest";
import {
  tokenDefinitions,
  toHex,
  toCssValue,
  type PrimitiveRef,
  type ThemeRef,
  type TokenRef,
} from "../src/semantic";

describe("toHex", () => {
  it("resolves PrimitiveRef to hex", () => {
    const ref: PrimitiveRef = { kind: "primitive", scale: "blue", step: 600 };
    expect(toHex(ref)).toBe("#2563EB");
  });

  it("resolves ThemeRef to fallback hex", () => {
    const ref: ThemeRef = {
      kind: "theme",
      cssVar: "--theme-primary",
      fallback: { kind: "primitive", scale: "blue", step: 600 },
    };
    expect(toHex(ref)).toBe("#2563EB");
  });
});

describe("toCssValue", () => {
  it("resolves PrimitiveRef to var(--scale-step)", () => {
    const ref: PrimitiveRef = { kind: "primitive", scale: "gray", step: 900 };
    expect(toCssValue(ref)).toBe("var(--gray-900)");
  });

  it("resolves ThemeRef to var(--theme-x, var(--scale-step))", () => {
    const ref: ThemeRef = {
      kind: "theme",
      cssVar: "--theme-primary",
      fallback: { kind: "primitive", scale: "blue", step: 600 },
    };
    expect(toCssValue(ref)).toBe("var(--theme-primary, var(--blue-600))");
  });
});

describe("tokenDefinitions", () => {
  it("text.primary resolves to gray-900 hex", () => {
    expect(toHex(tokenDefinitions.text.primary)).toBe("#111827");
  });

  it("interactive.primary is theme-aware", () => {
    expect(tokenDefinitions.interactive.primary.kind).toBe("theme");
    expect(toCssValue(tokenDefinitions.interactive.primary)).toBe(
      "var(--theme-primary, var(--blue-600))"
    );
    expect(toHex(tokenDefinitions.interactive.primary)).toBe("#2563EB");
  });

  it("status.brand.foreground is theme-aware", () => {
    expect(tokenDefinitions.status.brand.foreground.kind).toBe("theme");
    expect(toCssValue(tokenDefinitions.status.brand.foreground)).toBe(
      "var(--theme-primary, var(--blue-600))"
    );
  });

  it("brandAccent is theme-aware", () => {
    expect(tokenDefinitions.brandAccent.kind).toBe("theme");
    expect(toCssValue(tokenDefinitions.brandAccent)).toBe(
      "var(--theme-accent, var(--blue-200))"
    );
  });

  it("all six status groups have foreground/background/border/subtle", () => {
    const variants = ["success", "brand", "warning", "danger", "info", "neutral"] as const;
    for (const v of variants) {
      const group = tokenDefinitions.status[v];
      expect(group.foreground).toBeDefined();
      expect(group.background).toBeDefined();
      expect(group.border).toBeDefined();
      expect(group.subtle).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @propertypro/tokens test
```

Expected: FAIL — `semantic` module not found

- [ ] **Step 3: Write `semantic.ts`**

Copy the full `semantic.ts` from the spec (Section 2, lines 101-235). This includes:
- Type definitions (`PrimitiveRef`, `ThemeRef`, `TokenRef`)
- Shared resolvers (`toHex`, `toCssValue`)
- Helper functions (`prim`, `theme`)
- `tokenDefinitions` object

- [ ] **Step 4: Update `packages/tokens/src/index.ts`**

```ts
export { primitiveColors } from "./primitives";
export {
  tokenDefinitions,
  toHex,
  toCssValue,
  type PrimitiveRef,
  type ThemeRef,
  type TokenRef,
} from "./semantic";
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @propertypro/tokens test
```

Expected: All tests PASS (primitives + semantic)

- [ ] **Step 6: Commit**

```bash
git add packages/tokens/src/semantic.ts packages/tokens/src/index.ts packages/tokens/__tests__/semantic.test.ts
git commit -m "feat(tokens): add semantic token definitions with resolvers"
```

---

### Task 4: Write `email.ts` entry with tests

**Files:**
- Create: `packages/tokens/src/email.ts`
- Create: `packages/tokens/__tests__/email.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/tokens/__tests__/email.test.ts
import { describe, it, expect } from "vitest";
import { emailColors, primitiveColors } from "../src/email";

describe("emailColors", () => {
  it("textPrimary is gray-900", () => {
    expect(emailColors.textPrimary).toBe("#111827");
  });

  it("textSecondary is gray-600 (not gray-700)", () => {
    expect(emailColors.textSecondary).toBe("#4B5563");
  });

  it("surfacePage is gray-50 (not custom #F6F9FC)", () => {
    expect(emailColors.surfacePage).toBe("#F9FAFB");
  });

  it("interactivePrimary is blue-600", () => {
    expect(emailColors.interactivePrimary).toBe("#2563EB");
  });

  it("all status groups have foreground/background/border/subtle", () => {
    const groups = ["success", "warning", "danger", "info", "neutral"] as const;
    for (const g of groups) {
      expect(emailColors[`${g}Foreground`]).toBeDefined();
      expect(emailColors[`${g}Background`]).toBeDefined();
      expect(emailColors[`${g}Border`]).toBeDefined();
      expect(emailColors[`${g}Subtle`]).toBeDefined();
    }
  });

  it("all values are hex strings", () => {
    for (const value of Object.values(emailColors)) {
      expect(value).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

describe("primitiveColors re-export", () => {
  it("re-exports primitiveColors for one-off access", () => {
    expect(primitiveColors.red[600]).toBe("#DC2626");
    expect(primitiveColors.gray[800]).toBe("#1F2937");
    expect(primitiveColors.orange[600]).toBe("#EA580C");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @propertypro/tokens test
```

Expected: FAIL — `email` module not found

- [ ] **Step 3: Write `email.ts`**

Copy the full `email.ts` from the spec (Section 4, lines 308-377).

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @propertypro/tokens test
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/tokens/src/email.ts packages/tokens/__tests__/email.test.ts
git commit -m "feat(tokens): add email entry point with resolved hex values"
```

---

### Task 5: Write CSS generator + parity test

**Files:**
- Create: `packages/tokens/scripts/build.ts`
- Create: `packages/tokens/__tests__/parity.test.ts`
- Create: `packages/tokens/src/generated/tokens.css` (generated, committed)

- [ ] **Step 1: Write the parity test**

```ts
// packages/tokens/__tests__/parity.test.ts
import { describe, it, expect } from "vitest";
import { tokenDefinitions, toCssValue, toHex, type TokenRef } from "../src/semantic";
import { primitiveColors } from "../src/primitives";
import { emailColors } from "../src/email";
import fs from "node:fs";
import path from "node:path";

const cssPath = path.resolve(__dirname, "../src/generated/tokens.css");
const cssContent = fs.readFileSync(cssPath, "utf-8");

/** Recursively collect all TokenRef values from a nested object */
function collectRefs(obj: Record<string, unknown>, refs: TokenRef[] = []): TokenRef[] {
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object" && "kind" in value) {
      refs.push(value as TokenRef);
    } else if (value && typeof value === "object") {
      collectRefs(value as Record<string, unknown>, refs);
    }
  }
  return refs;
}

describe("Token parity", () => {
  it("generated CSS declares all primitive color vars", () => {
    for (const [scale, steps] of Object.entries(primitiveColors)) {
      for (const [step, hex] of Object.entries(steps)) {
        expect(cssContent).toContain(`--${scale}-${step}: ${hex}`);
      }
    }
  });

  it("generated CSS contains toCssValue() for every semantic token", () => {
    const refs = collectRefs(tokenDefinitions as unknown as Record<string, unknown>);
    for (const ref of refs) {
      const cssValue = toCssValue(ref);
      expect(cssContent, `Missing CSS value: ${cssValue}`).toContain(cssValue);
    }
  });

  it("emailColors values match toHex() for their corresponding tokens", () => {
    // Spot-check key mappings
    expect(emailColors.textPrimary).toBe(toHex(tokenDefinitions.text.primary));
    expect(emailColors.surfacePage).toBe(toHex(tokenDefinitions.surface.page));
    expect(emailColors.interactivePrimary).toBe(toHex(tokenDefinitions.interactive.primary));
    expect(emailColors.successForeground).toBe(toHex(tokenDefinitions.status.success.foreground));
    expect(emailColors.dangerForeground).toBe(toHex(tokenDefinitions.status.danger.foreground));
    expect(emailColors.warningBackground).toBe(toHex(tokenDefinitions.status.warning.background));
  });

  it("uses two-space indentation matching UI tokens.css format", () => {
    const lines = cssContent.split("\n").filter((l) => l.includes("--"));
    for (const line of lines) {
      expect(line).toMatch(/^  --/);
    }
  });

  it("generated CSS declares expected var names for non-trivial mappings", () => {
    // Verify the build.ts naming lookup produces correct CSS var names
    // These are the cases where the key name differs from the var name
    expect(cssContent).toContain("--interactive-primary-hover:");
    expect(cssContent).toContain("--interactive-primary-active:");
    expect(cssContent).toContain("--interactive-subtle-hover:");
    expect(cssContent).toContain("--brand-accent:");
    expect(cssContent).toContain("--status-success:");
    expect(cssContent).toContain("--status-success-bg:");
    expect(cssContent).toContain("--status-brand:");
    expect(cssContent).toContain("--surface-card:"); // not --surface-default
    expect(cssContent).toContain("--surface-hover:");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @propertypro/tokens test
```

Expected: FAIL — `src/generated/tokens.css` file not found

- [ ] **Step 3: Write `scripts/build.ts`**

The build script must:
1. Import `primitiveColors` from `../src/primitives`
2. Import `tokenDefinitions` and `toCssValue` from `../src/semantic`
3. Generate `src/generated/tokens.css` with two-space indentation
4. Use the flattening rules table from the spec (Section 3, lines 287-302) as a lookup
5. Write primitive vars first, then semantic vars grouped by category
6. Also read `packages/ui/src/styles/tokens.css`, replace both color sections (lines 8-54 and 130-208), and write back

Key implementation details:
- CSS var naming uses camelCase→kebab-case conversion for `interactive` keys
- Status tokens flatten: `foreground`→bare name, `background`→`-bg`, `border`→`-border`, `subtle`→`-subtle`
- `brandAccent` is a standalone token → `--brand-accent`
- Must produce exactly the same whitespace format as the current `tokens.css`
- Read the current `tokens.css`, find `/* Colors */` marker and `/* Spacing` prefix for the primitive block boundary, find the second `:root {` and its closing `}` for the semantic block boundary

- [ ] **Step 4: Run the generator**

```bash
pnpm --filter @propertypro/tokens generate
```

Expected: Creates `packages/tokens/src/generated/tokens.css` and updates `packages/ui/src/styles/tokens.css`

- [ ] **Step 5: Verify the generated CSS matches current values**

```bash
diff <(grep -E '^\s+--blue-|^\s+--gray-|^\s+--green-|^\s+--amber-|^\s+--red-' packages/ui/src/styles/tokens.css) <(grep -E '^\s+--blue-|^\s+--gray-|^\s+--green-|^\s+--amber-|^\s+--red-' packages/tokens/src/generated/tokens.css)
```

Expected: Only differences are the new `red.900` and `orange` scale entries

- [ ] **Step 6: Run parity test**

```bash
pnpm --filter @propertypro/tokens test
```

Expected: All tests PASS (primitives + semantic + email + parity)

- [ ] **Step 7: Commit both generated files**

```bash
git add packages/tokens/scripts/build.ts packages/tokens/__tests__/parity.test.ts packages/tokens/src/generated/tokens.css packages/ui/src/styles/tokens.css
git commit -m "feat(tokens): add CSS generator and parity test"
```

---

### Task 6: Migrate `packages/ui` to consume from tokens

**Files:**
- Modify: `packages/ui/src/tokens/colors.ts`
- Modify: `packages/ui/package.json` (add workspace dependency)

- [ ] **Step 1: Add `@propertypro/tokens` as workspace dependency**

```bash
cd packages/ui && pnpm add @propertypro/tokens@workspace:* && cd ../..
```

- [ ] **Step 2: Replace `packages/ui/src/tokens/colors.ts`**

Replace the entire file with the compatibility shim from the spec (Section 5, lines 386-480). This re-exports `primitiveColors` from `@propertypro/tokens` and keeps `semanticColors`, `StatusVariant`, and `getStatusColors` with their exact current API shape.

Key: the `interactive` keys stay as `default`/`hover`/`active` (not `primary`/`primaryHover`/`primaryActive`).

- [ ] **Step 3: Run existing UI token tests**

```bash
pnpm --filter @propertypro/ui test
```

Expected: All existing tests PASS — the public API is identical.

- [ ] **Step 4: Run typecheck**

```bash
pnpm --filter @propertypro/ui typecheck
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/tokens/colors.ts packages/ui/package.json
git commit -m "refactor(ui): migrate colors.ts to consume from @propertypro/tokens"
```

---

### Task 7: Workspace wiring (tsconfigs, next configs)

**Files:**
- Modify: `apps/web/tsconfig.json`
- Modify: `apps/admin/tsconfig.json`
- Modify: `apps/web/next.config.ts`
- Modify: `apps/admin/next.config.ts`

- [ ] **Step 1: Add tsconfig path aliases in `apps/web/tsconfig.json`**

Add to the `paths` object:
```json
"@propertypro/tokens": ["../../packages/tokens/src"],
"@propertypro/tokens/*": ["../../packages/tokens/src/*"]
```

- [ ] **Step 2: Add tsconfig path aliases in `apps/admin/tsconfig.json`**

Same as step 1.

- [ ] **Step 3: Add `@propertypro/tokens` to `transpilePackages` in `apps/web/next.config.ts`**

Add `"@propertypro/tokens"` to the `transpilePackages` array.

- [ ] **Step 4: Add `@propertypro/tokens` to `transpilePackages` in `apps/admin/next.config.ts`**

Add `"@propertypro/tokens"` to the `transpilePackages` array.

- [ ] **Step 5: Check if `apps/web/vitest.config.ts` needs a resolve alias**

The spec notes this may be necessary (matching `@propertypro/theme` pattern). Check if tests that transitively import from `@propertypro/tokens` pass without an alias. If they fail, add:
```ts
'@propertypro/tokens': path.resolve(__dirname, '../../packages/tokens/src'),
```

- [ ] **Step 6: Run typecheck to verify wiring**

```bash
pnpm typecheck
```

Expected: PASS across all packages

- [ ] **Step 7: Commit**

```bash
git add apps/web/tsconfig.json apps/admin/tsconfig.json apps/web/next.config.ts apps/admin/next.config.ts
git commit -m "chore: wire @propertypro/tokens into app configs"
```

**Note:** The Vercel `buildCommand` in `apps/web/vercel.json` does not need `@propertypro/tokens` in the filter chain since the package is source-first. Per the spec, this is optional/nice-to-have for producing dist artifacts.

---

### Task 8: Migrate `email-layout.tsx`

**Files:**
- Modify: `packages/email/package.json` (add workspace dependency)
- Modify: `packages/email/src/components/email-layout.tsx`

- [ ] **Step 1: Add `@propertypro/tokens` as workspace dependency**

```bash
cd packages/email && pnpm add @propertypro/tokens@workspace:* && cd ../..
```

- [ ] **Step 2: Replace hardcoded hex in `email-layout.tsx`**

Add import:
```ts
import { emailColors } from "@propertypro/tokens/email";
```

Replace inline values:
- `"#f6f9fc"` → `emailColors.surfacePage`
- `"#ffffff"` → `emailColors.surfaceCard`
- `"#2563eb"` → `emailColors.interactivePrimary`
- `"#e5e7eb"` → `emailColors.borderDefault`
- `"#9ca3af"` → `emailColors.textDisabled`
- `"#6b7280"` → `emailColors.textSecondary` (was gray-500, corrected to gray-600)
- `"#ffffff"` (community name) → `emailColors.textInverse`

Keep `branding.accentColor ?? emailColors.interactivePrimary` pattern for accent.

- [ ] **Step 3: Run email tests**

```bash
pnpm --filter @propertypro/email test
```

Expected: PASS (or no test breakage — email tests may not exist for layout)

- [ ] **Step 4: Commit**

```bash
git add packages/email/package.json packages/email/src/components/email-layout.tsx
git commit -m "refactor(email): use token colors in email layout"
```

---

### Task 9: Migrate email templates (batch 1 — auth/account)

**Files:**
- Modify: `packages/email/src/templates/welcome-email.tsx`
- Modify: `packages/email/src/templates/signup-verification-email.tsx`
- Modify: `packages/email/src/templates/password-reset-email.tsx`
- Modify: `packages/email/src/templates/otp-verification.tsx`
- Modify: `packages/email/src/templates/invitation-email.tsx`
- Modify: `packages/email/src/templates/access-request-approved.tsx`
- Modify: `packages/email/src/templates/access-request-denied.tsx`
- Modify: `packages/email/src/templates/access-request-pending.tsx`

- [ ] **Step 1: Migrate each template**

For each file:
1. Add `import { emailColors, primitiveColors } from "@propertypro/tokens/email";`
2. Replace hardcoded hex with `emailColors.*` or `primitiveColors.*` per the corrections table in the spec (Section 6, lines 541-554)
3. Key corrections: `#374151` → `emailColors.textSecondary`, `#6b7280` → `emailColors.textDisabled`, `#111827` → `emailColors.textPrimary`, `#e5e7eb` → `emailColors.borderDefault`, `#f9fafb` → `emailColors.surfacePage`

- [ ] **Step 2: Run email tests**

```bash
pnpm --filter @propertypro/email test
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/email/src/templates/welcome-email.tsx packages/email/src/templates/signup-verification-email.tsx packages/email/src/templates/password-reset-email.tsx packages/email/src/templates/otp-verification.tsx packages/email/src/templates/invitation-email.tsx packages/email/src/templates/access-request-approved.tsx packages/email/src/templates/access-request-denied.tsx packages/email/src/templates/access-request-pending.tsx
git commit -m "refactor(email): migrate auth/account templates to token colors"
```

---

### Task 10: Migrate email templates (batch 2 — notifications/compliance)

**Files:**
- Modify: `packages/email/src/templates/announcement-email.tsx`
- Modify: `packages/email/src/templates/document-posted-email.tsx`
- Modify: `packages/email/src/templates/meeting-notice-email.tsx`
- Modify: `packages/email/src/templates/maintenance-update-email.tsx`
- Modify: `packages/email/src/templates/compliance-alert-email.tsx`
- Modify: `packages/email/src/templates/notification-digest-email.tsx`

- [ ] **Step 1: Migrate each template**

Same mechanical process. For compliance-alert: severity colors map to `emailColors.dangerForeground` / `emailColors.warningForeground` / `emailColors.infoForeground`. Status badge backgrounds use the matching `*Background` token.

- [ ] **Step 2: Run email tests**

```bash
pnpm --filter @propertypro/email test
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/email/src/templates/announcement-email.tsx packages/email/src/templates/document-posted-email.tsx packages/email/src/templates/meeting-notice-email.tsx packages/email/src/templates/maintenance-update-email.tsx packages/email/src/templates/compliance-alert-email.tsx packages/email/src/templates/notification-digest-email.tsx
git commit -m "refactor(email): migrate notification/compliance templates to token colors"
```

---

### Task 11: Migrate email templates (batch 3 — esign/emergency)

**Files:**
- Modify: `packages/email/src/templates/esign-invitation-email.tsx`
- Modify: `packages/email/src/templates/esign-reminder-email.tsx`
- Modify: `packages/email/src/templates/esign-completed-email.tsx`
- Modify: `packages/email/src/templates/emergency-alert-email.tsx`

- [ ] **Step 1: Migrate each template**

For emergency-alert: replace `#ea580c` with `primitiveColors.orange[600]`, `#c2410c` with `primitiveColors.orange[700]`, `#dc2626` with `primitiveColors.red[600]`.

For esign-completed: success colors (`#22c55e`, `#f0fdf4`, `#16a34a`) map to `emailColors.successBorder`, `emailColors.successBackground`, `emailColors.successForeground`.

- [ ] **Step 2: Run email tests**

```bash
pnpm --filter @propertypro/email test
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/email/src/templates/esign-invitation-email.tsx packages/email/src/templates/esign-reminder-email.tsx packages/email/src/templates/esign-completed-email.tsx packages/email/src/templates/emergency-alert-email.tsx
git commit -m "refactor(email): migrate esign/emergency templates to token colors"
```

---

### Task 12: Migrate email templates (batch 4 — finance/billing/lifecycle)

**Files:**
- Modify: `packages/email/src/templates/assessment-due-reminder.tsx`
- Modify: `packages/email/src/templates/assessment-payment-received.tsx`
- Modify: `packages/email/src/templates/payment-failed.tsx`
- Modify: `packages/email/src/templates/subscription-canceled.tsx`
- Modify: `packages/email/src/templates/subscription-expiry-warning.tsx`
- Modify: `packages/email/src/templates/free-access-expiring-email.tsx`
- Modify: `packages/email/src/templates/free-access-expired-email.tsx`
- Modify: `packages/email/src/templates/account-deletion-initiated-email.tsx`
- Modify: `packages/email/src/templates/account-deletion-executed-email.tsx`
- Modify: `packages/email/src/templates/account-recovered-email.tsx`

- [ ] **Step 1: Migrate each template**

For account-deletion-initiated: yellow timeline colors (`#ca8a04`, `#fde047`, `#fef9c3`) migrate to amber equivalents (`emailColors.warningForeground`, `emailColors.warningBorder`, `emailColors.warningBackground`).

For payment-failed: `#7f1d1d` → `primitiveColors.red[900]`, `#dc2626` → `primitiveColors.red[600]`.

- [ ] **Step 2: Run email tests**

```bash
pnpm --filter @propertypro/email test
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/email/src/templates/
git commit -m "refactor(email): migrate finance/billing/lifecycle templates to token colors"
```

---

### Task 13: Add CI staleness guard

**Files:**
- Create: `scripts/verify-token-freshness.ts`
- Modify: `package.json` (add script alias)

- [ ] **Step 1: Write `scripts/verify-token-freshness.ts`**

The script:
1. Runs the token generator to a temp directory
2. Diffs the temp output against the committed `packages/tokens/src/generated/tokens.css`
3. Diffs the temp UI output against the committed `packages/ui/src/styles/tokens.css` (color sections only)
4. Exits 0 if identical, exits 1 with a helpful error if stale

- [ ] **Step 2: Add script to root `package.json`**

```json
"guard:token-freshness": "tsx scripts/verify-token-freshness.ts"
```

- [ ] **Step 3: Add to lint command**

The existing `lint` script is `"turbo run lint && pnpm guard:db-access"`. Append `&& pnpm guard:token-freshness`.

- [ ] **Step 4: Run the guard**

```bash
pnpm guard:token-freshness
```

Expected: PASS (files are fresh)

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-token-freshness.ts package.json
git commit -m "ci: add token staleness guard to lint pipeline"
```

---

### Task 14: Final verification

- [ ] **Step 1: Run full typecheck**

```bash
pnpm typecheck
```

Expected: PASS across all packages and apps

- [ ] **Step 2: Run all unit tests**

```bash
pnpm test
```

Expected: PASS — all existing tests plus new token tests

- [ ] **Step 3: Run lint (includes staleness guard)**

```bash
pnpm lint
```

Expected: PASS

- [ ] **Step 4: Run build**

```bash
pnpm build
```

Expected: PASS — all packages build, Next.js apps compile

- [ ] **Step 5: Verify no hardcoded hex remains in email templates**

```bash
grep -rn '#[0-9a-fA-F]\{6\}' packages/email/src/templates/ packages/email/src/components/ | grep -v 'node_modules' | grep -v '.test.'
```

Expected: Only `branding.accentColor` fallbacks and comments should remain

- [ ] **Step 6: Commit any fixes from verification**

```bash
git add -A
git commit -m "fix: address issues found during final verification"
```
