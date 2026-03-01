import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { and, eq, sql } from '@propertypro/db/filters';
import {
  announcements,
  communities,
  complianceChecklistItems,
  demoSeedRegistry,
  documentCategories,
  documents,
  leases,
  maintenanceRequests,
  meetingDocuments,
  meetings,
  notificationPreferences,
  units,
  users,
} from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { getComplianceTemplate } from '../packages/shared/src/compliance/templates';
import { DEMO_COMMUNITIES, DEMO_USERS } from './config/demo-data';

const db = createUnscopedClient();

type CanonicalRole =
  | 'owner'
  | 'tenant'
  | 'board_member'
  | 'board_president'
  | 'cam'
  | 'site_manager'
  | 'property_manager_admin';

interface SeedContext {
  communityIds: Record<string, number>;
  userIdsByEmail: Record<string, string>;
}

interface DemoSeedOptions {
  syncAuthUsers?: boolean;
}

type DemoDocumentCategoryKey =
  | 'declaration'
  | 'rules'
  | 'inspection_reports'
  | 'meeting_minutes'
  | 'announcements'
  | 'maintenance_records'
  | 'lease_docs'
  | 'community_handbook'
  | 'move_in_out_docs';

interface DemoCategoryDefinition {
  key: DemoDocumentCategoryKey;
  name: string;
  description: string;
}

const DEFAULT_PASSWORD = process.env.DEMO_DEFAULT_PASSWORD ?? 'DemoPass123!';
const DEBUG_DEMO_SEED = process.env.DEBUG_DEMO_SEED === '1';
let cachedUserRoleLabels: Set<string> | null = null;
let cachedRegistryAvailable: boolean | null = null;

const ROLE_FALLBACK_ORDER: Record<CanonicalRole, string[]> = {
  owner: ['owner', 'resident', 'manager', 'admin'],
  tenant: ['tenant', 'resident', 'manager', 'admin'],
  board_member: ['board_member', 'manager', 'admin', 'resident'],
  board_president: ['board_president', 'board_member', 'manager', 'admin', 'resident'],
  cam: ['cam', 'manager', 'admin', 'resident'],
  site_manager: ['site_manager', 'manager', 'admin', 'resident'],
  property_manager_admin: ['property_manager_admin', 'admin', 'manager', 'resident'],
};

function debugSeed(message: string): void {
  if (DEBUG_DEMO_SEED) {
    // eslint-disable-next-line no-console
    console.log(`[seed-demo] ${message}`);
  }
}

async function getUserRoleLabels(): Promise<Set<string>> {
  if (cachedUserRoleLabels) {
    return cachedUserRoleLabels;
  }

  const result = await db.execute<{ enumlabel: string }>(sql`
    select e.enumlabel
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'user_role'
    order by e.enumsortorder
  `);
  const rows = Array.isArray(result)
    ? result
    : ('rows' in result ? result.rows : []);
  cachedUserRoleLabels = new Set(rows.map((row) => row.enumlabel));
  return cachedUserRoleLabels;
}

async function resolvePersistedRole(role: CanonicalRole): Promise<string> {
  const labels = await getUserRoleLabels();
  const candidates = ROLE_FALLBACK_ORDER[role];

  for (const candidate of candidates) {
    if (labels.has(candidate)) {
      return candidate;
    }
  }

  throw new Error(`No compatible user_role enum label found for canonical role "${role}"`);
}

async function hasRegistryTable(): Promise<boolean> {
  if (cachedRegistryAvailable !== null) {
    return cachedRegistryAvailable;
  }

  const result = await db.execute<{ exists: boolean }>(sql`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public' and table_name = 'demo_seed_registry'
    ) as exists
  `);
  const rows = Array.isArray(result)
    ? result
    : ('rows' in result ? result.rows : []);
  cachedRegistryAvailable = rows[0]?.exists === true;
  return cachedRegistryAvailable;
}

async function ensureCommunity(record: (typeof DEMO_COMMUNITIES)[number]): Promise<number> {
  const existing = await db
    .select()
    .from(communities)
    .where(eq(communities.slug, record.slug))
    .limit(1);

  if (existing[0]) {
    const [updated] = await db
      .update(communities)
      .set({
        name: record.name,
        communityType: record.communityType,
        timezone: record.timezone,
        addressLine1: record.addressLine1,
        city: record.city,
        state: record.state,
        zipCode: record.zipCode,
        updatedAt: new Date(),
      })
      .where(eq(communities.id, existing[0].id))
      .returning();
    return updated!.id;
  }

  const [created] = await db
    .insert(communities)
    .values({
      name: record.name,
      slug: record.slug,
      communityType: record.communityType,
      timezone: record.timezone,
      addressLine1: record.addressLine1,
      city: record.city,
      state: record.state,
      zipCode: record.zipCode,
    })
    .returning();

  return created!.id;
}

