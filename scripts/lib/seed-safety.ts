/* eslint-disable no-console -- CLI guardrail; console output is intentional */

/**
 * Seed/reset CLI guardrails.
 *
 * These checks gate destructive scripts (`pnpm seed:demo`, `pnpm reset:demo`)
 * so they refuse to run without explicit operator acknowledgement of the
 * target environment. Placed at the CLI entry so library callers (integration
 * tests importing `runDemoSeed` / `runDemoReset` directly) bypass the gate.
 *
 * This module intentionally imports only from `drizzle-orm` (plus the
 * dependency-free `extract-rows`) — not from `@propertypro/db` — to avoid pulling
 * the module-level DB client. That keeps
 * the env-check surface pure and unit-testable without a live database.
 */
import { sql } from 'drizzle-orm';
import { extractRows } from './extract-rows';

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

type SqlExecutor = {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>;
};

/**
 * Ids of the communities the reset may wipe: those holding a demo slug AND
 * flagged `is_demo`. The reset DELETEs 31 tables for these ids and runs against
 * production, so a real association that somehow holds a demo slug must never
 * be returned — the slug alone is not proof a row is a demo.
 */
export async function resolveDemoCommunityIds(
  db: SqlExecutor,
  slugs: readonly string[],
): Promise<number[]> {
  if (slugs.length === 0) return [];
  const rows = extractRows<{ id: number | string }>(
    await db.execute(sql`
      select id from communities
      where is_demo = true
        and slug in (${sql.join(slugs.map((slug) => sql`${slug}`), sql`, `)})
      order by id
    `),
  );
  return rows.map((row) => Number(row.id));
}

/**
 * Refuse when a demo user is attached to a REAL (is_demo=false, live) community,
 * by a role or as the owner of its billing group.
 *
 * The seed rewrites demo users wherever they are — name, phone, auth password,
 * and a re-key of every FK to them — and recounts the pm.admin billing group. A
 * real community is only at risk through one of those users, so that is what
 * this checks. Real communities merely EXISTING is expected: this runs nightly
 * against production. (The previous rule refused on any non-demo community,
 * which blocked every run from the first real signup on.)
 *
 * Raw SQL through the caller's db, so this module never imports the schema.
 */
export async function assertDemoUsersNotAttachedToRealCommunities(
  db: SqlExecutor,
  demoEmails: readonly string[],
): Promise<void> {
  if (demoEmails.length === 0) {
    throw new SeedSafetyError('Refusing to run: no demo user emails were supplied to check.');
  }
  const emails = sql.join(demoEmails.map((email) => sql`${email.toLowerCase()}`), sql`, `);
  const rows = extractRows<{ id: number | string; slug: string; email: string }>(
    await db.execute(sql`
      select c.id, c.slug, u.email
        from communities c
        join user_roles ur on ur.community_id = c.id
        join users u on u.id = ur.user_id
       where c.is_demo = false and c.deleted_at is null and lower(u.email) in (${emails})
      union
      select c.id, c.slug, u.email
        from communities c
        join billing_groups bg on bg.id = c.billing_group_id
        join users u on u.id = bg.owner_user_id
       where c.is_demo = false and c.deleted_at is null and lower(u.email) in (${emails})
      order by id, email
    `),
  );

  if (rows.length === 0) return;

  const listed = rows.map((r) => `  - ${r.slug} (id=${String(r.id)}) via ${r.email}`).join('\n');
  throw new SeedSafetyError(
    [
      `Refusing to run: ${String(rows.length)} real (is_demo=false) community link(s) to a demo user.`,
      'The seed rewrites demo users (name, phone, password, id) and their billing group,',
      'so running now would change data that belongs to these communities:',
      listed,
      '',
      '  Remediation: detach the demo user from the real community (remove the role or',
      '  billing-group link), then re-run.',
    ].join('\n'),
  );
}

/**
 * Compose the checks. Call from `main()` of seed/reset CLI entry points before
 * any destructive operation.
 */
export async function runSeedSafetyChecks(params: {
  databaseUrl: string;
  db: SqlExecutor;
  demoEmails: readonly string[];
}): Promise<SeedEnvironment> {
  const env = assertSeedEnvironment();
  logDatabaseTarget(params.databaseUrl);
  await assertDemoUsersNotAttachedToRealCommunities(params.db, params.demoEmails);
  console.log(`[seed-safety] Checks passed. PROPERTYPRO_SEED_ENV=${env}`);
  return env;
}
