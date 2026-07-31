# Recovery contract — what `/phase-run` must be able to undo

The runner merges to `main` unattended and `deploy.yml` then ships `main` to
production automatically. So every phase is a production change nobody reviewed
first. This file is the answer to the only question that matters about that:

> **When it goes wrong and I don't find out for a week, what gets me back?**

Three obligations, in order of how often they save you: **capture** state before
changing it, **detect** that it went wrong, **restore** without improvising.

---

## 1. Capture — the restore point

Before a phase does anything, write a restore point and **verify each value is
real**, not assumed. Captured values are worthless if they were guessed.

```json
{
  "phaseName": "11b-3",
  "capturedAtIso": "<from the caller; the sandbox has no clock>",
  "git": {
    "mainSha": "<git rev-parse origin/main>",
    "mainSubject": "<git log -1 --format=%s origin/main>"
  },
  "deploy": {
    "liveDeploymentId": "<the CURRENT production deployment id>",
    "liveDeploymentSha": "<the commit it was built from>"
  },
  "db": {
    "ledgerTipId": "<max(id) from drizzle.__drizzle_migrations>",
    "ledgerTipCreatedAt": "<its created_at>",
    "migrationFileCount": "<files on disk in packages/db/migrations>",
    "publicTableCount": "<count of relations in schema public>",
    "rlsTenantTableCount": "<RLS_EXPECTED_TENANT_TABLE_COUNT>",
    "advisorErrors": "<count of ERROR-level Supabase advisor lints>"
  }
}
```

**Written to `~/.claude/state/phase-run/<phase>-restore.json` — outside the repo,
deliberately.** A restore point stored in the thing you are about to break is not
a restore point. Echo it into the run log as well, so it survives a lost file.

`advisorErrors` is a **baseline, not an assertion**. "No new ERROR lints" is only
meaningful against a number captured before. Prod has been at zero; if it is not,
record the real number and carry it forward rather than treating the phase as
having caused them.

## 2. Retain — delete nothing until it is proven healthy

The previous integrator ran `git worktree remove --force` as soon as a slice
merged. That destroys the only copy of an agent's reasoning at exactly the moment
it might be needed.

- **Slice branches are never deleted.** This repo has `delete_branch_on_merge`
  off, which for once is the behaviour we want. Push every slice branch to origin
  before integrating, so the work survives a lost worktree.
- **Worktrees survive until the phase is verified healthy in production**, then
  are removed in one sweep. A failed slice's worktree is kept regardless.
- **Never `git push --force` to `main`.** `--force-with-lease` on a *phase's own
  branch* is fine; anything else is not.
- **Never `git reset --hard` or `git checkout .` in the integration worktree**
  once slices have merged into it — that is uncommitted repair work, gone.

## 3. Detect — the part that answers "didn't realize until later"

Green CI means the code compiles and the tests we wrote pass. It does not mean
production works. After each phase merges, and after `deploy.yml` has shipped it:

- **Confirm the deploy actually reached production.** A merge is not a deploy.
  Compare the live deployment's commit to the merge commit.
- **Verify the steady state the phase claims to preserve.** Every phase declares
  what must still be true afterwards — the app still loads, a resident still
  reaches the dashboard, the public site still renders, no route 500s. Check it
  against the real production host, not a local build.
- **Re-run the advisor check** and compare with the captured baseline.
- **Check the error tracker** for a new issue class since the deploy.

A phase that merges, deploys, and fails this check is **rolled back immediately**
using its own runbook — not diagnosed first. Diagnose from a healthy production.

## 4. Restore — the runbook, written before the risk is taken

Each phase gets a runbook written **at capture time**, with the real values
filled in, ordered cheapest-and-safest first:

| Situation | Action |
|---|---|
| Merged, deploy broken, code is the cause | **Vercel instant rollback** to `liveDeploymentId`. Fastest, no git archaeology, documented incident response for this repo. |
| Merged, needs to leave `main` | `git revert -m 1 <mergeCommit>` on a branch → PR → normal CI. Never a force-push to main. |
| Migration applied, code not yet live | Nothing to do if the migration was EXPAND — that is the point of expand-first. |
| Migration applied and wrong | Only recoverable because the runner refuses DESTRUCTIVE. Reverse the reversible statement (recreate the index, drop the NOT NULL) and correct the ledger row. |
| Data damaged | **Stop. Escalate to a human.** PITR is a whole-project point-in-time restore, not an undo — it reverts unrelated writes too. Nobody should trigger that unattended. |

**Verify the runbook, do not just write it.** At minimum, confirm the revert
applies cleanly against the current tree (`git revert --no-commit` then
`git revert --abort`). An unverified rollback plan is a guess, and it is a guess
you will be relying on under time pressure.

---

## 5. What is genuinely unrecoverable — and is therefore refused

Anything on this list stops the run and escalates. No override, no flag:

- **`DROP COLUMN` / `DROP TABLE`** — the data is gone; nothing in this repo can
  reconstruct it.
- **Non-idempotent DML** — a backfill that cannot be re-run safely, an UPDATE
  with no inverse.
- **A force-push over commits that are not the runner's own.**
- **Deleting a branch that has unmerged work.**
- **Anything outward-facing** — sending mail, posting to a third party, charging
  a card. These cannot be recalled and no phase needs to do them.

Everything else in this pipeline is reversible by design, and that is not an
accident — it is the reason the destructive class is refused rather than
carefully handled.

---

## 6. Least privilege

The runner has repo write, merge rights, and — when a phase declares a migration
— production database access. That is a large amount of authority for an
unattended process, so it is scoped:

- **No production database credentials are needed unless the phase declares a
  migration.** A phase without one must never load `.env.local`, whose
  `DATABASE_URL` is production. Integration tests use the local disposable DB;
  this is not a preference, it is how test communities leaked into prod once.
- **Migrations are applied through the reviewed ladder only** — local → preview
  branch → prod rehearsal inside `BEGIN … ROLLBACK` → apply → verify → auto-roll
  back on any mismatch. Never an ad-hoc statement against production.
- **Secrets are never read, echoed, logged, committed, or put in a PR body.** If
  a task appears to need one, that is an `EXTERNAL_BLOCKER` and it stops.
- **The runner never edits its own safety machinery** — this file, the bug
  protocol, or the workflow's refusal list — as part of shipping a phase.
