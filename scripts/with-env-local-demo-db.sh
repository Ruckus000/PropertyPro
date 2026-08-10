#!/usr/bin/env bash
set -euo pipefail

# Standardized wrapper for commands that need the normal local app env plus a
# safe, local-only override for Postgres AND Supabase.
#
# ## Why Supabase is redirected too, and why that is not optional
#
# This script used to override DATABASE_URL / DIRECT_URL and nothing else, while
# sourcing the rest of `.env.local` verbatim — where NEXT_PUBLIC_SUPABASE_URL and
# SUPABASE_SERVICE_ROLE_KEY point at PRODUCTION.
#
# That is not a theoretical hazard, it was this file's own documented example.
# `pnpm seed:demo` calls `createAdminClient()` and then
# `admin.auth.admin.listUsers()` (scripts/seed-demo.ts) and uploads seeded PDFs
# via `admin.storage.from('documents')`. So the recommended invocation wrote to a
# LOCAL Postgres while creating users and objects in PRODUCTION Supabase, with
# the production service-role key. `DEMO_SEED_SYNC_AUTH_USERS` defaults to ON,
# so nothing stopped it; an e2e spec even documents `DEMO_SEED_SYNC_AUTH_USERS=0`
# as a workaround, which patched the symptom in an error message rather than the
# script. The old usage text also recommended `pnpm test:e2e`, whose
# `/dev/agent-login` calls `auth.admin.generateLink` against whatever GoTrue this
# env names.
#
# The invariant is therefore: **local Postgres implies local Supabase.** A
# half-redirected env is the dangerous state, because it looks local and writes
# remote.
#
# ## Fail CLOSED
#
# Keys are not defaulted to anything. If you do not supply local ones, they are
# UNSET, and `createAdminClient()` throws "Missing SUPABASE_SERVICE_ROLE_KEY"
# (packages/db/src/supabase/admin.ts). Commands that need no Supabase at all —
# `db:migrate` — are unaffected. Commands that do need it stop with a loud,
# harmless error instead of quietly reaching production.

