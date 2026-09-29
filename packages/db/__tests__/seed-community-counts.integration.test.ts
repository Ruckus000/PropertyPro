/**
 * Per-domain row-count snapshot of what `seedCommunity` writes, per community
 * type (INF-03 / roadmap 3.10).
 *
 * `seed-community.ts` is split at its function seams behind a barrel. A split
 * that drops a seeding call, calls one twice, or loses a branch would still
 * type-check and still leave most of the demo looking alive — `pnpm
 * seed:verify` checks categories, e-sign templates and storage, and nothing
 * about units, leases, maintenance, wizard state or announcements. This file
 * pins every table the seed touches, for every community type and every
 * `seedHints` branch the admin demo route can pass, so any such drift names the
 * table that moved.
 *
 * What is snapshotted (deterministic — no ids, no timestamps):
 *   - `tables`: row count of EVERY public base table that has a `community_id`
 *     column, scoped to the seeded community (zero-count tables omitted). This
 *     is discovered from information_schema, not listed by hand, so a new write
 *     to a table nobody thought of still shows up;
 *   - per-domain breakdowns where a count alone could hide a swap (role shape,
 *     meeting types, announcement audience/pinned, lease/maintenance status,
 *     registry entity types, owned units, backdated hint documents, wizard row);
 *   - PDFs uploaded to storage for the community, and public.users rows made.
 *
 * Each case is then seeded a SECOND time and must produce the identical
 * snapshot: the seed is an idempotent upsert, so a duplicated insert shows up
 * as a count that grows on reseed.
 *
 * The expected literal below is the contract — edit it only for an intended
 * change to what the seed writes, never to make a refactor pass.
 *
 * Row COUNTS only: `seedRoles`' conflict semantics (the #1212
 * `coalesce(excluded.unit_id, user_roles.unit_id)` upsert) are pinned by
 * seed-resident-units.integration.test.ts, not here — linkSeededResidentUnits
 * re-links on every seed, so a count snapshot cannot see that revert.
 *
 * Supabase storage/auth go to the in-process HTTP double
 * (helpers/supabase-http-double.ts); no module is mocked. The file refuses a
 * non-loopback DATABASE_URL unless CI is set: it seeds and deletes communities.
 *
 * Run against the local disposable DB (never prod):
 *   DATABASE_URL="$(scripts/local-test-db.sh url)" pnpm --filter @propertypro/db \
 *     exec vitest run --config vitest.integration.config.ts \
 *     __tests__/seed-community-counts.integration.test.ts
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SeedHints } from '@propertypro/shared';
import { startSupabaseDouble, type SupabaseHttpDouble } from './helpers/supabase-http-double';

type CommunityType = 'condo_718' | 'hoa_720' | 'apartment';
type SeedUser = {
  email: string;
  fullName: string;
  role: 'owner' | 'tenant' | 'property_manager';
  designation?: 'board_president' | 'board_member';
};

interface SeedCase {
  key: string;
  communityType: CommunityType;
  seedHints?: SeedHints;
  users: Array<Omit<SeedUser, 'email'> & { local: string }>;
}

const CONDO_USERS: SeedCase['users'] = [
  { local: 'owner', fullName: 'Olive Owner', role: 'owner' },
  { local: 'tenant', fullName: 'Terry Tenant', role: 'tenant' },
  { local: 'president', fullName: 'Paula President', role: 'property_manager', designation: 'board_president' },
  { local: 'member', fullName: 'Mark Member', role: 'property_manager', designation: 'board_member' },
  { local: 'manager', fullName: 'Manny Manager', role: 'property_manager' },
];
const HOA_USERS: SeedCase['users'] = [
  { local: 'owner1', fullName: 'Hank Owner', role: 'owner' },
  { local: 'owner2', fullName: 'Hope Owner', role: 'owner' },
  { local: 'president', fullName: 'Harriet President', role: 'property_manager', designation: 'board_president' },
];
const APARTMENT_USERS: SeedCase['users'] = [
  { local: 'manager', fullName: 'Ada Manager', role: 'property_manager' },
  { local: 'tenant1', fullName: 'Tom Tenant', role: 'tenant' },
  { local: 'tenant2', fullName: 'Tina Tenant', role: 'tenant' },
  { local: 'tenant3', fullName: 'Theo Tenant', role: 'tenant' },
  { local: 'owner', fullName: 'Oscar Owner', role: 'owner' },
];

const CASES: SeedCase[] = [
  { key: 'condo', communityType: 'condo_718', users: CONDO_USERS },
  { key: 'hoa', communityType: 'hoa_720', users: HOA_USERS },
  { key: 'apartment', communityType: 'apartment', users: APARTMENT_USERS },
  // Every seedHints branch the admin demo route can pass, except
  // documentBias 'general' (a documented no-op).
  {
    key: 'condo-hinted',
    communityType: 'condo_718',
    users: CONDO_USERS,
    seedHints: { documentBias: 'compliance', meetingDensity: 'high', complianceScore: 40, announcementTone: 'urgent' },
  },
  {
    key: 'hoa-hinted',
    communityType: 'hoa_720',
    users: HOA_USERS,
    seedHints: { documentBias: 'financial', meetingDensity: 'low', complianceScore: 100, announcementTone: 'friendly' },
  },
  {
    key: 'apartment-hinted',
    communityType: 'apartment',
    users: APARTMENT_USERS,
    seedHints: { documentBias: 'maintenance', meetingDensity: 'medium', complianceScore: 0, announcementTone: 'formal' },
  },
];

interface CountSnapshot {
  community: string;
  tables: Record<string, number>;
  roles: Record<string, number>;
  registry: Record<string, number>;
  documents: { total: number; uncategorized: number; backdated: number };
  meetingTypes: Record<string, number>;
  meetingDocuments: number;
  announcements: Record<string, number>;
  units: { total: number; owned: number };
  leases: Record<string, number>;
  maintenance: Record<string, number>;
  wizard: string[];
  storageObjects: number;
  publicUsers: number;
}

/*
 * Measured 2026-09-29 on origin/main 4543362a, before seed-community.ts was split.
 *
 * `documents.backdated` counts documents older than 2 days. The unhinted cases
 * are 0; each hinted case is exactly its two documentBias documents, which the
 * complianceScore UPDATE back-dates by 5 + (1 - score/100) * 40 days (score 100
 * → 5 days, still past the 2-day threshold). Until that UPDATE matched on
 * `file_path` it matched `file_name LIKE '<slug>-%-hints-%'`, which no hint
 * document's file name satisfies, so all three read 0.
 */
