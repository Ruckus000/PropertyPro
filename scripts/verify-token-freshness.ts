#!/usr/bin/env tsx
/**
 * CI guard: verifies that generated token CSS files are fresh.
 * If someone edits primitives.ts or semantic.ts without re-running
 * the generator, this check will fail.
 */
import { execSync } from "node:child_process";

const FILES = [
  "packages/tokens/src/generated/tokens.css",
  "packages/ui/src/styles/tokens.css",
];

try {
  // Re-run the generator
  execSync("pnpm --filter @propertypro/tokens generate", {
    stdio: "pipe",
    cwd: process.cwd(),
  });

  // Check if the generated files differ from what's committed
  execSync(`git diff --exit-code ${FILES.join(" ")}`, {
    stdio: "pipe",
    cwd: process.cwd(),
  });

  console.log("✓ Token CSS files are fresh");
  process.exit(0);
} catch (error: unknown) {
  // git diff --exit-code returns 1 if there are differences
  const err = error as { status?: number; stdout?: Buffer };
  if (err.status === 1 && err.stdout) {
    console.error("✗ Token CSS files are stale!");
    console.error("");
    console.error("The generated CSS does not match the committed files.");
    console.error("Run: pnpm --filter @propertypro/tokens generate");
    console.error("Then commit the updated files.");
    console.error("");
    console.error("Diff:");
    console.error(err.stdout.toString());

    // Restore the committed versions
    execSync(`git checkout -- ${FILES.join(" ")}`, { stdio: "pipe" });

    process.exit(1);
  }
  // Some other error (generate failed, etc.)
  console.error("✗ Token freshness check failed:", error);
  process.exit(1);
}
