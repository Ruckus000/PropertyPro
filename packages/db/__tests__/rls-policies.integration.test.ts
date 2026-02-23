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
import { maintenanceRequests } from '../src/schema/maintenance-requests';
import { notificationPreferences } from '../src/schema/notification-preferences';
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
  tenantBSameCommAUserId: string;
  adminBUserId: string;
  communityADocumentId: number;
  communityBDocumentId: number;
  communityAAnnouncementId: number;
  tenantAMaintenanceRequestId: number;
  tenantBSameCommAMaintenanceRequestId: number;
  tenantANotifPrefId: number;
  tenantBSameCommANotifPrefId: number;
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
    // Second tenant in community A — used to verify IDOR: tenantA must not see tenantBSameCommA's rows.
    const tenantBSameCommAUserId = randomUUID();
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
        id: tenantBSameCommAUserId,
        email: `${runTag}-tenant-b-comm-a@example.com`,
        fullName: `RLS Tenant B CommA ${runTag}`,
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
        userId: tenantBSameCommAUserId,
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

    // Seed maintenance requests for IDOR test: one per tenant in community A.
    const [maintenanceRequestA] = await db
      .insert(maintenanceRequests)
      .values({
        communityId: communityA.id,
        submittedById: tenantAUserId,
        title: `RLS MR TenantA ${runTag}`,
        description: 'Tenants A maintenance request for RLS IDOR test',
        status: 'open',
        priority: 'normal',
        category: 'general',
      })
      .returning({ id: maintenanceRequests.id });

    const [maintenanceRequestBSameCommA] = await db
      .insert(maintenanceRequests)
      .values({
        communityId: communityA.id,
        submittedById: tenantBSameCommAUserId,
        title: `RLS MR TenantBCommA ${runTag}`,
        description: 'Tenant B (same community A) maintenance request for RLS IDOR test',
        status: 'open',
        priority: 'normal',
        category: 'general',
      })
      .returning({ id: maintenanceRequests.id });

    if (!maintenanceRequestA || !maintenanceRequestBSameCommA) {
      throw new Error('Failed to seed maintenance requests for RLS integration tests');
    }

    // Seed notification preferences for IDOR test: one per tenant in community A.
    const [notifPrefA] = await db
      .insert(notificationPreferences)
      .values({
        userId: tenantAUserId,
        communityId: communityA.id,
        emailFrequency: 'immediate',
      })
      .returning({ id: notificationPreferences.id });

    const [notifPrefBSameCommA] = await db
      .insert(notificationPreferences)
      .values({
        userId: tenantBSameCommAUserId,
        communityId: communityA.id,
        emailFrequency: 'daily',
      })
      .returning({ id: notificationPreferences.id });

    if (!notifPrefA || !notifPrefBSameCommA) {
      throw new Error('Failed to seed notification preferences for RLS integration tests');
    }

    seed = {
      runTag,
      communityAId: communityA.id,
      communityBId: communityB.id,
      adminAUserId,
      tenantAUserId,
      tenantBSameCommAUserId,
      adminBUserId,
      communityADocumentId: documentA.id,
      communityBDocumentId: documentB.id,
      communityAAnnouncementId: announcementA.id,
      tenantAMaintenanceRequestId: maintenanceRequestA.id,
      tenantBSameCommAMaintenanceRequestId: maintenanceRequestBSameCommA.id,
      tenantANotifPrefId: notifPrefA.id,
      tenantBSameCommANotifPrefId: notifPrefBSameCommA.id,
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

      // notification_preferences have no soft-delete; hard-delete is safe.
      await db
        .delete(notificationPreferences)
        .where(
          inArray(notificationPreferences.id, [
            seed.tenantANotifPrefId,
            seed.tenantBSameCommANotifPrefId,
          ]),
        );

      // maintenance_requests support soft-delete but hard-delete is fine for test data.
      await db
        .delete(maintenanceRequests)
        .where(
          inArray(maintenanceRequests.id, [
            seed.tenantAMaintenanceRequestId,
            seed.tenantBSameCommAMaintenanceRequestId,
          ]),
        );

      await db
        .delete(userRoles)
        .where(
          and(
            inArray(userRoles.userId, [
              seed.adminAUserId,
              seed.tenantAUserId,
              seed.tenantBSameCommAUserId,
              seed.adminBUserId,
            ]),
            inArray(userRoles.communityId, [seed.communityAId, seed.communityBId]),
          ),
        );

      // compliance_audit_log rows seeded in beforeAll are intentionally not cleaned up.
      // The BEFORE UPDATE OR DELETE trigger (migration 0005_append_only_audit_log.sql)
      // blocks deletion even for the postgres superuser — this is a correct invariant.
      // These rows accumulate per test run; this is acceptable for a compliance-grade
      // test environment where audit log immutability is a first-class design property.

      // compliance_audit_log has restrictive FKs (AGENTS learnings).
      // Parent cleanup is best-effort and may fail once audit rows exist.
      try {
        await db
          .delete(users)
          .where(
            inArray(users.id, [
              seed.adminAUserId,
              seed.tenantAUserId,
              seed.tenantBSameCommAUserId,
              seed.adminBUserId,
            ]),
          );
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
    // Use adminAUserId (board_member) — documents is now tenant_admin_write and
    // requires pp_rls_can_read_audit_log() for INSERT. Tenant-tier actors are
    // blocked at the DB level; admin-tier actors may insert and have their
    // community_id rewritten by the pp_rls_enforce_tenant_community_id trigger.
    await setAuthenticatedContext(authSql, seed.adminAUserId, seed.communityAId);

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

  it('blocks tenant-role actor from inserting a privileged user_roles row (escalation prevention)', async () => {
    // pp_user_roles_insert requires admin-tier role via pp_rls_can_read_audit_log.
    // A tenant actor must not be able to INSERT a new user_roles row with an elevated role.
    await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);
    try {
      await authSql`
        insert into public.user_roles (user_id, community_id, role)
        values (${seed.tenantAUserId}, ${seed.communityAId}, 'board_president')
      `;
      expect.fail('Tenant INSERT on user_roles should be blocked by pp_user_roles_insert');
    } catch (error: unknown) {
      expect((error as { code?: string }).code).toBe('42501');
    }
  });

  it('blocks tenant-role actor from escalating their own user_roles row via UPDATE', async () => {
    // pp_user_roles_update requires admin-tier role via pp_rls_can_read_audit_log.
    // A tenant actor must not be able to UPDATE their own role to an elevated value.
    await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);
    try {
      await authSql`
        update public.user_roles
        set role = 'board_president'
        where user_id = ${seed.tenantAUserId} and community_id = ${seed.communityAId}
      `;
    } catch (error: unknown) {
      // Some Postgres versions throw 42501; others silently return 0 rows on USING mismatch.
      expect((error as { code?: string }).code).toBe('42501');
      return;
    }
    // If no exception: verify the row was NOT escalated.
    const check = await adminSql<{ role: string }[]>`
      select role from public.user_roles
      where user_id = ${seed.tenantAUserId} and community_id = ${seed.communityAId}
    `;
    expect(check[0]?.role, 'Tenant role must not have been escalated').toBe('tenant');
  });

  it('blocks authenticated actor from inserting directly into compliance_audit_log', async () => {
    // pp_audit_insert requires pp_rls_is_privileged() — authenticated actors are blocked.
    // logAuditEvent() works because it uses the postgres-role db instance (drizzle.ts).
    await setAuthenticatedContext(authSql, seed.adminAUserId, seed.communityAId);
    try {
      await authSql`
        insert into public.compliance_audit_log
          (user_id, community_id, action, resource_type, resource_id)
        values
          (${seed.adminAUserId}, ${seed.communityAId}, 'document_created', 'document',
           ${`${seed.auditResourcePrefix}_blocked`})
      `;
      expect.fail('Authenticated INSERT on compliance_audit_log should be blocked by pp_audit_insert');
    } catch (error: unknown) {
      expect((error as { code?: string }).code).toBe('42501');
    }
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

  describe('tenant_user_scoped policy coverage', () => {
    it('restricts maintenance_requests SELECT to own rows for non-admin actors', async () => {
      // tenantAUserId should see only their own request, not tenantBSameCommA's request.
      await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);

      const rows = await authSql<{ id: number; submitted_by_id: string }[]>`
        select id, submitted_by_id
        from public.maintenance_requests
        where id in (
          ${seed.tenantAMaintenanceRequestId},
          ${seed.tenantBSameCommAMaintenanceRequestId}
        )
        order by id
      `;

      expect(rows.every((row) => row.submitted_by_id === seed.tenantAUserId)).toBe(true);
      expect(rows.some((row) => row.id === seed.tenantAMaintenanceRequestId)).toBe(true);
      expect(rows.some((row) => row.id === seed.tenantBSameCommAMaintenanceRequestId)).toBe(false);
    });

    it('allows admin-tier actor to SELECT all maintenance_requests in community', async () => {
      // adminAUserId (board_member) should see both requests in community A.
      await setAuthenticatedContext(authSql, seed.adminAUserId, seed.communityAId);

      const rows = await authSql<{ id: number }[]>`
        select id
        from public.maintenance_requests
        where id in (
          ${seed.tenantAMaintenanceRequestId},
          ${seed.tenantBSameCommAMaintenanceRequestId}
        )
        order by id
      `;

      expect(rows.some((row) => row.id === seed.tenantAMaintenanceRequestId)).toBe(true);
      expect(rows.some((row) => row.id === seed.tenantBSameCommAMaintenanceRequestId)).toBe(true);
    });

    it('restricts notification_preferences SELECT to own row for any actor', async () => {
      // tenantAUserId should see only their own preferences, not tenantBSameCommA's.
      await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);

      const rows = await authSql<{ id: number; user_id: string }[]>`
        select id, user_id
        from public.notification_preferences
        where id in (${seed.tenantANotifPrefId}, ${seed.tenantBSameCommANotifPrefId})
        order by id
      `;

      expect(rows.every((row) => row.user_id === seed.tenantAUserId)).toBe(true);
      expect(rows.some((row) => row.id === seed.tenantANotifPrefId)).toBe(true);
      expect(rows.some((row) => row.id === seed.tenantBSameCommANotifPrefId)).toBe(false);
    });

    it('blocks actor from UPDATing another user notification_preferences', async () => {
      // tenantAUserId must not be able to UPDATE tenantBSameCommA's preferences.
      await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);

      const updated = await authSql<{ id: number }[]>`
        update public.notification_preferences
        set email_frequency = 'weekly'
        where id = ${seed.tenantBSameCommANotifPrefId}
        returning id
      `;
      expect(updated).toHaveLength(0);

      // Verify the row was not changed.
      await resetSession(authSql);
      const check = await adminSql<{ email_frequency: string }[]>`
        select email_frequency from public.notification_preferences
        where id = ${seed.tenantBSameCommANotifPrefId}
      `;
      expect(check[0]?.email_frequency).toBe('daily');
    });
  });

  describe('tenant_member_configurable policy coverage', () => {
    it('allows member write on announcements when community_settings does not restrict', async () => {
      // Community A has default settings ({}), so member writes are permitted.
      await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);

      const inserted = await authSql<{ id: number }[]>`
        insert into public.announcements (community_id, title, body, audience, is_pinned, published_by)
        values (
          ${seed.communityAId},
          ${`RLS Configurable Test ${seed.runTag}`},
          'Member write test',
          'all',
          false,
          ${seed.tenantAUserId}
        )
        returning id
      `;
      expect(inserted).toHaveLength(1);

      // Cleanup
      if (inserted[0]) {
        await adminSql`delete from public.announcements where id = ${inserted[0].id}`;
      }
    });

    it('blocks member write on announcements when community_settings restricts to admin_only', async () => {
      // Set announcementsWriteLevel = admin_only for community A.
      await adminSql`
        update public.communities
        set community_settings = jsonb_set(
          coalesce(community_settings, '{}'),
          '{announcementsWriteLevel}',
          '"admin_only"'
        )
        where id = ${seed.communityAId}
      `;

      await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);
      try {
        await authSql`
          insert into public.announcements (community_id, title, body, audience, is_pinned, published_by)
          values (
            ${seed.communityAId},
            ${`RLS Restricted Test ${seed.runTag}`},
            'Should be blocked',
            'all',
            false,
            ${seed.tenantAUserId}
          )
        `;
        expect.fail('Non-admin INSERT on admin_only announcements should have been blocked');
      } catch (error: unknown) {
        expect((error as { code?: string }).code).toBe('42501');
      } finally {
        // Always restore the setting so other tests are not affected.
        await adminSql`
          update public.communities
          set community_settings = community_settings - 'announcementsWriteLevel'
          where id = ${seed.communityAId}
        `;
      }
    });

    it('allows admin-tier write on announcements even when community_settings restricts members', async () => {
      // Set announcementsWriteLevel = admin_only for community A.
      await adminSql`
        update public.communities
        set community_settings = jsonb_set(
          coalesce(community_settings, '{}'),
          '{announcementsWriteLevel}',
          '"admin_only"'
        )
        where id = ${seed.communityAId}
      `;

      await setAuthenticatedContext(authSql, seed.adminAUserId, seed.communityAId);
      let insertedId: number | undefined;
      try {
        const inserted = await authSql<{ id: number }[]>`
          insert into public.announcements (community_id, title, body, audience, is_pinned, published_by)
          values (
            ${seed.communityAId},
            ${`RLS Admin Write Test ${seed.runTag}`},
            'Admin write should succeed',
            'all',
            false,
            ${seed.adminAUserId}
          )
          returning id
        `;
        expect(inserted).toHaveLength(1);
        insertedId = inserted[0]?.id;
      } finally {
        // Restore setting and clean up inserted row.
        await adminSql`
          update public.communities
          set community_settings = community_settings - 'announcementsWriteLevel'
          where id = ${seed.communityAId}
        `;
        if (insertedId !== undefined) {
          await adminSql`delete from public.announcements where id = ${insertedId}`;
        }
      }
    });
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
        case 'tenant_append_only':
          // UPDATE and DELETE dropped at RLS level (consistent with scoped-client APPEND_ONLY_TABLES)
          expectedPolicies = [
            'pp_tenant_insert',
            'pp_tenant_select',
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
        case 'tenant_admin_write':
          // SELECT on community membership; INSERT/UPDATE/DELETE require admin-tier role.
          // Write policy names are table-specific (pp_{tableName}_*) to allow per-table hardening.
          expectedPolicies = [
            'pp_tenant_select',
            `pp_${entry.tableName}_delete`,
            `pp_${entry.tableName}_insert`,
            `pp_${entry.tableName}_update`,
          ].sort();
          break;
        case 'tenant_user_scoped':
          // SELECT scoped to auth.uid() for non-admins (bespoke pp_{tableName}_select).
          // notification_preferences also has a bespoke pp_{tableName}_update.
          // INSERT and DELETE retain generic pp_tenant_* policies.
          if (entry.tableName === 'notification_preferences') {
            expectedPolicies = [
              `pp_${entry.tableName}_select`,
              `pp_${entry.tableName}_update`,
              'pp_tenant_delete',
              'pp_tenant_insert',
            ].sort();
          } else {
            // maintenance_requests: UPDATE is still generic (admin-tier app-layer gate handles it)
            expectedPolicies = [
              `pp_${entry.tableName}_select`,
              'pp_tenant_delete',
              'pp_tenant_insert',
              'pp_tenant_update',
            ].sort();
          }
          break;
        case 'tenant_member_configurable':
          // SELECT on community membership (pp_tenant_select retained).
          // INSERT/UPDATE/DELETE are bespoke per-table policies that consult community_settings.
          expectedPolicies = [
            `pp_${entry.tableName}_delete`,
            `pp_${entry.tableName}_insert`,
            `pp_${entry.tableName}_update`,
            'pp_tenant_select',
          ].sort();
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
