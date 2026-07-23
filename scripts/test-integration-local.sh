#!/usr/bin/env bash
set -euo pipefail

# Run the integration suite against the LOCAL disposable database instead of the
# production DB that `.env.local` points at. Ensures the local DB exists and is
# migrated, then runs the integration Vitest config with DATABASE_URL/DIRECT_URL
# pointed at localhost.
#
# Usage:
#   scripts/test-integration-local.sh                 # whole integration suite
#   scripts/test-integration-local.sh <vitest args>   # e.g. a single file
#
# Env: same overrides as scripts/local-test-db.sh (PROPERTYPRO_TEST_DB_*).
# Set SKIP_DB_SETUP=1 to skip the ensure/migrate step (DB already prepared).

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"

if [[ "${SKIP_DB_SETUP:-}" != "1" ]]; then
  "$script_dir/local-test-db.sh" setup
fi

database_url="$("$script_dir/local-test-db.sh" url)"

echo "Running integration tests against ${database_url}"
DATABASE_URL="$database_url" \
DIRECT_URL="$database_url" \
PROPERTYPRO_SEED_ENV="${PROPERTYPRO_SEED_ENV:-ci}" \
  pnpm --dir "$repo_root" exec vitest run \
    --config "$repo_root/apps/web/vitest.integration.config.ts" "$@"
