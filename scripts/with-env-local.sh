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

set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

# Drop NODE_ENV after sourcing. Older .env.local files (see .env.example
# history) set `NODE_ENV=development`, which breaks `next build`: Next's
# `module.compiled.js` picks `pages.runtime.dev.js` when NODE_ENV=development,
# but the build pipeline is compiled for production. The two runtimes carry
# different `HtmlContext` instances, so the Pages-Router `<Html>` consumer
# reads a different context than the render-pipeline Provider, and prerender
# of `/_error: /404` throws "<Html> should not be imported outside of
# pages/_document". Let downstream commands (next build/dev, vitest, etc.)
# set NODE_ENV themselves.
unset NODE_ENV

exec "$@"