async function ensureUser(
  email: string,
  fullName: string,
  phone: string,
  /** When provided (from auth.users), use this as the public.users ID to keep them in sync. */
  preferredId?: string,
): Promise<string> {
  const normalizedEmail = email.toLowerCase();
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existing[0]) {
    // If the auth user ID differs from public.users.id, update the public ID to match.
    // This reconciles any previous mismatch caused by independent ID generation.
    // Strategy: delete the stale public.users row (FK-referencing rows are cleaned up
    // by cascade or manual deletion), then re-insert with the correct ID.
    // The seed script re-creates all dependent data (roles, documents, etc.) afterward.
    if (preferredId && existing[0].id !== preferredId) {
      debugSeed(`syncing public.users.id for ${normalizedEmail}: ${existing[0].id} → ${preferredId}`);
      const oldId = existing[0].id;
      // Delete FK-referencing rows that use ON DELETE RESTRICT (would block cascade).
      // Only delete rows referencing the old user via RESTRICT FKs.
      // SET NULL FKs (documents.uploaded_by, maintenance_requests.assigned_to_id,
      // units.owner_user_id) are handled automatically by PostgreSQL.
      const restrictFkDeletes: Array<ReturnType<typeof sql>> = [
        sql`DELETE FROM maintenance_comments WHERE user_id = ${oldId}`,
        sql`DELETE FROM maintenance_requests WHERE submitted_by_id = ${oldId}`,
        sql`DELETE FROM leases WHERE resident_id = ${oldId}`,
        sql`DELETE FROM announcements WHERE published_by = ${oldId}`,
        sql`DELETE FROM compliance_audit_log WHERE user_id = ${oldId}`,
        sql`DELETE FROM contracts WHERE created_by = ${oldId}`,
        sql`DELETE FROM contract_bids WHERE created_by = ${oldId}`,
        sql`DELETE FROM invitations WHERE invited_by = ${oldId}`,
      ];
      for (const stmt of restrictFkDeletes) {
        await db.execute(stmt);
      }
      // Now delete the old users row (CASCADE FKs: user_roles,
      // notification_preferences, notification_digest_queue, invitations.user_id,
      // announcement_delivery_log; SET NULL FKs nullified automatically)
      await db.execute(sql`DELETE FROM public.users WHERE id = ${oldId}`);
      // Re-insert with the correct auth user ID
      await db.insert(users).values({
        id: preferredId,
        email: normalizedEmail,
        fullName,
        phone,
      });
      return preferredId;
    }
    await db
      .update(users)
      .set({
        fullName,
        phone,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing[0].id));
    return existing[0].id;
  }

  const userId = preferredId ?? randomUUID();
  await db.insert(users).values({
    id: userId,
    email: normalizedEmail,
    fullName,
    phone,
  });
  return userId;
}

/**
 * Create or update an auth.users entry and return its ID.
 * Returns `null` when Supabase env vars are missing (e.g. CI without a live DB).
 */
async function ensureAuthUser(
  email: string,
  fullName: string,
  password: string,
): Promise<string | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return null;
  }

  const admin = createAdminClient();
  const createResult = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (!createResult.error) {
    return createResult.data.user.id;
  }

  const message = createResult.error.message.toLowerCase();
  const duplicate = message.includes('already') || message.includes('exists');
  if (!duplicate) {
    throw createResult.error;
  }

  let page = 1;
  const perPage = 200;
  while (page <= 20) {
    const listed = await admin.auth.admin.listUsers({ page, perPage });
    if (listed.error) {
      throw listed.error;
    }
    const matched = listed.data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (matched) {
      await admin.auth.admin.updateUserById(matched.id, {
        password,
        user_metadata: { ...(matched.user_metadata ?? {}), full_name: fullName },
      });
      return matched.id;
    }
    if (listed.data.users.length < perPage) {
      break;
    }
    page += 1;
  }

  return null;
}

async function seedRoles(
  assignments: Array<{ communityId: number; userId: string; role: CanonicalRole }>,
): Promise<void> {
  if (assignments.length === 0) {
    return;
  }

  const persistedAssignments: Array<{ communityId: number; userId: string; role: string }> = [];
  for (const assignment of assignments) {
    persistedAssignments.push({
      communityId: assignment.communityId,
      userId: assignment.userId,
      role: await resolvePersistedRole(assignment.role),
    });
  }

  const uniqueCommunityIds = [...new Set(persistedAssignments.map((assignment) => assignment.communityId))];
  const uniqueUserIds = [...new Set(persistedAssignments.map((assignment) => assignment.userId))];

  await db.execute(sql`
    delete from user_roles
    where community_id in (${sql.join(uniqueCommunityIds.map((id) => sql`${id}`), sql`, `)})
      and user_id in (${sql.join(uniqueUserIds.map((id) => sql`${id}`), sql`, `)})
  `);

  const values = sql.join(
    persistedAssignments.map((assignment) => sql`(${assignment.userId}, ${assignment.communityId}, ${assignment.role})`),
    sql`, `,
  );
  await db.execute(sql`
    insert into user_roles (user_id, community_id, role)
    values ${values}
  `);
}

async function ensureNotificationPreference(communityId: number, userId: string): Promise<void> {
  const existing = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.communityId, communityId),
        eq(notificationPreferences.userId, userId),
      ),
    )
    .limit(1);

  if (!existing[0]) {
    await db.insert(notificationPreferences).values({ communityId, userId });
    return;
  }

  await db
    .update(notificationPreferences)
    .set({
      emailAnnouncements: true,
      emailMeetings: true,
      updatedAt: new Date(),
    })
    .where(eq(notificationPreferences.id, existing[0].id));
}

async function lookupRegistry(entityType: string, seedKey: string): Promise<string | null> {
  if (!(await hasRegistryTable())) {
    return null;
  }

  const rows = await db
    .select()
    .from(demoSeedRegistry)
    .where(and(eq(demoSeedRegistry.entityType, entityType), eq(demoSeedRegistry.seedKey, seedKey)))
    .limit(1);
  return rows[0]?.entityId ?? null;
}

