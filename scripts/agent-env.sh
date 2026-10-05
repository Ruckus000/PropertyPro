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
    s/^\[analytics\]\nenabled = true$/[analytics]\nenabled = false/m;
  " "$config"
  grep -q '^auto_expose_new_tables = true' "$config" || {
    echo 'Could not enable Supabase auto_expose_new_tables.' >&2; exit 70;
  }
  # Analytics (Logflare) and its Vector log shipper cost ~800 MiB per stack and
  # nothing in the app or the tests reads them. With several worktree stacks on
  # one Docker VM, that is what got a new stack's analytics container OOM-killed
  # mid-start ("Killed", then LegacyHealthCheckTimeoutError). Realtime stays:
  # the notification bell and publish status subscribe to it.
  perl -0ne 'exit(/^\[analytics\]\nenabled = false$/m ? 0 : 1)' "$config" || {
    echo 'Could not disable Supabase analytics.' >&2; exit 70;
  }
}

write_runtime_env() {
  local status_file="$sandbox/supabase-status.env"
  # Before ANY write: this file holds the service-role key, the JWT secret and
  # the S3 keys. `umask 077` used to come later in this function, so the status
  # file alone was created 0644 while its siblings were 0600. The rm matters too:
  # `>` truncates an existing file but keeps its old mode.
  umask 077
  rm -f "$status_file"
  # KEY=value lines only: this file is `source`d, and pnpm prints warnings on
  # STDOUT (e.g. "WARN Unsupported engine" when the shell's Node is not the
  # .nvmrc major), which made line 1 a bash syntax error. `status()` below
  # filters the same way. Under pipefail, no matching line fails loudly.
  pnpm --dir "$repo_root" exec supabase --workdir "$supabase_workdir" status -o env \
    | grep -E '^[A-Z_][A-Z0-9_]*=' > "$status_file"
  # shellcheck disable=SC1090
  set -a; source "$status_file"; set +a
  write_secrets_env
  # shellcheck disable=SC1090
  set -a; source "$secrets_env"; set +a
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

# Document publishing renders PDFs with a browser
# (apps/web/src/lib/documents/render-pdf.ts). Its bundled @sparticuz/chromium is
# a Linux x64 binary and nothing else, so every other host needs
# PUPPETEER_EXECUTABLE_PATH -- and `env -i` below strips a shell export, which
# made publishing impossible in this sandbox on macOS. Pass that ONE variable
# through: a browser path is not a credential, so this does not weaken what
# `env -i` exists to prevent. Sets `pdf_browser` (empty = use the bundled binary).
#
# An override that is set but not an executable file (a stale export after the
# browser was uninstalled) is refused only with `--strict`, which `web` uses: it
# is the one process that renders PDFs. Everything else that goes through
# run_sandbox_command (`exec`, `admin`, and prepare's build/migrate/seed) warns
# once and ignores the override instead of refusing work that never renders a PDF.
pdf_browser_warned=''
resolve_pdf_browser() {
  pdf_browser=''
  local requested="${PUPPETEER_EXECUTABLE_PATH:-}"
  if [[ -n "${requested//[[:space:]]/}" ]]; then
    if [[ -f "$requested" && -x "$requested" ]]; then
      pdf_browser="$requested"
      return 0
    fi
    if [[ "${1:-}" == --strict ]]; then
      echo "PUPPETEER_EXECUTABLE_PATH is not an executable file: '$requested'" >&2; exit 64
    fi
    if [[ -z "$pdf_browser_warned" ]]; then
      echo "WARNING: ignoring PUPPETEER_EXECUTABLE_PATH (not an executable file: '$requested'); PDF publishing falls back to auto-detection." >&2
      pdf_browser_warned=1
    fi
  fi
  [[ "$(uname -s)" == Darwin ]] || return 0
  local candidate
  for candidate in \
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
    '/Applications/Chromium.app/Contents/MacOS/Chromium'; do
    if [[ -x "$candidate" ]]; then pdf_browser="$candidate"; return 0; fi
  done
}

report_pdf_browser() {
  local host libs
  host="$(uname -s)/$(uname -m)"
  if [[ -n "$pdf_browser" ]]; then
    echo "PDF publishing: $pdf_browser"
  elif [[ "$host" == Linux/x86_64 ]]; then
    # Outside Lambda/Vercel the bundled binary uses the host's NSS libraries.
    # Capture first: `ldconfig -p | grep -q` under pipefail reports a SIGPIPE
    # as "missing".
    libs="$(ldconfig -p 2>/dev/null || true)"
    if [[ -n "$libs" && ( "$libs" != *libnss3.so* || "$libs" != *libnspr4.so* ) ]]; then
      echo 'WARNING: PDF publishing will fail: libnss3/libnspr4 not found (apt-get install libnss3).' >&2
    else
      # Empty = no readable ldconfig cache, so say nothing we cannot back up.
      echo 'PDF publishing: bundled @sparticuz/chromium'
    fi
  else
    echo "WARNING: PDF publishing will fail on $host: the bundled browser is Linux x64 only and no Chrome was found. Export PUPPETEER_EXECUTABLE_PATH=/path/to/chrome and rerun." >&2
  fi
}

run_sandbox_command() {
  local cwd="$1"
  shift
  [[ -f "$runtime_env" ]] || { echo 'Agent sandbox is not prepared. Run pnpm agent:env:prepare.' >&2; exit 64; }
  resolve_pdf_browser
  # A clean environment prevents exported production values from leaking into
  # app, seed, and fixture processes. Next runs from the app directory, where
  # app-local .env files are rejected below.
  env -i \
    PATH="$PATH" \
    HOME="${HOME:-/tmp}" \
    TMPDIR="${TMPDIR:-/tmp}" \
    ${pdf_browser:+"PUPPETEER_EXECUTABLE_PATH=$pdf_browser"} \
    bash -c 'set -a; source "$1"; set +a; cd "$2"; shift 2; exec "$@"' \
    sandbox-runtime "$runtime_env" "$cwd" "$@"
}

# The fingerprint marker only says "this worktree's migrations and seed were
# applied to SOME database". The database it vouches for can vanish under it:
# `stop` discards the volumes (--no-backup), and so does a Docker reset or a
# volume prune. Trusting the marker alone then printed "Agent sandbox ready"
# over an empty database with no user_roles. So ask the database itself.
# Exits 0 only when the migration ledger exists and user_roles has a row; any
# failure to check, an unreachable database included, reads as "not prepared".
sandbox_db_is_prepared() {
  # Resolve the browser BEFORE the silenced call below: resolve_pdf_browser warns
  # once per process about a stale PUPPETEER_EXECUTABLE_PATH, and inside the
  # redirect that one warning would go to /dev/null and never be printed.
  resolve_pdf_browser
  run_sandbox_command "$repo_root" node --input-type=module -e '
    import postgres from "postgres";
    const sql = postgres(process.env.DIRECT_URL, { max: 1, onnotice: () => {} });
    try {
      const [probe] = await sql`
        select to_regclass(${"drizzle.__drizzle_migrations"}) is not null as ledger,
               to_regclass(${"public.user_roles"}) is not null as roles`;
      let ready = probe.ledger && probe.roles;
      if (ready) {
        const [row] = await sql`select exists (select 1 from public.user_roles) as seeded`;
        ready = row.seeded;
      }
      process.exitCode = ready ? 0 : 1;
    } finally {
      await sql.end({ timeout: 1 });
    }
  ' >/dev/null 2>&1
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
  if [[ -f "$marker" ]] && [[ "$(<"$marker")" == "$current" ]] && ! sandbox_db_is_prepared; then
    # Said out loud so a check that is wrongly red shows up as re-seeding on
    # every prepare, not as a silently slow one.
    echo 'Sandbox database has no migration ledger or seeded user_roles; re-running migrate and seed.' >&2
    rm -f "$marker"
  fi
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
  # --no-backup deletes the database volumes, so the marker vouching for them goes too.
  rm -f "$sandbox/prepared.fingerprint"
  pnpm --dir "$repo_root" exec supabase --workdir "$supabase_workdir" stop --no-backup || true
}

case "${1:-}" in
  prepare) prepare ;;
  reset) reset ;;
  status) status ;;
  stop) stop ;;
  exec) shift; prepare >/dev/null; run_sandbox_command "$repo_root" "$@" ;;
  web) resolve_pdf_browser --strict; prepare; assert_no_app_env_files "$repo_root/apps/web"; report_pdf_browser; run_sandbox_command "$repo_root/apps/web" pnpm --dir "$repo_root" --filter @propertypro/web exec next dev --turbopack --port "$web_port" --hostname 127.0.0.1 ;;
  admin) prepare; assert_no_app_env_files "$repo_root/apps/admin"; run_sandbox_command "$repo_root/apps/admin" pnpm --dir "$repo_root" --filter @propertypro/admin exec next dev --turbopack --port "$admin_port" --hostname 127.0.0.1 ;;
  *) usage >&2; exit 64 ;;
esac
