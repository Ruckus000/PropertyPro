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

# The packages/db RLS suite lives behind its own config, which CI now also runs
# (.github/workflows/integration-tests.yml). Run it here too so "green locally"
# == "green in CI" — that contract is the reason the stub is shared, and it was
# quietly false for this suite: it ran in neither place.
#
# Whole-suite mode only. A path argument is meant for an apps/web file, and
# forwarding it to the db config would just select nothing and report a
# confusing pass.
if [[ $# -eq 0 ]]; then
  echo ""
  echo "Running database RLS policy tests against ${database_url}"
  # Scoped to the RLS file, matching the CI step exactly. The rest of
  # packages/db's integration config has pre-existing failures unrelated to RLS
  # (seed-demo / reset-demo / schema-gate0 want seeded demo data; several others
  # fail on this vanilla-Postgres harness), so running the whole config here
  # would report a red local run for problems this script cannot fix.
  DATABASE_URL="$database_url" \
  DIRECT_URL="$database_url" \
    pnpm --dir "$repo_root" --filter @propertypro/db exec vitest run \
      --config vitest.integration.config.ts \
      __tests__/rls-policies.integration.test.ts
fi
