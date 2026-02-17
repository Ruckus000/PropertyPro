#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/claude-ralph-loop.sh <prompt-file> [max-iterations] [success-marker]

Examples:
  scripts/claude-ralph-loop.sh docs/agent-prompts/phase2-batch-2c/p2-33.prompt.md 12 "<promise>ALL TESTS PASSING</promise>"
  scripts/claude-ralph-loop.sh docs/agent-prompts/phase2-batch-2c/p2-33-5.prompt.md 8 "<promise>ALL TESTS PASSING</promise>"

Notes:
  - Uses direct "claude <prompt>" invocation (no "-p") per AGENTS.md loop learnings.
  - Stores each iteration log under .claude-ralph-runs/<prompt-name>/<timestamp>/.
  - Optional env vars:
      CLAUDE_PERMISSION_MODE=acceptEdits|bypassPermissions|default|delegate|dontAsk|plan
      CLAUDE_DANGEROUS_SKIP_PERMISSIONS=true|false
      CLAUDE_EXTRA_ARGS="--model sonnet --effort high"
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -lt 1 || $# -gt 3 ]]; then
  usage >&2
  exit 64
fi

prompt_file="$1"
max_iterations="${2:-10}"
success_marker="${3:-<promise>ALL TESTS PASSING</promise>}"

if [[ ! -f "$prompt_file" ]]; then
  echo "Prompt file not found: $prompt_file" >&2
  exit 66
fi

if ! [[ "$max_iterations" =~ ^[0-9]+$ ]] || [[ "$max_iterations" -lt 1 ]]; then
  echo "max-iterations must be a positive integer: $max_iterations" >&2
  exit 64
fi

if ! command -v claude >/dev/null 2>&1; then
  echo "claude command not found in PATH" >&2
  exit 69
fi

prompt_basename="$(basename "$prompt_file")"
prompt_name="${prompt_basename%.*}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
run_dir=".claude-ralph-runs/$prompt_name/$timestamp"
summary_log="$run_dir/summary.log"

mkdir -p "$run_dir"

prompt="$(cat "$prompt_file")"

permission_mode="${CLAUDE_PERMISSION_MODE:-acceptEdits}"
dangerous_skip="${CLAUDE_DANGEROUS_SKIP_PERMISSIONS:-false}"
extra_args="${CLAUDE_EXTRA_ARGS:-}"

declare -a claude_cmd
claude_cmd=(claude --permission-mode "$permission_mode")

if [[ "$dangerous_skip" == "true" ]]; then
  claude_cmd+=(--dangerously-skip-permissions)
fi

if [[ -n "$extra_args" ]]; then
  # shellcheck disable=SC2206
  extra_argv=($extra_args)
  claude_cmd+=("${extra_argv[@]}")
fi

echo "Prompt file: $prompt_file" | tee -a "$summary_log"
echo "Iterations: $max_iterations" | tee -a "$summary_log"
echo "Success marker: $success_marker" | tee -a "$summary_log"
echo "Run directory: $run_dir" | tee -a "$summary_log"
echo "Permission mode: $permission_mode" | tee -a "$summary_log"
echo "Dangerous skip permissions: $dangerous_skip" | tee -a "$summary_log"
echo "Claude command: ${claude_cmd[*]}" | tee -a "$summary_log"

for ((iteration = 1; iteration <= max_iterations; iteration++)); do
  iter_log="$run_dir/iteration-$iteration.log"
  echo "=== Iteration $iteration/$max_iterations ===" | tee -a "$summary_log"

  set +e
  "${claude_cmd[@]}" "$prompt" 2>&1 | tee "$iter_log"
  claude_exit="${PIPESTATUS[0]}"
  set -e

  if grep -Fq "$success_marker" "$iter_log"; then
    echo "Success marker found at iteration $iteration." | tee -a "$summary_log"
    exit 0
  fi

  if grep -Eiq "write permissions|grant write permission|hit your limit|resets .*America/New_York" "$iter_log"; then
    echo "Stopping early due to permission or rate-limit blocker detected in iteration $iteration." | tee -a "$summary_log"
    exit 2
  fi

  if [[ "$claude_exit" -ne 0 ]]; then
    echo "claude exited with code $claude_exit at iteration $iteration." | tee -a "$summary_log"
  fi
done

echo "Max iterations reached without success marker." | tee -a "$summary_log"
exit 1
