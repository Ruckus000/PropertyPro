<important if="verifying a change, running tests, claiming work is complete, or writing a guard">

# Verification

The failure this file exists to prevent: **a step that did not happen, reported as a step that
succeeded.** Every entry below was hit for real in this repo, not imagined.

## The revert-check

After writing a test for a fix, prove the test is not vacuous:

1. Delete the **one production line** that implements the fix.
2. Confirm the test goes **red for the reason claimed** — the failure message should be the defect
   verbatim, not merely "element not found".
3. Confirm the **control cases stay green** under the revert, so the file is not just globally broken.
4. Restore, and re-confirm green.

Record it in the commit message: which line, how many tests go red. Two shipped fixes were found
**unprotected** this way with the whole suite green (`docs/audits/2026-08-09-feature-correctness-audit.md` §7).

Where a change has no single-line revert target (an axe audit, a config), substitute an
**anti-vacuity probe**: break one thing the test claims to cover and show *that* case reddens while
its siblings stay green. Cite a probe per case — one probe does not cover four cases
(`apps/web/__tests__/accessibility/site-editor-axe.test.tsx` records getting this wrong twice).

## An exit code is not evidence

- **`$?` after a pipe is the LAST command's status.** `vitest … | tail` reports tail's `0` for a run
  that exited `1`. Don't pipe when you need the status; use `${pipestatus[1]}` (zsh) / `PIPESTATUS`.
- **Guard the mutation and the verification together.** A `&&` chain that guards only the setup lets
  the check run against an unperturbed system — and the whole block still exits 0:

  ```sh
  cd some/dir && mutate_the_file     # cd fails → mutation skipped
  run_the_test                       # runs anyway, against UNMODIFIED code, exit 0
  ```

  Before believing a fault-injection result, **confirm the fault landed** (hash the file, diff it,
  re-grep for the thing you removed).
- Shell cwd **persists between tool calls**, so a `cd` can fail by already being there.

## Absence in a log is not evidence of absence

Command output here is captured through a PTY. Vitest's default reporter then repaints a live
summary, and only the final frame survives — a full run can leave ~30 lines. Grepping that for a
filename and finding nothing proves **nothing**. (Measured: the same run redirected to a plain file
produced 2689 lines. The capture layer itself is lossless — 3003/3000 lines retained.)

When you intend to *query* output, make it deterministic: redirect to a file, or use a
machine-readable reporter and assert against the report.

## Running tests

- **`pnpm test -- <path>` silently runs the ENTIRE suite and exits 0.** pnpm forwards `--` literally,
  so vitest's filter ends up empty. Verified with a nonexistent path: `Test Files 987 passed`, exit 0.
- **Use `pnpm test <path>`** — no `--`. It filters correctly, and exits 1 with "No test files found"
  on a typo, so a bad path fails loudly.
- **`pnpm --filter <pkg> test` exits 0 when `<pkg>` has no `test` script** — it just prints
  `Scope: N of M workspace projects`. This is how 403 tests across three packages ran nowhere in CI.
  If you add a package with tests, give it a `test` script *and* add it to `vitest.workspace.ts`.
- A green suite does not prove an absence. To assert something is gone, grep for it directly.

## Writing a guard

Follow `scripts/verify-css-var-migration.sh` (`ce0ec269`) — the canonical shape:

- **Tri-state exits**: `0` clean · `1` violations · `≥2` **"I could not check, so I refuse to pass"**.
- **Assert the search root exists** before reporting success.
- **Branch on the search's real exit status, never on its stdout.** `grep … || true` and
  `$(… | wc -l)` both make a failed search indistinguishable from a clean one.
- **Assert a non-zero population.** A scan that examined nothing must not pass. Print the
  denominator (`semantic classes referenced: 39`) so the reader can see what was checked.
- **Vacuously red is as useless as vacuously green.** A guard that cannot pass proves nothing either;
  verify both directions.
- **Verify three ways**: passes on the real repo · fails in the broken environment where the old
  version passed · fails on an injected violation.

</important>
