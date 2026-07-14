/**
 * CSS token generator.
 *
 * Generates the ENTIRE tokens.css file (colors, spacing, radius, typography,
 * motion, sizing, focus, elevation, navigation, and the structural CSS around
 * them — media queries, :focus-visible rules, .skip-link, .large-text) from
 * the TypeScript token definitions in ../src (primitives.ts, semantic.ts,
 * static.ts). Nothing in tokens.css is hand-maintained.
 *
 * Writes the same output to:
 *   1. packages/tokens/src/generated/tokens.css — standalone generated CSS
 *   2. packages/ui/src/styles/tokens.css — the file both apps load
 */
import fs from "node:fs";
import path from "node:path";
import { primitiveColors } from "../src/primitives";
import { tokenDefinitions, toCssValue, type TokenRef } from "../src/semantic";
import { staticTokens } from "../src/static";

// ─── camelCase → kebab-case ───────────────────────────────────────────────────

function toKebab(str: string): string {
  return str.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`);
}

// ─── Primitive CSS block ───────────────────────────────────────────────────────

function buildPrimitiveBlock(): string {
  const lines: string[] = ["  /* Primitive Colors */"];

  for (const [scale, steps] of Object.entries(primitiveColors)) {
    for (const [step, hex] of Object.entries(steps)) {
      lines.push(`  --${scale}-${step}: ${hex};`);
    }
    lines.push(""); // blank line between scales
  }

  // Remove trailing blank line
  while (lines[lines.length - 1] === "") lines.pop();

  return lines.join("\n");
}

// ─── Semantic CSS block ────────────────────────────────────────────────────────

function buildSemanticBlock(): string {
  const lines: string[] = [];
  const t = tokenDefinitions;

  // Text
  lines.push("  /* Text */");
  for (const [key, ref] of Object.entries(t.text)) {
    lines.push(`  --text-${toKebab(key)}: ${toCssValue(ref)};`);
  }
  lines.push("");

  // Surfaces
  lines.push("  /* Surfaces */");
  for (const [key, ref] of Object.entries(t.surface)) {
    lines.push(`  --surface-${toKebab(key)}: ${toCssValue(ref)};`);
  }
  lines.push("");

  // Borders
  lines.push("  /* Borders */");
  for (const [key, ref] of Object.entries(t.border)) {
    lines.push(`  --border-${toKebab(key)}: ${toCssValue(ref)};`);
  }
  lines.push("");

  // Brand-overridable
  lines.push("  /* Brand-overridable — resolve to community theme vars when injected */");
  lines.push(`  --brand-accent: ${toCssValue(t.brandAccent)};`);
  lines.push("");

  // Interactive
  lines.push("  /* Interactive */");
  for (const [key, ref] of Object.entries(t.interactive)) {
    lines.push(`  --interactive-${toKebab(key)}: ${toCssValue(ref)};`);
  }
  lines.push("");

  // Status — each variant separated by blank line
  lines.push("  /* Status */");
  const statusEntries = Object.entries(t.status);
  for (let i = 0; i < statusEntries.length; i++) {
    const [variant, faces] = statusEntries[i]!;
    for (const [face, ref] of Object.entries(faces as Record<string, TokenRef>)) {
      let varName: string;
      switch (face) {
        case "foreground":
          varName = `--status-${variant}`;
          break;
        case "background":
          varName = `--status-${variant}-bg`;
          break;
        case "border":
          varName = `--status-${variant}-border`;
          break;
        case "subtle":
          varName = `--status-${variant}-subtle`;
          break;
        default:
          varName = `--status-${variant}-${face}`;
      }
      lines.push(`  ${varName}: ${toCssValue(ref)};`);
    }
    // Blank line between status groups (not after last)
    if (i < statusEntries.length - 1) {
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ─── Static (non-color) primitive blocks ──────────────────────────────────────

/** Pad a CSS declaration with spaces so an inline `/* … *\/` comment starts at `col`. */
function padToComment(decl: string, col: number): string {
  return decl.padEnd(col);
}

function buildSpacingBlock(): string {
  const lines = ["  /* Spacing (4px base unit) */"];
  for (const [key, value] of Object.entries(staticTokens.spacing)) {
    lines.push(`  --space-${key}: ${value};`);
  }
  return lines.join("\n");
}

function buildRadiusBlock(): string {
  const lines = ["  /* Radius */"];
  for (const [key, value] of Object.entries(staticTokens.radius)) {
    lines.push(`  --radius-${key}: ${value};`);
  }
  return lines.join("\n");
}

function buildTypographyBlock(): string {
  const lines = [
    "  /* Typography */",
    "  font-size: 16px;",
    `  --font-sans: ${staticTokens.fontFamily.sans};`,
    `  --font-mono: ${staticTokens.fontFamily.mono};`,
  ];
  for (const [key, { value, px }] of Object.entries(staticTokens.fontSize)) {
    const decl = `  --font-size-${key}: ${value};`;
    lines.push(`${padToComment(decl, 32)}/* ${px} */`);
  }
  return lines.join("\n");
}

function buildMotionBlock(): string {
  const lines = ["  /* Motion */"];
  for (const [key, value] of Object.entries(staticTokens.motionDuration)) {
    lines.push(`  --motion-duration-${key}: ${value};`);
  }
  lines.push("");
  for (const key of Object.keys(staticTokens.motionDuration)) {
    lines.push(`  --duration-${key}: var(--motion-duration-${key});`);
  }
  lines.push("");
  for (const [key, value] of Object.entries(staticTokens.ease)) {
    lines.push(`  --ease-${key}: ${value};`);
  }
  return lines.join("\n");
}

function buildSizingBlock(): string {
  const lines = ["  /* Sizing — responsive density */"];
  for (const [key, value] of Object.entries(staticTokens.sizing)) {
    lines.push(`  --${key}: ${value};`);
  }
  return lines.join("\n");
}

function buildFocusBlock(): string {
  const lines = ["  /* Focus */"];
  for (const [key, value] of Object.entries(staticTokens.focus)) {
    lines.push(`  --${key}: ${value};`);
  }
  return lines.join("\n");
}

function buildElevationBlock(): string {
  const lines = ["  /* Elevation */"];
  for (const [key, value] of Object.entries(staticTokens.elevation)) {
    lines.push(`  --elevation-${key}: ${value};`);
  }
  return lines.join("\n");
}

function buildSizingDesktopBlock(): string {
  return Object.entries(staticTokens.sizingDesktop)
    .map(([key, value]) => `    --${key}: ${value};`)
    .join("\n");
}

function buildNavBlock(): string {
  return Object.entries(staticTokens.nav)
    .map(([key, value]) => `  --${key}: ${value};`)
    .join("\n");
}

function buildLargeTextBlock(): string {
  const lines: string[] = [];
  for (const [key, { value, note }] of Object.entries(staticTokens.fontSizeLargeText)) {
    const decl = `  --font-size-${key}: ${value};`;
    lines.push(`${padToComment(decl, 31)}/* ${note} */`);
  }
  return lines.join("\n");
}

// ─── Full tokens.css ───────────────────────────────────────────────────────────

export function generateFullCSS(): string {
  const primitiveColorBlock = buildPrimitiveBlock().replace(
    "  /* Primitive Colors */",
    "  /* Colors */"
  );

  return (
    [
      `/* PropertyPro Design System — CSS Custom Properties */`,
      ``,
      `/* GENERATED FILE — do not edit directly.`,
      `   Source: packages/tokens/src/primitives.ts, semantic.ts, static.ts`,
      `   Regenerate: pnpm -F @propertypro/tokens generate */`,
      ``,
      `/* ═══════════════════════════════════════════════════════════════════════════`,
      `   PRIMITIVES`,
      `   ═══════════════════════════════════════════════════════════════════════════ */`,
      ``,
      `:root {`,
      primitiveColorBlock,
      ``,
      buildSpacingBlock(),
      ``,
      buildRadiusBlock(),
      ``,
      buildTypographyBlock(),
      ``,
      buildMotionBlock(),
      ``,
      buildSizingBlock(),
      ``,
      buildFocusBlock(),
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
      `/* ═══════════════════════════════════════════════════════════════════════════`,
      `   RESPONSIVE DENSITY`,
      `   ═══════════════════════════════════════════════════════════════════════════ */`,
      ``,
      `@media (min-width: 768px) {`,
      `  :root {`,
      buildSizingDesktopBlock(),
      `  }`,
      `}`,
      ``,
      `/* ═══════════════════════════════════════════════════════════════════════════`,
      `   FOCUS`,
      `   ═══════════════════════════════════════════════════════════════════════════ */`,
      ``,
      `:focus-visible {`,
      `  outline: var(--focus-ring-width) var(--focus-ring-style) var(--focus-ring-color);`,
      `  outline-offset: var(--focus-ring-offset);`,
      `  border-radius: inherit;`,
      `}`,
      ``,
      `:focus:not(:focus-visible) {`,
      `  outline: none;`,
      `}`,
      ``,
      `.skip-link {`,
      `  position: absolute;`,
      `  top: -100%;`,
      `  left: 16px;`,
      `  z-index: 9999;`,
      `  padding: 8px 16px;`,
      `  background: var(--surface-inverse);`,
      `  color: var(--text-inverse);`,
      `  border-radius: var(--radius-sm);`,
      `  font-weight: 600;`,
      `  text-decoration: none;`,
      `}`,
      ``,
      `.skip-link:focus {`,
      `  top: 16px;`,
      `}`,
      ``,
      `@media (forced-colors: active) {`,
      `  :focus-visible {`,
      `    outline: 3px solid CanvasText;`,
      `  }`,
      `}`,
      ``,
      `/* ═══════════════════════════════════════════════════════════════════════════`,
      `   MOTION — REDUCED MOTION`,
      `   ═══════════════════════════════════════════════════════════════════════════ */`,
      ``,
      `@media (prefers-reduced-motion: reduce) {`,
      `  :root {`,
      `    --motion-duration-micro: 0ms;`,
      `    --motion-duration-quick: 0ms;`,
      `    --motion-duration-standard: 0ms;`,
      `    --motion-duration-slow: 0ms;`,
      `    --motion-duration-expressive: 0ms;`,
      `  }`,
      ``,
      `  *,`,
      `  *::before,`,
      `  *::after {`,
      `    animation-duration: 0.01ms !important;`,
      `    animation-iteration-count: 1 !important;`,
      `    transition-duration: 0.01ms !important;`,
      `    scroll-behavior: auto !important;`,
      `  }`,
      `}`,
      ``,
      `@keyframes fadeIn {`,
      `  from { opacity: 0; }`,
      `  to { opacity: 1; }`,
      `}`,
      ``,
      `@media (prefers-reduced-motion: no-preference) {`,
      `  .animate-fade-in {`,
      `    animation: fadeIn var(--duration-standard) var(--ease-enter);`,
      `  }`,
      `}`,
      ``,
      `/* ═══════════════════════════════════════════════════════════════════════════`,
      `   NAVIGATION — SIDEBAR SEMANTIC TOKENS`,
      `   ═══════════════════════════════════════════════════════════════════════════ */`,
      ``,
      `:root {`,
      `  /* Light/neutral sidebar (Cloudflare-style). All values resolve to existing`,
      `     semantic tokens — no raw hex. Active state = neutral bg + themed left bar`,
      `     + bold label (never color-alone), so a non-blue community theme never`,
      `     produces a themed-bar/blue-bg mismatch. */`,
      buildNavBlock(),
      `}`,
      ``,
      `/* ═══════════════════════════════════════════════════════════════════════════`,
      `   LARGE TEXT MODE — Accessibility`,
      `   Activated by adding .large-text class to <html>.`,
      `   Scales all typography tokens up for users with poor vision.`,
      `   ═══════════════════════════════════════════════════════════════════════════ */`,
      ``,
      `.large-text {`,
      buildLargeTextBlock(),
      `}`,
      ``,
    ]
      .join("\n")
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const tokensDir = path.resolve(__dirname, "..");
  const generatedDir = path.resolve(tokensDir, "src/generated");
  const generatedCssPath = path.resolve(generatedDir, "tokens.css");
  const uiCssPath = path.resolve(tokensDir, "../../packages/ui/src/styles/tokens.css");

  fs.mkdirSync(generatedDir, { recursive: true });

  const fullCSS = generateFullCSS();

  fs.writeFileSync(generatedCssPath, fullCSS, "utf-8");
  console.log(`  Generated: ${generatedCssPath}`);

  fs.writeFileSync(uiCssPath, fullCSS, "utf-8");
  console.log(`  Generated: ${uiCssPath}`);

  console.log("Done.");
}
