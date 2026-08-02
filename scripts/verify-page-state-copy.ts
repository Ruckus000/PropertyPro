// scripts/verify-page-state-copy.ts
//
// CI guard: sentences that claim a site page IS (or is not) visible to a visitor
// must come from `apps/web/src/lib/site-editor/describe-page-state.ts`, not from
// a string literal inline in a component.
//
// ## Why this exists
//
// The Pages panel makes the same claim — "this change is on your public site" —
// from six independent places: a hint above the controls, four toasts, and an
// explanatory paragraph. While that copy lived inline, each site derived the
// truth condition for itself, and they drifted. Twice:
//
//   1. The reorder toast learned that a Draft or Not-in-nav page is on no public
//      surface. The rename toast, both nav toasts and the shared hint went on
//      asserting "This is live on your site now." for a page that 404s — and the
//      reorder fix's own comment NAMED rename and the nav toggle as the surfaces
//      it was copying.
//   2. When the reorder toast was corrected it tested only the MOVED row, missing
//      that the public nav is a filtered PROJECTION — so moving a public page
//      past a hidden one still claimed a visitor-facing change that never
//      happened.
//
// Both were found by review, one round apart, and the second was introduced by
// the fix for the first. Extracting the module put the state matrix under one
// property test (`__tests__/lib/site-editor/describe-page-state.test.ts`), which
// covers everything the module says. This guard covers the other half: a NEW
// claim written inline, which the property test cannot see because it never
// reaches the module.
//
// ## What it looks for
//
// Phrases that assert public visibility, appearing as source text under
// apps/web/src/components/pm/site-editor-v3/. The module itself is exempt — it is
// where they are supposed to live.
//
// Scope is deliberately narrow. This is not a general "no inline copy" rule;
// it is one invariant on one family of sentences that has demonstrably drifted.
//
// Escape hatch: `// page-state-copy:exempt — <reason>` on the offending line.
//
// Known limitation: a source grep, not an AST walk. It cannot see a sentence
// assembled from fragments, and it does not check that a call to the module is
// passed the right page. The property test covers the latter.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_ROOT = join(repoRoot, 'apps/web/src/components/pm/site-editor-v3');
const MODULE_PATH = 'apps/web/src/lib/site-editor/describe-page-state.ts';

/**
 * Sentences asserting a page is on the public site right now.
 *
 * Kept in step with `CLAIMS_PUBLIC_NOW` in the module's test. Both lists exist
 * because they guard different things — the test guards what the module SAYS,
 * this guards where a claim is WRITTEN — and a phrase belongs in both.
 */
const CLAIM_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /live on your site now/i, label: '"live on your site now"' },
  { pattern: /\blive now\b/i, label: '"live now"' },
  { pattern: /go live straight away/i, label: '"go live straight away"' },
  { pattern: /shows in your navigation now/i, label: '"shows in your navigation now"' },
  { pattern: /the page (itself )?stays online/i, label: '"the page stays online"' },
  {
    pattern: /search engines can still find it/i,
    label: '"search engines can still find it"',
  },
];

const EXEMPT = /page-state-copy:exempt/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(full)) {
      out.push(full);
    }
  }
  return out;
}

const violations: string[] = [];

for (const file of walk(SCAN_ROOT)) {
  const rel = relative(repoRoot, file);
  const lines = readFileSync(file, 'utf8').split('\n');

  lines.forEach((line, index) => {
    if (EXEMPT.test(line)) return;
    // Comments may discuss the phrases — this guard is about rendered copy, and
    // the surrounding files explain these rules at length on purpose.
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('//')) return;

    for (const { pattern, label } of CLAIM_PATTERNS) {
      if (pattern.test(line)) {
        violations.push(
          `${rel}:${index + 1}  ${label}\n` +
            `    A page-visibility claim written inline. Move it to ${MODULE_PATH}\n` +
            `    and call the describer, so the state matrix stays under one property test.`,
        );
      }
    }
  });
}

if (violations.length > 0) {
  console.error('❌ guard:page-state-copy\n');
  console.error(
    'Sentences claiming a page is visible to visitors must come from\n' +
      `${MODULE_PATH}, not from a literal in a component.\n\n` +
      'This family of copy has drifted twice: a rule was derived, applied to the\n' +
      'one surface that prompted it, and left false on its siblings.\n',
  );
  for (const v of violations) console.error(`  ${v}\n`);
  console.error(
    `${violations.length} violation${violations.length === 1 ? '' : 's'}.\n` +
      'Escape hatch (rare, and say why): // page-state-copy:exempt — <reason>',
  );
  process.exit(1);
}

console.log('✅ guard:page-state-copy — page-visibility copy is single-sourced');
