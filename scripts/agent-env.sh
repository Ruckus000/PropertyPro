#!/usr/bin/env bash
set -euo pipefail

# A complete, disposable local application environment for browser-driving
# agents.  It deliberately never reads .env.local: in this repository that
# file may name production credentials.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
state_root="${PROPERTYPRO_AGENT_ENV_ROOT:-${TMPDIR:-/tmp}/propertypro-agent-env}"
worktree_id="$(printf '%s' "$repo_root" | shasum -a 256 | cut -c1-12)"
sandbox="$state_root/$worktree_id"
supabase_workdir="$sandbox/supabase-project"
runtime_env="$sandbox/runtime.env"
secrets_env="$sandbox/secrets.env"
lease_root="$state_root/leases"
lease_file="$sandbox/slot"

usage() {
  cat <<'EOF'
Usage: scripts/agent-env.sh <prepare|status|reset|stop|exec|web|admin> [command args]

All commands create or use a Supabase/Auth/Storage stack isolated to this
worktree. It is always local and never loads .env.local.
EOF
}

require_tools() {
  command -v docker >/dev/null || { echo 'Docker is required for agent live testing.' >&2; exit 69; }
  docker info >/dev/null 2>&1 || { echo 'Docker is installed but not running.' >&2; exit 69; }
  pnpm --dir "$repo_root" exec supabase --version >/dev/null || {
    echo 'The pinned Supabase CLI is unavailable. Run pnpm install.' >&2; exit 69;
  }
}

port_in_use() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

ensure_slot() {
  mkdir -p "$sandbox" "$lease_root"
  if [[ -f "$lease_file" ]]; then
    slot="$(<"$lease_file")"
    return
  fi

  for candidate in $(seq 1 99); do
    candidate_dir="$lease_root/$candidate"
    if mkdir "$candidate_dir" 2>/dev/null; then
      printf '%s\n' "$worktree_id" > "$candidate_dir/worktree"
      printf '%s\n' "$candidate" > "$lease_file"
      slot="$candidate"
      return
    fi
    if [[ -f "$candidate_dir/worktree" ]] && [[ "$(<"$candidate_dir/worktree")" == "$worktree_id" ]]; then
      printf '%s\n' "$candidate" > "$lease_file"
      slot="$candidate"
      return
    fi
  done
  echo 'No free PropertyPro agent port slots remain. Stop an unused sandbox first.' >&2
  exit 75
}

set_ports() {
  api_port=$((50000 + slot * 10 + 1))
  db_port=$((50000 + slot * 10 + 2))
  shadow_port=$((50000 + slot * 10 + 3))
  studio_port=$((50000 + slot * 10 + 4))
  inbucket_port=$((50000 + slot * 10 + 5))
  pooler_port=$((50000 + slot * 10 + 6))
  analytics_port=$((50000 + slot * 10 + 7))
  vector_port=$((50000 + slot * 10 + 8))
  web_port=$((31000 + slot * 2))
  admin_port=$((web_port + 1))
}

assert_ports_free() {
  for port in "$api_port" "$db_port" "$shadow_port" "$studio_port" "$inbucket_port" "$pooler_port" "$analytics_port" "$vector_port"; do
    if port_in_use "$port"; then
      echo "Agent sandbox port $port is in use. Run pnpm agent:env:stop for the owning worktree." >&2
      exit 75
    fi
  done
}

configure_supabase() {
  local config="$supabase_workdir/supabase/config.toml"
  if [[ ! -f "$config" ]]; then
    mkdir -p "$supabase_workdir"
    pnpm --dir "$repo_root" exec supabase --workdir "$supabase_workdir" init --force >/dev/null
  fi

  # The CLI version is pinned in package.json, so these generated defaults are
  # a stable contract. Keep config outside the repository because every
  # worktree needs a different port block.
  perl -0pi -e "
    s/^project_id = .*/project_id = 'propertypro-agent-$worktree_id'/m;
    s/^port = 54321$/port = $api_port/m;
    s/^port = 54322$/port = $db_port/m;
    s/^shadow_port = 54320$/shadow_port = $shadow_port/m;
    s/^port = 54323$/port = $studio_port/m;
    s/^port = 54324$/port = $inbucket_port/m;
    s/^port = 54329$/port = $pooler_port/m;
    s/^port = 54327$/port = $analytics_port/m;
    s/^vector_port = 54328$/vector_port = $vector_port/m;
    s/^#\\s*auto_expose_new_tables = true/auto_expose_new_tables = true/m;
    s#^site_url = .*#site_url = 'http://localhost:$web_port'#m;
  " "$config"
  grep -q '^auto_expose_new_tables = true' "$config" || {
    echo 'Could not enable Supabase auto_expose_new_tables.' >&2; exit 70;
  }
}

write_runtime_env() {
  local status_file="$sandbox/supabase-status.env"
  pnpm --dir "$repo_root" exec supabase --workdir "$supabase_workdir" status -o env > "$status_file"
  # shellcheck disable=SC1090
  set -a; source "$status_file"; set +a
  write_secrets_env
  # shellcheck disable=SC1090
  set -a; source "$secrets_env"; set +a
  umask 077
  cat > "$runtime_env" <<EOF
NODE_ENV=development
PROPERTYPRO_AGENT_SANDBOX=1
PROPERTYPRO_SEED_ENV=development
DEMO_DEFAULT_PASSWORD=DemoPass123!
NEXT_PUBLIC_SUPABASE_URL=${API_URL/localhost/127.0.0.1}
SUPABASE_URL=${API_URL/localhost/127.0.0.1}
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
DATABASE_URL=${DB_URL/localhost/127.0.0.1}
DIRECT_URL=${DB_URL/localhost/127.0.0.1}
NEXT_PUBLIC_APP_URL=http://localhost:$web_port
NEXT_PUBLIC_ROOT_DOMAIN=localhost:$web_port
ADMIN_APP_ORIGIN=http://localhost:$admin_port
EMAIL_DRY_RUN=1
SMS_DISPATCH_ENABLED=false
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
$(<"$secrets_env")
EOF
}

