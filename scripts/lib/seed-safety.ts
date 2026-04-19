/* eslint-disable no-console -- CLI guardrail; console output is intentional */

/**
 * Seed/reset CLI guardrails.
 *
 * These checks gate destructive scripts (`pnpm seed:demo`, `pnpm reset:demo`)
 * so they refuse to run without explicit operator acknowledgement of the
 * target environment. Placed at the CLI entry so library callers (integration
 * tests importing `runDemoSeed` / `runDemoReset` directly) bypass the gate.
 *
 * This module intentionally imports only from `drizzle-orm` — not from
 * `@propertypro/db` — to avoid pulling the module-level DB client. That keeps
 * the env-check surface pure and unit-testable without a live database.
 */
import { sql } from 'drizzle-orm';

export const ALLOWED_SEED_ENVIRONMENTS = ['development', 'ci', 'demo-nightly'] as const;
export type SeedEnvironment = (typeof ALLOWED_SEED_ENVIRONMENTS)[number];

export class SeedSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedSafetyError';
  }
}

/**
 * Require `PROPERTYPRO_SEED_ENV` to be explicitly set to an allowed value.
 * Throws with remediation text otherwise.
 */
export function assertSeedEnvironment(): SeedEnvironment {
  const raw = process.env.PROPERTYPRO_SEED_ENV;
  if (
    typeof raw === 'string' &&
    (ALLOWED_SEED_ENVIRONMENTS as readonly string[]).includes(raw)
  ) {
    return raw as SeedEnvironment;
  }

  const allowed = ALLOWED_SEED_ENVIRONMENTS.join(' | ');
  const current = raw === undefined ? '(unset)' : JSON.stringify(raw);
  throw new SeedSafetyError(
    [
      `Refusing to run: PROPERTYPRO_SEED_ENV must be set to one of: ${allowed}.`,
      `  current value: ${current}`,
      '',
      '  Remediation: export PROPERTYPRO_SEED_ENV=development',
      '  (or "ci" in GitHub Actions, "demo-nightly" in the reset-demo workflow.)',
    ].join('\n'),
  );
}

/**
 * Print the resolved hostname of the target database so the operator can see
 * where destruction will happen before it starts.
 */
export function logDatabaseTarget(databaseUrl: string): void {
  let hostname = '(unparseable)';
  try {
    hostname = new URL(databaseUrl).hostname;
  } catch {
    /* fall through with placeholder */
  }
  console.log(`[seed-safety] Target database host: ${hostname}`);
}

interface CommunityBackstopRow {
  id: number | string;
  slug: string;
}

type SqlExecutor = {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>;
};

/**
 * Scan `communities` for rows where `is_demo = false AND deleted_at IS NULL`.
 * If any exist, the database likely contains production (or real signup-created)
 * data — refuse unless `PROPERTYPRO_SEED_ACK_NONDEMO=1` is set.
 *
 * Uses raw SQL through the caller's db.execute so this module does not import
 * the @propertypro/db schema (which would pull the module-level client and
 * break env-less unit tests).
 */
export async function assertNoUnrecognizedProductionData(
  db: SqlExecutor,
): Promise<void> {
  const raw = await db.execute(
    sql`select id, slug from communities where is_demo = false and deleted_at is null order by id`,
  );

  // postgres-js returns a RowList (array); node-pg shape uses { rows: [] }
  const maybe = raw as unknown;
  const rows: CommunityBackstopRow[] = Array.isArray(maybe)
    ? (maybe as CommunityBackstopRow[])
    : ((maybe as { rows?: CommunityBackstopRow[] }).rows ?? []);

  if (rows.length === 0) {
    return;
  }

  const ack = process.env.PROPERTYPRO_SEED_ACK_NONDEMO;
  if (ack === '1') {
    const slugs = rows.map((r) => r.slug).join(', ');
    console.log(
      `[seed-safety] PROPERTYPRO_SEED_ACK_NONDEMO=1 — proceeding despite ${String(
        rows.length,
      )} non-demo community row(s) present: ${slugs}`,
    );
    return;
  }

  const slugs = rows.map((r) => `  - ${r.slug} (id=${String(r.id)})`).join('\n');
  throw new SeedSafetyError(
    [
      `Refusing to run: found ${String(
        rows.length,
      )} community row(s) with is_demo=false and deleted_at IS NULL.`,
      'This database may contain production (or real signup-created) data.',
      '',
      'Offending communities:',
      slugs,
      '',
      '  Remediation: verify the target database is safe to mutate, then re-run with:',
      '    export PROPERTYPRO_SEED_ACK_NONDEMO=1',
    ].join('\n'),
  );
}

/**
 * Compose all three checks. Call from `main()` of seed/reset CLI entry points
 * before any destructive operation.
 */
export async function runSeedSafetyChecks(params: {
  databaseUrl: string;
  db: SqlExecutor;
}): Promise<SeedEnvironment> {
  const env = assertSeedEnvironment();
  logDatabaseTarget(params.databaseUrl);
  await assertNoUnrecognizedProductionData(params.db);
  console.log(`[seed-safety] Checks passed. PROPERTYPRO_SEED_ENV=${env}`);
  return env;
}
