import { randomUUID } from 'node:crypto';
import { and, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../src/schema';
import { accessRequests } from '../src/schema/access-requests';
import { announcementDeliveryLog } from '../src/schema/announcement-delivery-log';
import { announcements } from '../src/schema/announcements';
import { communities } from '../src/schema/communities';
import { communityJoinRequests } from '../src/schema/community-join-requests';
import { complianceAuditLog } from '../src/schema/compliance-audit-log';
import { demoSeedRegistry } from '../src/schema/demo-seed-registry';
import { documents } from '../src/schema/documents';
import { maintenanceComments } from '../src/schema/maintenance-comments';
import { maintenanceRequests } from '../src/schema/maintenance-requests';
import { notificationPreferences } from '../src/schema/notification-preferences';
import { onboardingChecklistItems } from '../src/schema/onboarding-checklist-items';
import { onboardingWizardState } from '../src/schema/onboarding-wizard-state';
import { siteBlocks } from '../src/schema/site-blocks';
import { sitePageRedirects, sitePages } from '../src/schema/site-pages';
import {
  RLS_GLOBAL_EXCLUSION_NAMES,
  RLS_TENANT_TABLES,
  RLS_TENANT_TABLE_NAMES,
  validateRlsConfigInvariant,
} from '../src/schema/rls-config';
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
  communityAOnboardingWizardStateId: number;
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
  const createdAccessRequestIds = new Set<number>();
  const createdEmergencyBroadcastIds = new Set<number>();
  const createdCommunityJoinRequestIds = new Set<number>();
  const createdChecklistItemIds = new Set<number>();
  const createdSiteBlockIds = new Set<number>();
  const createdSitePageIds = new Set<number>();
  const createdRentGuardCommunityIds = new Set<number>();

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

  async function setAnonContext(
    sqlClient: SqlClient,
    activeCommunityId: number,
  ): Promise<void> {
    await resetSession(sqlClient);
    await sqlClient.unsafe('set role anon');
    await sqlClient`select set_config('request.jwt.claim.role', 'anon', false)`;
    await sqlClient`select set_config('app.current_community_id', ${String(activeCommunityId)}, false)`;
  }

  async function nextSequenceValue(sequenceName: string): Promise<number> {
    const rows = await adminSql<{ id: string }[]>`
      select nextval(${sequenceName}::regclass)::text as id
    `;
    const id = Number(rows[0]?.id);
    if (!Number.isSafeInteger(id)) {
      throw new Error(`Failed to allocate test id from ${sequenceName}`);
    }
    return id;
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
        role: 'property_manager', isUnitOwner: false, displayTitle: 'Board Member', presetKey: 'board_member', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } },
        unitId: null,
      },
      {
        userId: tenantAUserId,
        communityId: communityA.id,
        role: 'resident', isUnitOwner: false, displayTitle: 'Tenant',
        unitId: null,
      },
      {
        userId: tenantBSameCommAUserId,
        communityId: communityA.id,
        role: 'resident', isUnitOwner: false, displayTitle: 'Tenant',
        unitId: null,
      },
      {
        userId: adminBUserId,
        communityId: communityB.id,
        role: 'property_manager', isUnitOwner: false, displayTitle: 'Board President', presetKey: 'board_president', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } },
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

    // Seed onboarding wizard state for community A (admin-write restriction test).
    const [wizardStateA] = await db
      .insert(onboardingWizardState)
      .values({
        communityId: communityA.id,
        wizardType: 'apartment',
        status: 'in_progress',
        stepData: {},
      })
      .returning({ id: onboardingWizardState.id });

    if (!wizardStateA) {
      throw new Error('Failed to seed onboarding wizard state for RLS integration tests');
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
      communityAOnboardingWizardStateId: wizardStateA.id,
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

      const accessRequestIds = [...createdAccessRequestIds];
      if (accessRequestIds.length > 0) {
        await db.delete(accessRequests).where(inArray(accessRequests.id, accessRequestIds));
      }

      const emergencyBroadcastIds = [...createdEmergencyBroadcastIds];
      if (emergencyBroadcastIds.length > 0) {
        await adminSql`delete from public.emergency_broadcasts where id in ${adminSql(emergencyBroadcastIds)}`;
      }

      const communityJoinRequestIds = [...createdCommunityJoinRequestIds];
      if (communityJoinRequestIds.length > 0) {
        await db
          .delete(communityJoinRequests)
          .where(inArray(communityJoinRequests.id, communityJoinRequestIds));
      }

      const checklistItemIds = [...createdChecklistItemIds];
      if (checklistItemIds.length > 0) {
        await db
          .delete(onboardingChecklistItems)
          .where(inArray(onboardingChecklistItems.id, checklistItemIds));
      }

      const siteBlockIds = [...createdSiteBlockIds];
      if (siteBlockIds.length > 0) {
        await db.delete(siteBlocks).where(inArray(siteBlocks.id, siteBlockIds));
      }

      // AFTER the blocks: site_blocks.page_id and site_page_redirects.page_id
      // both cascade from here, so deleting pages first would take blocks with
      // them and make the delete above look like it had nothing to do.
      const sitePageIds = [...createdSitePageIds];
      if (sitePageIds.length > 0) {
        await db.delete(sitePages).where(inArray(sitePages.id, sitePageIds));
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

      await db
        .delete(onboardingWizardState)
        .where(inArray(onboardingWizardState.id, [seed.communityAOnboardingWizardStateId]));

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

      // Rent-guard fixtures own their own communities; units and leases go with
      // them via ON DELETE CASCADE, so one delete per community is enough.
      const rentGuardCommunityIds = [...createdRentGuardCommunityIds];
      if (rentGuardCommunityIds.length > 0) {
        try {
          await db.delete(communities).where(inArray(communities.id, rentGuardCommunityIds));
        } catch {
          // tolerate FK-restricted cleanup when audit rows were written
        }
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

  it('registers every table in public as either tenant-scoped or explicitly excluded', async () => {
    // The drift guard. Until 2026-07-26, 24 of the 98 tables in public were in
    // NEITHER list — so validateRlsConfigInvariant() did not cover them, the
    // family policy-name loop never checked them, and the service_only
    // behavioural loop could not see them. Nothing failed, because nothing
    // compared the config against the database's actual table list. This does.
    //
    // A new table must be classified into RLS_TENANT_TABLES (with a policy
    // family) or RLS_GLOBAL_TABLE_EXCLUSIONS (with a reason) before it can land.
    const rows = await adminSql<{ relname: string }[]>`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
      order by c.relname
    `;

    const registered = new Set<string>([...RLS_TENANT_TABLE_NAMES, ...RLS_GLOBAL_EXCLUSION_NAMES]);
    const unregistered = rows
      .map((row) => row.relname)
      // drizzle's migration ledger lives in its own schema; anything named like
      // it in public would be a stray and is not ours to classify.
      .filter((name) => !name.startsWith('__drizzle'))
      .filter((name) => !registered.has(name));

    expect(
      unregistered,
      `Unregistered public tables — add each to RLS_TENANT_TABLES (with a policy family) ` +
        `or RLS_GLOBAL_TABLE_EXCLUSIONS (with a reason) in rls-config.ts: ${unregistered.join(', ')}`,
    ).toEqual([]);

    // And the converse: a config entry naming a table that no longer exists is
    // just as much a drift as a missing one.
    const existing = new Set(rows.map((row) => row.relname));
    const phantom = [...registered].filter((name) => !existing.has(name)).sort();
    expect(phantom, `Config lists tables that do not exist: ${phantom.join(', ')}`).toEqual([]);
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
    const forgedDocumentId = await nextSequenceValue('public.documents_id_seq');
    const inserted = await authSql<{ id: number; community_id: number; file_name: string }[]>`
      insert into public.documents (
        id,
        community_id,
        title,
        file_path,
        file_name,
        file_size,
        mime_type
      ) values (
        ${forgedDocumentId},
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
        values (${seed.tenantAUserId}, ${seed.communityAId}, 'property_manager')
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
        set role = 'property_manager'
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
    expect(check[0]?.role, 'Tenant role must not have been escalated').toBe('resident');
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
      expect(rows.some((row) => Number(row.id) === seed.tenantAMaintenanceRequestId)).toBe(true);
      expect(rows.some((row) => Number(row.id) === seed.tenantBSameCommAMaintenanceRequestId)).toBe(false);
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

      expect(rows.some((row) => Number(row.id) === seed.tenantAMaintenanceRequestId)).toBe(true);
      expect(rows.some((row) => Number(row.id) === seed.tenantBSameCommAMaintenanceRequestId)).toBe(true);
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
      expect(rows.some((row) => Number(row.id) === seed.tenantANotifPrefId)).toBe(true);
      expect(rows.some((row) => Number(row.id) === seed.tenantBSameCommANotifPrefId)).toBe(false);
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

    it('allows admin-tier actor to SELECT another user notification_preferences', async () => {
      // adminAUserId (board_member) should see both tenantA and tenantBSameCommA preferences.
      await setAuthenticatedContext(authSql, seed.adminAUserId, seed.communityAId);

      const rows = await authSql<{ id: number; user_id: string }[]>`
        select id, user_id
        from public.notification_preferences
        where id in (${seed.tenantANotifPrefId}, ${seed.tenantBSameCommANotifPrefId})
        order by id
      `;

      expect(rows.some((row) => Number(row.id) === seed.tenantANotifPrefId)).toBe(true);
      expect(rows.some((row) => Number(row.id) === seed.tenantBSameCommANotifPrefId)).toBe(true);
    });

    it('allows admin-tier actor to UPDATE another user notification_preferences', async () => {
      // adminAUserId (board_member) should be able to UPDATE tenantBSameCommA's preferences.
      await setAuthenticatedContext(authSql, seed.adminAUserId, seed.communityAId);

      const updated = await authSql<{ id: number }[]>`
        update public.notification_preferences
        set email_frequency = 'weekly'
        where id = ${seed.tenantBSameCommANotifPrefId}
        returning id
      `;
      expect(updated).toHaveLength(1);

      // Restore original value.
      await adminSql`
        update public.notification_preferences
        set email_frequency = 'daily'
        where id = ${seed.tenantBSameCommANotifPrefId}
      `;
    });
  });

  describe('tenant_member_configurable policy coverage', () => {
    it('allows member write on announcements when community_settings does not restrict', async () => {
      // Community A has default settings ({}), so member writes are permitted.
      await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);

      const announcementId = await nextSequenceValue('public.announcements_id_seq');
      const inserted = await authSql<{ id: number }[]>`
        insert into public.announcements (id, community_id, title, body, audience, is_pinned, published_by)
        values (
          ${announcementId},
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
        const announcementId = await nextSequenceValue('public.announcements_id_seq');
        const inserted = await authSql<{ id: number }[]>`
          insert into public.announcements (id, community_id, title, body, audience, is_pinned, published_by)
          values (
            ${announcementId},
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
    // Derived from the config, NOT a hardcoded list.
    //
    // This block used to name four tables literally, which meant a newly
    // registered service_only table got zero behavioural coverage — it would be
    // checked for policy NAMES by the family loop and nothing else. Driving it
    // from RLS_TENANT_TABLES is what stops the next table landing in the same
    // blind spot; `site_publish_snapshots` is the one that exposed it.
    const serviceOnlyTables = RLS_TENANT_TABLES.filter(
      (entry) => entry.policyFamily === 'service_only',
    ).map((entry) => entry.tableName);

    it('covers every service_only table in the config, not a hardcoded subset', () => {
      // Guards the guard: if the filter ever silently yields nothing (a rename,
      // a family retired), the loops below would vacuously pass.
      expect(serviceOnlyTables.length).toBeGreaterThanOrEqual(6);
      expect(serviceOnlyTables).toContain('site_publish_snapshots');
    });

    it.each(serviceOnlyTables)(
      'blocks authenticated SELECT on service_only table %s',
      async (tableName) => {
        await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);

        // Zero rows, not an error: production grants authenticated SELECT on
        // these tables and relies on RLS to return nothing. An error here would
        // mean the ACL denied before any policy ran — which is what the missing
        // stub GRANTs used to cause, making this suite pass for the wrong reason.
        const rows = await authSql`select * from public.${authSql(tableName)} limit 1`;
        expect(rows).toHaveLength(0);
      },
    );

    it.each(serviceOnlyTables)(
      'blocks anon SELECT on service_only table %s',
      async (tableName) => {
        // Reuses authSql with `SET ROLE anon` — the file's existing precedent
        // (see the 0023 wrong-GUC block); there is no separate anon connection.
        await setAnonContext(authSql, seed.communityAId);
        const rows = await authSql`select * from public.${authSql(tableName)} limit 1`;
        expect(rows).toHaveLength(0);
      },
    );

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

  describe('Issue 1 (0026): maintenance_requests IDOR — UPDATE/DELETE hardening', () => {
    it('non-admin cannot UPDATE another user\'s maintenance request', async () => {
      // tenantBSameCommAUserId must not be able to update tenantA's request.
      await setAuthenticatedContext(authSql, seed.tenantBSameCommAUserId, seed.communityAId);

      const updated = await authSql<{ id: number }[]>`
        update public.maintenance_requests
        set status = 'in_progress'
        where id = ${seed.tenantAMaintenanceRequestId}
        returning id
      `;
      expect(updated).toHaveLength(0);
    });

    it('non-admin cannot DELETE another user\'s maintenance request', async () => {
      await setAuthenticatedContext(authSql, seed.tenantBSameCommAUserId, seed.communityAId);

      const deleted = await authSql<{ id: number }[]>`
        delete from public.maintenance_requests
        where id = ${seed.tenantAMaintenanceRequestId}
        returning id
      `;
      expect(deleted).toHaveLength(0);

      // Verify row still exists.
      await resetSession(authSql);
      const check = await adminSql<{ id: number }[]>`
        select id from public.maintenance_requests
        where id = ${seed.tenantAMaintenanceRequestId}
      `;
      expect(check).toHaveLength(1);
    });

    it('request owner can UPDATE their own maintenance request', async () => {
      await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);

      const updated = await authSql<{ id: number }[]>`
        update public.maintenance_requests
        set status = 'in_progress'
        where id = ${seed.tenantAMaintenanceRequestId}
        returning id
      `;
      expect(updated).toHaveLength(1);

      // Restore original status.
      await adminSql`
        update public.maintenance_requests
        set status = 'open'
        where id = ${seed.tenantAMaintenanceRequestId}
      `;
    });

    it('admin-tier can UPDATE any maintenance request in the community', async () => {
      await setAuthenticatedContext(authSql, seed.adminAUserId, seed.communityAId);

      const updated = await authSql<{ id: number }[]>`
        update public.maintenance_requests
        set status = 'in_progress'
        where id = ${seed.tenantAMaintenanceRequestId}
        returning id
      `;
      expect(updated).toHaveLength(1);

      // Restore.
      await adminSql`
        update public.maintenance_requests
        set status = 'open'
        where id = ${seed.tenantAMaintenanceRequestId}
      `;
    });
  });

  describe('Issue 2 (0026): notification_preferences IDOR — INSERT/DELETE hardening', () => {
    it('user cannot INSERT notification_preferences for another user', async () => {
      await setAuthenticatedContext(authSql, seed.tenantBSameCommAUserId, seed.communityAId);

      // Attempt to insert a row with user_id belonging to tenantA (not the authenticated user).
      await expect(
        authSql`
          insert into public.notification_preferences (user_id, community_id, email_frequency)
          values (${seed.tenantAUserId}, ${seed.communityAId}, 'weekly')
        `,
      ).rejects.toThrow();
    });

    it('user can INSERT their own notification_preferences row', async () => {
      await adminSql`
        delete from public.notification_preferences
        where id = ${seed.tenantBSameCommANotifPrefId}
      `;

      await setAuthenticatedContext(authSql, seed.tenantBSameCommAUserId, seed.communityAId);

      const notificationPreferenceId = await nextSequenceValue('public.notification_preferences_id_seq');
      const inserted = await authSql<{ id: number }[]>`
        insert into public.notification_preferences (id, user_id, community_id, email_frequency)
        values (${notificationPreferenceId}, ${seed.tenantBSameCommAUserId}, ${seed.communityAId}, 'weekly')
        returning id
      `;
      expect(inserted).toHaveLength(1);

      // Cleanup.
      if (inserted[0]) {
        await adminSql`delete from public.notification_preferences where id = ${inserted[0].id}`;
      }
    });

    it('user cannot DELETE another user\'s notification_preferences', async () => {
      await setAuthenticatedContext(authSql, seed.tenantBSameCommAUserId, seed.communityAId);

      const deleted = await authSql<{ id: number }[]>`
        delete from public.notification_preferences
        where id = ${seed.tenantANotifPrefId}
        returning id
      `;
      expect(deleted).toHaveLength(0);

      // Verify row still exists.
      await resetSession(authSql);
      const check = await adminSql<{ id: number }[]>`
        select id from public.notification_preferences
        where id = ${seed.tenantANotifPrefId}
      `;
      expect(check).toHaveLength(1);
    });
  });

  describe('Issue 3 (0026): onboarding_wizard_state write access restriction', () => {
    it('tenant role cannot UPDATE onboarding_wizard_state', async () => {
      await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);

      const updated = await authSql<{ id: number }[]>`
        update public.onboarding_wizard_state
        set status = 'completed'
        where id = ${seed.communityAOnboardingWizardStateId}
        returning id
      `;
      expect(updated).toHaveLength(0);
    });

    it('tenant role cannot INSERT into onboarding_wizard_state', async () => {
      await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);

      await expect(
        authSql`
          insert into public.onboarding_wizard_state (community_id, wizard_type, status, step_data)
          values (${seed.communityAId}, 'condo', 'in_progress', '{}')
        `,
      ).rejects.toThrow();
    });

    it('admin-tier role can UPDATE onboarding_wizard_state', async () => {
      await setAuthenticatedContext(authSql, seed.adminAUserId, seed.communityAId);

      const updated = await authSql<{ id: number }[]>`
        update public.onboarding_wizard_state
        set status = 'completed'
        where id = ${seed.communityAOnboardingWizardStateId}
        returning id
      `;
      expect(updated).toHaveLength(1);

      // Restore.
      await adminSql`
        update public.onboarding_wizard_state
        set status = 'in_progress'
        where id = ${seed.communityAOnboardingWizardStateId}
      `;
    });
  });

  describe('Issue 4 (0026): maintenance_comments INSERT — must be authorized to view request', () => {
    it('user cannot INSERT a maintenance_comment with a spoofed user_id', async () => {
      // tenantAUserId (who owns the request) tries to attribute the comment to adminAUserId.
      await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);

      await expect(
        authSql`
          insert into public.maintenance_comments (community_id, request_id, user_id, text)
          values (
            ${seed.communityAId},
            ${seed.tenantAMaintenanceRequestId},
            ${seed.adminAUserId},
            'spoofed attribution attempt'
          )
        `,
      ).rejects.toThrow();
    });

    it('user cannot INSERT a comment on a request they did not submit', async () => {
      // tenantBSameCommAUserId tries to comment on tenantA's request.
      await setAuthenticatedContext(authSql, seed.tenantBSameCommAUserId, seed.communityAId);

      await expect(
        authSql`
          insert into public.maintenance_comments (community_id, request_id, user_id, text)
          values (
            ${seed.communityAId},
            ${seed.tenantAMaintenanceRequestId},
            ${seed.tenantBSameCommAUserId},
            'unauthorized comment attempt'
          )
        `,
      ).rejects.toThrow();
    });

    it('request owner can INSERT a comment on their own request', async () => {
      await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);

      const commentId = await nextSequenceValue('public.maintenance_comments_id_seq');
      const inserted = await authSql<{ id: number }[]>`
        insert into public.maintenance_comments (id, community_id, request_id, user_id, text)
        values (
          ${commentId},
          ${seed.communityAId},
          ${seed.tenantAMaintenanceRequestId},
          ${seed.tenantAUserId},
          'owner comment'
        )
        returning id
      `;
      expect(inserted).toHaveLength(1);

      // Cleanup (use admin — append-only at RLS so we need a privileged delete).
      if (inserted[0]) {
        await adminSql`delete from public.maintenance_comments where id = ${inserted[0].id}`;
      }
    });

    it('admin-tier can INSERT a comment on any request in the community', async () => {
      await setAuthenticatedContext(authSql, seed.adminAUserId, seed.communityAId);

      const commentId = await nextSequenceValue('public.maintenance_comments_id_seq');
      const inserted = await authSql<{ id: number }[]>`
        insert into public.maintenance_comments (id, community_id, request_id, user_id, text)
        values (
          ${commentId},
          ${seed.communityAId},
          ${seed.tenantAMaintenanceRequestId},
          ${seed.adminAUserId},
          'admin comment'
        )
        returning id
      `;
      expect(inserted).toHaveLength(1);

      if (inserted[0]) {
        await adminSql`delete from public.maintenance_comments where id = ${inserted[0].id}`;
      }
    });
  });

  describe('Issue 5 (0026): communities table RLS', () => {
    it('community member can SELECT their own community row', async () => {
      await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);

      const rows = await authSql<{ id: number }[]>`
        select id from public.communities
        where id = ${seed.communityAId}
      `;
      expect(rows).toHaveLength(1);
      expect(Number(rows[0]!.id)).toBe(seed.communityAId);
    });

    it('community member cannot SELECT another community row', async () => {
      await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);

      const rows = await authSql<{ id: number }[]>`
        select id from public.communities
        where id = ${seed.communityBId}
      `;
      expect(rows).toHaveLength(0);
    });

    it('community member cannot SELECT stripe billing fields of another community', async () => {
      await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);

      // A SELECT * should return at most 1 row (own community only).
      const rows = await authSql<{ id: number }[]>`
        select id from public.communities
        where id in (${seed.communityAId}, ${seed.communityBId})
      `;
      expect(rows.every((r) => Number(r.id) === seed.communityAId)).toBe(true);
      expect(rows.some((r) => Number(r.id) === seed.communityBId)).toBe(false);
    });

    it('authenticated user cannot INSERT a community directly', async () => {
      await setAuthenticatedContext(authSql, seed.adminAUserId, seed.communityAId);

      await expect(
        authSql`
          insert into public.communities (name, slug, community_type, timezone)
          values ('Unauthorized Community', 'unauth-community', 'condo_718', 'America/New_York')
        `,
      ).rejects.toThrow();
    });

    it('verifies communities policies exist in pg_policies', async () => {
      const rows = await adminSql<{ policyname: string }[]>`
        select policyname
        from pg_policies
        where schemaname = 'public' and tablename = 'communities'
        order by policyname
      `;
      const policyNames = rows.map((r) => r.policyname).sort();
      expect(policyNames).toEqual([
        'pp_communities_delete',
        'pp_communities_insert',
        'pp_communities_select',
        'pp_communities_update',
      ]);
    });
  });

  describe('units.rent_amount derived-column guard (0040)', () => {
    // units.rent_amount is DERIVED from the active lease. Until 0040 the guard
    // that was supposed to enforce that had condition `pg_trigger_depth() = 0`,
    // which inside a trigger is never true (depth is >= 1 by definition), so it
    // had NEVER fired — a direct UPDATE succeeded silently for the table's whole
    // life. The guard had no test, which is exactly why nobody noticed.
    //
    // BOTH directions are asserted on purpose. A guard checked only in the
    // negative can be dead again and still pass; the cascade test is what pins
    // the condition to 1 rather than 0 or 2.

    const makeFixture = async () => {
      const [community] = await adminSql<{ id: number }[]>`
        insert into communities (name, slug, community_type, is_demo)
        values (${`Rent Guard ${seed.runTag}`}, ${`rent-guard-${seed.runTag}-${createdRentGuardCommunityIds.size}`}, 'apartment', false)
        returning id
      `;
      // Track BEFORE anything can throw, so a failure cannot leak the fixture.
      createdRentGuardCommunityIds.add(Number(community!.id));
      const [unit] = await adminSql<{ id: number }[]>`
        insert into units (community_id, unit_number) values (${Number(community!.id)}, 'RG-1')
        returning id
      `;
      return { communityId: Number(community!.id), unitId: Number(unit!.id) };
    };

    it('rejects a direct UPDATE of units.rent_amount', async () => {
      const { unitId } = await makeFixture();

      // Matched on the message, not a bare rejects.toThrow(): the RAISE carries
      // no custom SQLSTATE, and a bare throw-assertion would also pass if the
      // row simply did not exist — which is how a dead guard looks.
      await expect(
        adminSql`update units set rent_amount = 555.00 where id = ${unitId}`,
      ).rejects.toThrow(/units\.rent_amount is derived/);

      const [row] = await adminSql<{ rent_amount: string | null }[]>`
        select rent_amount from units where id = ${unitId}
      `;
      expect(row?.rent_amount, 'the rejected write must not have persisted').toBeNull();
    });

    it('still allows the lease-sync cascade to set units.rent_amount', async () => {
      const { communityId, unitId } = await makeFixture();

      // leases write -> leases_sync_unit_rent_amount (depth 1)
      //   -> pp_sync_unit_rent_amount_from_lease -> UPDATE units (depth 2) -> allowed.
      const [lease] = await adminSql<{ id: number }[]>`
        insert into leases (community_id, unit_id, resident_id, status, start_date, end_date, rent_amount)
        values (${communityId}, ${unitId}, ${seed.tenantAUserId}, 'active',
                current_date - 1, current_date + 365, 2345.67)
        returning id
      `;

      const [afterInsert] = await adminSql<{ rent_amount: string | null }[]>`
        select rent_amount from units where id = ${unitId}
      `;
      expect(Number(afterInsert?.rent_amount)).toBeCloseTo(2345.67, 2);

      await adminSql`update leases set rent_amount = 999.99 where id = ${Number(lease!.id)}`;
      const [afterUpdate] = await adminSql<{ rent_amount: string | null }[]>`
        select rent_amount from units where id = ${unitId}
      `;
      expect(Number(afterUpdate?.rent_amount)).toBeCloseTo(999.99, 2);
    });

    it('keeps the guard function search_path pinned (0039 must not regress)', async () => {
      // 0040 CREATE OR REPLACEs this function, so it has to carry 0039's
      // SET search_path clause forward. The derived test in the 0039 block only
      // covers SECURITY DEFINER functions, and this one is INVOKER — so without
      // this assertion, 0040 could silently un-pin it.
      const [row] = await adminSql<{ proconfig: string[] | null }[]>`
        select p.proconfig
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'pp_block_direct_unit_rent_amount_write'
      `;
      expect(row?.proconfig, 'search_path must still be pinned').not.toBeNull();
      expect(String(row?.proconfig)).toContain('search_path');
    });
  });

  describe('function hardening (0039)', () => {
    it('pins search_path on every SECURITY DEFINER function in public', async () => {
      // Derived from pg_catalog, NOT a hardcoded list — so a SECURITY DEFINER
      // function added LATER without a pin fails here too, rather than only the
      // 13 known when 0039 was written being covered.
      //
      // SECURITY DEFINER + mutable search_path is the actual escalation vector:
      // the function runs as its owner, so an attacker who can shadow an
      // unqualified object it references executes their own code as that owner.
      const rows = await adminSql<{ proname: string }[]>`
        select p.proname
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.prosecdef
          and p.proconfig is null
        order by p.proname
      `;
      const unpinned = rows.map((r) => r.proname);
      expect(
        unpinned,
        `SECURITY DEFINER functions with a mutable search_path: ${unpinned.join(', ')}. ` +
          "Add SET search_path TO 'public', 'pg_catalog' (plus 'auth' only if it calls auth.uid()/auth.role()).",
      ).toEqual([]);
    });

    it('denies anon and authenticated CREATE on schema public, while keeping USAGE', async () => {
      // CREATE was revoked in 0039. It is the precondition that makes any
      // search_path hijack possible at all — without somewhere to create a
      // shadowing object, an unpinned search_path is untidy rather than
      // exploitable. Supabase's bootstrap grants it; nothing here uses it
      // (zero objects in public are owned by either role).
      //
      // USAGE is asserted in the other direction on purpose: the local stub and
      // PostgREST both need it, so an over-broad `REVOKE ALL ON SCHEMA` would
      // break the suite here rather than somewhere confusing.
      for (const role of ['anon', 'authenticated']) {
        const [row] = await adminSql<{ can_create: boolean; can_use: boolean }[]>`
          select has_schema_privilege(${role}, 'public', 'CREATE') as can_create,
                 has_schema_privilege(${role}, 'public', 'USAGE')  as can_use
        `;
        expect(row?.can_create, `${role} must NOT hold CREATE on schema public`).toBe(false);
        expect(row?.can_use, `${role} must retain USAGE on schema public`).toBe(true);
      }
    });

    it('KEEPS EXECUTE on the RLS policy helpers for anon and authenticated', async () => {
      // Deliberately the inverse of what Supabase's advisor recommends (lints
      // 0028/0029 flag these as "callable without signing in" and suggest
      // revoking EXECUTE). Postgres evaluates a policy expression with the
      // privileges of the role running the query, so that role MUST hold EXECUTE
      // on every function the policy calls. Revoking turns silent 0-row tenant
      // filtering into `permission denied for function` on every authenticated
      // read — verified by experiment, not assumed.
      //
      // These helpers back 144 / 85 / 70 / 12 / 2 policies. This test exists so
      // that acting on the advisor's advice fails here instead of in production.
      const helpers = [
        'pp_rls_can_read_audit_log',
        'pp_rls_has_community_membership',
        'pp_rls_community_allows_member_writes',
        'pp_rls_can_access_community',
        'pp_rls_is_privileged',
      ];
      for (const fn of helpers) {
        const [row] = await adminSql<{ anon_exec: boolean; auth_exec: boolean }[]>`
          select has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
                 has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = ${fn}
          limit 1
        `;
        expect(row?.anon_exec, `anon must retain EXECUTE on ${fn} (RLS policies call it)`).toBe(
          true,
        );
        expect(
          row?.auth_exec,
          `authenticated must retain EXECUTE on ${fn} (RLS policies call it)`,
        ).toBe(true);
      }
    });
  });

  describe('locked-down platform tables (0037, 0038)', () => {
    // Four tables that held PII or integrity-critical state while reachable by
    // anon and/or authenticated, each closed by giving it the posture eleven
    // sibling platform tables already had: RLS enabled AND forced, zero policies
    // (the deny-everyone default), ACL revoked, service_role retaining CRUD.
    //
    // Measured in production immediately before each fix:
    //   user_search_index (0037) — RLS off, anon+authenticated SELECT, over
    //     trigram-indexed full_name and email.
    //   users (0038) — RLS off, 1,660 rows of email/full_name/phone/avatar plus
    //     OTP lockout state; anon SELECT, authenticated SELECT+INSERT+UPDATE+DELETE.
    //   pending_signups (0038) — same grants; name, email, street address, zip.
    //   stripe_webhook_events (0038) — same grants; the write half mattered most,
    //     since INSERT/DELETE defeats webhook idempotency.
    //
    // Deny here is a HARD PERMISSION ERROR, not zero rows — the ACL rejects before
    // any policy is consulted. That is the same idiom the platform_admin_users
    // describe below uses, and it is why these cannot be folded into the
    // service_only behavioural loop, which asserts zero rows instead.
    const LOCKED_DOWN_TABLES = [
      'user_search_index',
      'users',
      'pending_signups',
      'stripe_webhook_events',
    ] as const;

    it.each(LOCKED_DOWN_TABLES)('%s has RLS enabled and forced', async (tableName) => {
      const [row] = await adminSql<{ relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
        select c.relrowsecurity, c.relforcerowsecurity
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = ${tableName}
      `;
      expect(row?.relrowsecurity, `${tableName} should have RLS enabled`).toBe(true);
      expect(row?.relforcerowsecurity, `${tableName} should have RLS forced`).toBe(true);
    });

    // Assert the SQLSTATE, not merely "it threw". A bare rejects.toThrow() also
    // passes on 42P01 (undefined_table), so a typo in LOCKED_DOWN_TABLES above
    // would sail through as a green test asserting nothing. 42501 is
    // insufficient_privilege — the ACL rejection we actually mean.
    const expectPermissionDenied = async (promise: Promise<unknown>, tableName: string) => {
      let error: unknown;
      try {
        await promise;
      } catch (err) {
        error = err;
      }
      expect(error, `${tableName} should have rejected the read`).toBeDefined();
      expect(
        (error as { code?: string }).code,
        `${tableName} should reject with 42501 insufficient_privilege, not ${(error as { code?: string }).code}`,
      ).toBe('42501');
    };

    it.each(LOCKED_DOWN_TABLES)('authenticated is denied SELECT on %s', async (tableName) => {
      await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);
      await expectPermissionDenied(
        authSql`select 1 from ${authSql(tableName)} limit 1`,
        tableName,
      );
    });

    it.each(LOCKED_DOWN_TABLES)('anon is denied SELECT on %s', async (tableName) => {
      await setAnonContext(authSql, seed.communityAId);
      await expectPermissionDenied(
        authSql`select 1 from ${authSql(tableName)} limit 1`,
        tableName,
      );
    });

    it.each(LOCKED_DOWN_TABLES)(
      'service_role retains full CRUD privilege on %s',
      async (tableName) => {
        await setServiceRoleContext(serviceSql);
        for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
          const [row] = await serviceSql<{ has_privilege: boolean }[]>`
            select has_table_privilege('service_role', ${`public.${tableName}`}, ${privilege}) as has_privilege
          `;
          expect(row?.has_privilege, `service_role should retain ${privilege} on ${tableName}`).toBe(
            true,
          );
        }
      },
    );
  });

  describe('platform_admin_users RLS (service_role only)', () => {
    // platform_admin_users uses REVOKE ALL from anon/authenticated + GRANT to service_role.
    // This means authenticated users get a hard "permission denied" error (not just 0 rows).
    // We cannot INSERT test rows directly because user_id FK references auth.users (not public.users).
    // Instead we verify deny behaviour via permission errors and service_role privileges via
    // has_table_privilege() checks.

    it('authenticated user is denied SELECT on platform_admin_users', async () => {
      await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);
      await expect(
        authSql`select user_id from public.platform_admin_users`,
      ).rejects.toThrow();
    });

    it('authenticated user is denied INSERT on platform_admin_users', async () => {
      await setAuthenticatedContext(authSql, seed.adminAUserId, seed.communityAId);
      await expect(
        authSql`insert into public.platform_admin_users (user_id, role) values (${randomUUID()}, 'super_admin')`,
      ).rejects.toThrow();
    });

    it('authenticated user is denied UPDATE on platform_admin_users', async () => {
      await setAuthenticatedContext(authSql, seed.adminAUserId, seed.communityAId);
      await expect(
        authSql`update public.platform_admin_users set role = 'super_admin' where user_id = ${randomUUID()}`,
      ).rejects.toThrow();
    });

    it('authenticated user is denied DELETE on platform_admin_users', async () => {
      await setAuthenticatedContext(authSql, seed.adminAUserId, seed.communityAId);
      await expect(
        authSql`delete from public.platform_admin_users where user_id = ${randomUUID()}`,
      ).rejects.toThrow();
    });

    it('service_role can SELECT from platform_admin_users without error', async () => {
      await setServiceRoleContext(serviceSql);
      const rows = await serviceSql<{ user_id: string }[]>`
        select user_id from public.platform_admin_users limit 1
      `;
      expect(Array.isArray(rows)).toBe(true);
    });

    it.each(['INSERT', 'UPDATE', 'DELETE'])(
      'service_role has %s privilege on platform_admin_users',
      async (privilege) => {
        await setServiceRoleContext(serviceSql);
        const [row] = await serviceSql<{ has_privilege: boolean }[]>`
          select has_table_privilege('service_role', 'public.platform_admin_users', ${privilege}) as has_privilege
        `;
        expect(row?.has_privilege).toBe(true);
      },
    );
  });

  it('verifies policy presence in pg_policies for every tenant table and family', async () => {
    const expectedPolicyOverrides: Record<string, string[]> = {
      finance_stripe_webhook_events: ['pp_finance_webhook_insert', 'pp_finance_webhook_select'],
      election_ballot_submissions: [
        'pp_election_ballot_submissions_insert',
        'pp_tenant_delete',
        'pp_tenant_select',
        'pp_tenant_update',
      ],
      poll_votes: ['pp_poll_votes_insert', 'pp_poll_votes_select'],
      esign_templates: ['pp_esign_admin_delete', 'pp_esign_admin_insert', 'pp_esign_admin_update', 'pp_tenant_select'],
      esign_submissions: ['pp_esign_admin_delete', 'pp_esign_admin_insert', 'pp_esign_admin_update', 'pp_tenant_select'],
      esign_signers: ['pp_esign_admin_delete', 'pp_esign_admin_insert', 'pp_esign_admin_update', 'pp_tenant_select'],
      esign_events: ['pp_esign_events_admin_insert', 'pp_tenant_select'],
      esign_consent: ['pp_esign_consent_admin_delete', 'pp_esign_consent_insert', 'pp_esign_consent_update', 'pp_tenant_select'],
      support_consent_grants: ['consent_community_read', 'consent_service_bypass'],
      support_access_log: ['access_log_community_read', 'access_log_service_bypass'],
      // onboarding_checklist_items (tenant_user_scoped): bespoke per-user policy
      // names, and no DELETE policy (rows are soft-deleted via UPDATE; authenticated
      // hard-delete fails closed). Names repaired-in-place by 0023, not renamed.
      onboarding_checklist_items: [
        'checklist_items_insert_own',
        'checklist_items_select_own',
        'checklist_items_update_own',
      ],
      // site_blocks (public_read_service_write): anon + authenticated published-row
      // read, service-role-only writes. Bespoke names; no pp_* family standard.
      site_blocks: ['site_blocks_anon_read', 'site_blocks_read_published', 'site_blocks_service_role'],
      // site_pages / site_page_redirects (public_read_service_write, 0046):
      // same family as site_blocks, but named to the pp_ convention since both
      // tables are new. They still need an entry — the family has no DERIVABLE
      // name shape (see the `case` below), so membership requires listing them.
      // site_page_redirects has no is_draft column, so its read policies are
      // community-scoped only; the `_read_published` suffix is kept for symmetry
      // with its sibling rather than describing an is_draft filter.
      site_pages: [
        'pp_site_pages_anon_read',
        'pp_site_pages_read_published',
        'pp_site_pages_service',
      ],
      site_page_redirects: [
        'pp_site_page_redirects_anon_read',
        'pp_site_page_redirects_read_published',
        'pp_site_page_redirects_service',
      ],
      // site_publish_snapshots (service_only): migration 0034 grants the family's
      // whole surface with ONE `FOR ALL` policy rather than the four per-command
      // pp_service_* policies. Functionally identical — same predicate
      // (pp_rls_is_privileged()) applied to every command — and the single-policy
      // shape was verified against production after 0034 was applied.
      site_publish_snapshots: ['pp_site_publish_snapshots_service'],
      // snowbird_digest_subscriptions (tenant_user_scoped): bespoke INSERT policy
      // name where the family's generic `pp_tenant_insert` is expected. Predates
      // this suite ever running — the guard that would have caught it has never
      // executed until now. Behaviour is covered by the family's own assertions;
      // only the NAME diverges.
      snowbird_digest_subscriptions: [
        'pp_snowbird_digest_subscriptions_delete',
        'pp_snowbird_digest_subscriptions_insert',
        'pp_snowbird_digest_subscriptions_select',
        'pp_snowbird_digest_subscriptions_update',
      ],

      // -----------------------------------------------------------------------
      // Tables registered in rls-config on 2026-07-26. Every override below is a
      // NAME divergence only — each was checked against its CREATE POLICY in
      // migration 0000 (or 0019) and matches its declared family's behaviour.
      // They predate the pp_* convention and, like snowbird_digest_subscriptions,
      // were never caught because this suite had never run.
      //
      // election_ballots and election_proxies are deliberately absent: they use
      // their family's canonical names verbatim and need no override.
      // -----------------------------------------------------------------------

      // denied_visitors (tenant_admin_write): baseline names for the exact family
      // shape — SELECT on membership, the other three additionally requiring
      // pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id).
      denied_visitors: [
        'denied_visitors_delete',
        'denied_visitors_insert',
        'denied_visitors_select',
        'denied_visitors_update',
      ],

      // The four *_community_* tables below share one baseline shape: the family's
      // four membership-scoped ops under bespoke names, plus an explicit
      // *_service_bypass FOR ALL policy where the pp_* families let
      // pp_rls_is_privileged() flow through pp_rls_can_access_community instead.
      // Equivalent surface, one extra policy row.
      document_drafts: [
        'document_drafts_community_delete',
        'document_drafts_community_insert',
        'document_drafts_community_read',
        'document_drafts_community_update',
        'document_drafts_service_bypass',
      ],
      faqs: [
        'faqs_community_delete',
        'faqs_community_insert',
        'faqs_community_read',
        'faqs_community_update',
        'faqs_service_bypass',
      ],
      help_article_feedback: [
        'help_article_feedback_community_delete',
        'help_article_feedback_community_insert',
        'help_article_feedback_community_read',
        'help_article_feedback_community_update',
        'help_article_feedback_service_bypass',
      ],
      move_checklists: [
        'move_checklists_community_delete',
        'move_checklists_community_insert',
        'move_checklists_community_read',
        'move_checklists_community_update',
        'move_checklists_service_bypass',
      ],

      // help_article_views (tenant_append_only): same baseline idiom as its
      // sibling help_article_feedback, but with no UPDATE and no DELETE policy —
      // authenticated mutation fails closed, which is the append-only posture
      // reached by omission rather than by an explicit drop.
      help_article_views: [
        'help_article_views_community_insert',
        'help_article_views_community_read',
        'help_article_views_service_bypass',
      ],

      // elections / election_candidates (tenant_admin_write): the family's exact
      // shape, but the write policies carry an _admin_ infix the family default
      // does not expect (pp_elections_admin_insert vs pp_elections_insert).
      elections: [
        'pp_elections_admin_delete',
        'pp_elections_admin_insert',
        'pp_elections_admin_update',
        'pp_tenant_select',
      ],
      election_candidates: [
        'pp_election_candidates_admin_delete',
        'pp_election_candidates_admin_insert',
        'pp_election_candidates_admin_update',
        'pp_tenant_select',
      ],

      // election_eligibility_snapshots (tenant_append_only): correct family shape,
      // but the INSERT policy name truncates the table name
      // (pp_election_eligibility_insert, not pp_election_eligibility_snapshots_insert).
      election_eligibility_snapshots: ['pp_election_eligibility_insert', 'pp_tenant_select'],

      // emergency_broadcasts / _recipients (tenant_crud): four bespoke-named ops
      // sharing one predicate — pp_rls_is_privileged() OR (auth.uid() IS NOT NULL
      // AND pp_rls_can_access_community(community_id)) — i.e. the membership check
      // with an explicit not-anon guard. Equivalent to tenant_crud for any
      // authenticated caller. See the trigger test: these two are the pair with no
      // write-scope trigger at all.
      emergency_broadcasts: [
        'pp_emergency_broadcasts_delete',
        'pp_emergency_broadcasts_insert',
        'pp_emergency_broadcasts_select',
        'pp_emergency_broadcasts_update',
      ],
      emergency_broadcast_recipients: [
        'pp_emergency_broadcast_recipients_delete',
        'pp_emergency_broadcast_recipients_insert',
        'pp_emergency_broadcast_recipients_select',
        'pp_emergency_broadcast_recipients_update',
      ],

      // notifications (tenant_user_scoped): only SELECT and UPDATE policies exist,
      // both on user_id = auth.uid() with no community_id term. Strictly narrower
      // than the family's membership check rather than weaker — a user reaches
      // only their own rows in any tenant. No INSERT/DELETE policy, so authenticated
      // writes fail closed and the service role creates notifications.
      notifications: ['notifications_user_select', 'notifications_user_update'],

      // root_claim_disputes (audit_log_restricted): the family's shape under
      // table-specific names — admin-tier SELECT, privileged INSERT, and no
      // UPDATE/DELETE policy because a filed dispute is immutable.
      root_claim_disputes: ['pp_root_claim_disputes_insert', 'pp_root_claim_disputes_select'],
    };

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
      let expectedPolicies = expectedPolicyOverrides[entry.tableName]?.toSorted();

      if (expectedPolicies) {
        expect(
          actualPolicies,
          `${entry.tableName} (${entry.policyFamily}) should have policies: ${expectedPolicies.join(', ')}`,
        ).toEqual(expectedPolicies);
        continue;
      }

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
          // UPDATE and DELETE dropped at RLS level (consistent with scoped-client APPEND_ONLY_TABLES).
          // INSERT is bespoke (pp_{tableName}_insert) to enforce viewer-authorization on comments.
          expectedPolicies = [
            `pp_${entry.tableName}_insert`,
            'pp_tenant_select',
          ].sort();
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
          // notification_preferences: all four ops are bespoke and user_id-scoped.
          //   SELECT/UPDATE (0025) and INSERT/DELETE (0026) all use pp_notification_preferences_*
          //   policies that restrict to user_id = auth.uid() OR admin-tier (pp_rls_can_read_audit_log).
          // maintenance_requests: SELECT/UPDATE/DELETE are bespoke and submitted_by_id-scoped;
          //   INSERT retains the generic pp_tenant_insert (community-membership check only).
          if (entry.tableName === 'notification_preferences') {
            expectedPolicies = [
              `pp_${entry.tableName}_delete`,
              `pp_${entry.tableName}_insert`,
              `pp_${entry.tableName}_select`,
              `pp_${entry.tableName}_update`,
            ].sort();
          } else {
            // maintenance_requests: INSERT retains generic pp_tenant_insert.
            expectedPolicies = [
              `pp_${entry.tableName}_delete`,
              `pp_${entry.tableName}_select`,
              `pp_${entry.tableName}_update`,
              'pp_tenant_insert',
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
        case 'public_read_service_write':
          // This family has no canonical pp_* name shape by construction: its
          // members are public-facing site content whose anon-read policies were
          // named per table (site_blocks_anon_read, …). There is nothing to
          // derive, so membership in this family REQUIRES an override entry.
          // Reaching here means a table was added to the family without one —
          // previously that fell through to the generic `default:` throw below,
          // which said "unhandled family" and sent you looking for a missing case
          // that cannot be written.
          throw new Error(
            `${entry.tableName} is in the public_read_service_write family, which has no canonical ` +
              'policy names — add an expectedPolicyOverrides entry listing its actual policies.',
          );
        default:
          throw new Error(`Unhandled policy family: ${entry.policyFamily as string}`);
      }

      expect(
        actualPolicies,
        `${entry.tableName} (${entry.policyFamily}) should have policies: ${expectedPolicies.join(', ')}`,
      ).toEqual(expectedPolicies);
    }
  });

  describe('0021: access_requests + community_join_requests RLS repair', () => {
    it('installs the write-scope trigger on every tenant-scoped table', async () => {
      // Matched on the FUNCTION, not the trigger name. Several baseline tables
      // attach pp_rls_enforce_tenant_community_id() under a legacy name (see
      // legacyTriggerNames below); filtering on tgname = 'pp_rls_enforce_tenant_scope'
      // — as this test did until 2026-07-26 — made those triggers invisible and
      // would have reported a table as unprotected when it is in fact enforced.
      const rows = await adminSql<{ relname: string; tgname: string }[]>`
        select c.relname, t.tgname
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        join pg_proc p on p.oid = t.tgfoid
        where n.nspname = 'public'
          and p.proname = 'pp_rls_enforce_tenant_community_id'
          and not t.tgisinternal
      `;

      const triggerNamesByTable = new Map<string, Set<string>>();
      for (const row of rows) {
        const names = triggerNamesByTable.get(row.relname) ?? new Set<string>();
        names.add(row.tgname);
        triggerNamesByTable.set(row.relname, names);
      }

      // Service-only and audit-restricted tables intentionally lack this trigger
      // because they are written exclusively under a privileged role. Append-only
      // tables also skip it — their write path is INSERT-only and the trigger is
      // an INSERT/UPDATE rewrite that is not applied to those families.
      const familiesWithoutTrigger = new Set([
        'service_only',
        'audit_log_restricted',
        'tenant_append_only',
        // public_read_service_write (site_blocks): writes are service-role only,
        // so there is no authenticated write path for a write-scope trigger to guard.
        'public_read_service_write',
      ]);

      // Tables whose write-scope trigger runs the canonical function under a
      // pre-convention name. Each was confirmed against migration 0000: same
      // BEFORE INSERT OR UPDATE timing, same pp_rls_enforce_tenant_community_id()
      // body — only the trigger's name differs, so renaming them would be pure
      // churn requiring a production apply. Asserted by exact name so a trigger
      // being dropped or swapped still fails here.
      const legacyTriggerNames: Record<string, string> = {
        denied_visitors: 'enforce_denied_visitors_community_scope',
        document_drafts: 'document_drafts_tenant_scope',
        faqs: 'faqs_tenant_scope',
        help_article_feedback: 'help_article_feedback_tenant_scope',
        move_checklists: 'move_checklists_tenant_scope',
        notifications: 'notifications_enforce_tenant_scope',
      };

      // No per-table exemptions. emergency_broadcasts and
      // emergency_broadcast_recipients were exempted here when they were
      // registered — they had no write-scope trigger under any name — and 0037
      // installed the canonical trigger on both, so the exemption is gone. The
      // self-destruct assertion that forced this removal has been deleted with
      // it; the loop below is now unconditional for every non-exempt family.
      const expectedTables = RLS_TENANT_TABLES.filter(
        (entry) => !familiesWithoutTrigger.has(entry.policyFamily),
      ).map((entry) => entry.tableName);

      // Both repaired tables (access_requests, community_join_requests) must be present.
      expect(triggerNamesByTable.get('access_requests')).toContain('pp_rls_enforce_tenant_scope');
      expect(triggerNamesByTable.get('community_join_requests')).toContain(
        'pp_rls_enforce_tenant_scope',
      );

      for (const tableName of expectedTables) {
        const expectedName = legacyTriggerNames[tableName] ?? 'pp_rls_enforce_tenant_scope';
        expect(
          [...(triggerNamesByTable.get(tableName) ?? [])],
          `${tableName} should have a write-scope trigger named ${expectedName}`,
        ).toContain(expectedName);
      }
    });

    it('rewrites a forged community_id on emergency_broadcasts INSERT (0037)', async () => {
      // The behavioural reason gap 2 mattered. The four tenant policies only ever
      // checked that the caller CAN access the community_id they supplied — and a
      // user who belongs to two communities passes that check for either one. So
      // before 0037 installed the write-scope trigger, such a caller could write a
      // broadcast into whichever of their communities they named, regardless of the
      // tenant context the request resolved to. The trigger rewrites it instead.
      await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);

      const inserted = await authSql<{ id: number; community_id: number }[]>`
        insert into public.emergency_broadcasts (
          community_id,
          title,
          body,
          initiated_by
        ) values (
          ${seed.communityBId},
          ${`${seed.runTag}-eb-forge`},
          'forged tenant test',
          ${seed.tenantAUserId}
        )
        returning id, community_id
      `;

      // Track BEFORE asserting. If an assertion throws — which is exactly the
      // failure this test exists to catch — an inline delete after it would never
      // run and the row would leak into the shared local/CI database. afterAll
      // cleanup is the pattern the documents and access_requests forged-insert
      // tests already use, for the same reason.
      if (inserted[0]) {
        createdEmergencyBroadcastIds.add(Number(inserted[0].id));
      }

      expect(inserted).toHaveLength(1);
      // Written into the ACTIVE tenant (A), not the forged one (B).
      expect(Number(inserted[0]?.community_id)).toBe(seed.communityAId);
    });

    it('rewrites a forged community_id on access_requests INSERT to the active tenant', async () => {
      // tenantA has a role in community A and qualifies for the tenant_crud
      // write path; the write-scope trigger rewrites any forged community_id
      // to the active tenant.
      await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);

      const refCode = `${seed.runTag}-ar-forge`;
      const inserted = await authSql<{ id: number; community_id: number }[]>`
        insert into public.access_requests (
          community_id,
          email,
          full_name,
          role_requested,
          ref_code
        ) values (
          ${seed.communityBId},
          ${`${seed.runTag}-ar-forge@example.com`},
          ${`Forged AR ${seed.runTag}`},
          'resident',
          ${refCode}
        )
        returning id, community_id
      `;

      expect(inserted).toHaveLength(1);
      expect(Number(inserted[0]?.community_id)).toBe(seed.communityAId);
      if (inserted[0]) {
        createdAccessRequestIds.add(Number(inserted[0].id));
      }
    });

    it('blocks cross-tenant SELECT on access_requests', async () => {
      // Seed an access_requests row in community B via service role.
      await setServiceRoleContext(serviceSql);
      const seededId = await nextSequenceValue('public.access_requests_id_seq');
      await serviceSql`
        insert into public.access_requests (
          id,
          community_id,
          email,
          full_name,
          role_requested,
          ref_code
        ) values (
          ${seededId},
          ${seed.communityBId},
          ${`${seed.runTag}-ar-b@example.com`},
          ${`AR B ${seed.runTag}`},
          'resident',
          ${`${seed.runTag}-ar-b`}
        )
      `;
      createdAccessRequestIds.add(seededId);

      // Tenant A reading must not see community B's row.
      await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);
      const visible = await authSql<{ id: number }[]>`
        select id from public.access_requests where id = ${seededId}
      `;
      expect(visible).toHaveLength(0);
    });

    it('blocks cross-tenant UPDATE on community_join_requests', async () => {
      // Seed a community_join_requests row in community B via service role.
      await setServiceRoleContext(serviceSql);
      const seededId = await nextSequenceValue('public.community_join_requests_id_seq');
      await serviceSql`
        insert into public.community_join_requests (
          id,
          user_id,
          community_id,
          unit_identifier,
          resident_type,
          status
        ) values (
          ${seededId},
          ${seed.adminBUserId},
          ${seed.communityBId},
          ${'B-101'},
          'owner',
          'pending'
        )
      `;
      createdCommunityJoinRequestIds.add(seededId);

      // Tenant A acting in community A must not be able to update community B's row.
      await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);
      const updated = await authSql<{ id: number }[]>`
        update public.community_join_requests
        set status = 'approved'
        where id = ${seededId}
        returning id
      `;
      expect(updated).toHaveLength(0);
    });
  });

  describe('0023: wrong-GUC policy repair (onboarding_checklist_items + site_blocks)', () => {
    let checklistItemAId: number;
    let checklistItemOtherUserId: number;
    let publishedBlockAId: number;
    let draftBlockAId: number;
    let publishedBlockBId: number;

    beforeAll(async () => {
      // Seed via the admin connection (privileged, RLS-bypassing) — the
      // policies under test only gate anon/authenticated direct access.
      const [itemA] = await db
        .insert(onboardingChecklistItems)
        .values({
          communityId: seed.communityAId,
          userId: seed.tenantAUserId,
          itemKey: `${seed.runTag}-own`,
        })
        .returning({ id: onboardingChecklistItems.id });
      const [itemOtherUser] = await db
        .insert(onboardingChecklistItems)
        .values({
          communityId: seed.communityAId,
          userId: seed.tenantBSameCommAUserId,
          itemKey: `${seed.runTag}-other-user`,
        })
        .returning({ id: onboardingChecklistItems.id });
      if (!itemA || !itemOtherUser) throw new Error('Failed to seed checklist items');
      checklistItemAId = itemA.id;
      checklistItemOtherUserId = itemOtherUser.id;
      createdChecklistItemIds.add(checklistItemAId);
      createdChecklistItemIds.add(checklistItemOtherUserId);

      const [publishedA] = await db
        .insert(siteBlocks)
        .values({
          communityId: seed.communityAId,
          blockOrder: 1,
          blockType: 'text',
          content: { runTag: seed.runTag },
          isDraft: false,
        })
        .returning({ id: siteBlocks.id });
      const [draftA] = await db
        .insert(siteBlocks)
        .values({
          communityId: seed.communityAId,
          blockOrder: 2,
          blockType: 'text',
          content: { runTag: seed.runTag },
          isDraft: true,
        })
        .returning({ id: siteBlocks.id });
      const [publishedB] = await db
        .insert(siteBlocks)
        .values({
          communityId: seed.communityBId,
          blockOrder: 1,
          blockType: 'text',
          content: { runTag: seed.runTag },
          isDraft: false,
        })
        .returning({ id: siteBlocks.id });
      if (!publishedA || !draftA || !publishedB) throw new Error('Failed to seed site blocks');
      publishedBlockAId = publishedA.id;
      draftBlockAId = draftA.id;
      publishedBlockBId = publishedB.id;
      createdSiteBlockIds.add(publishedBlockAId);
      createdSiteBlockIds.add(draftBlockAId);
      createdSiteBlockIds.add(publishedBlockBId);
    });

    it('lets an authenticated user read their own checklist item under the canonical GUC', async () => {
      await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);
      const visible = await authSql<{ id: number }[]>`
        select id from public.onboarding_checklist_items where id = ${checklistItemAId}
      `;
      expect(visible).toHaveLength(1);
    });

    it("blocks reading another user's checklist item in the same community", async () => {
      await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);
      const visible = await authSql<{ id: number }[]>`
        select id from public.onboarding_checklist_items where id = ${checklistItemOtherUserId}
      `;
      expect(visible).toHaveLength(0);
    });

    it('blocks reading own checklist item under a different community GUC', async () => {
      await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityBId);
      const visible = await authSql<{ id: number }[]>`
        select id from public.onboarding_checklist_items where id = ${checklistItemAId}
      `;
      expect(visible).toHaveLength(0);
    });

    /**
     * Regression: the public-site outage.
     *
     * `middleware.ts` resolves a tenant host to a community id using the
     * ANON-keyed Supabase client. It used to do that with a direct read of
     * `communities`, whose SELECT policy requires
     * `pp_rls_has_community_membership(id)` — and that function returns false
     * whenever `auth.uid()` is null. So every anonymous visitor resolved to
     * nothing, `x-community-id` was never set, and every community's public
     * site rendered "Community not found." behind an HTTP 200 while
     * authenticated users saw a working app.
     *
     * These two assertions are the contract migration 0045 created: anon CAN
     * resolve a slug to an id, and anon still CANNOT read the row.
     */
    it('lets anon resolve a community slug to an id via the public RPC', async () => {
      // Read the slug as admin FIRST. Resolving it inside the anon session
      // would pass NULL into the function — anon cannot read `communities`,
      // which is the whole reason this RPC exists.
      const [community] = await adminSql<{ slug: string }[]>`
        select slug from public.communities where id = ${seed.communityAId}
      `;
      expect(community?.slug).toBeTruthy();

      await setAnonContext(authSql, seed.communityAId);
      const rows = await authSql<{ id: number | null }[]>`
        select public.pp_public_community_id_by_slug(${community!.slug}) as id
      `;
      expect(Number(rows[0]?.id)).toBe(seed.communityAId);
    });

    it('returns null from the public RPC for an unknown slug', async () => {
      await setAnonContext(authSql, seed.communityAId);
      const rows = await authSql<{ id: number | null }[]>`
        select public.pp_public_community_id_by_slug('no-such-community-slug') as id
      `;
      expect(rows[0]?.id).toBeNull();
    });

    it('still hides the communities row itself from anon', async () => {
      // The RPC must not have widened table access. If this ever passes with
      // rows, someone "fixed" the outage by adding an anon SELECT policy and
      // published subscription_plan, stripe_subscription_id and the street
      // address to the internet along with it.
      await setAnonContext(authSql, seed.communityAId);
      const rows = await authSql<{ id: number }[]>`
        select id from public.communities where id = ${seed.communityAId}
      `;
      expect(rows).toHaveLength(0);
    });

    it('lets anon read only published blocks of the GUC-selected community', async () => {
      await setAnonContext(authSql, seed.communityAId);
      const rows = await authSql<{ id: number }[]>`
        select id from public.site_blocks
        where id in (${publishedBlockAId}, ${draftBlockAId}, ${publishedBlockBId})
      `;
      expect(rows.map((r) => Number(r.id))).toEqual([publishedBlockAId]);
    });

    it('lets authenticated read only published blocks of the GUC-selected community', async () => {
      await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);
      const rows = await authSql<{ id: number }[]>`
        select id from public.site_blocks
        where id in (${publishedBlockAId}, ${draftBlockAId}, ${publishedBlockBId})
      `;
      expect(rows.map((r) => Number(r.id))).toEqual([publishedBlockAId]);
    });

    it('returns zero rows (not an error) for authenticated reads with an empty GUC', async () => {
      // Regression: the old site_blocks_read_published called current_setting
      // without missing_ok, so an unset/empty GUC THREW instead of failing closed.
      await resetSession(authSql);
      await authSql.unsafe('set role authenticated');
      await authSql`select set_config('request.jwt.claim.sub', ${seed.tenantAUserId}, false)`;
      await authSql`select set_config('request.jwt.claim.role', 'authenticated', false)`;
      await authSql`select set_config('app.current_community_id', '', false)`;
      const rows = await authSql<{ id: number }[]>`
        select id from public.site_blocks where id = ${publishedBlockAId}
      `;
      expect(rows).toHaveLength(0);
    });

    it('0024: onboarding_checklist_items carries the canonical write-scope trigger, not the legacy name', async () => {
      // 0024 renamed enforce_community_scope_onboarding_checklist_items to the
      // canonical pp_rls_enforce_tenant_scope (same function), bringing the table
      // into taxonomy compliance. The generic trigger-coverage test in the 0021
      // block asserts presence; here we also assert the legacy name is gone.
      const rows = await adminSql<{ tgname: string }[]>`
        select t.tgname
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'onboarding_checklist_items'
          and not t.tgisinternal
      `;
      const names = new Set(rows.map((r) => r.tgname));
      expect(names.has('pp_rls_enforce_tenant_scope')).toBe(true);
      expect(names.has('enforce_community_scope_onboarding_checklist_items')).toBe(false);
    });
  });

  /**
   * 0046 — Phase 11a multi-page EXPAND migration.
   *
   * Two halves. The RLS half is the one that matters most: `site_pages` is
   * anon-readable because the public site renders it, so a page the PM has
   * created but never published must be invisible to anon — the whole draft
   * layer of the editor is otherwise on the internet.
   *
   * The structural half asserts what makes Phase 11b REVERTIBLE: `page_id` is
   * still nullable and the 3-column ordering index still exists. Dropping either
   * is gate G3, a deploy wait behind 11b being live. If a future change makes
   * these fail, it has moved 11c's work into 11b's window.
   */
  describe('0046: multi-page expand (site_pages + site_page_redirects)', () => {
    let publishedPageAId: number;
    let draftPageAId: number;
    let publishedPageBId: number;
    let redirectAId: number;
    let redirectBId: number;
    // Well clear of the block_orders the 0023 block seeds (1 and 2): the
    // 3-column index is still live, so it is community-wide until 11c.
    const orderBase = 900;

    beforeAll(async () => {
      // runTag carries underscores; slugs are ^[a-z0-9][a-z0-9-]*$ by CHECK.
      const slugTag = seed.runTag.replace(/_/g, '-');

      const [publishedA] = await db
        .insert(sitePages)
        .values({
          communityId: seed.communityAId,
          name: `Published ${seed.runTag}`,
          slug: `published-${slugTag}`,
          isDraft: false,
          publishedAt: new Date(),
        })
        .returning({ id: sitePages.id });
      const [draftA] = await db
        .insert(sitePages)
        .values({
          communityId: seed.communityAId,
          name: `Draft ${seed.runTag}`,
          slug: `draft-${slugTag}`,
          isDraft: true,
        })
        .returning({ id: sitePages.id });
      const [publishedB] = await db
        .insert(sitePages)
        .values({
          communityId: seed.communityBId,
          name: `Published B ${seed.runTag}`,
          slug: `published-b-${slugTag}`,
          isDraft: false,
          publishedAt: new Date(),
        })
        .returning({ id: sitePages.id });
      if (!publishedA || !draftA || !publishedB) throw new Error('Failed to seed site pages');
      publishedPageAId = publishedA.id;
      draftPageAId = draftA.id;
      publishedPageBId = publishedB.id;
      createdSitePageIds.add(publishedPageAId);
      createdSitePageIds.add(draftPageAId);
      createdSitePageIds.add(publishedPageBId);

      const [redirectA] = await db
        .insert(sitePageRedirects)
        .values({
          communityId: seed.communityAId,
          fromSlug: `old-${slugTag}`,
          pageId: publishedPageAId,
        })
        .returning({ id: sitePageRedirects.id });
      const [redirectB] = await db
        .insert(sitePageRedirects)
        .values({
          communityId: seed.communityBId,
          fromSlug: `old-b-${slugTag}`,
          pageId: publishedPageBId,
        })
        .returning({ id: sitePageRedirects.id });
      if (!redirectA || !redirectB) throw new Error('Failed to seed site page redirects');
      redirectAId = redirectA.id;
      redirectBId = redirectB.id;
      // Both cascade from their page — no separate cleanup set needed.
    });

    it('lets anon read only PUBLISHED pages of the GUC-selected community', async () => {
      // The draft page is the assertion that matters: an anon-visible draft
      // would publish the editor's unreleased content to the internet.
      await setAnonContext(authSql, seed.communityAId);
      const rows = await authSql<{ id: number }[]>`
        select id from public.site_pages
        where id in (${publishedPageAId}, ${draftPageAId}, ${publishedPageBId})
      `;
      expect(rows.map((r) => Number(r.id))).toEqual([publishedPageAId]);
    });

    it('lets authenticated read only PUBLISHED pages of the GUC-selected community', async () => {
      await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);
      const rows = await authSql<{ id: number }[]>`
        select id from public.site_pages
        where id in (${publishedPageAId}, ${draftPageAId}, ${publishedPageBId})
      `;
      expect(rows.map((r) => Number(r.id))).toEqual([publishedPageAId]);
    });

    it('hides a draft page from a member of its own community', async () => {
      // Membership is not the gate here — publication is. A resident of
      // community A still must not see A's unpublished page.
      await setAuthenticatedContext(authSql, seed.tenantAUserId, seed.communityAId);
      const rows = await authSql<{ id: number }[]>`
        select id from public.site_pages where id = ${draftPageAId}
      `;
      expect(rows).toHaveLength(0);
    });

    it('returns zero rows (not an error) for page reads with an empty GUC', async () => {
      // The fail-closed COALESCE/NULLIF form 0023 introduced. The pre-0023
      // site_blocks policy called current_setting without missing_ok and THREW.
      await resetSession(authSql);
      await authSql.unsafe('set role authenticated');
      await authSql`select set_config('request.jwt.claim.sub', ${seed.tenantAUserId}, false)`;
      await authSql`select set_config('request.jwt.claim.role', 'authenticated', false)`;
      await authSql`select set_config('app.current_community_id', '', false)`;
      const rows = await authSql<{ id: number }[]>`
        select id from public.site_pages where id = ${publishedPageAId}
      `;
      expect(rows).toHaveLength(0);
    });

    it('lets anon read redirects of the GUC-selected community only', async () => {
      await setAnonContext(authSql, seed.communityAId);
      const rows = await authSql<{ id: number }[]>`
        select id from public.site_page_redirects where id in (${redirectAId}, ${redirectBId})
      `;
      expect(rows.map((r) => Number(r.id))).toEqual([redirectAId]);
    });

    it('returns zero rows (not an error) for redirect reads with an empty GUC', async () => {
      await resetSession(authSql);
      await authSql.unsafe('set role anon');
      await authSql`select set_config('request.jwt.claim.role', 'anon', false)`;
      await authSql`select set_config('app.current_community_id', '', false)`;
      const rows = await authSql<{ id: number }[]>`
        select id from public.site_page_redirects where id = ${redirectAId}
      `;
      expect(rows).toHaveLength(0);
    });

    it('refuses an anon INSERT into site_pages', async () => {
      await setAnonContext(authSql, seed.communityAId);
      await expect(
        authSql`
          insert into public.site_pages (community_id, name, slug)
          values (${seed.communityAId}, 'anon write', 'anon-write-attempt')
        `,
      ).rejects.toThrow();
    });

    it('refuses an anon INSERT into site_page_redirects', async () => {
      await setAnonContext(authSql, seed.communityAId);
      await expect(
        authSql`
          insert into public.site_page_redirects (community_id, from_slug, page_id)
          values (${seed.communityAId}, 'anon-write-attempt', ${publishedPageAId})
        `,
      ).rejects.toThrow();
    });

    it('keeps site_blocks.page_id NULLABLE until gate G3 (Phase 11c)', async () => {
      const [column] = await adminSql<{ is_nullable: string }[]>`
        select is_nullable
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'site_blocks'
          and column_name = 'page_id'
      `;
      expect(column?.is_nullable).toBe('YES');
    });

    it('keeps BOTH ordering indexes until gate G3 (Phase 11c)', async () => {
      // The 3-column index is what pre-11b code relies on; its survival is what
      // makes 11b revertible.
      const rows = await adminSql<{ indexname: string }[]>`
        select indexname from pg_indexes
        where schemaname = 'public' and tablename = 'site_blocks'
      `;
      const names = new Set(rows.map((r) => r.indexname));
      expect(names.has('site_blocks_community_order_draft_partial')).toBe(true);
      expect(names.has('site_blocks_community_page_order_draft_partial')).toBe(true);
    });

    it('allows the same block_order on two DIFFERENT pages', async () => {
      // The point of the whole migration: ordering becomes per-page. Note both
      // rows must still differ under the surviving 3-column index, so they use
      // different is_draft values.
      const [first] = await db
        .insert(siteBlocks)
        .values({
          communityId: seed.communityAId,
          pageId: publishedPageAId,
          blockOrder: orderBase,
          blockType: 'text',
          content: { runTag: seed.runTag },
          isDraft: false,
        })
        .returning({ id: siteBlocks.id });
      const [second] = await db
        .insert(siteBlocks)
        .values({
          communityId: seed.communityAId,
          pageId: draftPageAId,
          blockOrder: orderBase,
          blockType: 'text',
          content: { runTag: seed.runTag },
          isDraft: true,
        })
        .returning({ id: siteBlocks.id });
      if (!first || !second) throw new Error('Failed to seed per-page blocks');
      createdSiteBlockIds.add(first.id);
      createdSiteBlockIds.add(second.id);
      expect(first.id).not.toBe(second.id);
    });

    it('rejects a duplicate (community, page, block_order, is_draft)', async () => {
      const [row] = await db
        .insert(siteBlocks)
        .values({
          communityId: seed.communityAId,
          pageId: publishedPageAId,
          blockOrder: orderBase + 1,
          blockType: 'text',
          content: { runTag: seed.runTag },
          isDraft: false,
        })
        .returning({ id: siteBlocks.id });
      if (!row) throw new Error('Failed to seed block');
      createdSiteBlockIds.add(row.id);

      await expect(
        db.insert(siteBlocks).values({
          communityId: seed.communityAId,
          pageId: publishedPageAId,
          blockOrder: orderBase + 1,
          blockType: 'text',
          content: { runTag: seed.runTag },
          isDraft: false,
        }),
      ).rejects.toThrow();
    });

    it('allows at most one live home page per community', async () => {
      // The backfill's idempotency depends on this: a re-apply must not be able
      // to give a community a second home page. Two indexes both forbid it (the
      // home partial index and slug-uniqueness on the shared '' slug); either
      // rejecting is the guarantee the backfill needs.
      const [home] = await db
        .insert(sitePages)
        .values({
          communityId: seed.communityAId,
          name: 'Home',
          slug: '',
          isHome: true,
          isDraft: false,
          publishedAt: new Date(),
        })
        .returning({ id: sitePages.id });
      if (!home) throw new Error('Failed to seed home page');
      createdSitePageIds.add(home.id);

      await expect(
        db.insert(sitePages).values({
          communityId: seed.communityAId,
          name: 'Home again',
          slug: '',
          isHome: true,
        }),
      ).rejects.toThrow();
    });

    it('rejects a malformed slug at the database layer', async () => {
      // Shape only — the RESERVED-slug rule lives in the app layer, where
      // isReservedPublicSlug() derives it from PROTECTED_FIRST_SEGMENTS so the
      // routing rule and the validator cannot drift into two lists.
      for (const slug of ['..', 'Docs', 'has space', 'trailing/slash', '-leading']) {
        await expect(
          db.insert(sitePages).values({
            communityId: seed.communityAId,
            name: `bad ${slug}`,
            slug,
          }),
          `slug ${JSON.stringify(slug)} should violate site_pages_slug_shape_check`,
        ).rejects.toThrow();
      }
    });

    it('requires a non-home page to have a non-empty slug', async () => {
      await expect(
        db.insert(sitePages).values({
          communityId: seed.communityAId,
          name: 'no slug',
          slug: '',
          isHome: false,
        }),
      ).rejects.toThrow();
    });

    it('refuses a block whose page belongs to ANOTHER community', async () => {
      // The composite (community_id, page_id) FK. With a single-column page_id
      // FK this insert would succeed, and then deleting community B's page would
      // cascade away community A's block — a cross-tenant DESTRUCTIVE path, not
      // just a read one. Enforced by the database so no future write path has to
      // remember to re-check it.
      await expect(
        db.insert(siteBlocks).values({
          communityId: seed.communityAId,
          pageId: publishedPageBId,
          blockOrder: orderBase + 3,
          blockType: 'text',
          content: { runTag: seed.runTag },
          isDraft: true,
        }),
      ).rejects.toThrow();
    });

    it('refuses a redirect whose page belongs to ANOTHER community', async () => {
      const slugTag = seed.runTag.replace(/_/g, '-');
      await expect(
        db.insert(sitePageRedirects).values({
          communityId: seed.communityAId,
          fromSlug: `cross-tenant-${slugTag}`,
          pageId: publishedPageBId,
        }),
      ).rejects.toThrow();
    });

    it('cascades block deletion when a page is deleted', async () => {
      const slugTag = seed.runTag.replace(/_/g, '-');
      const [page] = await db
        .insert(sitePages)
        .values({
          communityId: seed.communityAId,
          name: `Cascade ${seed.runTag}`,
          slug: `cascade-${slugTag}`,
        })
        .returning({ id: sitePages.id });
      if (!page) throw new Error('Failed to seed cascade page');

      const [block] = await db
        .insert(siteBlocks)
        .values({
          communityId: seed.communityAId,
          pageId: page.id,
          blockOrder: orderBase + 2,
          blockType: 'text',
          content: { runTag: seed.runTag },
          isDraft: true,
        })
        .returning({ id: siteBlocks.id });
      const [redirect] = await db
        .insert(sitePageRedirects)
        .values({
          communityId: seed.communityAId,
          fromSlug: `cascade-old-${slugTag}`,
          pageId: page.id,
        })
        .returning({ id: sitePageRedirects.id });
      if (!block || !redirect) throw new Error('Failed to seed cascade children');

      await db.delete(sitePages).where(inArray(sitePages.id, [page.id]));

      const remainingBlocks = await adminSql<{ id: number }[]>`
        select id from public.site_blocks where id = ${block.id}
      `;
      const remainingRedirects = await adminSql<{ id: number }[]>`
        select id from public.site_page_redirects where id = ${redirect.id}
      `;
      expect(remainingBlocks).toHaveLength(0);
      expect(remainingRedirects).toHaveLength(0);
    });
  });
});
