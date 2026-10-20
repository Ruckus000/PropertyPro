#!/usr/bin/env tsx
/**
 * CI guard: verifies that generated token CSS files are fresh.
 * If someone edits primitives.ts or semantic.ts without re-running
 * the generator, this check will fail.
 *
 * Read-only: it renders the CSS in memory and compares it with the files on
 * disk. It used to run the generator (overwriting both files) and then
 * `git checkout` them, which threw away any uncommitted edit to either file.
 *
 * Exit codes: 0 fresh · 1 stale · 2 could not check (generator failed, file
 * missing) — never a pass.
 */
import { readFileSync } from "node:fs";

const FILES = [
  "packages/tokens/src/generated/tokens.css",
  "packages/ui/src/styles/tokens.css",
];

async function main(): Promise<number> {
  let expected: string;
  try {
    // Imported here, not at the top, so a generator that fails to LOAD is also
    // a "could not check" (exit 2) rather than an uncaught crash read as stale.
    const { generateFullCSS } = await import("../packages/tokens/scripts/build");
    expected = generateFullCSS();
  } catch (error) {
    console.error("✗ Token freshness could not check — the generator failed:", error);
    return 2;
  }

  const stale: string[] = [];
  for (const file of FILES) {
    let onDisk: string;
    try {
      onDisk = readFileSync(file, "utf-8");
    } catch (error) {
      console.error(`✗ Token freshness could not check — cannot read ${file}:`, error);
      return 2;
    }
    if (onDisk !== expected) stale.push(file);
  }

  if (stale.length > 0) {
    console.error("✗ Token CSS files are stale!");
    console.error("");
    for (const file of stale) console.error(`  ${file}`);
    console.error("");
    console.error("The generated CSS does not match these files.");
    console.error("Run: pnpm --filter @propertypro/tokens generate");
    console.error("Then commit the updated files.");
    return 1;
  }

  console.log(`✓ Token CSS files are fresh (${FILES.length} files checked)`);
  return 0;
}

void main().then((code) => process.exit(code));
