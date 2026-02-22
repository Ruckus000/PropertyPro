import { randomUUID } from 'node:crypto';
import { and, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/schema';
import { announcementDeliveryLog } from '../src/schema/announcement-delivery-log';
import { announcements } from '../src/schema/announcements';
import { communities } from '../src/schema/communities';
import { complianceAuditLog } from '../src/schema/compliance-audit-log';
import { demoSeedRegistry } from '../src/schema/demo-seed-registry';
import { documents } from '../src/schema/documents';
import { RLS_TENANT_TABLES, RLS_TENANT_TABLE_NAMES, validateRlsConfigInvariant } from '../src/schema/rls-config';
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
  communityAAnnouncementId: number;
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
  const createdDemoSeedRegistryIds = new Set<number>();
  const createdAnnouncementDeliveryLogIds = new Set<number>();

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

    const [announcementA] = await db
      .insert(announcements)
      .values({
        communityId: communityA.id,
        title: `RLS Announcement A ${runTag}`,
        body: 'Test announcement for delivery log FK',
        audience: 'all',
        isPinned: false,
        publishedBy: adminAUserId,
      })
      .returning({ id: announcements.id });

    if (!announcementA) {
      throw new Error('Failed to seed announcement for RLS integration tests');
    }

    seed = {
      runTag,
      communityAId: communityA.id,
      communityBId: communityB.id,
      adminAUserId,
      tenantAUserId,
      adminBUserId,
      communityADocumentId: documentA.id,
      communityBDocumentId: documentB.id,
      communityAAnnouncementId: announcementA.id,
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
      const deliveryLogIds = [...createdAnnouncementDeliveryLogIds];
      if (deliveryLogIds.length > 0) {
        await db
          .delete(announcementDeliveryLog)
          .where(inArray(announcementDeliveryLog.id, deliveryLogIds));
      }

      const registryIds = [...createdDemoSeedRegistryIds];
      if (registryIds.length > 0) {
        await db
          .delete(demoSeedRegistry)
          .where(inArray(demoSeedRegistry.id, registryIds));
      }

      const documentIds = [...createdDocumentIds];
      if (documentIds.length > 0) {
        await db.delete(documents).where(inArray(documents.id, documentIds));
      }

      await db
        .delete(announcements)
        .where(inArray(announcements.id, [seed.communityAAnnouncementId]));

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

  describe('service_only table coverage', () => {
    it('blocks authenticated SELECT on service_only tables', async () => {
      await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);

      const registryRows = await authSql`select * from public.demo_seed_registry limit 1`;
      expect(registryRows).toHaveLength(0);

      const deliveryRows = await authSql`select * from public.announcement_delivery_log limit 1`;
      expect(deliveryRows).toHaveLength(0);

      const digestRows = await authSql`select * from public.notification_digest_queue limit 1`;
      expect(digestRows).toHaveLength(0);

      const provisioningRows = await authSql`select * from public.provisioning_jobs limit 1`;
      expect(provisioningRows).toHaveLength(0);
    });

    it('blocks authenticated INSERT on service_only tables', async () => {
      await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);

      try {
        await authSql`
          insert into public.demo_seed_registry (entity_type, seed_key, entity_id, community_id)
          values ('test', ${`${seed.runTag}_blocked`}, 'blocked-1', ${seed.communityAId})
        `;
        expect.fail('Authenticated INSERT on service_only table should have been blocked by RLS');
      } catch (error: unknown) {
        const pgError = error as { code?: string };
        expect(pgError.code).toBe('42501');
      }

      // Verify no row was persisted regardless of error path
      await setServiceRoleContext(serviceSql);
      const check = await serviceSql`
        select id from public.demo_seed_registry
        where seed_key = ${`${seed.runTag}_blocked`}
      `;
      expect(check).toHaveLength(0);
    });

    it('allows service_role full CRUD on demo_seed_registry', async () => {
      await setServiceRoleContext(serviceSql);

      const seedKey = `${seed.runTag}_svc_crud_${randomUUID().slice(0, 8)}`;

      // INSERT
      const inserted = await serviceSql<{ id: number }[]>`
        insert into public.demo_seed_registry (entity_type, seed_key, entity_id, community_id)
        values ('test', ${seedKey}, 'test-1', ${seed.communityAId})
        returning id
      `;
      expect(inserted).toHaveLength(1);
      const insertedId = Number(inserted[0]!.id);
      createdDemoSeedRegistryIds.add(insertedId);

      // SELECT
      const selected = await serviceSql<{ id: number; entity_id: string }[]>`
        select id, entity_id from public.demo_seed_registry where id = ${insertedId}
      `;
      expect(selected).toHaveLength(1);
      expect(selected[0]!.entity_id).toBe('test-1');

      // UPDATE
      const updated = await serviceSql<{ id: number }[]>`
        update public.demo_seed_registry
        set entity_id = 'test-1-updated'
        where id = ${insertedId}
        returning id
      `;
      expect(updated).toHaveLength(1);

      // DELETE
      const deleted = await serviceSql<{ id: number }[]>`
        delete from public.demo_seed_registry where id = ${insertedId}
        returning id
      `;
      expect(deleted).toHaveLength(1);
      createdDemoSeedRegistryIds.delete(insertedId);
    });

    it('allows service_role INSERT and SELECT on announcement_delivery_log', async () => {
      await setServiceRoleContext(serviceSql);

      const inserted = await serviceSql<{ id: number }[]>`
        insert into public.announcement_delivery_log (
          community_id, announcement_id, user_id, email, status
        ) values (
          ${seed.communityAId},
          ${seed.communityAAnnouncementId},
          ${seed.tenantAUserId},
          ${`${seed.runTag}-delivery@example.com`},
          'pending'
        )
        returning id
      `;
      expect(inserted).toHaveLength(1);
      const insertedId = Number(inserted[0]!.id);
      createdAnnouncementDeliveryLogIds.add(insertedId);

      const selected = await serviceSql<{ id: number; status: string }[]>`
        select id, status from public.announcement_delivery_log where id = ${insertedId}
      `;
      expect(selected).toHaveLength(1);
      expect(selected[0]!.status).toBe('pending');

      // Cleanup
      await serviceSql`delete from public.announcement_delivery_log where id = ${insertedId}`;
      createdAnnouncementDeliveryLogIds.delete(insertedId);
    });
  });

  it('verifies policy presence in pg_policies for every tenant table and family', async () => {
    const rows = await adminSql<{ schemaname: string; tablename: string; policyname: string }[]>`
      select schemaname, tablename, policyname
      from pg_policies
      where schemaname = 'public'
      order by tablename, policyname
    `;

    const policyMap = new Map<string, string[]>();
    for (const row of rows) {
      const existing = policyMap.get(row.tablename) ?? [];
      existing.push(row.policyname);
      policyMap.set(row.tablename, existing);
    }

    for (const entry of RLS_TENANT_TABLES) {
      const actualPolicies = (policyMap.get(entry.tableName) ?? []).sort();
      let expectedPolicies: string[];

      switch (entry.policyFamily) {
        case 'tenant_crud':
          expectedPolicies = [
            'pp_tenant_delete',
            'pp_tenant_insert',
            'pp_tenant_select',
            'pp_tenant_update',
          ];
          break;
        case 'service_only':
          expectedPolicies = [
            'pp_service_delete',
            'pp_service_insert',
            'pp_service_select',
            'pp_service_update',
          ];
          break;
        case 'audit_log_restricted':
          expectedPolicies = ['pp_audit_insert', 'pp_audit_select'];
          break;
        default:
          throw new Error(`Unhandled policy family: ${entry.policyFamily as string}`);
      }

      expect(
        actualPolicies,
        `${entry.tableName} (${entry.policyFamily}) should have policies: ${expectedPolicies.join(', ')}`,
      ).toEqual(expectedPolicies);
    }
  });
});
