#!/usr/bin/env bash
set -euo pipefail

# Manage a LOCAL, disposable Postgres database for the integration suite so
# local test runs never touch production.
#
# WHY: the repo's `.env.local` DATABASE_URL points at PRODUCTION, and running the
# integration suite through `scripts/with-env-local.sh` therefore seeds/mutates
# prod (this is how ~89 test communities leaked). This script gives the suite an
# isolated local database that mirrors CI's ephemeral service container exactly
# (same Supabase stub + same migrations + same privileged `postgres` role), so
# "green locally" == "green in CI".
#
# It NEVER sources `.env.local`; it builds a localhost DATABASE_URL/DIRECT_URL
# explicitly and refuses to run against a non-local host.
#
# The suite must connect as a role the app treats as privileged
# (`pp_rls_is_privileged()` — postgres / service_role / supabase_admin), because
# the scoped client relies on that instead of setting the tenant GUC. CI uses
# `postgres`; we default to `postgres` too and create it if missing.
#
# Usage:
#   scripts/local-test-db.sh setup   # create (if needed), stub, migrate — idempotent (default)
#   scripts/local-test-db.sh reset   # drop + recreate + stub + migrate (clean slate)
#   scripts/local-test-db.sh url      # print the resolved DATABASE_URL
#
# Config (env overrides):
#   PROPERTYPRO_TEST_DB_NAME    default: propertypro_test
#   PROPERTYPRO_TEST_DB_HOST    default: localhost
#   PROPERTYPRO_TEST_DB_PORT    default: 5432
#   PROPERTYPRO_TEST_DB_USER    default: postgres  (must be a privileged role)
#   PROPERTYPRO_TEST_DB_ADMIN_USER  bootstrap superuser for create/drop/role;
#                                   default: $PGUSER or $USER (homebrew superuser)
#   PROPERTYPRO_TEST_DATABASE_URL   full override (skips create/drop/role mgmt)
#   PROPERTYPRO_ALLOW_REMOTE_TEST_DB=1   escape hatch to allow a non-local host

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
stub_sql="$script_dir/sql/local-supabase-stub.sql"
post_migrate_sql="$script_dir/sql/local-supabase-post-migrate.sql"

# Homebrew/libpq on macOS otherwise renegotiates GSS and stalls local sockets.
export PGGSSENCMODE="${PGGSSENCMODE:-disable}"

db_name="${PROPERTYPRO_TEST_DB_NAME:-propertypro_test}"
db_host="${PROPERTYPRO_TEST_DB_HOST:-localhost}"
db_port="${PROPERTYPRO_TEST_DB_PORT:-5432}"
db_user="${PROPERTYPRO_TEST_DB_USER:-postgres}"
admin_user="${PROPERTYPRO_TEST_DB_ADMIN_USER:-${PGUSER:-$USER}}"

if [[ -n "${PROPERTYPRO_TEST_DATABASE_URL:-}" ]]; then
  database_url="$PROPERTYPRO_TEST_DATABASE_URL"
  managed=0 # externally-provided URL: don't create/drop/role-manage it
else
  database_url="postgresql://${db_user}@${db_host}:${db_port}/${db_name}"
  managed=1
fi

# --- Safety: refuse a non-local host unless explicitly allowed. Prevents this
# tool from ever pointing the destructive reset/migrate at a remote (prod) DB.
url_host="$(printf '%s' "$database_url" | sed -E 's#^[a-z]+://([^@/]*@)?([^:/]+).*#\2#')"
if [[ "$url_host" != "localhost" && "$url_host" != "127.0.0.1" && "$url_host" != "::1" ]]; then
  if [[ "${PROPERTYPRO_ALLOW_REMOTE_TEST_DB:-}" != "1" ]]; then
    echo "ERROR: refusing to use non-local test DB host '$url_host'." >&2
    echo "       This tool is for a LOCAL disposable database only." >&2
    echo "       Set PROPERTYPRO_ALLOW_REMOTE_TEST_DB=1 to override (not recommended)." >&2
    exit 1
  fi
  echo "WARNING: operating against non-local host '$url_host' (override set)." >&2
fi

# Maintenance connection (the 'postgres' db) as the bootstrap superuser.
admin_url="postgresql://${admin_user}@${db_host}:${db_port}/postgres"

db_exists() {
  [[ "$(psql "$admin_url" -tAc "SELECT 1 FROM pg_database WHERE datname='${db_name}'" 2>/dev/null)" == "1" ]]
}

ensure_privileged_role() {
  # The suite connects as $db_user, which must be a login role the app considers
  # privileged. Create it (superuser, matching CI's postgres) if it doesn't exist.
  local exists
  exists="$(psql "$admin_url" -tAc "SELECT 1 FROM pg_roles WHERE rolname='${db_user}'" 2>/dev/null || true)"
  if [[ "$exists" != "1" ]]; then
    echo "Creating login role '${db_user}' ..."
    psql "$admin_url" -v ON_ERROR_STOP=1 -q -c "CREATE ROLE \"${db_user}\" LOGIN SUPERUSER"
  fi
}

apply_stub() {
  psql "$database_url" -v ON_ERROR_STOP=1 -q -f "$stub_sql"
}

# Must run AFTER migrations: the stub's ALTER DEFAULT PRIVILEGES grants every
# table the migrations then create, so the revocations have to be re-applied
# once those tables exist.
apply_post_migrate() {
  psql "$database_url" -v ON_ERROR_STOP=1 -q -f "$post_migrate_sql"
}

run_migrations() {
  # drizzle.config.ts reads DIRECT_URL; the runtime reads DATABASE_URL. Set both
  # to the local DB and do NOT source .env.local, so migrations hit LOCAL only.
  DATABASE_URL="$database_url" DIRECT_URL="$database_url" \
    pnpm --dir "$repo_root" --filter @propertypro/db db:migrate
}

cmd="${1:-setup}"
case "$cmd" in
  url)
    echo "$database_url"
    ;;
  reset)
    if [[ "$managed" != "1" ]]; then
      echo "ERROR: cannot reset an externally-provided PROPERTYPRO_TEST_DATABASE_URL." >&2
      exit 1
    fi
    ensure_privileged_role
    echo "Dropping and recreating ${db_name} ..."
    dropdb --if-exists -h "$db_host" -p "$db_port" -U "$admin_user" "$db_name"
    createdb -h "$db_host" -p "$db_port" -U "$admin_user" -O "$db_user" "$db_name"
    apply_stub
    run_migrations
    apply_post_migrate
    echo "Reset complete: $database_url"
    ;;
  setup)
    if [[ "$managed" == "1" ]]; then
      ensure_privileged_role
      if ! db_exists; then
        echo "Creating ${db_name} ..."
        createdb -h "$db_host" -p "$db_port" -U "$admin_user" -O "$db_user" "$db_name"
      fi
    fi
    apply_stub
    if ! run_migrations; then
      echo "" >&2
      echo "Migration failed. If '${db_name}' predates the migration squash (its" >&2
      echo "drizzle ledger won't match the current baseline), run a clean reset:" >&2
      echo "    pnpm db:test-local:reset" >&2
      exit 1
    fi
    apply_post_migrate
    echo "Ready: $database_url"
    ;;
  *)
    echo "Unknown command '$cmd' (expected: setup | reset | url)" >&2
    exit 64
    ;;
esac