async function upsertRegistryEntry(
  entityType: string,
  seedKey: string,
  entityId: string,
  communityId: number,
): Promise<void> {
  if (!(await hasRegistryTable())) {
    return;
  }

  const existing = await db
    .select()
    .from(demoSeedRegistry)
    .where(and(eq(demoSeedRegistry.entityType, entityType), eq(demoSeedRegistry.seedKey, seedKey)))
    .limit(1);

  if (!existing[0]) {
    await db.insert(demoSeedRegistry).values({ entityType, seedKey, entityId, communityId });
    return;
  }

  await db
    .update(demoSeedRegistry)
    .set({ entityId, communityId })
    .where(eq(demoSeedRegistry.id, existing[0].id));
}

function getDemoCategoryDefinitions(
  communityType: 'condo_718' | 'hoa_720' | 'apartment',
): DemoCategoryDefinition[] {
  if (communityType === 'apartment') {
    return [
      {
        key: 'rules',
        name: 'Rules',
        description: 'Community rules and policy updates.',
      },
      {
        key: 'announcements',
        name: 'Announcements',
        description: 'Building-wide notices and updates.',
      },
      {
        key: 'maintenance_records',
        name: 'Maintenance Records',
        description: 'Operational maintenance and work order records.',
      },
      {
        key: 'lease_docs',
        name: 'Lease Docs',
        description: 'Lease agreements and related lease forms.',
      },
      {
        key: 'community_handbook',
        name: 'Community Handbook',
        description: 'Resident handbook and onboarding materials.',
      },
      {
        key: 'move_in_out_docs',
        name: 'Move In/Out Docs',
        description: 'Move-in and move-out instructions and forms.',
      },
    ];
  }

  return [
    {
      key: 'declaration',
      name: 'Declaration',
      description: 'Governing declaration and related amendments.',
    },
    {
      key: 'rules',
      name: 'Rules & Regulations',
      description: 'Rules, regulations, and published policy updates.',
    },
    {
      key: 'inspection_reports',
      name: 'Inspection Reports',
      description: 'Safety and statutory inspection documentation.',
    },
    {
      key: 'meeting_minutes',
      name: 'Meeting Minutes',
      description: 'Board and owner meeting minutes and packets.',
    },
    {
      key: 'announcements',
      name: 'Announcements',
      description: 'Community announcements and notice records.',
    },
  ];
}

async function seedDocumentCategories(
  communityId: number,
  communityType: 'condo_718' | 'hoa_720' | 'apartment',
): Promise<Record<DemoDocumentCategoryKey, number | undefined>> {
  const definitions = getDemoCategoryDefinitions(communityType);
  const categoryIds: Record<DemoDocumentCategoryKey, number | undefined> = {
    declaration: undefined,
    rules: undefined,
    inspection_reports: undefined,
    meeting_minutes: undefined,
    announcements: undefined,
    maintenance_records: undefined,
    lease_docs: undefined,
    community_handbook: undefined,
    move_in_out_docs: undefined,
  };

  for (const definition of definitions) {
    const existing = await db
      .select({ id: documentCategories.id })
      .from(documentCategories)
      .where(
        and(
          eq(documentCategories.communityId, communityId),
          eq(documentCategories.name, definition.name),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(documentCategories)
        .set({
          description: definition.description,
          isSystem: true,
          updatedAt: new Date(),
        })
        .where(eq(documentCategories.id, existing[0].id));
      categoryIds[definition.key] = existing[0].id;
      continue;
    }

    const [created] = await db
      .insert(documentCategories)
      .values({
        communityId,
        name: definition.name,
        description: definition.description,
        isSystem: true,
      })
      .returning({ id: documentCategories.id });

    categoryIds[definition.key] = created?.id;
  }

  return categoryIds;
}

async function seedRegistryDocument(
  communityId: number,
  seedKey: string,
  title: string,
  fileName: string,
  searchText: string,
  categoryId: number | null = null,
): Promise<number> {
  const registryEntityId = await lookupRegistry('document', seedKey);
  if (registryEntityId) {
    const id = Number(registryEntityId);
    const [updated] = await db
      .update(documents)
      .set({
        title,
        fileName,
        filePath: `demo/${communityId}/${seedKey}/${fileName}`,
        mimeType: 'application/pdf',
        fileSize: 1024,
        searchText,
        categoryId,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, id))
      .returning();
    if (updated) return updated.id;
  }

  if (!(await hasRegistryTable())) {
    const existing = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.communityId, communityId), eq(documents.fileName, fileName)))
      .limit(1);

    if (existing[0]) {
      const [updated] = await db
        .update(documents)
        .set({
          title,
          fileName,
          filePath: `demo/${communityId}/${seedKey}/${fileName}`,
          mimeType: 'application/pdf',
          fileSize: 1024,
          searchText,
          categoryId,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, existing[0].id))
        .returning();
      if (updated) return updated.id;
    }
  }

  const [created] = await db
    .insert(documents)
    .values({
      communityId,
      title,
      fileName,
      filePath: `demo/${communityId}/${seedKey}/${fileName}`,
      mimeType: 'application/pdf',
      fileSize: 1024,
      searchText,
      categoryId,
    })
    .returning();

  await upsertRegistryEntry('document', seedKey, String(created!.id), communityId);
  return created!.id;
}

