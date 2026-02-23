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

exec "$@"
