import { randomUUID } from 'node:crypto';
import { and, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/schema';
import { communities } from '../src/schema/communities';
import { complianceAuditLog } from '../src/schema/compliance-audit-log';
import { documents } from '../src/schema/documents';
import { RLS_TENANT_TABLE_NAMES, validateRlsConfigInvariant } from '../src/schema/rls-config';
import { userRoles } from '../src/schema/user-roles';
import { users } from '../src/schema/users';

const describeDb = process.env.DATABASE_URL && process.env.DIRECT_URL ? describe : describe.skip;

type SqlClient = ReturnType<typeof postgres>;
type DbClient = ReturnType<typeof drizzle>;

interface SeedData {
  runTag: string;
  communityAId: number;
  communityBId: number;
  adminAUserId: string;
  tenantAUserId: string;
  adminBUserId: string;
  communityADocumentId: number;
  communityBDocumentId: number;
  filePrefix: string;
  auditResourcePrefix: string;
}

describeDb('P4-55 RLS policies (integration)', () => {
  let adminSql: SqlClient;
  let authSql: SqlClient;
  let serviceSql: SqlClient;
  let db: DbClient;
  let seed: SeedData;
  const createdDocumentIds = new Set<number>();

  async function resetSession(sqlClient: SqlClient): Promise<void> {
    await sqlClient.unsafe('reset role');
    await sqlClient`select set_config('request.jwt.claim.sub', '', false)`;
    await sqlClient`select set_config('request.jwt.claim.role', '', false)`;
    await sqlClient`select set_config('app.current_community_id', '', false)`;
  }

  async function setAuthenticatedContext(
    sqlClient: SqlClient,
    userId: string,
    activeCommunityId: number,
  ): Promise<void> {
    await resetSession(sqlClient);
    await sqlClient.unsafe('set role authenticated');
    await sqlClient`select set_config('request.jwt.claim.sub', ${userId}, false)`;
    await sqlClient`select set_config('request.jwt.claim.role', 'authenticated', false)`;
    await sqlClient`select set_config('app.current_community_id', ${String(activeCommunityId)}, false)`;
  }

  async function setServiceRoleContext(sqlClient: SqlClient): Promise<void> {
    await resetSession(sqlClient);
    await sqlClient.unsafe('set role service_role');
    await sqlClient`select set_config('request.jwt.claim.role', 'service_role', false)`;
  }

  beforeAll(async () => {
    adminSql = postgres(process.env.DIRECT_URL!, { prepare: false, max: 1 });
    authSql = postgres(process.env.DIRECT_URL!, { prepare: false, max: 1 });
    serviceSql = postgres(process.env.DIRECT_URL!, { prepare: false, max: 1 });
    db = drizzle(adminSql, { schema });

    const runTag = `p4_55_rls_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const filePrefix = `__${runTag}_doc__`;
    const auditResourcePrefix = `__${runTag}_audit__`;

    const [communityA] = await db
      .insert(communities)
      .values({
        name: `RLS Community A ${runTag}`,
        slug: `${runTag}-a`,
        communityType: 'condo_718',
        timezone: 'America/New_York',
      })
      .returning({ id: communities.id });

    const [communityB] = await db
      .insert(communities)
      .values({
        name: `RLS Community B ${runTag}`,
        slug: `${runTag}-b`,
        communityType: 'hoa_720',
        timezone: 'America/Chicago',
      })
      .returning({ id: communities.id });

    if (!communityA || !communityB) {
      throw new Error('Failed to create test communities for RLS integration tests');
    }

    const adminAUserId = randomUUID();
    const tenantAUserId = randomUUID();
    const adminBUserId = randomUUID();

    await db.insert(users).values([
      {
        id: adminAUserId,
        email: `${runTag}-admin-a@example.com`,
        fullName: `RLS Admin A ${runTag}`,
      },
      {
        id: tenantAUserId,
        email: `${runTag}-tenant-a@example.com`,
        fullName: `RLS Tenant A ${runTag}`,
      },
      {
        id: adminBUserId,
        email: `${runTag}-admin-b@example.com`,
        fullName: `RLS Admin B ${runTag}`,
      },
    ]);

    await db.insert(userRoles).values([
      {
        userId: adminAUserId,
        communityId: communityA.id,
        role: 'board_member',
        unitId: null,
      },
      {
        userId: tenantAUserId,
        communityId: communityA.id,
        role: 'tenant',
        unitId: null,
      },
      {
        userId: adminBUserId,
        communityId: communityB.id,
        role: 'board_president',
        unitId: null,
      },
    ]);

    const [documentA] = await db
      .insert(documents)
      .values({
        communityId: communityA.id,
        title: `RLS Doc A ${runTag}`,
        filePath: `communities/${communityA.id}/documents/${filePrefix}a.pdf`,
        fileName: `${filePrefix}a.pdf`,
        fileSize: 1000,
        mimeType: 'application/pdf',
      })
      .returning({ id: documents.id });

    const [documentB] = await db
      .insert(documents)
      .values({
        communityId: communityB.id,
        title: `RLS Doc B ${runTag}`,
        filePath: `communities/${communityB.id}/documents/${filePrefix}b.pdf`,
        fileName: `${filePrefix}b.pdf`,
        fileSize: 2000,
        mimeType: 'application/pdf',
      })
      .returning({ id: documents.id });

    if (!documentA || !documentB) {
      throw new Error('Failed to seed documents for RLS integration tests');
    }

    createdDocumentIds.add(documentA.id);
    createdDocumentIds.add(documentB.id);

    await db.insert(complianceAuditLog).values([
      {
        userId: adminAUserId,
        communityId: communityA.id,
        action: 'document_created',
        resourceType: 'document',
        resourceId: `${auditResourcePrefix}_a`,
        oldValues: null,
        newValues: { ok: true },
        metadata: { source: 'rls_test' },
      },
      {
        userId: adminBUserId,
        communityId: communityB.id,
        action: 'document_created',
        resourceType: 'document',
        resourceId: `${auditResourcePrefix}_b`,
        oldValues: null,
        newValues: { ok: true },
        metadata: { source: 'rls_test' },
      },
    ]);

    seed = {
      runTag,
      communityAId: communityA.id,
      communityBId: communityB.id,
      adminAUserId,
      tenantAUserId,
      adminBUserId,
      communityADocumentId: documentA.id,
      communityBDocumentId: documentB.id,
      filePrefix,
      auditResourcePrefix,
    };
  });

  afterAll(async () => {
    if (authSql) {
      try {
        await resetSession(authSql);
      } catch {
        // Best-effort cleanup only.
      }
    }
    if (serviceSql) {
      try {
        await resetSession(serviceSql);
      } catch {
        // Best-effort cleanup only.
      }
    }

    if (db && seed) {
      const documentIds = [...createdDocumentIds];
      if (documentIds.length > 0) {
        await db.delete(documents).where(inArray(documents.id, documentIds));
      }

      await db
        .delete(userRoles)
        .where(
          and(
            inArray(userRoles.userId, [seed.adminAUserId, seed.tenantAUserId, seed.adminBUserId]),
            inArray(userRoles.communityId, [seed.communityAId, seed.communityBId]),
          ),
        );

      // compliance_audit_log is append-only and has restrictive FKs (AGENTS learnings).
      // Parent cleanup is best-effort and may fail once audit rows exist.
      try {
        await db
          .delete(users)
          .where(inArray(users.id, [seed.adminAUserId, seed.tenantAUserId, seed.adminBUserId]));
      } catch {
        // tolerate FK-restricted cleanup when audit rows were written
      }

      try {
        await db
          .delete(communities)
          .where(inArray(communities.id, [seed.communityAId, seed.communityBId]));
      } catch {
        // tolerate FK-restricted cleanup when audit rows were written
      }
    }

    if (adminSql) await adminSql.end();
    if (authSql) await authSql.end();
    if (serviceSql) await serviceSql.end();
  });

  it('enables RLS on every tenant-scoped table from rls-config', async () => {
    expect(validateRlsConfigInvariant()).toEqual([]);

    const rows = await adminSql<{ relname: string; relrowsecurity: boolean }[]>`
      select c.relname, c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
      order by c.relname
    `;

    const actual = new Map(
      rows
        .filter((row) => RLS_TENANT_TABLE_NAMES.includes(row.relname))
        .map((row) => [row.relname, row.relrowsecurity]),
    );

    expect([...actual.keys()].sort()).toEqual([...RLS_TENANT_TABLE_NAMES].sort());
    for (const tableName of RLS_TENANT_TABLE_NAMES) {
      expect(actual.get(tableName), `${tableName} should have relrowsecurity=true`).toBe(true);
    }
  });

  it('restricts authenticated reads to the actor community on tenant CRUD tables (documents)', async () => {
    await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);

    const rows = await authSql<{ id: number; community_id: number; file_name: string }[]>`
      select id, community_id, file_name
      from public.documents
      where file_name like ${`${seed.filePrefix}%`}
      order by id
    `;

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => Number(row.community_id) === seed.communityAId)).toBe(true);
    expect(rows.some((row) => Number(row.id) === seed.communityADocumentId)).toBe(true);
    expect(rows.some((row) => Number(row.id) === seed.communityBDocumentId)).toBe(false);
  });

  it('auto-scopes forged inserts to the active tenant context', async () => {
    await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);

    const forgedFileName = `${seed.filePrefix}forged-${randomUUID().slice(0, 8)}.pdf`;
    const inserted = await authSql<{ id: number; community_id: number; file_name: string }[]>`
      insert into public.documents (
        community_id,
        title,
        file_path,
        file_name,
        file_size,
        mime_type
      ) values (
        ${seed.communityBId},
        ${`Forged ${seed.runTag}`},
        ${`communities/${seed.communityBId}/documents/${forgedFileName}`},
        ${forgedFileName},
        4096,
        'application/pdf'
      )
      returning id, community_id, file_name
    `;

    expect(inserted).toHaveLength(1);
    expect(Number(inserted[0]?.community_id)).toBe(seed.communityAId);
    if (inserted[0]) {
      createdDocumentIds.add(Number(inserted[0].id));
    }
  });

  it('blocks cross-tenant UPDATE and DELETE attempts', async () => {
    await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);

    const updated = await authSql<{ id: number }[]>`
      update public.documents
      set title = 'RLS bypass attempt'
      where id = ${seed.communityBDocumentId}
      returning id
    `;
    expect(updated).toHaveLength(0);

    const deleted = await authSql<{ id: number }[]>`
      delete from public.documents
      where id = ${seed.communityBDocumentId}
      returning id
    `;
    expect(deleted).toHaveLength(0);
  });

  it('restricts compliance_audit_log reads to admin roles for the actor community', async () => {
    await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);
    const tenantRows = await authSql<{ id: number; community_id: number }[]>`
      select id, community_id
      from public.compliance_audit_log
      where resource_id like ${`${seed.auditResourcePrefix}%`}
      order by id
    `;
    expect(tenantRows).toEqual([]);

    await setAuthenticatedContext(authSql, seed.adminAUserId, seed.communityAId);
    const adminARows = await authSql<{ id: number; community_id: number }[]>`
      select id, community_id
      from public.compliance_audit_log
      where resource_id like ${`${seed.auditResourcePrefix}%`}
      order by id
    `;
    expect(adminARows.length).toBeGreaterThan(0);
    expect(adminARows.every((row) => Number(row.community_id) === seed.communityAId)).toBe(true);

    await setAuthenticatedContext(authSql, seed.adminBUserId, seed.communityBId);
    const adminBRows = await authSql<{ id: number; community_id: number }[]>`
      select id, community_id
      from public.compliance_audit_log
      where resource_id like ${`${seed.auditResourcePrefix}%`}
      order by id
    `;
    expect(adminBRows.length).toBeGreaterThan(0);
    expect(adminBRows.every((row) => Number(row.community_id) === seed.communityBId)).toBe(true);
  });

  it('preserves service_role bypass across tenant data', async () => {
    await setServiceRoleContext(serviceSql);

    const rows = await serviceSql<{ community_id: number }[]>`
      select community_id
      from public.documents
      where file_name like ${`${seed.filePrefix}%`}
      order by id
    `;

    const communitiesVisible = new Set(rows.map((row) => Number(row.community_id)));
    expect(communitiesVisible.has(seed.communityAId)).toBe(true);
    expect(communitiesVisible.has(seed.communityBId)).toBe(true);
  });

  it.todo('adds table-family representative coverage for service_only tables beyond tenant CRUD');
  it.todo('verifies policy presence in pg_policies for every tenant table and family');
});
