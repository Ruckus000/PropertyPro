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
RUNNER_DIR="/opt/runners/${IDX}"

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

cleanup() {
  log 'supervisor exiting; wiping work tree'
  wipe_work
}
trap cleanup EXIT

ensure_runner_dir

while true; do
  wipe_work

  # Single-use JIT config. A fresh one is minted per job; there is nothing
  # persistent to steal from inside the VM.
  log 'requesting JIT config'
  JIT="$(
    api -X POST "repos/${REPO}/actions/runners/generate-jitconfig" \
      -f "name=${LABEL}-${IDX}-$(date -u +%s)" \
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
  limactl shell "$VM" -- bash -lc \
    "cd '${RUNNER_DIR}' && ./run.sh --jitconfig '${JIT}'" || \
    log 'runner exited non-zero (job failure is normal here)'

  log 'job finished; recycling'
  sleep 2
done
