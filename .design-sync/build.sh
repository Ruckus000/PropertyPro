#!/usr/bin/env bash
# Prepares every input the design-sync converter needs. Run from the repo root.
# Deterministic and idempotent - safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"

# The repo-specific scripts are COMMITTED here but RUN from .ds-sync/ (which is
# gitignored and re-staged from the skill each sync). Restore them first so a
# fresh clone works without hunting for them.
mkdir -p .ds-sync && cp .design-sync/scripts/*.mjs .ds-sync/

echo "==> 1/4 barrel (147 exports)"
node .ds-sync/gen-barrel.mjs

echo "==> 2/4 declaration tree"
# --noCheck: emit-only. The repo's root tsconfig sets noEmit:true (inherited),
# which is overridden in entry/tsconfig.json - without that override tsc exits
# 0 having emitted NOTHING.
rm -rf .design-sync/entry/dist
./node_modules/.bin/tsc -p .design-sync/entry/tsconfig.json --noCheck
# `types` must resolve so findTypesRoot() -> dist/, letting loadDts glob the
# WHOLE tree (tsc nests output under dist/<repo-relative-path>).
cat > .design-sync/entry/dist/index.d.ts <<'SHIM'
export * from './.design-sync/entry/index';
SHIM
# LOAD-BEARING: without this, class-variance-authority does not resolve from the
# nested dist tree, VariantProps<> collapses, and every CVA component silently
# loses `variant`/`size`. The rm -rf above destroys it, so recreate it here.
ln -sfn "$ROOT/apps/web/node_modules" .design-sync/entry/dist/node_modules

echo "==> 3/4 disambiguate duplicate declarations"
node .ds-sync/disambiguate-dts.mjs

# Guards against the two name-based extraction failures (see NOTES.md).
node .ds-sync/find-dup-decls.mjs | head -2
node .ds-sync/find-crosslayer-props.mjs | head -1

echo "==> 4/4 compiled Tailwind"
node .ds-sync/gen-vocabulary.mjs
# cssEntry must live INSIDE the package dir or the converter skips it and every
# component ships unstyled.
apps/web/node_modules/.bin/tailwindcss \
  -c .design-sync/tailwind.config.ts \
  -i apps/web/src/app/globals.css \
  -o .design-sync/entry/generated.css --minify 2>&1 | tail -1

CSS_BYTES=$(wc -c < .design-sync/entry/generated.css)
echo "    css: ${CSS_BYTES} bytes"
grep -q -- '--surface-card' .design-sync/entry/generated.css || { echo "FAIL: tokens not inlined"; exit 2; }
grep -q 'font-size:18px' .design-sync/entry/generated.css || { echo "FAIL: 18px root missing"; exit 2; }
node .ds-sync/check-css-coverage.mjs | head -3
echo "==> inputs ready"
