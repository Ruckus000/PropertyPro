import { defineConfig } from 'vitest/config';

/**
 * Entrypoint for `cd apps/web && vitest run` — what CI's Unit Tests job uses.
 *
 * The suite is split into two projects so that the ~505 test files which never
 * touch a DOM stop paying for a JSDOM instance. See vitest.shared.ts for the
 * partition rules and the reasoning.
 *
 * The projects are referenced by path rather than defined inline: inline
 * projects use `extends: true` to inherit the root `resolve.alias`, and that
 * same inheritance pulls in a root-level `include`, which unions back over each
 * project's own include and silently puts every file on jsdom again. Referenced
 * config files get no root `test` block to inherit, so the partition holds — and
 * the repo-root vitest.workspace.ts can point at the very same two files.
 */
export default defineConfig({
  test: {
    // `coverage` is a root-only option — it cannot be set per project, and it
    // applies across both of them, so `--coverage` keeps working unchanged.
    coverage: {
      provider: 'v8',
      // No `html`: nothing uploads or reads the HTML report, so it was writing
      // hundreds of files that die with the runner. The CI step summary reads
      // coverage-summary.json, which `json-summary` still emits.
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: './coverage',
      // Defaults to true, which instruments every file under `include` even
      // when no test touches it. Nothing gates on these numbers (no
      // thresholds, no upload), so don't pay to instrument untested files.
      all: false,
      include: [
        'src/lib/services/**',
        'src/lib/utils/**',
        'src/hooks/**',
        'src/components/compliance/**',
        'src/components/finance/**',
      ],
      exclude: ['**/*.test.{ts,tsx}', '**/__tests__/**'],
    },
    projects: ['./vitest.node.config.ts', './vitest.jsdom.config.ts'],
  },
});
