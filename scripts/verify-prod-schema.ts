/**
 * Refuse to deploy code whose schema declares something the database lacks.
 *
 * Usage:  DATABASE_URL=… pnpm db:schema:verify
 *
 * ## Why this exists
 *
 * On 2026-10-29 `a955ae3` (#1416) deployed code that reads
 * `communities.short_name`. Its expand migration, `0095_website_builder_columns`,
 * had not been applied to production. Drizzle lists every declared column in a
 * `select()`, so the shared tenant lookup failed and every association subdomain
 * returned 500 until the migration was applied the next day. Nothing in the
 * pipeline could have noticed: CI migrates a fresh database, and the deploy's
 * smoke test only fetches `/auth/login` on the apex host.
 *
 * Migrations here are applied to production BY HAND, before (expand) or after
 * (contract) their code ships. Both orders are correct, so "every migration file
 * is in the ledger" is the wrong invariant: a merged contract migration is
 * legitimately unapplied while the old code is still live. The invariant that
 * holds in both cases is narrower:
 *
 *   every table, column and enum value the code's Drizzle schema declares
 *   exists in the database it is about to run against.
 *
 * Extra columns in the database are fine (that is what a pending contract
 * migration looks like). Missing ones are an outage or a failed write.
 *
 * ## Why this runs in Deploy and not in CI
 *
 * For the reason `verify-migration-ledger.ts` gives: CI's database is migrated
 * from the same files, so it satisfies the schema by construction and the check
 * would pass unconditionally there. The only database where the answer means
 * anything is production, so `deploy.yml` runs it against production before
 * building. `compareSchema()` is pure, and CI unit-tests it.
 *
 * ## Read-only, and safe for a role with no grants
 *
 * One SELECT, against `pg_catalog`, NOT `information_schema`. The latter hides
 * columns the connecting role holds no privilege on, so a least-privilege role
 * would see an empty database and every column would read as missing.
 * `pg_catalog` is readable by every role. Deploy connects as a dedicated login
 * role with no table grants (see docs/DEPLOYMENT.md).
 *
 * ## Known limits
 *
 * ponytail: checks existence only, not column type, nullability or defaults. A
 * code-side NOT NULL the database lacks is harmless; a database-side NOT NULL the
 * code never writes (a contract migration applied too late) fails inserts and is
 * not caught here. Trigger: an incident caused by a type or NOT NULL mismatch.
 *
 * ## Exit codes
 *
 *   0  the database covers the schema (allowlisted gaps are reported, not failed)
 *   1  something declared is missing
 *   2  could not check: no DATABASE_URL, connection failed, empty schema on
 *      either side. Refuses rather than passes.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { is } from "drizzle-orm";
import { PgTable, getTableConfig, isPgEnum } from "drizzle-orm/pg-core";
import postgres from "postgres";

import * as schema from "../packages/db/src/schema/index.ts";
import { isMainModule } from "./lib/is-main-module";
import { databaseHost } from "./lib/stripe-guards";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(resolve(scriptDir, ".."), "packages/db/migrations");

/**
 * Declared objects production is allowed to lack, each tied to a migration that
 * `verify-migration-ledger.ts` lists in `KNOWN_UNAPPLIED_MIGRATIONS`. A unit test
 * keeps the two lists in step: an entry whose migration is no longer held, or
 * that the migration does not add, fails CI.
 *
 * Keys are `table.column`, `table` or `enum_type.value`.
 */
export const KNOWN_MISSING: ReadonlyArray<{
  key: string;
  migration: string;
  reason: string;
}> = [
  {
    key: "election_ballot_submissions.selection_digest",
    migration: "0062_secret_ballot",
    reason:
      "Added by 0062, which is held until e-voting clears attorney review. Only " +
      "castElectionVoteForCommunity and getMyElectionVoteReceiptForCommunity read " +
      "it, and both routes call requireElectionsEnabled, which refuses while " +
      "community_settings.electionsAttorneyReviewed is unset (false for every " +
      "production community on 2026-10-30). Apply 0062 BEFORE enabling that flag.",
  },
];

export interface DeclaredSchema {
  /** Table name → declared column names. */
  tables: Map<string, Set<string>>;
  /** Enum type name → declared values. */
  enums: Map<string, Set<string>>;
}

export interface CatalogRow {
  kind: "column" | "enum";
  /** Table name or enum type name. */
  owner: string;
  /** Column name or enum value. */
  name: string;
}

export interface SchemaComparison {
  declaredColumns: number;
  declaredEnumValues: number;
  /** Tables absent altogether (their columns are not also listed below). */
  missingTables: string[];
  /** `table.column` keys absent from a table that does exist. */
  missingColumns: string[];
  /** Enum types absent altogether. */
  missingEnumTypes: string[];
  /** `type.value` keys absent from an enum type that does exist. */
  missingEnumValues: string[];
  /** Missing, but allowlisted in KNOWN_MISSING. */
  allowed: Array<{ key: string; migration: string }>;
  /** Allowlisted, but present. The entry can go once its migration is applied. */
  staleAllowlist: string[];
}

