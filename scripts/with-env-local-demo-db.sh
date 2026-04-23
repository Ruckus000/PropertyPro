#!/usr/bin/env bash
set -euo pipefail

# Standardized wrapper for commands that need the normal local app env plus a
# safe, local-only Postgres override for DATABASE_URL / DIRECT_URL.

usage() {
  cat <<'EOF'
Usage:
  scripts/with-env-local-demo-db.sh <command> [args...]

Examples:
  scripts/with-env-local-demo-db.sh pnpm --filter @propertypro/db db:migrate
  scripts/with-env-local-demo-db.sh pnpm seed:demo
  scripts/with-env-local-demo-db.sh pnpm test:e2e -- e2e/esign-and-documents-flow.spec.ts

Optional overrides:
  PROPERTYPRO_LOCAL_DB_HOST      default: 127.0.0.1
  PROPERTYPRO_LOCAL_DB_PORT      default: 5432
  PROPERTYPRO_LOCAL_DB_NAME      default: propertypro_demo_local
  PROPERTYPRO_LOCAL_DB_USER      default: postgres
  PROPERTYPRO_LOCAL_DB_PASSWORD  default: empty
  PROPERTYPRO_LOCAL_DATABASE_URL explicit runtime URL override
  PROPERTYPRO_LOCAL_DIRECT_URL   explicit migrate URL override
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

_caller_node_env_set="${NODE_ENV+x}"
_caller_node_env="${NODE_ENV-}"

set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

if [[ -n "$_caller_node_env_set" ]]; then
  export NODE_ENV="$_caller_node_env"
else
  unset NODE_ENV
fi
unset _caller_node_env_set _caller_node_env

local_db_host="${PROPERTYPRO_LOCAL_DB_HOST:-127.0.0.1}"
local_db_port="${PROPERTYPRO_LOCAL_DB_PORT:-5432}"
local_db_name="${PROPERTYPRO_LOCAL_DB_NAME:-propertypro_demo_local}"
local_db_user="${PROPERTYPRO_LOCAL_DB_USER:-postgres}"
local_db_password="${PROPERTYPRO_LOCAL_DB_PASSWORD:-}"

local_db_auth="$local_db_user"
if [[ -n "$local_db_password" ]]; then
  local_db_auth="${local_db_user}:${local_db_password}"
fi

default_local_db_url="postgresql://${local_db_auth}@${local_db_host}:${local_db_port}/${local_db_name}"

export DATABASE_URL="${PROPERTYPRO_LOCAL_DATABASE_URL:-$default_local_db_url}"
export DIRECT_URL="${PROPERTYPRO_LOCAL_DIRECT_URL:-${PROPERTYPRO_LOCAL_DATABASE_URL:-$default_local_db_url}}"
export PGGSSENCMODE="${PGGSSENCMODE:-disable}"

exec "$@"
