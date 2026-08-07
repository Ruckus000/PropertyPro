#!/usr/bin/env bash
#
# Supervises ONE ephemeral GitHub Actions runner inside the `ci` Lima VM.
#
# Run one instance per concurrent runner:
#   ./runner-supervisor.sh 1
#   ./runner-supervisor.sh 2
#
# WHY THE SUPERVISOR LIVES ON THE MAC AND NOT IN THE VM
#
# A runner *registration* credential is repo-admin-grade: anything holding it
# can register more runners against this repo. Keeping it on the host and
# minting a single-use JIT config per job means no long-lived credential ever
# exists inside the VM, where untrusted PR code runs. `config.sh --ephemeral`
# with a token file in the guest would be strictly worse.
#
# WHY TWO RUNNERS
#
# `Unit Tests` and `perf-check` run concurrently today on two GitHub-hosted
# runners. With a single self-hosted runner they would SERIALIZE, turning a
# max() into a sum() and giving back much of the speedup. Two keeps them
# parallel. The VM is sized for that.
#
# WHAT `--ephemeral` DOES AND DOES NOT DO
#
# It makes the runner accept exactly ONE job and then unregister. It does NOT
# clean disk — that is this script's job, below. Getting this wrong is how
# self-hosted runners accumulate state and start producing results that cannot
# be reproduced anywhere else.

set -euo pipefail

REPO="${PROPERTYPRO_CI_REPO:-Ruckus000/PropertyPro}"
VM="${PROPERTYPRO_CI_VM:-ci}"
LABEL="${PROPERTYPRO_CI_LABEL:-propertypro-mac}"
IDX="${1:?usage: runner-supervisor.sh <runner-index>}"
# Numeric-only, because IDX is interpolated into remote shell commands below.
case "$IDX" in
  '' | *[!0-9]*) echo "runner index must be a positive integer, got: $IDX" >&2; exit 1 ;;
esac
RUNNER_DIR="/opt/runners/${IDX}"
# Set when a JIT config is minted, so the EXIT trap can deregister it.
RUNNER_NAME=""