write_secrets_env() {
  [[ -f "$secrets_env" ]] && return
  umask 077
  cat > "$secrets_env" <<EOF
CRON_SECRET=$(openssl rand -hex 32)
PROVISIONING_RETRY_SECRET=$(openssl rand -hex 32)
OTP_HMAC_SECRET=$(openssl rand -hex 32)
TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32)
SUPPORT_SESSION_JWT_SECRET=$(openssl rand -hex 32)
DEMO_TOKEN_ENCRYPTION_KEY_HEX=$(openssl rand -hex 32)
REAUTH_JWT_SECRET=$(openssl rand -hex 32)
EOF
}

assert_no_app_env_files() {
  local app_dir="$1" env_file
  env_file="$(find "$app_dir" -maxdepth 1 -type f \( -name '.env' -o -name '.env.*' \) -print -quit)"
  [[ -z "$env_file" ]] || { echo "Refusing agent live testing: app-local env file exists at $env_file." >&2; exit 70; }
}

run_sandbox_command() {
  local cwd="$1"
  shift
  [[ -f "$runtime_env" ]] || { echo 'Agent sandbox is not prepared. Run pnpm agent:env:prepare.' >&2; exit 64; }
  # A clean environment prevents exported production values from leaking into
  # app, seed, and fixture processes. Next runs from the app directory, where
  # app-local .env files are rejected below.
  env -i \
    PATH="$PATH" \
    HOME="${HOME:-/tmp}" \
    TMPDIR="${TMPDIR:-/tmp}" \
    bash -c 'set -a; source "$1"; set +a; cd "$2"; shift 2; exec "$@"' \
    sandbox-runtime "$runtime_env" "$cwd" "$@"
}

fingerprint() {
  (cd "$repo_root" && { find packages/db/migrations -type f -print; printf '%s\n' scripts/seed-demo.ts scripts/config/demo-data.ts; } | sort | xargs shasum -a 256) | shasum -a 256 | awk '{print $1}'
}

prepare() {
  require_tools
  ensure_slot
  set_ports
  configure_supabase
  if ! pnpm --dir "$repo_root" exec supabase --workdir "$supabase_workdir" status >/dev/null 2>&1; then
    assert_ports_free
    pnpm --dir "$repo_root" exec supabase --workdir "$supabase_workdir" start
  fi
  write_runtime_env
  local current marker="$sandbox/prepared.fingerprint"
  current="$(fingerprint)"
  if [[ ! -f "$marker" ]] || [[ "$(<"$marker")" != "$current" ]]; then
    run_sandbox_command "$repo_root" pnpm --dir "$repo_root" --filter @propertypro/shared --filter @propertypro/email --filter @propertypro/db --filter @propertypro/api-contract build
    run_sandbox_command "$repo_root" pnpm --dir "$repo_root" --filter @propertypro/db db:migrate
    run_sandbox_command "$repo_root" pnpm --dir "$repo_root" seed:demo
    run_sandbox_command "$repo_root" pnpm --dir "$repo_root" seed:verify
    printf '%s\n' "$current" > "$marker"
  fi
  echo "Agent sandbox ready: web=http://localhost:$web_port admin=http://localhost:$admin_port"
  echo "Login: http://localhost:$web_port/dev/agent-login?as=owner"
}

reset() {
  prepare
  rm -f "$sandbox/prepared.fingerprint"
  rm -f "$runtime_env" "$secrets_env"
  pnpm --dir "$repo_root" exec supabase --workdir "$supabase_workdir" db reset
  prepare
}

status() {
  ensure_slot; set_ports
  if [[ -f "$runtime_env" ]]; then
    echo "worktree=$worktree_id slot=$slot web=http://localhost:$web_port admin=http://localhost:$admin_port"
    pnpm --dir "$repo_root" exec supabase --workdir "$supabase_workdir" status -o env \
      | awk -F= '/^(API_URL|STUDIO_URL)=/{print}'
  else
    echo "Agent sandbox is not prepared for this worktree."
    exit 1
  fi
}

stop() {
  [[ -d "$supabase_workdir" ]] || exit 0
  pnpm --dir "$repo_root" exec supabase --workdir "$supabase_workdir" stop --no-backup || true
}

case "${1:-}" in
  prepare) prepare ;;
  reset) reset ;;
  status) status ;;
  stop) stop ;;
  exec) shift; prepare >/dev/null; run_sandbox_command "$repo_root" "$@" ;;
  web) prepare; assert_no_app_env_files "$repo_root/apps/web"; run_sandbox_command "$repo_root/apps/web" pnpm --dir "$repo_root" --filter @propertypro/web exec next dev --turbopack --port "$web_port" --hostname 127.0.0.1 ;;
  admin) prepare; assert_no_app_env_files "$repo_root/apps/admin"; run_sandbox_command "$repo_root/apps/admin" pnpm --dir "$repo_root" --filter @propertypro/admin exec next dev --turbopack --port "$admin_port" --hostname 127.0.0.1 ;;
  *) usage >&2; exit 64 ;;
esac
