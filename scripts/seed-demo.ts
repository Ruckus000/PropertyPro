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
): Promise<string> {
  const normalizedEmail = email.toLowerCase();
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existing[0]) {
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

  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    email: normalizedEmail,
    fullName,
    phone,
  });
  return userId;
}

async function ensureAuthUser(
  email: string,
  fullName: string,
  password: string,
): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return;
  }

  const admin = createAdminClient();
  const createResult = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (!createResult.error) return;

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
      return;
    }
    if (listed.data.users.length < perPage) {
      break;
    }
    page += 1;
  }
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

async function seedApartmentUnits(communityId: number): Promise<number[]> {
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

  return unitIds;
}

async function seedApartmentLeases(
  communityId: number,
  unitIds: number[],
  tenantUserIds: string[],
): Promise<void> {
  const now = new Date();
  const today = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  function formatDate(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }

  const leaseData: Array<{
    unitId: number;
    residentId: string;
    startDate: string;
    endDate: string;
    rentAmount: string;
    status: 'active';
  }> = [
    { unitId: unitIds[0]!, residentId: tenantUserIds[0]!, startDate: formatDate(addDays(today, -365)), endDate: formatDate(addDays(today, 15)), rentAmount: '1250.00', status: 'active' },
    { unitId: unitIds[1]!, residentId: tenantUserIds[1]!, startDate: formatDate(addDays(today, -200)), endDate: formatDate(addDays(today, 25)), rentAmount: '1300.00', status: 'active' },
    { unitId: unitIds[2]!, residentId: tenantUserIds[2]!, startDate: formatDate(addDays(today, -180)), endDate: formatDate(addDays(today, 45)), rentAmount: '1275.00', status: 'active' },
    { unitId: unitIds[3]!, residentId: tenantUserIds[3]!, startDate: formatDate(addDays(today, -150)), endDate: formatDate(addDays(today, 50)), rentAmount: '1350.00', status: 'active' },
    { unitId: unitIds[4]!, residentId: tenantUserIds[4]!, startDate: formatDate(addDays(today, -120)), endDate: formatDate(addDays(today, 70)), rentAmount: '1200.00', status: 'active' },
    { unitId: unitIds[5]!, residentId: tenantUserIds[5]!, startDate: formatDate(addDays(today, -90)), endDate: formatDate(addDays(today, 75)), rentAmount: '1400.00', status: 'active' },
    { unitId: unitIds[6]!, residentId: tenantUserIds[6]!, startDate: formatDate(addDays(today, -60)), endDate: formatDate(addDays(today, 90)), rentAmount: '1325.00', status: 'active' },
    { unitId: unitIds[7]!, residentId: tenantUserIds[7]!, startDate: formatDate(addDays(today, -45)), endDate: formatDate(addDays(today, 105)), rentAmount: '1375.00', status: 'active' },
    { unitId: unitIds[8]!, residentId: tenantUserIds[8]!, startDate: formatDate(addDays(today, -30)), endDate: formatDate(addDays(today, 120)), rentAmount: '1225.00', status: 'active' },
    { unitId: unitIds[9]!, residentId: tenantUserIds[9]!, startDate: formatDate(addDays(today, -15)), endDate: formatDate(addDays(today, 135)), rentAmount: '1450.00', status: 'active' },
    { unitId: unitIds[10]!, residentId: tenantUserIds[10]!, startDate: formatDate(addDays(today, -300)), endDate: formatDate(addDays(today, 150)), rentAmount: '1500.00', status: 'active' },
    { unitId: unitIds[11]!, residentId: tenantUserIds[11]!, startDate: formatDate(addDays(today, -250)), endDate: formatDate(addDays(today, 160)), rentAmount: '1425.00', status: 'active' },
    { unitId: unitIds[12]!, residentId: tenantUserIds[12]!, startDate: formatDate(addDays(today, -220)), endDate: formatDate(addDays(today, 165)), rentAmount: '1475.00', status: 'active' },
    { unitId: unitIds[13]!, residentId: tenantUserIds[13]!, startDate: formatDate(addDays(today, -190)), endDate: formatDate(addDays(today, 170)), rentAmount: '1550.00', status: 'active' },
    { unitId: unitIds[14]!, residentId: tenantUserIds[14]!, startDate: formatDate(addDays(today, -160)), endDate: formatDate(addDays(today, 180)), rentAmount: '1600.00', status: 'active' },
  ];

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
  submitterIds: string[],
): Promise<void> {
  const requestData: Array<{
    seedKey: string;
    unitId: number;
    submittedById: string;
    title: string;
    description: string;
    status: 'open' | 'in_progress' | 'resolved' | 'closed';
    priority: 'low' | 'normal' | 'high' | 'urgent';
  }> = [
    { seedKey: 'apt-maint-1', unitId: unitIds[0]!, submittedById: submitterIds[0]!, title: 'Leaking faucet in kitchen', description: 'Kitchen sink faucet is dripping continuously.', status: 'open', priority: 'normal' },
    { seedKey: 'apt-maint-2', unitId: unitIds[1]!, submittedById: submitterIds[1]!, title: 'AC not cooling properly', description: 'Air conditioner is running but not cooling the unit.', status: 'in_progress', priority: 'high' },
    { seedKey: 'apt-maint-3', unitId: unitIds[2]!, submittedById: submitterIds[2]!, title: 'Broken window latch', description: 'Bedroom window latch is broken and won\'t close securely.', status: 'open', priority: 'normal' },
    { seedKey: 'apt-maint-4', unitId: unitIds[3]!, submittedById: submitterIds[3]!, title: 'Dishwasher not draining', description: 'Dishwasher leaves standing water after cycle.', status: 'resolved', priority: 'normal' },
    { seedKey: 'apt-maint-5', unitId: unitIds[4]!, submittedById: submitterIds[4]!, title: 'Light fixture flickering', description: 'Living room ceiling light flickers intermittently.', status: 'in_progress', priority: 'low' },
    { seedKey: 'apt-maint-6', unitId: unitIds[5]!, submittedById: submitterIds[5]!, title: 'Garbage disposal jammed', description: 'Garbage disposal is stuck and making grinding noise.', status: 'open', priority: 'normal' },
    { seedKey: 'apt-maint-7', unitId: unitIds[6]!, submittedById: submitterIds[6]!, title: 'Water heater issue', description: 'Hot water runs out very quickly.', status: 'in_progress', priority: 'high' },
    { seedKey: 'apt-maint-8', unitId: unitIds[7]!, submittedById: submitterIds[7]!, title: 'Carpet stain removal', description: 'Need professional carpet cleaning for bedroom.', status: 'closed', priority: 'low' },
    { seedKey: 'apt-maint-9', unitId: unitIds[8]!, submittedById: submitterIds[8]!, title: 'Door lock sticking', description: 'Front door lock is difficult to turn.', status: 'open', priority: 'normal' },
  ];

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
    throw new Error('Missing required apartment tenant users');
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
    { communityId: sunsetRidgeCommunityId, userId: tenantId, role: 'tenant' },
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

  const apartmentUnitIds = await seedApartmentUnits(sunsetRidgeCommunityId);
  debugSeed('apartment units seeded');

  await seedApartmentLeases(sunsetRidgeCommunityId, apartmentUnitIds, apartmentTenantIds);

  const maintenanceSubmitterIds = [...apartmentTenantIds.slice(0, 9)];
  await seedApartmentMaintenanceRequests(sunsetRidgeCommunityId, apartmentUnitIds, maintenanceSubmitterIds);

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
    const userId = await ensureUser(user.email, user.fullName, user.phone);
    userIdsByEmail[user.email] = userId;
    if (syncAuthUsers) {
      await ensureAuthUser(user.email, user.fullName, DEFAULT_PASSWORD);
    }
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