log() { printf '%s [runner-%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$IDX" "$*"; }

# `gh` reads its token from the login keychain, which is available because this
# runs as a launchd *agent* in the user session (not a daemon). Set GH_TOKEN to
# override with a fine-grained PAT (single repo, Administration: read/write).
api() { gh api "$@"; }

# --- one-time: give this runner index its own copy of the runner ------------
# Each concurrent runner needs its own _work tree; sharing one would let two
# jobs stomp each other's checkout.
ensure_runner_dir() {
  limactl shell "$VM" -- sudo bash -c "
    set -eu
    if [ ! -x '${RUNNER_DIR}/run.sh' ]; then
      mkdir -p '${RUNNER_DIR}'
      cp -a /opt/actions-runner/. '${RUNNER_DIR}/'
      # Owner-of-a-non-root-home. NOT \`ls /home | head -1\` (Lima also creates a
      # <user>.linux symlink) and NOT a uid>=1000 filter (Lima maps the macOS
      # uid through, so the user is uid 501). See lima-ci.yaml for the full note.
      CI_USER=\"\$(find /home -maxdepth 1 -mindepth 1 ! -user root -printf '%u\n' | head -1)\"
      chown -R \"\${CI_USER}:\${CI_USER}\" '${RUNNER_DIR}'
    fi
  "
}

# --- between every job: wipe job state, KEEP the caches ---------------------
#
# The split matters. Everything worth caching deliberately lives OUTSIDE
# `_work` (see the cache provisioning step in lima-ci.yaml), so wiping job
# state and keeping warm caches are not in tension:
#
#   wiped : _work/<repo>  _work/_temp  _work/_actions
#   kept  : /opt/ci-cache/tool-cache      (RUNNER_TOOL_CACHE — leave this
#                                          inside _work and setup-node
#                                          re-downloads the arm64 Node 20
#                                          tarball on EVERY job, a silent ~30s
#                                          tax that reads as "the VM is slow")
#           /opt/ci-cache/pnpm-store      (content-addressed + --frozen-lockfile,
#                                          so no state-carryover risk)
#           /opt/ci-cache/ms-playwright   (~150MB Chromium per job otherwise)
wipe_work() {
  limactl shell "$VM" -- sudo rm -rf "${RUNNER_DIR}/_work" || true
}

# --- kill this index's runner INSIDE the vm --------------------------------
#
# THE BUG THIS EXISTS FOR
#
# This supervisor runs on the Mac and starts the runner in the VM through
# `limactl shell`. Killing the supervisor — `launchctl unload`, a crash, a
# reboot of the agent — kills the Mac-side client but NOT the processes it
# started in the guest. `run.sh`'s Runner.Listener child simply reparents to
# init and keeps running: still registered with GitHub, still accepting jobs.
#
# Observed 2026-08-07 right after the CI cutover — four runners registered
# where there should have been two:
#
#   pid 145112 ppid=1 age=1396s /opt/runners/1/bin/Runner.Listener  <- orphan
#   pid 168692 ppid=1 age=1265s /opt/runners/2/bin/Runner.Listener  <- orphan
#
# That is not untidiness. Those orphans predated the per-runner $HOME fix, so
# they still shared one home directory, AND they occupied the same
# /opt/runners/N directory as the live runners — two listeners checking out
# into one _work tree is arbitrary corruption, on what are now REQUIRED checks.
# It is also invisible: `launchctl list` shows the expected two agents.
#
# WHY THE SCRIPT COMES IN ON STDIN (`bash -s`) AND NOT AS `bash -c '...'`
#
# `pgrep -f` matches against every process's argv. With `bash -c` the pattern
# would appear in OUR OWN argv, so the sweep would find and kill its own shell.
# Passing the script on stdin keeps the remote argv down to `bash -s -- <idx>`,
# where the pattern never appears. pgrep already excludes itself.
kill_vm_runner() {
  limactl shell "$VM" -- sudo bash -s -- "$IDX" <<'REMOTE' || true
set -u
idx="$1"
pat="/opt/runners/${idx}/bin/"
pids="$(pgrep -f "$pat" || true)"
[ -z "$pids" ] && exit 0
kill -TERM $pids 2>/dev/null || true
# A listener mid-job ignores TERM for a while; escalate rather than leak.
for _ in 1 2 3 4 5 6 7 8 9 10; do
  sleep 1
  pgrep -f "$pat" >/dev/null 2>&1 || exit 0
done
kill -KILL $(pgrep -f "$pat") 2>/dev/null || true
exit 0
REMOTE
}

# Remove the GitHub-side registration, so a killed runner does not linger as a
# phantom entry that the watchdog then counts as an available runner.
deregister_runner() {
  [ -n "$RUNNER_NAME" ] || return 0
  local id
  id="$(api "repos/${REPO}/actions/runners" \
        --jq ".runners[] | select(.name==\"${RUNNER_NAME}\") | .id" 2>/dev/null || true)"
  if [ -n "$id" ]; then
    api -X DELETE "repos/${REPO}/actions/runners/${id}" >/dev/null 2>&1 \
      && log "deregistered ${RUNNER_NAME}" || true
  fi
  RUNNER_NAME=""
  return 0
}

# Killing a runner's PROCESS does not remove its GitHub-side registration, and
# a registration outlives the process it described — briefly still reporting
# `online`. That phantom is not cosmetic: runner-watchdog.yml decides whether
# to fail CI back to hosted runners by COUNTING online runners, so a stale
# entry can convince it that a dead machine is available.
#
# Anything still registered for this index after the sweep is by definition
# stale, because the sweep just killed every process that could be serving it.
#
# `busy == false` ALONE IS NOT ENOUGH, and that is not obvious: a runner killed
# while a job was assigned to it stays `busy: true` indefinitely, because
# nothing ever reports the job finished. Filtering on `busy == false` therefore
# skips exactly the registrations most worth removing — the ones left by a hard
# kill. Accepting `status == "offline"` as well is what actually clears them,
# and it is safe: an offline runner is not serving anything, GitHub re-queues
# whatever it was assigned.
deregister_stale_for_index() {
  local ids
  ids="$(api "repos/${REPO}/actions/runners" \
        --jq ".runners[] | select(.name | startswith(\"${LABEL}-${IDX}-\")) | select(.busy==false or .status==\"offline\") | .id" \
        2>/dev/null || true)"
  for id in $ids; do
    api -X DELETE "repos/${REPO}/actions/runners/${id}" >/dev/null 2>&1 \
      && log "deregistered stale runner id=${id}" || true
  done
  return 0
}

cleanup() {
  log 'supervisor exiting; killing in-VM runner, deregistering, wiping work tree'
  kill_vm_runner
  deregister_runner
  wipe_work
}
# EXIT alone is not enough: launchd stops an agent with SIGTERM, and without
# these two the trap never runs and the guest-side runner is orphaned again.
trap cleanup EXIT INT TERM

ensure_runner_dir

# A previous supervisor may have died without running its trap (SIGKILL, a VM
# restart, or any version of this script from before the trap existed). Sweep
# before claiming the index, so we never end up with two listeners in one
# runner directory.
log 'sweeping any pre-existing runner for this index'
kill_vm_runner
deregister_stale_for_index

while true; do
  wipe_work

  # Single-use JIT config. A fresh one is minted per job; there is nothing
  # persistent to steal from inside the VM.
  log 'requesting JIT config'
  RUNNER_NAME="${LABEL}-${IDX}-$(date -u +%s)"
  JIT="$(
    api -X POST "repos/${REPO}/actions/runners/generate-jitconfig" \
      -f "name=${RUNNER_NAME}" \
      -F runner_group_id=1 \
      -f "labels[]=${LABEL}" \
      -f work_folder=_work \
      --jq .encoded_jit_config 2>/dev/null || true
  )"

  if [ -z "$JIT" ]; then
    log 'could not mint a JIT config (offline? token expired?); retrying in 30s'
    sleep 30
    continue
  fi

  log 'runner online, waiting for a job'
  # Runs until it has completed exactly one job, then exits.
  #
  # PER-RUNNER $HOME IS LOAD-BEARING, NOT TIDINESS.
  #
  # Both runners execute as the SAME user inside the one VM, so without this
  # they share a single home directory. `pnpm/action-setup@v4` self-installs
  # into `~/setup-pnpm`, and two concurrent jobs then race on that one
  # directory — one wipes and repopulates it while the other is reading, and
  # the loser dies with:
  #
  #   ENOENT: no such file or directory, open '~/setup-pnpm/package.json'
  #
  # Observed on PR #913 (run 31137648296). An earlier concurrent run had
  # survived the same race on timing luck, which is exactly why the shadow
  # phase runs for a week rather than once.
  #
  # The caches that are meant to be shared do not live under $HOME — they are
  # pinned by absolute path in /etc/environment (RUNNER_TOOL_CACHE,
  # PLAYWRIGHT_BROWSERS_PATH) — so splitting $HOME costs only a per-runner pnpm
  # store, a few GB against a 150GB disk.
  limactl shell "$VM" -- bash -lc \
    "mkdir -p '${RUNNER_DIR}/home' \
     && export HOME='${RUNNER_DIR}/home' PNPM_HOME='${RUNNER_DIR}/home/.pnpm' \
     && cd '${RUNNER_DIR}' && ./run.sh --jitconfig '${JIT}'" || \
    log 'runner exited non-zero (job failure is normal here)'

  # An ephemeral runner deregisters ITSELF once it finishes a job, so the name
  # no longer refers to anything. Clear it, or a later cleanup would chase a
  # registration that is already gone. While a job is in flight this stays set,
  # which is exactly when the trap needs it.
  RUNNER_NAME=""

  log 'job finished; recycling'
  sleep 2
done