/** Read the tables and enums the Drizzle schema declares. */
export function readDeclaredSchema(
  modules: Record<string, unknown> = schema,
): DeclaredSchema {
  const tables = new Map<string, Set<string>>();
  const enums = new Map<string, Set<string>>();
  for (const value of Object.values(modules)) {
    if (is(value, PgTable)) {
      const config = getTableConfig(value);
      if (config.schema && config.schema !== "public") {
        throw new Error(
          `Table ${config.schema}.${config.name} is outside "public"; the catalog query reads public only.`,
        );
      }
      tables.set(config.name, new Set(config.columns.map((c) => c.name)));
    } else if (isPgEnum(value)) {
      enums.set(value.enumName, new Set(value.enumValues));
    }
  }
  return { tables, enums };
}

/**
 * Compare what the code declares against what the database has. Pure: no
 * filesystem, database or printing.
 */
export function compareSchema(
  declared: DeclaredSchema,
  catalog: readonly CatalogRow[],
  knownMissing: ReadonlyArray<{
    key: string;
    migration: string;
  }> = KNOWN_MISSING,
): SchemaComparison {
  const actualTables = new Map<string, Set<string>>();
  const actualEnums = new Map<string, Set<string>>();
  for (const row of catalog) {
    const target = row.kind === "column" ? actualTables : actualEnums;
    const names = target.get(row.owner) ?? new Set<string>();
    names.add(row.name);
    target.set(row.owner, names);
  }

  const allowlist = new Map(knownMissing.map((e) => [e.key, e.migration]));
  const allowed: SchemaComparison["allowed"] = [];
  const consumed = new Set<string>();
  /** True when `key` is missing and NOT excused. */
  const fails = (key: string): boolean => {
    const migration = allowlist.get(key);
    if (migration === undefined) return true;
    allowed.push({ key, migration });
    consumed.add(key);
    return false;
  };

  const missingTables: string[] = [];
  const missingColumns: string[] = [];
  const missingEnumTypes: string[] = [];
  const missingEnumValues: string[] = [];
  let declaredColumns = 0;
  let declaredEnumValues = 0;

  for (const [table, columns] of declared.tables) {
    declaredColumns += columns.size;
    const actual = actualTables.get(table);
    if (!actual) {
      if (fails(table)) missingTables.push(table);
      continue;
    }
    for (const column of columns) {
      const key = `${table}.${column}`;
      if (!actual.has(column) && fails(key)) missingColumns.push(key);
    }
  }

  for (const [type, values] of declared.enums) {
    declaredEnumValues += values.size;
    const actual = actualEnums.get(type);
    if (!actual) {
      if (fails(type)) missingEnumTypes.push(type);
      continue;
    }
    for (const value of values) {
      const key = `${type}.${value}`;
      if (!actual.has(value) && fails(key)) missingEnumValues.push(key);
    }
  }

  return {
    declaredColumns,
    declaredEnumValues,
    missingTables: missingTables.sort(),
    missingColumns: missingColumns.sort(),
    missingEnumTypes: missingEnumTypes.sort(),
    missingEnumValues: missingEnumValues.sort(),
    allowed,
    staleAllowlist: knownMissing
      .map((e) => e.key)
      .filter((k) => !consumed.has(k)),
  };
}

/**
 * Which migration adds each key, so a failure can name the fix. A scan for the
 * statement shapes drizzle-kit emits, not a SQL parser: a miss costs a less
 * helpful message, never a wrong verdict. The LAST migration to add a key wins,
 * since a later one may re-add what an earlier one dropped.
 */
export function migrationsAdding(
  files: ReadonlyArray<{ tag: string; sql: string }>,
): Map<string, string> {
  const ident = '"?(?:public"?\\.)?"?([a-z_][a-z0-9_]*)"?';
  const found = new Map<string, string>();
  for (const { tag, sql } of files) {
    const code = sql
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .split("\n")
      .map((line) => line.replace(/--.*$/, ""))
      .join("\n");
    for (const m of code.matchAll(
      new RegExp(
        `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${ident}`,
        "gi",
      ),
    )) {
      found.set(m[1]!, tag);
    }
    for (const stmt of code.matchAll(
      new RegExp(
        `ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?${ident}([^;]*)`,
        "gi",
      ),
    )) {
      for (const c of stmt[2]!.matchAll(
        /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi,
      )) {
        found.set(`${stmt[1]}.${c[1]}`, tag);
      }
    }
    for (const m of code.matchAll(
      new RegExp(
        `CREATE\\s+TYPE\\s+${ident}\\s+AS\\s+ENUM\\s*\\(([^)]*)\\)`,
        "gi",
      ),
    )) {
      found.set(m[1]!, tag);
      for (const v of m[2]!.matchAll(/'([^']*)'/g))
        found.set(`${m[1]}.${v[1]}`, tag);
    }
    for (const m of code.matchAll(
      new RegExp(
        `ALTER\\s+TYPE\\s+${ident}\\s+ADD\\s+VALUE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?'([^']*)'`,
        "gi",
      ),
    )) {
      found.set(`${m[1]}.${m[2]}`, tag);
    }
  }
  return found;
}

