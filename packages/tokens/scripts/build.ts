/**
 * CSS token generator.
 *
 * Generates:
 *   1. packages/tokens/src/generated/tokens.css — standalone color-only CSS
 *   2. Patches packages/ui/src/styles/tokens.css — replaces primitive + semantic color sections
 */
import fs from "node:fs";
import path from "node:path";
import { primitiveColors } from "../src/primitives";
import { tokenDefinitions, toCssValue, type TokenRef } from "../src/semantic";

// ─── camelCase → kebab-case ───────────────────────────────────────────────────

function toKebab(str: string): string {
  return str.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`);
}

// ─── CSS var name lookup ───────────────────────────────────────────────────────
// Builds a flat map of { cssVarName → toCssValue(ref) } from tokenDefinitions.

function buildSemanticVars(): Array<[string, string]> {
  const vars: Array<[string, string]> = [];
  const t = tokenDefinitions;

  // Text
  for (const [key, ref] of Object.entries(t.text)) {
    vars.push([`--text-${toKebab(key)}`, toCssValue(ref)]);
  }

  // Surfaces
  for (const [key, ref] of Object.entries(t.surface)) {
    vars.push([`--surface-${toKebab(key)}`, toCssValue(ref)]);
  }

  // Borders
  for (const [key, ref] of Object.entries(t.border)) {
    vars.push([`--border-${toKebab(key)}`, toCssValue(ref)]);
  }

  // Brand-overridable
  vars.push([`--brand-accent`, toCssValue(t.brandAccent)]);

  // Interactive
  for (const [key, ref] of Object.entries(t.interactive)) {
    vars.push([`--interactive-${toKebab(key)}`, toCssValue(ref)]);
  }

  // Status
  for (const [variant, faces] of Object.entries(t.status)) {
    for (const [face, ref] of Object.entries(faces)) {
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
      vars.push([varName, toCssValue(ref)]);
    }
  }

  return vars;
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

// ─── Generate standalone tokens.css ───────────────────────────────────────────

function generateStandaloneCSS(): string {
  return [
    `:root {`,
    buildPrimitiveBlock(),
    ``,
    buildSemanticBlock(),
    `}`,
    ``,
  ].join("\n");
}

// ─── Update UI's tokens.css ────────────────────────────────────────────────────

function updateUiTokensCSS(uiCssPath: string): void {
  const original = fs.readFileSync(uiCssPath, "utf-8");

  // --- Replace primitive color block ---
  // Find "  /* Colors */" through the line just before "  /* Spacing"
  // Strategy: replace from "  /* Colors */" up to (not including) "  /* Spacing"
  const primitiveLines = buildPrimitiveBlock();
  // primitiveBlock starts with "  /* Primitive Colors */" — for UI we keep "  /* Colors */" header
  const uiPrimBlock = primitiveLines.replace("  /* Primitive Colors */", "  /* Colors */");

  const primStart = original.indexOf("  /* Colors */");
  const spacingMarker = "  /* Spacing";
  const primEnd = original.indexOf(spacingMarker);

  if (primStart === -1 || primEnd === -1) {
    throw new Error("Could not find primitive color boundaries in tokens.css");
  }

  // The content to replace: from "  /* Colors */" up to (not including) the spacing comment
  const beforePrim = original.slice(0, primStart);
  const afterPrim = original.slice(primEnd);

  // Build replacement: the block + a single trailing blank line
  const primReplacement = uiPrimBlock + "\n\n";

  const afterPrimReplace = beforePrim + primReplacement + afterPrim;

  // --- Replace semantic color block ---
  // Find "/* Text */" through "--status-neutral-subtle: var(--gray-50);"
  // Keep "  /* Elevation */" and everything after untouched
  const semanticBlock = buildSemanticBlock();

  const textMarker = "  /* Text */";
  const elevationMarker = "  /* Elevation */";

  const semStart = afterPrimReplace.indexOf(textMarker);
  const semEnd = afterPrimReplace.indexOf(elevationMarker);

  if (semStart === -1 || semEnd === -1) {
    throw new Error("Could not find semantic color boundaries in tokens.css");
  }

  const beforeSem = afterPrimReplace.slice(0, semStart);
  const afterSem = afterPrimReplace.slice(semEnd);

  // Build replacement: semantic block + blank line before elevation
  const semReplacement = semanticBlock + "\n\n";

  const result = beforeSem + semReplacement + afterSem;

  fs.writeFileSync(uiCssPath, result, "utf-8");
  console.log(`  Updated: ${uiCssPath}`);
}

// ─── Main ──────────────────────────────────────────────────────────────────────

const tokensDir = path.resolve(__dirname, "..");
const generatedDir = path.resolve(tokensDir, "src/generated");
const generatedCssPath = path.resolve(generatedDir, "tokens.css");
const uiCssPath = path.resolve(tokensDir, "../../packages/ui/src/styles/tokens.css");

fs.mkdirSync(generatedDir, { recursive: true });

// 1. Write standalone generated CSS
const standaloneCSS = generateStandaloneCSS();
fs.writeFileSync(generatedCssPath, standaloneCSS, "utf-8");
console.log(`  Generated: ${generatedCssPath}`);

// 2. Patch UI's tokens.css
updateUiTokensCSS(uiCssPath);

console.log("Done.");