async function seedRegistryMeeting(
  communityId: number,
  seedKey: string,
  title: string,
  meetingType: string,
  startsAt: Date,
  location: string,
): Promise<number> {
  const registryEntityId = await lookupRegistry('meeting', seedKey);
  if (registryEntityId) {
    const id = Number(registryEntityId);
    const [updated] = await db
      .update(meetings)
      .set({
        title,
        meetingType,
        startsAt,
        location,
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, id))
      .returning();
    if (updated) return updated.id;
  }

  if (!(await hasRegistryTable())) {
    const existing = await db
      .select({ id: meetings.id })
      .from(meetings)
      .where(and(eq(meetings.communityId, communityId), eq(meetings.title, title)))
      .limit(1);

    if (existing[0]) {
      const [updated] = await db
        .update(meetings)
        .set({
          title,
          meetingType,
          startsAt,
          location,
          updatedAt: new Date(),
        })
        .where(eq(meetings.id, existing[0].id))
        .returning();
      if (updated) return updated.id;
    }
  }

  const [created] = await db
    .insert(meetings)
    .values({
      communityId,
      title,
      meetingType,
      startsAt,
      location,
    })
    .returning();

  await upsertRegistryEntry('meeting', seedKey, String(created!.id), communityId);
  return created!.id;
}

