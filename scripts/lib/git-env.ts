/**
 * The environment for a git child process that must act on the directory it
 * is pointed at (`git -C <dir> …`), and nothing else.
 *
 * Why: git hooks export `GIT_DIR` (and sometimes `GIT_WORK_TREE`,
 * `GIT_INDEX_FILE`, …), and every process the hook starts inherits them.
 * localci runs the test suite from `.githooks/pre-push`, so a test's
 * `git init <tmpdir>` saw the REAL repository's `GIT_DIR`, re-initialised it as
 * bare and wrote `core.bare = true` into the shared `.git/config`. Every
 * checkout and worktree then failed with "this operation must be run in a work
 * tree" (2026-10-30 and 2026-10-31). `-C` does not help: `GIT_DIR` wins over
 * the directory git would otherwise discover.
 */
export function withoutGitEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const clean = { ...env };
  for (const key of Object.keys(clean)) {
    if (key.startsWith('GIT_')) delete clean[key];
  }
  return clean;
}
