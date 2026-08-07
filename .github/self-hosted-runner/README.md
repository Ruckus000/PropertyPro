# Self-hosted CI runner

`Unit Tests` and `perf-check` are the two expensive jobs in `ci.yml`. On
GitHub-hosted runners they are slow for one reason: cores. This directory holds
everything needed to run them on a Lima VM on a developer Mac instead.

**Nothing here is required.** `runs-on` falls back to `ubuntu-latest` whenever
`vars.CI_RUNNER_LABEL` is unset or the event is a push to `main`, so a repo with
no runner at all still has fully working CI.

---

## Why

Measured, not estimated. Identical `vitest run --coverage`, 9,028 tests:

| Host | Cores | vitest forks | Wall |
|---|---|---|---|
| GitHub `ubuntu-latest` | 4 | 3 | 974s |
| This Lima VM (M4 Max) | 8 | 7 | 100–174s |

vitest's forks pool is `availableParallelism() - 1`, so throughput tracks cores
directly. Nothing in the repo pins worker counts.

Per-job durations on `ubuntu-latest`, last four green runs
(`gh api repos/Ruckus000/PropertyPro/actions/runs/<id>/jobs`), 2026-08-06:

| Job | Hosted | Self-hosted | Moved? |
|---|---|---|---|
| Unit Tests | 18m17s / 18m38s / 18m17s / 13m42s | ~2.2–3.3 min | **yes** |
| perf-check | 6m42s – 8m01s | ~3 min | **yes** |
| integration-tests | 2m40s – 3m16s | — | no |
| Lint / Typecheck / no-mock-guard / migration-ordering / Build | 0m02s – 3m18s | — | no |

`integration-tests` deliberately stays hosted. It is the *cheapest* of the three
"heavy" jobs, and the only one needing Docker — leaving it alone removes
`services:`, `psql`, and the postgres image from this design entirely, and keeps
one always-available required check as an availability floor.

---

## Phase 2 gate results (2026-08-06)

Every step replayed by hand in the VM before any runner was registered.

| Measurement | Gate | Actual | |
|---|---|---|---|
| `vitest run --coverage` | ≤ 3 min | 108.1s / 173.8s / 100.5s | pass |
| Full Unit Tests sequence | ≤ 6 min | ~2.2–3.3 min | pass |
| perf-check sequence | green 3/3 | build 145s, e2e 3/3 green | pass |
| `pnpm perf:check` byte counts vs x64 | within ~1% | **≤ 0.02%** | pass |
| Test failures across all runs | zero | zero (9028 passed) | pass |

Bundle sizes, arm64 vs the last x64 hosted run — this was the real open question,
since the VM builds with `@next/swc-linux-arm64-gnu` instead of `-x64-gnu` and the
budgets sit at ~10% headroom:

| Route | arm64 | x64 |
|---|---|---|
| `web:pm /(authenticated)/dashboard` | 563.3 KiB | 563.3 KiB |
| `web:site-editor` | 653.3 KiB | 653.4 KiB |
| `web` aggregate | 824.9 KiB | 825.0 KiB |
| `admin:communities /clients` | 599.2 KiB | 599.3 KiB |

**Note the variance, not just the mean.** 100s vs 174s on identical input is a
74% spread, because the host is a laptop someone is also using. p95 sits near the
3-minute gate. This is the cost of self-hosting on a workstation and it is why
`timeout-minutes` should be ratcheted against measured p95, not against the mean.

---

## Setup

```bash
brew install lima
limactl start --name=ci .github/self-hosted-runner/lima-ci.yaml
```

Then, per runner (two are recommended — see below):

```bash
sed -e "s|__IDX__|1|g" -e "s|__REPO_DIR__|$PWD|g" \
  .github/self-hosted-runner/com.propertypro.ci-runner.plist.template \
  > ~/Library/LaunchAgents/com.propertypro.ci-runner.1.plist
launchctl load ~/Library/LaunchAgents/com.propertypro.ci-runner.1.plist
```

### The shadow phase

Before cutting over, run the two job bodies on the self-hosted label alongside
the real hosted jobs for ~1 week / ~20 PR runs, as a NON-REQUIRED workflow.

That workflow is **not in this branch on purpose**. Merged early it would sit
permanently pending on every PR — no runner carries the label yet — and a
forever-pending check reads as a flake rather than a block, which is a failure
mode this repo has already paid for once. It lives on
`claude/self-hosted-shadow-workflow` and should land at the same time the
runners are registered, not before.

What the shadow phase is actually looking for — not "does it pass once", which
the Phase 2 gate already settled:

- **Concurrency shakeout.** vitest goes from 3 workers to 7. Tests that pass
  today only because parallelism is low (shared temp paths, shared ports, order
  dependence) start failing.
- **Retry masking.** `retries: 2` can turn a new flake into slow-but-green.
  Compare retry counts against the hosted jobs, not just pass/fail.
- **Disk growth.** Lima images never shrink. Watch the trend across runs.

### Cutting over

Finally — **only after the shadow phase**, not at install time — point CI at it.
Two variables, because the watchdog must be able to fail CI back without ever
inventing the decision to cut over in the first place:

```bash
gh variable set CI_RUNNER_DESIRED_LABEL --body propertypro-mac  # operator intent
gh variable set CI_RUNNER_LABEL         --body propertypro-mac  # what ci.yml reads
```

