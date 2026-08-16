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

### The shadow phase — COMPLETE, workflow retired

`self-hosted-shadow.yml` ran the two job bodies on the self-hosted label
alongside the real hosted jobs as a NON-REQUIRED workflow (#913). It was
**deleted once CI cut over**, because from that point it stopped shadowing
anything and merely competed with the real jobs for the same VM — which is the
precise failure it had been built to detect.

**What it found, which is the reason the phase existed.** The very first real
shadow run failed two tests with `Test timed out in 5000ms` —
`contracts-route.test.ts:191` and `esign-route.test.ts:189` — neither of which
asserts anything about timing, while the hosted job was green on the same
commit. vitest's fork pool defaults to `availableParallelism() - 1`: 3 on a
4-core hosted runner, 7 on this 8-vCPU VM, and two jobs sharing the VM put up to
14 forks on 8 vCPUs. The earlier `demo-token` failure (#912) was the same cause,
which means fixing tests one at a time was closing instances, not the category.

Fixed in #916 and carried into `ci.yml` when the shadow workflow was retired:
`VITEST_MAX_FORKS=4` plus `--testTimeout=15000`, applied only when
`runner.environment == 'self-hosted'`. **If that guard is ever lost, the
timeouts come back** — it is the only thing keeping the real Unit Tests job from
running in the exact configuration that failed.

A sequential gate cannot find any of this. Replaying steps one at a time never
produces contention.

Still worth watching now that the phase is over:

- **Retry masking.** `retries: 2` can turn a new flake into slow-but-green.
  Compare retry counts, not just pass/fail.
- **Disk growth.** Lima images never shrink. Watch the trend across runs.

### Cutting over

Done on 2026-08-07. Recorded here because these are the two levers to reach for
when the arrangement misbehaves — and **only after the shadow phase**, never at
install time. Two variables, because the watchdog must be able to fail CI back
without ever inventing the decision to cut over in the first place:

```bash
gh variable set CI_RUNNER_DESIRED_LABEL --body propertypro-mac  # operator intent
gh variable set CI_RUNNER_LABEL         --body propertypro-mac  # what ci.yml reads
```

`runner-watchdog.yml` moves `CI_RUNNER_LABEL` between `ubuntu-latest` and
`CI_RUNNER_DESIRED_LABEL` as the runner goes offline and comes back. With
`CI_RUNNER_DESIRED_LABEL` unset it does nothing at all — which is what kept the
shadow phase from ending itself the first time a runner came online, and is now
the way to hold CI on hosted runners: clearing that variable is what makes a
manual `CI_RUNNER_LABEL=ubuntu-latest` stick instead of being reconciled back
within 10 minutes.

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

> **Corrected 2026-08-16: none of that was in effect for the first nine days.**
> The three paths were exported via `/etc/environment`, which `pam_env` reads only
> on a real PAM login — and jobs start through `limactl shell -- bash -lc`, which
> bypasses PAM. Measured in that shell, `RUNNER_TOOL_CACHE` and
> `PLAYWRIGHT_BROWSERS_PATH` were both **unset**. So `/opt/ci-cache/tool-cache`
> sat empty at 4.0K while each runner carried its own 40M `.cache/node`,
> `ms-playwright` was duplicated three ways (929M shared + 929M per runner), and
> the 1.2G `pnpm-store` was orphaned because pnpm resolved its store under `$HOME`
> — to a directory that did not even exist. The "silent ~30s tax that reads as
> *the VM is slow*" warned about just above was being paid on every job.
>
> The exports now live in `runner-supervisor.sh`, inside the `limactl shell`
> command. Adding a variable to `/etc/environment` alone will look correct and do
> nothing.

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

**Corrected 2026-08-16: the repo is PUBLIC, not private.** This paragraph used to
read "the repo is private and effectively single-writer" and concluded a malicious
fork PR was not a realistic threat. That premise was false, and it is the premise
this whole isolation posture was argued from — so treat a malicious fork PR as in
scope, alongside a compromised dependency.

`ci.yml` now selects the self-hosted label only for same-repo pull requests, which
removes the accidental path. It is **not** a boundary: for `pull_request`, GitHub
reads the workflow from the PR's own merge ref, so a fork PR can edit that
condition out or add a workflow naming the label. The gate a fork cannot edit is
the approval policy — currently `first_time_contributors`, which stops covering an
author after their first merged PR. `all_external_contributors` is the setting that
actually holds:

```
gh api -X PUT repos/Ruckus000/PropertyPro/actions/permissions/fork-pr-contributor-approval \
  -f approval_policy=all_external_contributors
```

Note the amplifier below: `/opt/ci-cache` is shared across jobs by design, so a job
that does reach the runner can poison the pnpm store and Playwright browsers for
subsequent same-repo jobs.

Also verified: neither `ci.yml` nor `integration-tests.yml` references `secrets.*`
at all, so the only credential reaching the VM is the job's ephemeral
`GITHUB_TOKEN`, already scoped `contents: read`.

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
