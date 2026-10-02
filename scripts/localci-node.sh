# Sourced (not executed) at the top of every localci.yml step:
#
#   . scripts/localci-node.sh && <command>
#
# localci runs each step with `sh -c`, which inherits whatever Node the parent
# shell happens to have. On this machine that was v20 while `.nvmrc` pins 24, so
# the suite ran on the wrong major (`WARN Unsupported engine`) and the slower
# runtime pushed whole-repo guard tests past their timeouts.
#
# This switches to the `.nvmrc` major for the rest of the step, and refuses to
# continue when it cannot: running the suite on the wrong Node and reporting the
# result is the failure this file exists to remove. Exit 2 = "could not check".
#
# POSIX sh: localci invokes `sh`, not bash or zsh. Must be sourced from the repo
# root, where `.nvmrc` lives.

NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
export NVM_DIR

if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  echo "localci-node: nvm not found at $NVM_DIR/nvm.sh; refusing to run on $(node -v 2>/dev/null || echo 'no node')." >&2
  echo "localci-node: install nvm or set NVM_DIR so steps run on the .nvmrc major ($(cat .nvmrc 2>/dev/null))." >&2
  exit 2
fi

. "$NVM_DIR/nvm.sh"

if ! nvm use --silent >/dev/null; then
  echo "localci-node: 'nvm use' failed for .nvmrc ($(cat .nvmrc 2>/dev/null)); run 'nvm install' first." >&2
  exit 2
fi

want="$(sed 's/^v//; s/\..*//' .nvmrc)"
have="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$have" != "$want" ]; then
  echo "localci-node: on Node $have after 'nvm use', but .nvmrc wants $want." >&2
  exit 2
fi

# `nvm use` swaps out the old version's bin dir, taking any pnpm installed as a
# global of THAT version with it. Say so here rather than letting every step die
# with a bare "pnpm: command not found" (127).
if ! command -v pnpm >/dev/null 2>&1; then
  echo "localci-node: no pnpm on PATH under Node $have; 'corepack enable' or install pnpm for this version." >&2
  exit 2
fi
