---
name: drain-loop
description: Autonomously drain remaining drainable routes from the A1 contract allowlist via multi-batch Workflow with defense-in-depth review. Use when the user invokes `/drain-loop` (or `/drain-loop --max-batches N --stop-floor N`) to run the drain corpus to completion without per-batch supervision.
---

# Drain Loop Skill

Execute these steps in order. If any step fails, abort with a clear error
message — do NOT proceed.

## 1. Baseline verification

Run:

```bash
cd /Users/jphilistin/Documents/Coding/PropertyPro
git fetch origin --quiet
git log origin/main --oneline -3
git show origin/main:scripts/verify-contracts.ts | grep -cE "^  'apps/web"
pnpm guard:contracts | tail -3
```

Capture the `Allowlist:` and `Contracted:` numbers from `pnpm guard:contracts`.

Compare to the documented state in MEMORY.md (the index entry for the A1
session). If they mismatch by more than 2 routes, abort with:
"MEMORY.md is stale (documented allowlist=X, actual=Y). Please reconcile
before running drain-loop."

## 2. Lock check

```bash
mkdir -p ~/.claude/state
```

Use the Read tool on `~/.claude/state/drain-progress.lock`.

- If the file exists, parse it as JSON: `{acquiredAt}`.
- Compute lock age. Use Bash:
  ```bash
  python3 -c "import json,sys,datetime;d=json.load(open(sys.argv[1]));a=datetime.datetime.fromisoformat(d['acquiredAt'].replace('Z','+00:00'));n=datetime.datetime.now(datetime.timezone.utc);print(int((n-a).total_seconds()))" ~/.claude/state/drain-progress.lock
  ```
  If the output is less than `21600` (6 hours in seconds), abort with:
  "drain-loop lock held since {acquiredAt}. Another instance may be
  running. If you're sure it's stale, delete the lock file."
- Else (file missing OR stale > 6h): proceed.

Write the lock file with the current timestamp using Bash:
```bash
echo "{\"acquiredAt\": \"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\"}" > ~/.claude/state/drain-progress.lock
```

## 3. Dirty-tree pre-flight

Run:

```bash
git -C /Users/jphilistin/Documents/Coding/PropertyPro status -s scripts/verify-contracts.ts
```

If output is non-empty, abort with:
"scripts/verify-contracts.ts has uncommitted changes. Please commit or
stash before running drain-loop."

## 4. Read or initialize the state file

Read `~/.claude/state/drain-progress.json`.

If the file does not exist, initialize:

```json
{
  "version": 1,
  "lastKnownAllowlistCount": <from-step-1>,
  "lastKnownContractedCount": <from-step-1>,
  "lastSuccessfulBatchAt": null,
  "batchesAttempted": 0,
  "skipList": {}
}
```

Pre-seed the skip list with known runner-blocked routes (these are
documented in MEMORY.md and the api-patterns rules):

```javascript
const PERMANENT_SKIPS = [
  'apps/web/src/app/api/v1/webhooks/stripe/route.ts',
  'apps/web/src/app/api/v1/webhooks/twilio/route.ts',
  'apps/web/src/app/api/v1/phone/verify/confirm/route.ts',
  'apps/web/src/app/api/v1/phone/verify/send/route.ts',
  'apps/web/src/app/api/v1/reauth/verify/route.ts',
  'apps/web/src/app/api/v1/transparency/route.ts',
  'apps/web/src/app/api/v1/esign/sign/[submissionExternalId]/[slug]/route.ts',
  // Plus any allowlist entry starting with 'apps/web/src/app/api/v1/internal/'
  // — apply this filter dynamically by scanning the current allowlist.
]
// For each, ensure skipList[route] = { classification: 'PERMANENT', reason: ..., lastAttemptedAt: null, attemptCount: 0 }
```

## 5. Parse user overrides from invocation arguments

If the user invoked `/drain-loop` with arguments, parse them:

- `--max-batches N` → set `overrides.maxBatches = N`
- `--stop-floor N` → set `overrides.stopFloor = N`

Without arguments, defaults: `{ maxBatches: Infinity, stopFloor: undefined }`.

## 6. Invoke the workflow

Capture the current ISO timestamp via Bash:

```bash
date -u +%Y-%m-%dT%H:%M:%S.000Z
```

Pass the result as `tsIso`. Then invoke the workflow:

```
Workflow({
  name: 'drain-loop',
  args: { state, tsIso: "<from-date-output>", overrides },
})
```

Wait for completion (the harness automatically resumes you on task notification).

## 7. On workflow completion

The workflow returns `{ updatedState, summary }`.

- Write `updatedState` back to `~/.claude/state/drain-progress.json`
  (pretty-print with 2-space indent).
- Delete `~/.claude/state/drain-progress.lock`.
- Print the final summary to the user:

```
✅ drain-loop complete
   Batches attempted: <summary.batchesDone>
   Total drains merged: <summary.totalMerged>
   Routes skipped: <summary.totalSkipped.length>
   Stop reason: <summary.stopReason>

   Skip breakdown:
     PERMANENT: <count> (added to skip-list, won't retry)
     TRANSIENT: <count> (will retry on next /drain-loop after 12h cooldown)
     NEEDS_HUMAN: <count> (require manual review)

   New baseline: Allowlist <updatedState.lastKnownAllowlistCount>, Contracted <updatedState.lastKnownContractedCount>
```

## 8. On workflow failure (uncaught throw)

If `Workflow({...})` throws or returns an unexpected shape:

- Write whatever state we last knew (the seed state) back to disk.
- Delete the lock file.
- Print the error to the user with the workflow's last-known phase.
