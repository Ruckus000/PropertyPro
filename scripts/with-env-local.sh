#!/usr/bin/env bash
set -euo pipefail

# Standardized wrapper for local verification commands that require .env.local.

usage() {
  cat <<'EOF'
Usage:
  scripts/with-env-local.sh <command> [args...]

Examples:
  scripts/with-env-local.sh pnpm --filter @propertypro/db test:integration
  scripts/with-env-local.sh pnpm test:integration:preflight
EOF
}

if [[ $# -lt 1 ]]; then
  usage >&2
  exit 64
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
env_file="$repo_root/.env.local"

if [[ ! -f "$env_file" ]]; then
  echo "Missing required env file: $env_file" >&2
  exit 66
fi

# Capture a caller-provided NODE_ENV (e.g. `NODE_ENV=staging scripts/…`) so
# we can preserve it across sourcing. `${VAR+x}` is the nounset-safe way to
# test whether a variable was set at all.
_caller_node_env_set="${NODE_ENV+x}"
_caller_node_env="${NODE_ENV-}"

set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

# Drop any NODE_ENV contributed by .env.local, but restore a caller-provided
# override if there was one. Why: older .env.local files (see .env.example
# history) set `NODE_ENV=development`, which breaks `next build` — Next's
# `module.compiled.js` picks `pages.runtime.dev.js` when NODE_ENV=development
# while the build pipeline is compiled for production. The two runtimes ship
# different `HtmlContext` instances, so the Pages-Router `<Html>` consumer
# reads a different context than the render-pipeline Provider, and prerender
# of `/_error: /404` throws "<Html> should not be imported outside of
# pages/_document". Absent an explicit caller value, let downstream commands
# (next build/dev, vitest, etc.) set NODE_ENV themselves.
if [[ -n "$_caller_node_env_set" ]]; then
  export NODE_ENV="$_caller_node_env"
else
  unset NODE_ENV
fi
unset _caller_node_env_set _caller_node_env

exec "$@"