/** Read every journaled migration's SQL. Returns [] when the tree has none. */
export function readMigrations(
  dir: string = MIGRATIONS_DIR,
): Array<{ tag: string; sql: string }> {
  const journalPath = join(dir, "meta/_journal.json");
  if (!existsSync(journalPath)) return [];
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries: Array<{ tag: string }>;
  };
  return journal.entries
    .filter((e) => existsSync(join(dir, `${e.tag}.sql`)))
    .map((e) => ({
      tag: e.tag,
      sql: readFileSync(join(dir, `${e.tag}.sql`), "utf8"),
    }));
}

/** Every column of every ordinary or partitioned table, and every enum value, in `public`. */
export const CATALOG_SQL = `
  select 'column' as kind, c.relname as owner, a.attname as name
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and a.attnum > 0 and not a.attisdropped
  union all
  select 'enum', t.typname, e.enumlabel
    from pg_catalog.pg_enum e
    join pg_catalog.pg_type t on t.oid = e.enumtypid
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public'
`;

/** Turn a comparison into printable lines and an exit code (0 or 1). */
export function formatReport(
  r: SchemaComparison,
  adding: ReadonlyMap<string, string> = new Map(),
): { lines: string[]; problems: string[]; exitCode: 0 | 1 } {
  const lines: string[] = [];
  const problems: string[] = [];
  const via = (key: string) => {
    const tag = adding.get(key);
    return tag
      ? `  ← added by ${tag}`
      : "  ← no migration on this commit adds it";
  };
  for (const t of r.missingTables) problems.push(`table   ${t}${via(t)}`);
  for (const c of r.missingColumns) problems.push(`column  ${c}${via(c)}`);
  for (const t of r.missingEnumTypes) problems.push(`enum    ${t}${via(t)}`);
  for (const v of r.missingEnumValues) problems.push(`value   ${v}${via(v)}`);

  for (const a of r.allowed) {
    lines.push(
      `allowed: ${a.key} is missing, held with ${a.migration} (KNOWN_MISSING)`,
    );
  }
  for (const key of r.staleAllowlist) {
    // A warning, not a failure: failing a deploy over bookkeeping is how this
    // pipeline once blocked every release for two weeks. CI's unit test is
    // what makes the entry go away.
    lines.push(
      `note: ${key} is in KNOWN_MISSING but present. Remove the entry.`,
    );
  }
  return { lines, problems, exitCode: problems.length > 0 ? 1 : 0 };
}

function couldNotCheck(msg: string): never {
  console.error(`✖ db:schema:verify — COULD NOT CHECK\n  ${msg}`);
  process.exit(2);
}

async function run(): Promise<number> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    couldNotCheck(
      "Missing DATABASE_URL. In Deploy this is the SCHEMA_CHECK_DATABASE_URL repository secret " +
        "(see docs/DEPLOYMENT.md). Refusing to pass a comparison that was never made.",
    );
  }
  // A secret pasted short (seen 2026-10-30: 33 characters) otherwise surfaces
  // as a bare "Invalid URL". Report its shape, never its value.
  if (!/^postgres(ql)?:\/\/[^\s@]+@[^\s/]+\/\S+$/.test(databaseUrl.trim())) {
    couldNotCheck(
      `DATABASE_URL is not a postgresql://user:password@host:port/db string ` +
        `(${databaseUrl.length} characters). Re-paste the whole connection string.`,
    );
  }

  const declared = readDeclaredSchema();
  if (declared.tables.size === 0) {
    couldNotCheck(
      "The Drizzle schema declared no tables. Refusing to compare an empty population.",
    );
  }

  console.log(
    `Production schema check: database host ${databaseHost(databaseUrl)}`,
  );
  const sql = postgres(databaseUrl, {
    prepare: false,
    max: 1,
    connect_timeout: 20,
  });
  let catalog: CatalogRow[];
  try {
    catalog = await sql.unsafe<CatalogRow[]>(CATALOG_SQL);
  } catch (error) {
    couldNotCheck(
      `Catalog query failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
  if (!catalog.some((row) => row.kind === "column")) {
    couldNotCheck(
      'The database has no tables in "public". That is the wrong database, not a schema to compare against.',
    );
  }

  const result = compareSchema(declared, catalog);
  const { lines, problems, exitCode } = formatReport(
    result,
    migrationsAdding(readMigrations()),
  );
  console.log(
    `declared: ${declared.tables.size} tables, ${result.declaredColumns} columns, ` +
      `${declared.enums.size} enums, ${result.declaredEnumValues} enum values`,
  );
  for (const line of lines) console.log(line);

  if (problems.length > 0) {
    console.error(
      `\n❌ This code expects ${problems.length} thing(s) the database does not have:\n`,
    );
    for (const p of problems) console.error(`  ${p}`);
    console.error(
      "\nApply the expand migration(s) above to production (migration-safety.md), then re-run Deploy.",
    );
    return exitCode;
  }
  console.log(
    "\n✅ The database has every table, column and enum value this code declares.",
  );
  return exitCode;
}

if (isMainModule(import.meta.url)) {
  run()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(
        `✖ db:schema:verify — unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(2);
    });
}