async function seedRegistryAnnouncement(
  communityId: number,
  seedKey: string,
  title: string,
  body: string,
  publishedBy: string,
  audience: string = 'all',
  isPinned = false,
): Promise<number> {
  const registryEntityId = await lookupRegistry('announcement', seedKey);
  if (registryEntityId) {
    const id = Number(registryEntityId);
    const [updated] = await db
      .update(announcements)
      .set({
        title,
        body,
        publishedBy,
        audience,
        isPinned,
        archivedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(announcements.id, id))
      .returning();
    if (updated) return updated.id;
  }

  if (!(await hasRegistryTable())) {
    const existing = await db
      .select({ id: announcements.id })
      .from(announcements)
      .where(and(eq(announcements.communityId, communityId), eq(announcements.title, title)))
      .limit(1);

    if (existing[0]) {
      const [updated] = await db
        .update(announcements)
        .set({
          title,
          body,
          publishedBy,
          audience,
          isPinned,
          archivedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(announcements.id, existing[0].id))
        .returning();
      if (updated) return updated.id;
    }
  }

  const [created] = await db
    .insert(announcements)
    .values({
      communityId,
      title,
      body,
      publishedBy,
      audience,
      isPinned,
    })
    .returning();

  await upsertRegistryEntry('announcement', seedKey, String(created!.id), communityId);
  return created!.id;
}

async function seedCommunityCompliance(communityId: number, communityType: 'condo_718' | 'hoa_720' | 'apartment'): Promise<void> {
  const template = getComplianceTemplate(communityType);
  if (template.length === 0) {
    await db
      .delete(complianceChecklistItems)
      .where(eq(complianceChecklistItems.communityId, communityId));
    return;
  }

  const existingRows = await db
    .select({
      id: complianceChecklistItems.id,
      templateKey: complianceChecklistItems.templateKey,
      title: complianceChecklistItems.title,
      description: complianceChecklistItems.description,
      category: complianceChecklistItems.category,
      statuteReference: complianceChecklistItems.statuteReference,
    })
    .from(complianceChecklistItems)
    .where(eq(complianceChecklistItems.communityId, communityId));
  const existingByKey = new Map(existingRows.map((row) => [row.templateKey, row]));
  const inserts: Array<typeof complianceChecklistItems.$inferInsert> = [];

  for (const item of template) {
    const existing = existingByKey.get(item.templateKey);

    if (!existing) {
      inserts.push({
        communityId,
        templateKey: item.templateKey,
        title: item.title,
        description: item.description,
        category: item.category,
        statuteReference: item.statuteReference,
      });
      continue;
    }

    const changed = existing.title !== item.title
      || existing.description !== item.description
      || existing.category !== item.category
      || (existing.statuteReference ?? null) !== (item.statuteReference ?? null);
    if (!changed) {
      continue;
    }

    await db
      .update(complianceChecklistItems)
      .set({
        title: item.title,
        description: item.description,
        category: item.category,
        statuteReference: item.statuteReference,
        updatedAt: new Date(),
      })
      .where(eq(complianceChecklistItems.id, existing.id));
  }

  if (inserts.length > 0) {
    await db.insert(complianceChecklistItems).values(inserts);
  }
}

async function seedApartmentUnits(communityId: number): Promise<{ unitIds: number[]; unitNumbers: string[] }> {
  const unitNumbers = [
    '101', '102', '103', '104', '105', '106',
    '201', '202', '203', '204', '205', '206',
    '301', '302', '303', '304', '305', '306',
    '401', '402', '403', '404',
  ];

  const unitIds: number[] = [];

  for (const unitNumber of unitNumbers) {
    const existing = await db
      .select({ id: units.id })
      .from(units)
      .where(
        and(
          eq(units.communityId, communityId),
          eq(units.unitNumber, unitNumber),
        ),
      )
      .limit(1);

    if (existing[0]) {
      unitIds.push(existing[0].id);
      continue;
    }

    const [created] = await db
      .insert(units)
      .values({
        communityId,
        unitNumber,
      })
      .returning({ id: units.id });

    unitIds.push(created!.id);
  }

  return { unitIds, unitNumbers };
}

async function seedApartmentLeases(
  communityId: number,
  unitIds: number[],
  unitNumbers: string[],
  context: SeedContext,
): Promise<void> {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  function formatDate(date: Date): string {
    return date.toISOString().split('T')[0]!;
  }

  function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }

  // Declarative lease configuration
  const leaseConfigs: Array<{
    unitNumber: string;
    tenantEmail: string;
    rentAmount: string;
    leaseStartDays: number;
    leaseEndDays: number;
  }> = [
    { unitNumber: '101', tenantEmail: 'tenant.apt101@sunsetridge.local', rentAmount: '1250.00', leaseStartDays: -365, leaseEndDays: 15 },
    { unitNumber: '102', tenantEmail: 'tenant.apt102@sunsetridge.local', rentAmount: '1300.00', leaseStartDays: -200, leaseEndDays: 25 },
    { unitNumber: '201', tenantEmail: 'tenant.apt201@sunsetridge.local', rentAmount: '1275.00', leaseStartDays: -180, leaseEndDays: 45 },
    { unitNumber: '202', tenantEmail: 'tenant.apt202@sunsetridge.local', rentAmount: '1350.00', leaseStartDays: -150, leaseEndDays: 50 },
    { unitNumber: '301', tenantEmail: 'tenant.apt301@sunsetridge.local', rentAmount: '1200.00', leaseStartDays: -120, leaseEndDays: 70 },
    { unitNumber: '302', tenantEmail: 'tenant.apt302@sunsetridge.local', rentAmount: '1400.00', leaseStartDays: -90, leaseEndDays: 75 },
    { unitNumber: '103', tenantEmail: 'tenant.apt103@sunsetridge.local', rentAmount: '1325.00', leaseStartDays: -60, leaseEndDays: 90 },
    { unitNumber: '104', tenantEmail: 'tenant.apt104@sunsetridge.local', rentAmount: '1375.00', leaseStartDays: -45, leaseEndDays: 105 },
    { unitNumber: '105', tenantEmail: 'tenant.apt105@sunsetridge.local', rentAmount: '1225.00', leaseStartDays: -30, leaseEndDays: 120 },
    { unitNumber: '106', tenantEmail: 'tenant.apt106@sunsetridge.local', rentAmount: '1450.00', leaseStartDays: -15, leaseEndDays: 135 },
    { unitNumber: '203', tenantEmail: 'tenant.apt203@sunsetridge.local', rentAmount: '1500.00', leaseStartDays: -300, leaseEndDays: 150 },
    { unitNumber: '204', tenantEmail: 'tenant.apt204@sunsetridge.local', rentAmount: '1425.00', leaseStartDays: -250, leaseEndDays: 160 },
    { unitNumber: '205', tenantEmail: 'tenant.apt205@sunsetridge.local', rentAmount: '1475.00', leaseStartDays: -220, leaseEndDays: 165 },
    { unitNumber: '206', tenantEmail: 'tenant.apt206@sunsetridge.local', rentAmount: '1550.00', leaseStartDays: -190, leaseEndDays: 170 },
    { unitNumber: '303', tenantEmail: 'tenant.apt303@sunsetridge.local', rentAmount: '1600.00', leaseStartDays: -160, leaseEndDays: 180 },
  ];

  // Map configs to lease data with validation
  const leaseData = leaseConfigs.map(config => {
    const unitIndex = unitNumbers.indexOf(config.unitNumber);
    if (unitIndex === -1) {
      throw new Error(`Unit ${config.unitNumber} not found in seeded units`);
    }

    const unitId = unitIds[unitIndex];
    const residentId = context.userIdsByEmail[config.tenantEmail];

    if (!unitId) {
      throw new Error(`Unit ID missing for unit ${config.unitNumber} at index ${unitIndex}`);
    }
    if (!residentId) {
      throw new Error(`Tenant user ID missing for ${config.tenantEmail}`);
    }

    return {
      unitId,
      residentId,
      startDate: formatDate(addDays(today, config.leaseStartDays)),
      endDate: formatDate(addDays(today, config.leaseEndDays)),
      rentAmount: config.rentAmount,
      status: 'active' as const,
    };
  });

  for (const lease of leaseData) {
    const existing = await db
      .select({ id: leases.id })
      .from(leases)
      .where(
        and(
          eq(leases.communityId, communityId),
          eq(leases.unitId, lease.unitId),
          eq(leases.residentId, lease.residentId),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(leases)
        .set({
          startDate: lease.startDate,
          endDate: lease.endDate,
          rentAmount: lease.rentAmount,
          status: lease.status,
          updatedAt: new Date(),
        })
        .where(eq(leases.id, existing[0].id));
      continue;
    }

    await db.insert(leases).values({
      communityId,
      unitId: lease.unitId,
      residentId: lease.residentId,
      startDate: lease.startDate,
      endDate: lease.endDate,
      rentAmount: lease.rentAmount,
      status: lease.status,
    });
  }

  debugSeed('apartment leases seeded');
}

async function seedApartmentMaintenanceRequests(
  communityId: number,
  unitIds: number[],
  unitNumbers: string[],
  context: SeedContext,
): Promise<void> {
  // Declarative maintenance request configuration
  const requestConfigs: Array<{
    seedKey: string;
    unitNumber: string;
    submitterEmail: string;
    title: string;
    description: string;
    status: 'open' | 'in_progress' | 'resolved' | 'closed';
    priority: 'low' | 'normal' | 'high' | 'urgent';
  }> = [
    { seedKey: 'apt-maint-1', unitNumber: '101', submitterEmail: 'tenant.apt101@sunsetridge.local', title: 'Leaking faucet in kitchen', description: 'Kitchen sink faucet is dripping continuously.', status: 'open', priority: 'normal' },
    { seedKey: 'apt-maint-2', unitNumber: '102', submitterEmail: 'tenant.apt102@sunsetridge.local', title: 'AC not cooling properly', description: 'Air conditioner is running but not cooling the unit.', status: 'in_progress', priority: 'high' },
    { seedKey: 'apt-maint-3', unitNumber: '201', submitterEmail: 'tenant.apt201@sunsetridge.local', title: 'Broken window latch', description: 'Bedroom window latch is broken and won\'t close securely.', status: 'open', priority: 'normal' },
    { seedKey: 'apt-maint-4', unitNumber: '202', submitterEmail: 'tenant.apt202@sunsetridge.local', title: 'Dishwasher not draining', description: 'Dishwasher leaves standing water after cycle.', status: 'resolved', priority: 'normal' },
    { seedKey: 'apt-maint-5', unitNumber: '301', submitterEmail: 'tenant.apt301@sunsetridge.local', title: 'Light fixture flickering', description: 'Living room ceiling light flickers intermittently.', status: 'in_progress', priority: 'low' },
    { seedKey: 'apt-maint-6', unitNumber: '302', submitterEmail: 'tenant.apt302@sunsetridge.local', title: 'Garbage disposal jammed', description: 'Garbage disposal is stuck and making grinding noise.', status: 'open', priority: 'normal' },
    { seedKey: 'apt-maint-7', unitNumber: '103', submitterEmail: 'tenant.apt103@sunsetridge.local', title: 'Water heater issue', description: 'Hot water runs out very quickly.', status: 'in_progress', priority: 'high' },
    { seedKey: 'apt-maint-8', unitNumber: '104', submitterEmail: 'tenant.apt104@sunsetridge.local', title: 'Carpet stain removal', description: 'Need professional carpet cleaning for bedroom.', status: 'closed', priority: 'low' },
    { seedKey: 'apt-maint-9', unitNumber: '105', submitterEmail: 'tenant.apt105@sunsetridge.local', title: 'Door lock sticking', description: 'Front door lock is difficult to turn.', status: 'open', priority: 'normal' },
  ];

  // Map configs to request data with validation
  const requestData = requestConfigs.map(config => {
    const unitIndex = unitNumbers.indexOf(config.unitNumber);
    if (unitIndex === -1) {
      throw new Error(`Unit ${config.unitNumber} not found in seeded units`);
    }

    const unitId = unitIds[unitIndex];
    const submittedById = context.userIdsByEmail[config.submitterEmail];

    if (!unitId) {
      throw new Error(`Unit ID missing for unit ${config.unitNumber} at index ${unitIndex}`);
    }
    if (!submittedById) {
      throw new Error(`Submitter user ID missing for ${config.submitterEmail}`);
    }

    return {
      seedKey: config.seedKey,
      unitId,
      submittedById,
      title: config.title,
      description: config.description,
      status: config.status,
      priority: config.priority,
    };
  });

  for (const request of requestData) {
    const registryEntityId = await lookupRegistry('maintenance_request', request.seedKey);
    if (registryEntityId) {
      const id = Number(registryEntityId);
      await db
        .update(maintenanceRequests)
        .set({
          title: request.title,
          description: request.description,
          status: request.status,
          priority: request.priority,
          updatedAt: new Date(),
        })
        .where(eq(maintenanceRequests.id, id));
      continue;
    }

    const [created] = await db
      .insert(maintenanceRequests)
      .values({
        communityId,
        unitId: request.unitId,
        submittedById: request.submittedById,
        title: request.title,
        description: request.description,
        status: request.status,
        priority: request.priority,
      })
      .returning({ id: maintenanceRequests.id });

    await upsertRegistryEntry('maintenance_request', request.seedKey, String(created!.id), communityId);
  }

  debugSeed('apartment maintenance requests seeded');
}

/**
 * Seed a completed onboarding wizard state for a community.
 * Idempotent: does nothing if a state row already exists for the (communityId, wizardType) pair.
 */
async function seedWizardState(communityId: number, wizardType: string): Promise<void> {
  const maxStep = wizardType === 'condo' ? 2 : 3;
  await db.execute(sql`
    INSERT INTO onboarding_wizard_state (community_id, wizard_type, status, last_completed_step, step_data, completed_at)
    VALUES (${communityId}, ${wizardType}, 'completed', ${maxStep}, '{}', now())
    ON CONFLICT (community_id, wizard_type) DO NOTHING
  `);
}

async function seedCoreEntities(context: SeedContext): Promise<void> {
  const sunsetCommunityId = context.communityIds['sunset-condos'];
  const palmCommunityId = context.communityIds['palm-shores-hoa'];
  const sunsetRidgeCommunityId = context.communityIds['sunset-ridge-apartments'];
  if (!sunsetCommunityId || !palmCommunityId || !sunsetRidgeCommunityId) {
    throw new Error('Missing seeded community IDs');
  }

  const boardPresidentId = context.userIdsByEmail['board.president@sunset.local'];
  const boardMemberId = context.userIdsByEmail['board.member@sunset.local'];
  const ownerId = context.userIdsByEmail['owner.one@sunset.local'];
  const tenantId = context.userIdsByEmail['tenant.one@sunset.local'];
  const camId = context.userIdsByEmail['cam.one@sunset.local'];
  const pmAdminId = context.userIdsByEmail['pm.admin@sunset.local'];
  const siteManagerId = context.userIdsByEmail['site.manager@sunsetridge.local'];

  const apartmentTenantIds = [
    context.userIdsByEmail['tenant.apt101@sunsetridge.local'],
    context.userIdsByEmail['tenant.apt102@sunsetridge.local'],
    context.userIdsByEmail['tenant.apt201@sunsetridge.local'],
    context.userIdsByEmail['tenant.apt202@sunsetridge.local'],
    context.userIdsByEmail['tenant.apt301@sunsetridge.local'],
    context.userIdsByEmail['tenant.apt302@sunsetridge.local'],
    context.userIdsByEmail['tenant.apt103@sunsetridge.local'],
    context.userIdsByEmail['tenant.apt104@sunsetridge.local'],
    context.userIdsByEmail['tenant.apt105@sunsetridge.local'],
    context.userIdsByEmail['tenant.apt106@sunsetridge.local'],
    context.userIdsByEmail['tenant.apt203@sunsetridge.local'],
    context.userIdsByEmail['tenant.apt204@sunsetridge.local'],
    context.userIdsByEmail['tenant.apt205@sunsetridge.local'],
    context.userIdsByEmail['tenant.apt206@sunsetridge.local'],
    context.userIdsByEmail['tenant.apt303@sunsetridge.local'],
  ].filter((id): id is string => id != null);

  if (!boardPresidentId || !boardMemberId || !ownerId || !tenantId || !camId || !pmAdminId || !siteManagerId) {
    throw new Error('Missing required seeded users');
  }

  if (apartmentTenantIds.length < 15) {
    throw new Error(`Missing required apartment tenant users. Expected 15, got ${apartmentTenantIds.length}`);
  }

  await db
    .insert(units)
    .values({
      communityId: sunsetCommunityId,
      unitNumber: 'A-101',
    })
    .onConflictDoNothing();

  await seedRoles([
    { communityId: sunsetCommunityId, userId: boardPresidentId, role: 'board_president' },
    { communityId: sunsetCommunityId, userId: boardMemberId, role: 'board_member' },
    { communityId: sunsetCommunityId, userId: ownerId, role: 'owner' },
    { communityId: sunsetCommunityId, userId: tenantId, role: 'tenant' },
    { communityId: sunsetCommunityId, userId: camId, role: 'cam' },
    { communityId: sunsetCommunityId, userId: pmAdminId, role: 'property_manager_admin' },
    { communityId: palmCommunityId, userId: boardPresidentId, role: 'board_president' },
    { communityId: palmCommunityId, userId: ownerId, role: 'owner' },
    { communityId: palmCommunityId, userId: tenantId, role: 'tenant' },
    { communityId: palmCommunityId, userId: camId, role: 'cam' },
    { communityId: palmCommunityId, userId: pmAdminId, role: 'property_manager_admin' },
    { communityId: sunsetRidgeCommunityId, userId: apartmentTenantIds[0]!, role: 'tenant' },
    { communityId: sunsetRidgeCommunityId, userId: siteManagerId, role: 'site_manager' },
    { communityId: sunsetRidgeCommunityId, userId: pmAdminId, role: 'property_manager_admin' },
  ]);
  debugSeed('roles seeded');

  for (const communityId of [sunsetCommunityId, palmCommunityId, sunsetRidgeCommunityId]) {
    for (const userId of [boardPresidentId, boardMemberId, ownerId, tenantId, camId, pmAdminId, siteManagerId]) {
      await ensureNotificationPreference(communityId, userId);
    }
  }
  debugSeed('notification preferences seeded');

  const sunsetCategories = await seedDocumentCategories(sunsetCommunityId, 'condo_718');
  const palmCategories = await seedDocumentCategories(palmCommunityId, 'hoa_720');
  const sunsetRidgeCategories = await seedDocumentCategories(sunsetRidgeCommunityId, 'apartment');
  debugSeed('document categories seeded');

  const sunsetDoc = await seedRegistryDocument(
    sunsetCommunityId,
    'sunset-doc-bylaws',
    'Sunset Bylaws',
    'sunset-bylaws.pdf',
    'association bylaws governing documents',
    sunsetCategories.declaration ?? null,
  );
  const palmDoc = await seedRegistryDocument(
    palmCommunityId,
    'palm-doc-budget',
    'Palm HOA Budget',
    'palm-budget.pdf',
    'annual budget financial report',
    palmCategories.rules ?? null,
  );

  await seedRegistryDocument(
    sunsetRidgeCommunityId,
    'sunsetridge-doc-community-rules',
    'Community Rules',
    'sunsetridge-rules.pdf',
    'resident community rules and policies',
    sunsetRidgeCategories.rules ?? null,
  );
  const moveInDoc = await seedRegistryDocument(
    sunsetRidgeCommunityId,
    'sunsetridge-doc-move-in',
    'Move-In Instructions',
    'sunsetridge-move-in.pdf',
    'move-in procedures and checklist',
    sunsetRidgeCategories.move_in_out_docs ?? null,
  );
  const sunsetRidgeDoc = moveInDoc;

  const now = Date.now();
  const sunsetMeeting = await seedRegistryMeeting(
    sunsetCommunityId,
    'sunset-meeting-board-upcoming',
    'Sunset Board Meeting',
    'board',
    new Date(now + 14 * 24 * 60 * 60 * 1000),
    'Sunset Clubhouse',
  );
  const palmMeeting = await seedRegistryMeeting(
    palmCommunityId,
    'palm-meeting-annual-upcoming',
    'Palm Annual Meeting',
    'annual',
    new Date(now + 21 * 24 * 60 * 60 * 1000),
    'Palm Community Hall',
  );
  const sunsetRidgeMeeting = await seedRegistryMeeting(
    sunsetRidgeCommunityId,
    'sunsetridge-meeting-ops-upcoming',
    'Sunset Ridge Operations Briefing',
    'committee',
    new Date(now + 10 * 24 * 60 * 60 * 1000),
    'Sunset Ridge Leasing Office',
  );

  await seedRegistryAnnouncement(
    sunsetCommunityId,
    'sunset-announcement-pinned',
    'Pool Maintenance Notice',
    'Pool maintenance is scheduled for next week.',
    boardPresidentId,
    'all',
    true,
  );
  debugSeed('announcements seeded');
  await seedRegistryAnnouncement(
    palmCommunityId,
    'palm-announcement-general',
    'Landscape Update',
    'Landscaping work begins Monday.',
    boardPresidentId,
  );
  await seedRegistryAnnouncement(
    sunsetRidgeCommunityId,
    'sunsetridge-announcement-parking',
    'Parking Reminder',
    'Please update your parking decal by Friday.',
    siteManagerId,
    'tenants_only',
  );
  await seedRegistryAnnouncement(
    sunsetRidgeCommunityId,
    'sunsetridge-announcement-gym',
    'Fitness Center Hours Extended',
    'The fitness center will now be open from 5 AM to 11 PM daily.',
    siteManagerId,
    'all',
  );
  await seedRegistryAnnouncement(
    sunsetRidgeCommunityId,
    'sunsetridge-announcement-maintenance',
    'Scheduled Maintenance Window',
    'HVAC system maintenance scheduled for this Saturday 8 AM - 12 PM.',
    siteManagerId,
    'all',
  );
  await seedRegistryAnnouncement(
    sunsetRidgeCommunityId,
    'sunsetridge-announcement-package',
    'Package Delivery Update',
    'New secure package lockers installed in the main lobby.',
    siteManagerId,
    'all',
  );
  await seedRegistryAnnouncement(
    sunsetRidgeCommunityId,
    'sunsetridge-announcement-event',
    'Community BBQ Next Weekend',
    'Join us for a resident appreciation BBQ on Saturday at 4 PM by the pool.',
    siteManagerId,
    'all',
  );

  const meetingDocumentPairs: Array<{ meetingId: number; documentId: number; attachedBy: string }> = [
    { meetingId: sunsetMeeting, documentId: sunsetDoc, attachedBy: boardPresidentId },
    { meetingId: palmMeeting, documentId: palmDoc, attachedBy: boardPresidentId },
    { meetingId: sunsetRidgeMeeting, documentId: sunsetRidgeDoc, attachedBy: siteManagerId },
  ];

  for (const pair of meetingDocumentPairs) {
    const existing = await db
      .select()
      .from(meetingDocuments)
      .where(
        and(
          eq(meetingDocuments.meetingId, pair.meetingId),
          eq(meetingDocuments.documentId, pair.documentId),
        ),
      )
      .limit(1);
    if (!existing[0]) {
      await db.insert(meetingDocuments).values({
        meetingId: pair.meetingId,
        documentId: pair.documentId,
        attachedBy: pair.attachedBy,
        communityId:
          pair.meetingId === sunsetMeeting
            ? sunsetCommunityId
            : pair.meetingId === palmMeeting
              ? palmCommunityId
              : sunsetRidgeCommunityId,
      });
    }
  }
  debugSeed('meeting documents seeded');

  await seedCommunityCompliance(sunsetCommunityId, 'condo_718');
  debugSeed('sunset compliance seeded');
  await seedCommunityCompliance(palmCommunityId, 'hoa_720');
  debugSeed('palm compliance seeded');
  await seedCommunityCompliance(sunsetRidgeCommunityId, 'apartment');
  debugSeed('sunset ridge compliance seeded');

  // Seed completed onboarding wizard states so dashboards don't redirect to onboarding
  await seedWizardState(sunsetCommunityId, 'condo');
  await seedWizardState(palmCommunityId, 'condo');
  await seedWizardState(sunsetRidgeCommunityId, 'apartment');
  debugSeed('onboarding wizard states seeded');

  const { unitIds: apartmentUnitIds, unitNumbers: apartmentUnitNumbers } = await seedApartmentUnits(sunsetRidgeCommunityId);
  debugSeed('apartment units seeded');

  await seedApartmentLeases(sunsetRidgeCommunityId, apartmentUnitIds, apartmentUnitNumbers, context);

  await seedApartmentMaintenanceRequests(sunsetRidgeCommunityId, apartmentUnitIds, apartmentUnitNumbers, context);

  for (const tenantId of apartmentTenantIds) {
    await seedRoles([
      { communityId: sunsetRidgeCommunityId, userId: tenantId, role: 'tenant' },
    ]);
    await ensureNotificationPreference(sunsetRidgeCommunityId, tenantId);
  }
  debugSeed('apartment tenant roles and preferences seeded');
}

export async function runDemoSeed(options: DemoSeedOptions = {}): Promise<void> {
  const syncAuthUsers = options.syncAuthUsers ?? true;
  debugSeed(`runDemoSeed start (syncAuthUsers=${String(syncAuthUsers)})`);
  const communityIds: Record<string, number> = {};
  for (const community of DEMO_COMMUNITIES) {
    communityIds[community.slug] = await ensureCommunity(community);
  }
  debugSeed('communities seeded');

  const userIdsByEmail: Record<string, string> = {};
  for (const user of DEMO_USERS) {
    // Resolve auth user first so we can use its ID for public.users (keeps IDs in sync)
    const authUserId = syncAuthUsers
      ? await ensureAuthUser(user.email, user.fullName, DEFAULT_PASSWORD)
      : null;
    const userId = await ensureUser(user.email, user.fullName, user.phone, authUserId ?? undefined);
    userIdsByEmail[user.email] = userId;
  }
  debugSeed('users seeded');

  await seedCoreEntities({ communityIds, userIdsByEmail });
  debugSeed('runDemoSeed complete');
}

async function main(): Promise<void> {
  await runDemoSeed();
  // eslint-disable-next-line no-console
  console.log('Demo seed complete.');
}

const isEntrypoint = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isEntrypoint) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Demo seed failed:', error);
    process.exitCode = 1;
  });
}
