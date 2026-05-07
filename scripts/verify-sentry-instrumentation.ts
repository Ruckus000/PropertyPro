/**
 * Sentry Instrumentation Presence Guard
 *
 * For every app under `apps/<name>/` whose `next.config.*` references
 * `@sentry/nextjs`, asserts that `apps/<name>/src/instrumentation.ts`
 * exists.
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

  console.log(`\n✅ All ${checked} Sentry-instrumented app(s) have src/instrumentation.ts.`);
  process.exit(0);
}

main();
