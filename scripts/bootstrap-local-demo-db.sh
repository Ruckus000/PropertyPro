#!/usr/bin/env bash
set -euo pipefail

# Resets a safe, local-only demo database by cloning the already bootstrapped
# local test DB, clearing app-owned schemas, and restoring the minimal auth
# helpers required by later migrations.

usage() {
  cat <<'EOF'
Usage:
  scripts/bootstrap-local-demo-db.sh

Optional overrides:
  PROPERTYPRO_LOCAL_DB_HOST      default: local socket
  PROPERTYPRO_LOCAL_DB_PORT      default: postgres client default
  PROPERTYPRO_LOCAL_DB_NAME      default: propertypro_demo_local
  PROPERTYPRO_LOCAL_DB_TEMPLATE  default: propertypro_test
EOF
}

if [[ "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

db_name="${PROPERTYPRO_LOCAL_DB_NAME:-propertypro_demo_local}"
template_db="${PROPERTYPRO_LOCAL_DB_TEMPLATE:-propertypro_test}"
db_host="${PROPERTYPRO_LOCAL_DB_HOST:-}"
db_port="${PROPERTYPRO_LOCAL_DB_PORT:-}"

dropdb_args=()
createdb_args=()
psql_args=()

if [[ -n "$db_host" ]]; then
  dropdb_args+=(-h "$db_host")
  createdb_args+=(-h "$db_host")
  psql_args+=(-h "$db_host")
fi

if [[ -n "$db_port" ]]; then
  dropdb_args+=(-p "$db_port")
  createdb_args+=(-p "$db_port")
  psql_args+=(-p "$db_port")
fi

export PGGSSENCMODE="${PGGSSENCMODE:-disable}"

dropdb_cmd=(dropdb --if-exists)
if ((${#dropdb_args[@]} > 0)); then
  dropdb_cmd+=("${dropdb_args[@]}")
fi
dropdb_cmd+=("$db_name")
"${dropdb_cmd[@]}"

createdb_cmd=(createdb)
if ((${#createdb_args[@]} > 0)); then
  createdb_cmd+=("${createdb_args[@]}")
fi
createdb_cmd+=(-T "$template_db" "$db_name")
"${createdb_cmd[@]}"

psql_cmd=(psql)
if ((${#psql_args[@]} > 0)); then
  psql_cmd+=("${psql_args[@]}")
fi
psql_cmd+=(-d "$db_name" -v ON_ERROR_STOP=1)
"${psql_cmd[@]}" <<'SQL'
drop schema if exists public cascade;
create schema public;
grant all on schema public to postgres;
grant all on schema public to public;
drop schema if exists drizzle cascade;

create schema if not exists auth;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('role', true), ''),
    'authenticated'
  )::text
$$;
SQL

echo "Bootstrapped local demo DB: $db_name (template: $template_db)"