usage() {
  cat <<'EOF'
Usage:
  scripts/with-env-local-demo-db.sh <command> [args...]

Overrides Postgres AND Supabase to local. Refuses to run if either still
points somewhere remote — see "Safety" below.

Examples:
  # Needs no Supabase; works with nothing else set.
  scripts/with-env-local-demo-db.sh pnpm --filter @propertypro/db db:migrate

  # Needs Supabase (auth users + storage), so supply LOCAL keys from
  # `supabase status`, or it stops with "Missing SUPABASE_SERVICE_ROLE_KEY".
  PROPERTYPRO_LOCAL_SUPABASE_SERVICE_ROLE_KEY=<local service_role key> \
  PROPERTYPRO_LOCAL_SUPABASE_ANON_KEY=<local anon key> \
    scripts/with-env-local-demo-db.sh pnpm seed:demo

NOT for `pnpm test:e2e`. That suite needs a full local stack (Auth + Storage +
a seed), not an env override — see docs/audits/2026-08-03-e2e-inventory.md and
the E2E preconditions in CLAUDE.md. The old example here was unsafe.

Optional overrides:
  PROPERTYPRO_LOCAL_DB_HOST      default: 127.0.0.1
  PROPERTYPRO_LOCAL_DB_PORT      default: 5432
  PROPERTYPRO_LOCAL_DB_NAME      default: propertypro_demo_local
  PROPERTYPRO_LOCAL_DB_USER      default: postgres
  PROPERTYPRO_LOCAL_DB_PASSWORD  default: empty
  PROPERTYPRO_LOCAL_DATABASE_URL explicit runtime URL override
  PROPERTYPRO_LOCAL_DIRECT_URL   explicit migrate URL override

  PROPERTYPRO_LOCAL_SUPABASE_URL              default: http://127.0.0.1:54321
  PROPERTYPRO_LOCAL_SUPABASE_ANON_KEY         default: unset (fails closed)
  PROPERTYPRO_LOCAL_SUPABASE_SERVICE_ROLE_KEY default: unset (fails closed)

Also UNSET, with no override: UPSTASH_REDIS_REST_URL / _TOKEN. The rate limiter
degrades to its in-memory implementation locally; there is no local Upstash.

Safety:
  Every resolved URL must resolve to a loopback host. If one does not, the
  script exits 78 without running your command. There is deliberately no
  opt-out flag: the only reason to want one is to point a "local" wrapper at
  production, which is the bug this guard exists to prevent.
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

# --- Supabase follows Postgres to local ------------------------------------
#
# Sourced-from-.env.local values are PRODUCTION. They are replaced, not left
# alone: see the header for what the half-redirected env did.

export NEXT_PUBLIC_SUPABASE_URL="${PROPERTYPRO_LOCAL_SUPABASE_URL:-http://127.0.0.1:54321}"
# Some call sites read the unprefixed name; keep the two in step rather than
# leaving one of them pointing at production.
export SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL"

# Keys are UNSET rather than defaulted. A wrong-but-present key is the failure
# mode worth engineering against — it authenticates somewhere. A missing one
# makes `createAdminClient()` throw by name.
if [[ -n "${PROPERTYPRO_LOCAL_SUPABASE_ANON_KEY:-}" ]]; then
  export NEXT_PUBLIC_SUPABASE_ANON_KEY="$PROPERTYPRO_LOCAL_SUPABASE_ANON_KEY"
else
  unset NEXT_PUBLIC_SUPABASE_ANON_KEY || true
fi

if [[ -n "${PROPERTYPRO_LOCAL_SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  export SUPABASE_SERVICE_ROLE_KEY="$PROPERTYPRO_LOCAL_SUPABASE_SERVICE_ROLE_KEY"
else
  unset SUPABASE_SERVICE_ROLE_KEY || true
fi

# --- Upstash Redis follows Postgres to local ---------------------------------
#
# Same invariant as Supabase above, for the same reason. The middleware rate
# limiter consults Upstash for the `auth` and `esign-sign` tiers, and
# `.env.local` names the PRODUCTION Upstash instance. Sourced verbatim, a
# "local" run writes rate-limit counters into production and pays a real
# network round-trip for every login attempt — which is exactly how it was
# first noticed: the e2e suite went from 41s to 52 MINUTES.
#
# Unset rather than redirected: the limiter degrades to its in-memory
# implementation when these are absent, which is the correct local behaviour.
# There is no local Upstash to point at.
unset UPSTASH_REDIS_REST_URL || true
unset UPSTASH_REDIS_REST_TOKEN || true

# --- Outbound mail follows Postgres to local ---------------------------------
#
# Same invariant as Supabase and Upstash above, and the last one that was still
# missing: `.env.local` carries the PRODUCTION Resend key, and nothing here used
# to touch it. So a run against a LOCAL database could still deliver real email
# to real people — arguably worse than the production case, because the contents
# are built from throwaway seed data.
#
# EMAIL_DRY_RUN (packages/email/src/send.ts) collects and logs every message
# instead of transmitting it. Forced on with no opt-out: there is no legitimate
# reason for a local-database run to mail anyone. To send for real, use
# scripts/with-env-local.sh with PROPERTYPRO_ALLOW_OUTBOUND_MAIL=1, which at
# least targets the production database the mail will describe.
export EMAIL_DRY_RUN=1

# --- The guard --------------------------------------------------------------
#
# Belt to the braces above. The redirects are unconditional, so this can only
# fire when an explicit PROPERTYPRO_LOCAL_* override names something remote —
# which is exactly the mistake that would otherwise be silent.

host_of() {
  # strip scheme, then credentials, then path/query, then :port
  printf '%s' "$1" \
    | sed -E 's#^[a-zA-Z][a-zA-Z0-9+.-]*://##; s#^[^@/]*@##; s#[/?].*$##; s#:[0-9]+$##'
}

assert_loopback() {
  local label="$1" value="$2" host
  [[ -z "$value" ]] && return 0
  host="$(host_of "$value")"
  case "$host" in
    localhost | 127.0.0.1 | ::1 | '[::1]' | 0.0.0.0 | host.docker.internal | *.localtest.me)
      return 0
      ;;
  esac
  cat >&2 <<EOF
REFUSING TO RUN — $label is not local.

  $label host: $host

This wrapper exists to keep a local command off production. A remote host here
means the command would run against real data with real credentials, which is
the exact failure it was written to prevent.

If you meant to target that host, do not use this wrapper.
EOF
  exit 78
}

assert_loopback 'DATABASE_URL' "$DATABASE_URL"
assert_loopback 'DIRECT_URL' "$DIRECT_URL"
assert_loopback 'NEXT_PUBLIC_SUPABASE_URL' "$NEXT_PUBLIC_SUPABASE_URL"

exec "$@"
