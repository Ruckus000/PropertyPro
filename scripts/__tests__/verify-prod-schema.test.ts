import { pgSchema, pgTable, pgEnum, text } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { KNOWN_UNAPPLIED_MIGRATIONS } from "../verify-migration-ledger";
import {
  KNOWN_MISSING,
  compareSchema,
  formatReport,
  migrationsAdding,
  readDeclaredSchema,
  readMigrations,
  type CatalogRow,
  type DeclaredSchema,
} from "../verify-prod-schema";

/**
 * `pnpm db:schema:verify` only means something against production, so Deploy
 * runs it there and CI tests the comparison here (see the script's header).
 */

const declared = (
  tables: Record<string, string[]>,
  enums: Record<string, string[]> = {},
): DeclaredSchema => ({
  tables: new Map(
    Object.entries(tables).map(([t, cols]) => [t, new Set(cols)]),
  ),
  enums: new Map(Object.entries(enums).map(([e, vals]) => [e, new Set(vals)])),
});

const cols = (table: string, names: string[]): CatalogRow[] =>
  names.map((name) => ({ kind: "column", owner: table, name }));
const vals = (type: string, names: string[]): CatalogRow[] =>
  names.map((name) => ({ kind: "enum", owner: type, name }));

describe("compareSchema", () => {
  const code = declared(
    { communities: ["id", "name", "short_name"] },
    { plan: ["free", "pro"] },
  );

  it("passes when the database has everything declared, and ignores extra database columns", () => {
    const r = compareSchema(
      code,
      [
        ...cols("communities", ["id", "name", "short_name", "dropped_later"]),
        ...vals("plan", ["free", "pro", "old"]),
      ],
      [],
    );
    expect(r).toMatchObject({
      declaredColumns: 3,
      declaredEnumValues: 2,
      missingTables: [],
      missingColumns: [],
      missingEnumTypes: [],
      missingEnumValues: [],
    });
    expect(formatReport(r).exitCode).toBe(0);
  });

  it("reports a column the code declares and the database lacks (the 2026-10-29 outage)", () => {
    const r = compareSchema(
      code,
      [
        ...cols("communities", ["id", "name"]),
        ...vals("plan", ["free", "pro"]),
      ],
      [],
    );
    expect(r.missingColumns).toEqual(["communities.short_name"]);
    expect(formatReport(r).exitCode).toBe(1);
  });

  it("reports a missing table once, not once per column", () => {
    const r = compareSchema(code, vals("plan", ["free", "pro"]), []);
    expect(r.missingTables).toEqual(["communities"]);
    expect(r.missingColumns).toEqual([]);
  });

  it("reports a missing enum value, and a missing enum type once", () => {
    const one = compareSchema(
      code,
      [
        ...cols("communities", ["id", "name", "short_name"]),
        ...vals("plan", ["free"]),
      ],
      [],
    );
    expect(one.missingEnumValues).toEqual(["plan.pro"]);
    const none = compareSchema(
      code,
      cols("communities", ["id", "name", "short_name"]),
      [],
    );
    expect(none.missingEnumTypes).toEqual(["plan"]);
    expect(none.missingEnumValues).toEqual([]);
  });

  it("excuses an allowlisted gap, and reports a stale entry as a note rather than a failure", () => {
    const allow = [
      { key: "communities.short_name", migration: "0095_x" },
      { key: "communities.name", migration: "0001_y" },
    ];
    const r = compareSchema(
      code,
      [
        ...cols("communities", ["id", "name"]),
        ...vals("plan", ["free", "pro"]),
      ],
      allow,
    );
    expect(r.missingColumns).toEqual([]);
    expect(r.allowed).toEqual([
      { key: "communities.short_name", migration: "0095_x" },
    ]);
    expect(r.staleAllowlist).toEqual(["communities.name"]);
    const report = formatReport(r);
    expect(report.exitCode).toBe(0);
    expect(report.lines.join("\n")).toContain(
      "communities.name is in KNOWN_MISSING but present",
    );
  });
});

describe("formatReport", () => {
  it("names the migration that adds each missing key", () => {
    const r = compareSchema(
      declared({ t: ["id", "a", "b"] }),
      cols("t", ["id"]),
      [],
    );
    const { problems } = formatReport(r, new Map([["t.a", "0095_x"]]));
    expect(problems).toEqual([
      "column  t.a  ← added by 0095_x",
      "column  t.b  ← no migration on this commit adds it",
    ]);
  });
});

describe("migrationsAdding", () => {
  it("reads the statement shapes drizzle-kit emits and ignores comments", () => {
    const found = migrationsAdding([
      {
        tag: "0001_a",
        sql: [
          '-- ALTER TABLE "decoy" ADD COLUMN "nope" text;',
          'CREATE TABLE IF NOT EXISTS "public"."things" ("id" bigserial);',
          "CREATE TYPE \"public\".\"plan\" AS ENUM('free', 'pro');",
          'ALTER TABLE "communities" ADD COLUMN "short_name" text, ADD COLUMN "office_hours" text;',
        ].join("\n"),
      },
      {
        tag: "0002_b",
        sql: 'ALTER TYPE "public"."plan" ADD VALUE \'max\';\nALTER TABLE "communities" ADD COLUMN "short_name" text;',
      },
    ]);
    expect(Object.fromEntries(found)).toEqual({
      things: "0001_a",
      plan: "0001_a",
      "plan.free": "0001_a",
      "plan.pro": "0001_a",
      "plan.max": "0002_b",
      "communities.office_hours": "0001_a",
      // the later migration wins
      "communities.short_name": "0002_b",
    });
  });
});

describe("readDeclaredSchema", () => {
  it("reads the real schema, including the column whose absence caused the outage", () => {
    const real = readDeclaredSchema();
    expect(real.tables.size).toBeGreaterThan(100);
    expect(real.tables.get("communities")?.has("short_name")).toBe(true);
    expect(real.enums.get("community_type")?.has("condo_718")).toBe(true);
  });

  it('refuses a table outside "public", which the catalog query cannot see', () => {
    const auth = pgSchema("auth");
    expect(() =>
      readDeclaredSchema({ users: auth.table("users", { id: text("id") }) }),
    ).toThrow(/outside "public"/);
  });

  it("collects tables and enums from module exports and ignores everything else", () => {
    const r = readDeclaredSchema({
      t: pgTable("t", { a: text("a") }),
      e: pgEnum("e", ["x"]),
      helper: () => 1,
    });
    expect([...r.tables.keys()]).toEqual(["t"]);
    expect([...r.enums.get("e")!]).toEqual(["x"]);
  });
});

describe("KNOWN_MISSING", () => {
  const held = new Set(KNOWN_UNAPPLIED_MIGRATIONS.map((m) => m.tag));
  const adding = migrationsAdding(readMigrations());
  const real = readDeclaredSchema();

  it.each(KNOWN_MISSING.map((e) => [e.key, e] as const))(
    "%s is still held, is added by its migration, and is declared by the code",
    (_key, entry) => {
      // Once the migration is applied and leaves KNOWN_UNAPPLIED_MIGRATIONS,
      // this entry must go too.
      expect(held.has(entry.migration)).toBe(true);
      expect(adding.get(entry.key)).toBe(entry.migration);
      const [table, column] = entry.key.split(".");
      const declaredHere = column
        ? real.tables.get(table!)?.has(column)
        : real.tables.has(table!);
      expect(declaredHere || real.enums.get(table!)?.has(column ?? "")).toBe(
        true,
      );
      expect(entry.reason.length).toBeGreaterThan(40);
    },
  );
});
