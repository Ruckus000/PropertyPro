/**
 * Sentry Instrumentation Presence Guard
 *
 * For every app under `apps/<name>/` whose `next.config.*` references
 * `@sentry/nextjs`, asserts BOTH:
 *
 *   1. `apps/<name>/src/instrumentation.ts` exists (see below), and
 *   2. every Sentry init config sets `initialScope: { tags: { app: '<name>' } }`.
 *
 * Check 2 exists because apps/web and apps/admin deliberately share ONE Sentry
 * project (`property-pro`). That is only tenable while every event carries an
 * `app` tag to separate them — an untagged app is indistinguishable noise in a
 * shared issue stream. The decision was made on the basis that admin-only
 * configuration in this repo rots silently (its Sentry org/project were unset
 * for 133 days and its client DSN was never set at all, so admin uploaded zero
 * source maps and captured zero browser errors, unnoticed). This guard is what
 * stops the tag going the same way. If you ever split admin into its own Sentry
 * project, this check becomes optional — not before.
 *
 * This catches the failure mode that produced a ~90-day Sentry blackout:
 * `instrumentation.ts` placed at `apps/<name>/` (project root) instead of
 * `apps/<name>/src/`. Next.js silently ignores the file at the project
 * root when a `src/` directory exists, with no warning at build or
 * runtime — every Sentry init is skipped and zero spans/errors are
 * ingested.
 *
 * See `project_sentry_no_data.md` for the original incident and PR #190
 * for the fix.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const appsDir = join(repoRoot, 'apps');

const NEXT_CONFIG_NAMES = [
  'next.config.ts',
  'next.config.js',
  'next.config.mjs',
  'next.config.cjs',
];

interface Problem {
  app: string;
  message: string;
}

function findNextConfig(appPath: string): string | null {
  for (const name of NEXT_CONFIG_NAMES) {
    const p = join(appPath, name);
    if (existsSync(p)) return p;
  }
  return null;
}

function referencesSentry(configPath: string): boolean {
  const src = readFileSync(configPath, 'utf-8');
  return /@sentry\/nextjs/.test(src);
}

/**
 * Candidate Sentry init sites, relative to `apps/<name>/`. Missing files are
 * skipped; a file is only checked if it actually calls `Sentry.init(`.
 *
 * `src/instrumentation.ts` is included because Next.js supports calling
 * `Sentry.init` directly from `register()`. Today both apps only re-export the
 * config modules from there, so it is skipped — but if init ever moves inline,
 * this list is what keeps it enforced instead of silently unguarded.
 */
const SENTRY_INIT_FILES = [
  'src/sentry.server.config.ts',
  'src/sentry.edge.config.ts',
  'src/instrumentation-client.ts',
  'src/instrumentation.ts',
];

/**
 * Strip comments so the tag check cannot be satisfied by commented-out or
 * documentation text.
 *
 * Without this, a developer who comments the tag out while debugging
 * (`// initialScope: { tags: { app: 'admin' } },`) still gets a green guard
 * while the live init ships untagged — the precise rot this guard exists to
 * catch, with a passing check asserting the opposite.
 *
 * The line-comment pattern deliberately refuses to fire on `//` preceded by a
 * colon, so DSNs and other `https://` literals survive intact.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'\\])\/\/.*$/gm, '$1');
}

/**
 * Assert each Sentry init site tags its events with the owning app.
 *
 * Matches `tags: { app: '<name>' }` (the `initialScope` form) so the tag is
 * attached from the first event, rather than a post-init `setTag` that races
 * early errors.
 *
 * Returns the number of init sites found, so the caller can fail an app that
 * references @sentry/nextjs but calls `Sentry.init` nowhere at all.
 */
function checkAppTags(appPath: string, app: string, problems: Problem[]): number {
  let initSites = 0;

  for (const rel of SENTRY_INIT_FILES) {
    const filePath = join(appPath, rel);
    if (!existsSync(filePath)) continue;

    const src = stripComments(readFileSync(filePath, 'utf-8'));
    if (!/Sentry\.init\(/.test(src)) continue;
    initSites++;

    const tagMatch = src.match(/tags:\s*\{\s*app:\s*['"]([^'"]+)['"]/);
    if (!tagMatch) {
      problems.push({
        app,
        message:
          `${app}/${rel} calls Sentry.init() without an app tag. ` +
          `Add \`initialScope: { tags: { app: '${app}' } }\` — apps/web and ` +
          `apps/admin share one Sentry project, so an untagged app cannot be ` +
          `separated from the other's events.`,
      });
      continue;
    }

    if (tagMatch[1] !== app) {
      problems.push({
        app,
        message:
          `${app}/${rel} tags events as app='${tagMatch[1]}' but lives in apps/${app}. ` +
          `A mismatched tag is worse than none — it misattributes events to the other app.`,
      });
      continue;
    }

    console.log(`  ${app}: ✓ ${rel} tags app='${app}'`);
  }

  return initSites;
}

function main(): void {
  console.log('🔍 Sentry Instrumentation Presence Guard');
  console.log('='.repeat(60));

  if (!existsSync(appsDir)) {
    console.error(`❌ apps/ directory not found at ${appsDir}`);
    process.exit(1);
  }

  const apps = readdirSync(appsDir).filter((name) => {
    const p = join(appsDir, name);
    return statSync(p).isDirectory();
  });

  const problems: Problem[] = [];
  let checked = 0;

  for (const app of apps) {
    const appPath = join(appsDir, app);
    const configPath = findNextConfig(appPath);
    if (!configPath) continue;

    if (!referencesSentry(configPath)) {
      console.log(`  ${app}: no @sentry/nextjs reference, skipping`);
      continue;
    }

    checked++;
    const expected = join(appPath, 'src', 'instrumentation.ts');
    const wrongLocation = join(appPath, 'instrumentation.ts');

    if (!existsSync(expected)) {
      const hint = existsSync(wrongLocation)
        ? ` Found a stray ${app}/instrumentation.ts at the project root — Next.js silently ignores this file when src/ exists. Move it to ${app}/src/instrumentation.ts.`
        : '';
      problems.push({
        app,
        message:
          `${app}/next.config.* imports @sentry/nextjs but ${app}/src/instrumentation.ts is missing.` +
          hint,
      });
    } else {
      console.log(`  ${app}: ✓ src/instrumentation.ts present`);
    }

    const initSites = checkAppTags(appPath, app, problems);
    if (initSites === 0) {
      problems.push({
        app,
        message:
          `${app}/next.config.* imports @sentry/nextjs but no Sentry.init() call was ` +
          `found in any of: ${SENTRY_INIT_FILES.join(', ')}. Either Sentry never ` +
          `initialises for this app, or init moved somewhere this guard does not ` +
          `look — both leave its events untagged in the shared project.`,
      });
    }
  }

  if (checked === 0) {
    console.log('\nNo apps reference @sentry/nextjs. Nothing to verify.');
    process.exit(0);
  }

  if (problems.length > 0) {
    console.log(`\n❌ ${problems.length} problem(s):`);
    for (const p of problems) {
      console.log(`  [${p.app}] ${p.message}`);
    }
    console.log(
      '\nRefer to docs/audits/sentry-no-data-investigation-2026-05-06.md ' +
        'for the original incident.',
    );
    process.exit(1);
  }

  console.log(
    `\n✅ All ${checked} Sentry-instrumented app(s) have src/instrumentation.ts ` +
      "and tag their events with 'app'.",
  );
  process.exit(0);
}

main();