const CONDO_ROLES = {
  'resident|owner=true|-|unit=true': 1,
  // A condo tenant has no lease here, so linkSeededResidentUnits leaves it
  // unit-less (scripts/seed-demo.ts links its persona explicitly).
  'resident|owner=false|-|unit=false': 1,
  'property_manager|owner=false|board_president|unit=false': 1,
  'property_manager|owner=false|board_member|unit=false': 1,
  'property_manager|owner=false|-|unit=false': 1,
};
const HOA_ROLES = {
  'resident|owner=true|-|unit=true': 2,
  'property_manager|owner=false|board_president|unit=false': 1,
};
const APARTMENT_ROLES = {
  'property_manager|owner=false|-|unit=false': 1,
  'resident|owner=false|-|unit=true': 3,
  'resident|owner=true|-|unit=true': 1,
};
const APARTMENT_MAINTENANCE = {
  'open|normal': 4,
  'in_progress|high': 2,
  'in_progress|low': 1,
  'resolved|normal': 1,
  'closed|low': 1,
};
const CONDO_WIZARD = ['condo|completed|step=2'];
const APARTMENT_WIZARD = ['apartment|completed|step=3'];

const EXPECTED: Record<string, CountSnapshot> = {
  condo: {
    community: 'condo_718|demo=true|trial=true|expires=true',
    tables: {
      announcements: 2,
      compliance_checklist_items: 17,
      demo_seed_registry: 5,
      document_categories: 8,
      documents: 2,
      meeting_documents: 1,
      meetings: 1,
      notification_preferences: 5,
      onboarding_wizard_state: 1,
      units: 6,
      user_roles: 5,
    },
    roles: CONDO_ROLES,
    registry: { announcement: 2, document: 2, meeting: 1 },
    documents: { total: 2, uncategorized: 0, backdated: 0 },
    meetingTypes: { board: 1 },
    meetingDocuments: 1,
    announcements: { 'all|pinned=true': 1, 'all|pinned=false': 1 },
    units: { total: 6, owned: 1 },
    leases: {},
    maintenance: {},
    wizard: CONDO_WIZARD,
    storageObjects: 2,
    publicUsers: 5,
  },
  hoa: {
    community: 'hoa_720|demo=true|trial=true|expires=true',
    tables: {
      announcements: 1,
      compliance_checklist_items: 10,
      demo_seed_registry: 4,
      document_categories: 8,
      documents: 2,
      meeting_documents: 1,
      meetings: 1,
      notification_preferences: 3,
      onboarding_wizard_state: 1,
      units: 6,
      user_roles: 3,
    },
    roles: HOA_ROLES,
    registry: { announcement: 1, document: 2, meeting: 1 },
    documents: { total: 2, uncategorized: 0, backdated: 0 },
    meetingTypes: { annual: 1 },
    meetingDocuments: 1,
    announcements: { 'all|pinned=false': 1 },
    units: { total: 6, owned: 2 },
    leases: {},
    maintenance: {},
    wizard: CONDO_WIZARD,
    storageObjects: 2,
    publicUsers: 3,
  },
  apartment: {
    community: 'apartment|demo=true|trial=true|expires=true',
    tables: {
      announcements: 5,
      demo_seed_registry: 18,
      document_categories: 8,
      documents: 3,
      leases: 15,
      maintenance_requests: 9,
      meeting_documents: 1,
      meetings: 1,
      notification_preferences: 5,
      onboarding_wizard_state: 1,
      units: 26,
      user_roles: 5,
    },
    roles: APARTMENT_ROLES,
    registry: { announcement: 5, document: 3, maintenance_request: 9, meeting: 1 },
    documents: { total: 3, uncategorized: 0, backdated: 0 },
    meetingTypes: { committee: 1 },
    meetingDocuments: 1,
    announcements: { 'all|pinned=false': 4, 'tenants_only|pinned=false': 1 },
    units: { total: 26, owned: 1 },
    leases: { active: 15 },
    maintenance: APARTMENT_MAINTENANCE,
    wizard: APARTMENT_WIZARD,
    storageObjects: 3,
    publicUsers: 5,
  },
  'condo-hinted': {
    community: 'condo_718|demo=true|trial=true|expires=true',
    tables: {
      announcements: 3,
      compliance_checklist_items: 17,
      demo_seed_registry: 13,
      document_categories: 8,
      documents: 4,
      meeting_documents: 1,
      meetings: 6,
      notification_preferences: 5,
      onboarding_wizard_state: 1,
      units: 6,
      user_roles: 5,
    },
    roles: CONDO_ROLES,
    registry: { announcement: 3, document: 4, meeting: 6 },
    documents: { total: 4, uncategorized: 0, backdated: 2 },
    meetingTypes: { board: 3, committee: 1, special: 1, annual: 1 },
    meetingDocuments: 1,
    announcements: { 'all|pinned=true': 2, 'all|pinned=false': 1 },
    units: { total: 6, owned: 1 },
    leases: {},
    maintenance: {},
    wizard: CONDO_WIZARD,
    storageObjects: 4,
    publicUsers: 5,
  },
  'hoa-hinted': {
    community: 'hoa_720|demo=true|trial=true|expires=true',
    tables: {
      announcements: 2,
      compliance_checklist_items: 10,
      demo_seed_registry: 8,
      document_categories: 8,
      documents: 4,
      meeting_documents: 1,
      meetings: 2,
      notification_preferences: 3,
      onboarding_wizard_state: 1,
      units: 6,
      user_roles: 3,
    },
    roles: HOA_ROLES,
    registry: { announcement: 2, document: 4, meeting: 2 },
    documents: { total: 4, uncategorized: 0, backdated: 2 },
    meetingTypes: { annual: 1, committee: 1 },
    meetingDocuments: 1,
    announcements: { 'all|pinned=false': 2 },
    units: { total: 6, owned: 2 },
    leases: {},
    maintenance: {},
    wizard: CONDO_WIZARD,
    storageObjects: 4,
    publicUsers: 3,
  },
  'apartment-hinted': {
    community: 'apartment|demo=true|trial=true|expires=true',
    tables: {
      announcements: 6,
      demo_seed_registry: 24,
      document_categories: 8,
      documents: 5,
      leases: 15,
      maintenance_requests: 9,
      meeting_documents: 1,
      meetings: 4,
      notification_preferences: 5,
      onboarding_wizard_state: 1,
      units: 26,
      user_roles: 5,
    },
    roles: APARTMENT_ROLES,
    registry: { announcement: 6, document: 5, maintenance_request: 9, meeting: 4 },
    documents: { total: 5, uncategorized: 0, backdated: 2 },
    meetingTypes: { committee: 2, board: 1, special: 1 },
    meetingDocuments: 1,
    announcements: { 'all|pinned=false': 5, 'tenants_only|pinned=false': 1 },
    units: { total: 26, owned: 1 },
    leases: { active: 15 },
    maintenance: APARTMENT_MAINTENANCE,
    wizard: APARTMENT_WIZARD,
    storageObjects: 5,
    publicUsers: 5,
  },
};

