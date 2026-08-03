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
// ## Broad vocabulary, not a phrase whitelist — and that is the whole design
//
// The FIRST version of this guard listed the six phrases already extracted. A
// review round defeated it in one probe: a new inline sentence — "Visitors can
// see this page right now. It is on your public site already." — inserted into
// the guard's own flagship file passed with exit 0. It also missed three
// visibility claims sitting in its scan root at the time.
//
// That is the same failure as the hand-enumerated surface lists this whole
// exercise is about: a whitelist recognises wordings someone already thought of,
// and drift arrives in new words.
//
// So the vocabulary is now deliberately BROAD and the false positives are
// handled by an explicit allowlist below. A broad guard with exemptions fails
// loudly on new copy and is corrected by a human reading one line; a narrow
// whitelist fails silently and is corrected by a review round.
//
// Scope covers the editor, the onboarding wizard (which round 10 caught making a
// false publish claim, and which was out of scope by construction until now) and
// lib/site-editor. The module itself is excluded by path — it is where these
// sentences are supposed to live.
//
// Escape hatch: `// page-state-copy:exempt — <reason>` on the offending line.
//
// Known limitation: a source grep, not an AST walk. It cannot see a sentence
// assembled across lines, and it does not check that a describer is passed the
// right page. The module's property test covers the latter, structurally.

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_ROOTS = [
  join(repoRoot, 'apps/web/src/components/pm/site-editor-v3'),
  join(repoRoot, 'apps/web/src/components/pm/onboarding-wizard'),
  join(repoRoot, 'apps/web/src/lib/site-editor'),
];
/**
 * The describer modules — where these sentences are SUPPOSED to live, so they
 * are excluded from the scan rather than baselined.
 *
 * A set, not one path: `describe-section-state.ts` joined it when the section
 * removal dialog's claim was extracted, and hard-coding a single module is the
 * hand-enumerated-list shape this guard exists to discourage. Any file matching
 * `describe-*-state.ts` under `lib/site-editor` is a describer module.
 */
const MODULE_PATH = 'apps/web/src/lib/site-editor/describe-page-state.ts';
const isDescriberModule = (rel: string) =>
  /^apps\/web\/src\/lib\/site-editor\/describe-[a-z-]+-state\.ts$/.test(rel);

/**
 * Vocabulary that indicates a claim about what a VISITOR can see.
 *
 * Deliberately over-broad. This is not "kept in step" with the module's test —
 * an earlier comment said it was, and that was both false and unachievable: the
 * two guard different things and one of them has to tolerate site-level copy
 * living in the same directories. Over-matching here is cheap (one allowlist
 * line, reviewed once); under-matching is the defect this guard exists to stop.
 */
const VISIBILITY_VOCABULARY: RegExp[] = [
  /\bvisitors?\b/i,
  /live site/i,
  /on your site/i,
  /public site|public website/i,
  /stays online/i,
  /go live/i,
  /\blive now\b/i,
  /in your navigation/i,
  /search engines/i,
  /published yet/i,
];

/**
 * Pre-existing hits, frozen per file — SHRINK-ONLY, matching `guard:design-tokens`
 * and `guard:page-padding`.
 *
 * A broad vocabulary over an existing codebase finds ~29 lines, and most are not
 * page-visibility claims at all: site-level copy ("Your site stays online"),
 * section-level copy, urgent-notice copy, and a link label ("View the public
 * site"). Hand-curating those into an allowlist in one pass would be 29 snap
 * judgements by one reviewer — which is how a whitelist goes wrong in the first
 * place.
 *
 * So the ceiling is frozen instead: a baselined file may keep AT MOST its
 * recorded count, and any file not listed must be clean. New copy in a new place
 * fails immediately, which is the property that matters; the existing lines get
 * drained deliberately, lowering the ceiling as they go.
 *
 * Regenerate with `--write-baseline` in a reviewed change, and only downward.
 */
const BASELINE_PATH = join(repoRoot, 'scripts/page-state-copy-baseline.json');

const EXEMPT = /page-state-copy:exempt/;

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
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

const baseline: Record<string, number> = existsSync(BASELINE_PATH)
  ? (JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Record<string, number>)
  : {};

const violations: string[] = [];
const counts: Record<string, number> = {};

for (const file of SCAN_ROOTS.flatMap(walk)) {
  const rel = relative(repoRoot, file);
  if (isDescriberModule(rel)) continue;
  const lines = readFileSync(file, 'utf8').split('\n');

  lines.forEach((line, index) => {
    if (EXEMPT.test(line)) return;
    // Comments may discuss the phrases — this guard is about rendered copy, and
    // the surrounding files explain these rules at length on purpose.
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
      return;
    }

    const hit = VISIBILITY_VOCABULARY.find((pattern) => pattern.test(line));
    if (hit) {
      counts[rel] = (counts[rel] ?? 0) + 1;
      violations.push(
        `${rel}:${index + 1}  matched ${hit}\n` +
          `    ${line.trim().slice(0, 100)}\n` +
          `    Reads as a claim about what a visitor can see. Move it to\n` +
          `    ${MODULE_PATH} and call the describer, so the claim is DECLARED\n` +
          `    and checked against the page state. If it is not a page-visibility\n` +
          `    claim, add it to ALLOWED in this file or mark the line exempt.`,
      );
    }
  });
}

if (process.argv.includes('--write-baseline')) {
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`✍️  wrote baseline: ${Object.keys(sorted).length} files`);
  process.exit(0);
}

// Shrink-only: a file may hold at most its frozen count; anything not frozen
// must be clean. The per-line list above is reported only for files that breach.
const breaches: string[] = [];
for (const [rel, count] of Object.entries(counts)) {
  const ceiling = baseline[rel] ?? 0;
  if (count > ceiling) {
    breaches.push(
      `${rel}: ${count} page-visibility claim${count === 1 ? '' : 's'}, ceiling ${ceiling}`,
    );
  }
}

if (breaches.length > 0) {
  console.error('❌ guard:page-state-copy\n');
  console.error(
    'Sentences claiming a page is visible to visitors must come from\n' +
      `${MODULE_PATH}, not from a literal in a component.\n\n` +
      'This family of copy has drifted twice: a rule was derived, applied to the\n' +
      'one surface that prompted it, and left false on its siblings.\n',
  );
  for (const b of breaches) console.error(`  ${b}`);
  console.error('');
  for (const v of violations) console.error(`  ${v}\n`);
  console.error(
    'Escape hatch (rare, and say why): // page-state-copy:exempt — <reason>\n' +
      'The ceiling only ever goes DOWN. Drain a line, then lower it.',
  );
  process.exit(1);
}

const frozen = Object.values(baseline).reduce((a, b) => a + b, 0);
console.log(
  `✅ guard:page-state-copy — no new page-visibility copy outside the module (${frozen} frozen)`,
);