`runner-watchdog.yml` moves `CI_RUNNER_LABEL` between `ubuntu-latest` and
`CI_RUNNER_DESIRED_LABEL` as the runner goes offline and comes back. With
`CI_RUNNER_DESIRED_LABEL` unset it does nothing at all, which is what keeps the
shadow phase from ending itself the first time a runner comes online.

The supervisor needs no separate PAT: a `gh` login carrying the classic `repo`
scope is enough to call `generate-jitconfig` (verified 2026-08-06). Set `GH_TOKEN`
to override with a fine-grained PAT (single repo, Administration: read/write) if
you would rather not hand CI a broadly-scoped token. `runner-watchdog.yml` DOES
need its own token, because the default `GITHUB_TOKEN` cannot write variables.

To roll back at any time — this is the whole rollback procedure:

```bash
gh variable set CI_RUNNER_LABEL --body ubuntu-latest
```

Queued runs are **not** re-dispatched by that flip; re-run them, or let
`runner-watchdog.yml` do it.

---

## Design decisions worth not re-litigating

**Two runners, not one.** The two jobs run concurrently today. A single runner
would serialize them, turning a `max()` into a `sum()` and giving back much of
the win.

**Supervisor on the Mac, not in the VM.** A runner registration credential is
repo-admin-grade. The supervisor holds it on the host and mints a single-use JIT
config per job, so no long-lived credential ever sits inside the VM where
untrusted PR code runs. It is a launchd *agent*, not a daemon, so `gh` can read
its token from the login keychain instead of a PAT file on disk.

**`--ephemeral` does not clean disk.** It only unregisters the runner after one
job. The supervisor wipes `_work`. Everything worth caching
(`RUNNER_TOOL_CACHE`, the pnpm store, Playwright browsers) deliberately lives in
`/opt/ci-cache`, *outside* `_work`, so isolation and warm caches are not in
tension. Leave `RUNNER_TOOL_CACHE` inside `_work` and `setup-node` re-downloads
the arm64 Node 20 tarball on every job.

**PR-only.** `push: main` stays hosted. A laptop gets closed, and a job with no
runner does not fail — it *queues*, leaving required checks pending and the PR
unmergeable with nothing red. Merges to main must never depend on this machine.

---

## Security model

The VM boundary is the whole security model. In-guest uid separation is not
attempted: the runner user keeps passwordless sudo because
`playwright install --with-deps` shells out to `sudo apt-get`.

What the boundary actually buys:

- **`mounts: []`** — the guest cannot see the Mac's filesystem. This is what
  makes running CI "as my own user" safe: `~/Documents/Coding/PropertyPro/.env.local`
  holds the production `DATABASE_URL` and Supabase service-role key, and CI
  cannot read it. Verified: `ls /Users` fails in-guest.
- **`portForwards` all ignored** — Lima forwards guest ports to the Mac's
  localhost by default. This machine already runs Postgres on 5432 and Supabase
  on 54321-54327, so that default would both collide with real services and
  expose CI-controlled ports to every process on the Mac.
- **nftables egress block** — no new outbound connections to RFC1918. A
  compromised npm postinstall gets internet access but cannot reach the Mac's
  services or anything else on the LAN. Verified: host `:22` and `:3000` refuse.

Realistic threat here is a compromised dependency, not a malicious fork PR — the
repo is private and effectively single-writer. Also verified: neither `ci.yml`
nor `integration-tests.yml` references `secrets.*` at all, so the only
credential reaching the VM is the job's ephemeral `GITHUB_TOKEN`, already scoped
`contents: read`.

**The VM does not fix `.env.local` itself.** Every ordinary `pnpm install` runs
package lifecycle scripts on the *Mac* as your user. The file has been
`chmod 600`'d; rotating the service-role key and prod DB password is still worth
doing on its own merits.

---

## Traps found while building this (all cost a rebuild)

1. **`flush ruleset` breaks DNS.** Ubuntu's stock `/etc/nftables.conf` opens
   with it, and it is the obvious thing to copy — but Lima installs its own
   `table ip nat` with a LIMADNS chain, and flushing takes name resolution with
   it. Replace only your own table.
2. **Lima's resolver is not where the docs imply.** An address-scoped carve-out
   for `192.168.5.3` missed: `resolvectl` reports `192.168.5.2`. Match DNS on
   **port 53**, not on a guessed address.
3. **`ct state established,related accept` is mandatory.** Without it, replies
   to the host's inbound SSH are dropped (destination `192.168.5.2`) and
   `limactl shell` hangs forever.
4. **Finding the guest user is genuinely awkward.** `ls /home | head -1` can
   return the `<user>.linux` symlink Lima also creates, and the standard
   `uid >= 1000` filter matches nothing because Lima maps the macOS uid straight
   through — the user is **uid 501**. Use owner-of-a-non-root-home.
5. **macOS `tar` smuggles AppleDouble files.** Copying the repo in with
   `tar czf -` produced 5,416 `._*` files from `com.apple.provenance` xattrs;
   the help-article loader parsed them as MDX and 816 test files "failed".
   Purely an artifact of manual transfer — `actions/checkout` never does this —
   but it looked exactly like a real arm64 regression for one confusing run.