const describeDb = process.env.DATABASE_URL ? describe.sequential : describe.skip;

/** Refuse any database not on this machine (CI's is an ephemeral container). */
function assertLoopbackDatabaseOrCI(): void {
  if (process.env.CI) return;
  let host = '';
  try {
    host = new URL(process.env.DATABASE_URL ?? '').hostname;
  } catch {
    throw new Error('seed-community-counts: DATABASE_URL is not a parseable URL; refusing to run');
  }
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    throw new Error(
      `seed-community-counts: refusing to run against non-local database host '${host}'; use scripts/local-test-db.sh`,
    );
  }
}

describeDb('seedCommunity per-domain row counts (integration)', () => {
  const tag = randomUUID().slice(0, 8);
  const slugOf = (c: SeedCase) => `demo-seedcounts-${c.key}-${tag}`;
  const emailOf = (c: SeedCase, local: string) => `${c.key}.${local}.${tag}@seedcounts.test`;

  let seed: typeof import('../src/seed/seed-community');
  let db: ReturnType<typeof import('../src/unsafe').createUnscopedClient>;
  let schema: typeof import('../src/schema');
  let filters: typeof import('../src/filters');
  let double: SupabaseHttpDouble;
  let communityTables: string[] = [];
  const first: Record<string, CountSnapshot> = {};
  const second: Record<string, CountSnapshot> = {};
  const savedEnv = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    pw: process.env.DEMO_DEFAULT_PASSWORD,
  };

  function rowsOf<T>(result: unknown): T[] {
    if (Array.isArray(result)) return result as T[];
    const rows = (result as { rows?: unknown } | null)?.rows;
    return Array.isArray(rows) ? (rows as T[]) : [];
  }

  async function tally(query: ReturnType<typeof filters.sql>): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const row of rowsOf<{ k: string; n: number | string }>(await db.execute(query))) {
      out[row.k] = Number(row.n);
    }
    return out;
  }

  async function scalar(query: ReturnType<typeof filters.sql>): Promise<number> {
    return Number(rowsOf<{ n: number | string }>(await db.execute(query))[0]?.n ?? 0);
  }

  function seedOnce(c: SeedCase) {
    return seed.seedCommunity(
      {
        name: `Seed Counts ${c.key}`,
        slug: slugOf(c),
        communityType: c.communityType,
        isDemo: true,
        ...(c.seedHints ? { seedHints: c.seedHints } : {}),
      },
      c.users.map(({ local, ...user }) => ({ ...user, email: emailOf(c, local) })),
      { syncAuthUsers: false },
    );
  }

  async function snapshot(c: SeedCase, communityId: number): Promise<CountSnapshot> {
    const { sql } = filters;
    const tables: Record<string, number> = {};
    for (const table of communityTables) {
      const n = await scalar(
        sql`select count(*)::int as n from ${sql.raw(`public."${table}"`)} where community_id = ${communityId}`,
      );
      if (n > 0) tables[table] = n;
    }

    const [community] = rowsOf<{ k: string }>(await db.execute(sql`
      select community_type || '|demo=' || is_demo::text
        || '|trial=' || (trial_ends_at is not null)::text
        || '|expires=' || (demo_expires_at is not null)::text as k
      from communities where id = ${communityId}
    `));

    const emails = c.users.map((u) => emailOf(c, u.local));
    const emailList = sql.join(emails.map((e) => sql`${e}`), sql`, `);

    return {
      community: community?.k ?? 'missing',
      tables,
      roles: await tally(sql`
        select role || '|owner=' || is_unit_owner::text || '|' || coalesce(designation, '-')
          || '|unit=' || (unit_id is not null)::text as k, count(*)::int as n
        from user_roles where community_id = ${communityId} group by 1
      `),
      registry: await tally(sql`
        select entity_type as k, count(*)::int as n
        from demo_seed_registry where community_id = ${communityId} group by 1
      `),
      documents: {
        total: await scalar(sql`select count(*)::int as n from documents where community_id = ${communityId}`),
        uncategorized: await scalar(
          sql`select count(*)::int as n from documents where community_id = ${communityId} and category_id is null`,
        ),
        backdated: await scalar(sql`
          select count(*)::int as n from documents
          where community_id = ${communityId} and created_at < now() - interval '2 days'
        `),
      },
      meetingTypes: await tally(sql`
        select meeting_type as k, count(*)::int as n
        from meetings where community_id = ${communityId} group by 1
      `),
      meetingDocuments: await scalar(
        sql`select count(*)::int as n from meeting_documents where community_id = ${communityId}`,
      ),
      announcements: await tally(sql`
        select audience || '|pinned=' || is_pinned::text as k, count(*)::int as n
        from announcements where community_id = ${communityId} group by 1
      `),
      units: {
        total: await scalar(sql`select count(*)::int as n from units where community_id = ${communityId}`),
        owned: await scalar(
          sql`select count(*)::int as n from units where community_id = ${communityId} and owner_user_id is not null`,
        ),
      },
      leases: await tally(sql`
        select status as k, count(*)::int as n from leases where community_id = ${communityId} group by 1
      `),
      maintenance: await tally(sql`
        select status || '|' || priority as k, count(*)::int as n
        from maintenance_requests where community_id = ${communityId} group by 1
      `),
      wizard: rowsOf<{ k: string }>(await db.execute(sql`
        select wizard_type || '|' || status || '|step=' || last_completed_step::text as k
        from onboarding_wizard_state where community_id = ${communityId} order by 1
      `)).map((r) => r.k),
      storageObjects: [...double.objects.keys()].filter((key) => key.startsWith(`documents/demo/${communityId}/`))
        .length,
      publicUsers: await scalar(sql`select count(*)::int as n from users where email in (${emailList})`),
    };
  }

  beforeAll(async () => {
    assertLoopbackDatabaseOrCI();
    double = await startSupabaseDouble();
    process.env.NEXT_PUBLIC_SUPABASE_URL = double.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'seed-counts-test-service-role';
    process.env.DEMO_DEFAULT_PASSWORD ??= 'seed-counts-test-password';
    seed = await import('../src/seed/seed-community');
    schema = await import('../src/schema');
    filters = await import('../src/filters');
    db = (await import('../src/unsafe')).createUnscopedClient();

    const { sql } = filters;
    communityTables = rowsOf<{ table_name: string }>(await db.execute(sql`
      select c.table_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema = 'public' and c.column_name = 'community_id' and t.table_type = 'BASE TABLE'
      order by c.table_name
    `)).map((r) => r.table_name);
    for (const table of communityTables) {
      if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error(`unexpected table name ${table}`);
    }

    for (const c of CASES) {
      const result = await seedOnce(c);
      first[c.key] = await snapshot(c, result.communityId);
    }
    for (const c of CASES) {
      const result = await seedOnce(c);
      second[c.key] = await snapshot(c, result.communityId);
    }
  }, 600_000);

  afterAll(async () => {
    if (!db) return;
    const { inArray, like } = filters;
    const rows = await db
      .select({ id: schema.communities.id })
      .from(schema.communities)
      .where(inArray(schema.communities.slug, CASES.map(slugOf)));
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      await db.delete(schema.demoSeedRegistry).where(inArray(schema.demoSeedRegistry.communityId, ids));
      await db.delete(schema.communities).where(inArray(schema.communities.id, ids));
    }
    await db.delete(schema.users).where(like(schema.users.email, `%.${tag}@seedcounts.test`));
    await new Promise((resolve) => double.server.close(resolve));
    for (const [name, value] of [
      ['NEXT_PUBLIC_SUPABASE_URL', savedEnv.url],
      ['SUPABASE_SERVICE_ROLE_KEY', savedEnv.key],
      ['DEMO_DEFAULT_PASSWORD', savedEnv.pw],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }, 120_000);

  it('discovered a non-trivial population of community-scoped tables', () => {
    // A scan that examined nothing must not pass.
    expect(communityTables.length).toBeGreaterThan(20);
    expect(communityTables).toEqual(expect.arrayContaining(['documents', 'units', 'user_roles']));
  });

  for (const c of CASES) {
    it(`${c.key}: first seed matches the frozen per-domain snapshot`, () => {
      expect(first[c.key]).toEqual(EXPECTED[c.key]);
    });

    it(`${c.key}: a reseed writes no duplicates and drops nothing`, () => {
      expect(second[c.key]).toEqual(first[c.key]);
    });
  }

  // Last, so it covers every request the seeds above made.
  it('only used the Supabase endpoints the double implements', () => {
    expect(double.unexpected).toEqual([]);
  });
});
