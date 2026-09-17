// scripts/verify-responsive-geometry.ts
//
// CI guard: every `<table>` goes through the shared primitive.
//
// Why this one rule and no others. A table that is wider than its box either
// scrolls or it does not. If it does not, the columns past the edge are simply
// gone — no scrollbar, no ellipsis, nothing to tell the reader they are missing
// — and if the scroll region has no tab stop they are gone for keyboard users
// even when it does scroll (WCAG 2.1.1). `apps/web/src/components/ui/table.tsx`
// solves both: a `relative w-full overflow-auto` wrapper plus a `tabIndex` that
// is re-measured on every render, so it appears only when the table actually
// overflows. Hand-rolled tables get whichever half their author remembered.
//
// Measured on 2026-09-14 in Chromium at a 375px viewport, inside the real shell
// geometry (content column 327px):
//   finance/recent-payments      490px table in a 325px box, no scroller  → 165px unreachable
//   emergency/BroadcastHistory   518px table in a 325px box, no scroller  → 193px unreachable
//   contracts/BidTracker         437px table, no wrapper at all           → bleeds out of the card
//   contracts/ContractTable     1552px table, scroller present, tabIndex -1 → keyboard-unreachable
//
// Deliberately NOT enforced here: unprefixed `grid-cols-N`, and `truncate`
// without `min-w-0`. Both are guesses about LAYOUT inferred from TEXT —
// `grid-cols-7` in a calendar is correct, and `min-w-0` legitimately sits on an
// ancestor in a different file. This repo has already shipped a guard that
// "answers confidently and wrongly" (08d0265); a geometry claim belongs in the
// browser, where `apps/web/e2e/responsive-overflow.spec.ts` makes it.
//
// Scope: apps/web/src and packages/ui/src — the two roots `apps/web`'s Tailwind
// config lists in `content`, and the two the 2026-09-14 responsive audit
// measured. apps/admin has its own programme.
//
// Escape hatch: `// responsive-geometry:exempt — <reason>` anywhere in the file.
//
// Pre-existing tables are frozen in scripts/responsive-geometry-baseline.json
// (shrink-only, per-file ceilings). Drain a file, then lower its ceiling.
//
// Exit codes: 0 clean · 1 violations · 2 could not check (refuses to pass).

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ROOTS = ['apps/web/src', 'packages/ui/src'];
/** The primitive itself is the one place a raw <table> is correct. */
const PRIMITIVE = 'apps/web/src/components/ui/table.tsx';
const BASELINE_PATH = join(repoRoot, 'scripts/responsive-geometry-baseline.json');
const EXEMPT = /responsive-geometry:exempt/;
/** `<table` followed by whitespace, `>` or `/` — never `<tablefoo`. */
const RAW_TABLE = /<table[\s>/]/g;

function collectTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectTsx(full, out);
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

function loadBaseline(): Record<string, number> {
  if (!existsSync(BASELINE_PATH)) return {};
  const raw = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Record<string, unknown>;
  // `$`-prefixed keys carry prose, not ceilings (the file has to explain itself
  // somewhere, and JSON has no comments).
  return Object.fromEntries(
    Object.entries(raw).filter(([k, v]) => !k.startsWith('$') && typeof v === 'number'),
  ) as Record<string, number>;
}

function main(): void {
  // Assert the search roots exist. A scan that examined nothing must not pass.
  for (const root of ROOTS) {
    if (!existsSync(join(repoRoot, root))) {
      console.error(`responsive-geometry: search root missing: ${root}`);
      console.error('Refusing to report a clean scan of a tree that is not there.');
      process.exit(2);
    }
  }

  const baseline = loadBaseline();
  const files: string[] = [];
  for (const root of ROOTS) collectTsx(join(repoRoot, root), files);

  if (files.length === 0) {
    console.error('responsive-geometry: scanned 0 .tsx files. Refusing to pass.');
    process.exit(2);
  }

  let total = 0;
  const failures: Array<{ file: string; count: number; allowed: number; lines: number[] }> = [];

  for (const file of files) {
    const rel = relative(repoRoot, file);
    if (rel === PRIMITIVE) continue;
    const source = readFileSync(file, 'utf8');
    if (EXEMPT.test(source)) continue;

    const lines: number[] = [];
    source.split('\n').forEach((line, i) => {
      // A fresh regex per line: a shared /g literal carries `lastIndex` between
      // calls and silently skips every other match.
      const matches = line.match(new RegExp(RAW_TABLE.source, 'g'));
      for (let n = 0; n < (matches?.length ?? 0); n += 1) lines.push(i + 1);
    });
    if (lines.length === 0) continue;

    total += lines.length;
    const allowed = baseline[rel] ?? 0;
    if (lines.length > allowed) failures.push({ file: rel, count: lines.length, allowed, lines });
  }

  console.log(
    `responsive-geometry: scanned ${files.length} .tsx files across ${ROOTS.join(', ')}; ` +
      `raw <table> elements found: ${total}`,
  );

  if (failures.length > 0) {
    console.error('\nResponsive-geometry guard failed — these render a raw <table>:');
    for (const f of failures) {
      console.error(`  ${f.file}:${f.lines.join(',')} — ${f.count} found, baseline allows ${f.allowed}`);
    }
    // The remedy differs by root, and saying so matters: this guard scans
    // `packages/ui/src` too, where neither the `@/` alias nor the primitive
    // exists, so the web advice is not merely unhelpful there — it is an
    // instruction that cannot be followed, leaving the exemption as the only
    // way out of a guard that never explains that.
    const inPackagesUi = failures.some((f) => f.file.startsWith('packages/ui/'));
    console.error(
      "\nFix (apps/web): import { Table } from '@/components/ui/table' and swap <table…> for" +
        ' <Table…>. Children pass straight through, so <thead>/<tbody> are untouched, and the' +
        ' wrapper brings the scroll box and the conditional tab stop with it.',
    );
    if (inPackagesUi) {
      console.error(
        `\nFix (packages/ui): there is no Table primitive here — ${PRIMITIVE} lives in apps/web` +
          " and the '@/' alias does not resolve in this package. Either move the table into a" +
          ' component under apps/web, or lift the primitive into packages/ui the way the twelve' +
          ' shadcn components already were, or exempt it below.',
      );
    }
    console.error(
      '\nIf a raw table is genuinely right here, add `// responsive-geometry:exempt — <reason>`.',
    );
    process.exit(1);
  }

  console.log('responsive-geometry: passed.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
