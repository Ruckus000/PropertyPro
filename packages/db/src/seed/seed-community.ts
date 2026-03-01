import { randomUUID } from 'node:crypto';
import { and, eq, sql } from '../filters';
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
} from '../schema';
import { createAdminClient } from '../supabase/admin';
import { createUnscopedClient } from '../unsafe';
import { getComplianceTemplate, type CommunityBranding, type CommunityType } from '@propertypro/shared';

const db = createUnscopedClient();

export interface SeedCommunityConfig {
  name: string;
  slug: string;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
  timezone?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  addressLine1?: string;
  branding?: CommunityBranding;
  isDemo?: boolean;
}

export interface SeedUserConfig {
  email: string;
  fullName: string;
  phone?: string;
  role: 'owner' | 'tenant' | 'board_member' | 'board_president' | 'cam' | 'site_manager' | 'property_manager_admin';
}

export interface SeedCommunityResult {
  communityId: number;
  users: Array<{ email: string; userId: string; role: string }>;
}

type CanonicalRole = SeedUserConfig['role'];

type WizardType = 'condo' | 'apartment';

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
const DAY_MS = 24 * 60 * 60 * 1000;

const ROLE_FALLBACK_ORDER: Record<CanonicalRole, string[]> = {
  owner: ['owner', 'resident', 'manager', 'admin'],
  tenant: ['tenant', 'resident', 'manager', 'admin'],
  board_member: ['board_member', 'manager', 'admin', 'resident'],
  board_president: ['board_president', 'board_member', 'manager', 'admin', 'resident'],
  cam: ['cam', 'manager', 'admin', 'resident'],
  site_manager: ['site_manager', 'manager', 'admin', 'resident'],
  property_manager_admin: ['property_manager_admin', 'admin', 'manager', 'resident'],
};

const ANNOUNCEMENT_AUTHOR_ROLES = new Set<CanonicalRole>([
  'board_member',
  'board_president',
  'cam',
  'site_manager',
  'property_manager_admin',
]);

const maxStepsByWizardType: Record<WizardType, number> = {
  condo: 2,
  apartment: 3,
};

let cachedUserRoleLabels: Set<string> | null = null;
let cachedRegistryAvailable: boolean | null = null;

interface SeededDocument {
  id: number;
  attachToMeeting: boolean;
}

function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  if (typeof result === 'object' && result !== null && 'rows' in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as T[]) : [];
  }

  return [];
}

function debugSeed(message: string): void {
  if (DEBUG_DEMO_SEED) {
    // eslint-disable-next-line no-console
    console.log(`[seed-community] ${message}`);
  }
}

function assertValidConfig(config: SeedCommunityConfig): void {
  if (!config.name?.trim()) {
    throw new Error('seedCommunity requires a non-empty config.name');
  }

  if (!config.slug?.trim()) {
    throw new Error('seedCommunity requires a non-empty config.slug');
  }

  if (!config.communityType) {
    throw new Error('seedCommunity requires config.communityType');
  }

  const validCommunityTypes: CommunityType[] = ['condo_718', 'hoa_720', 'apartment'];
  if (!validCommunityTypes.includes(config.communityType)) {
    throw new Error(`seedCommunity received invalid communityType: ${config.communityType}`);
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
  const rows = extractRows<{ enumlabel: string }>(result);
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
  const rows = extractRows<{ exists: boolean }>(result);
  cachedRegistryAvailable = rows[0]?.exists === true;
  return cachedRegistryAvailable;
}

async function ensureCommunity(config: SeedCommunityConfig): Promise<number> {
  const existing = await db
    .select()
    .from(communities)
    .where(eq(communities.slug, config.slug))
    .limit(1);

  const timezone = config.timezone ?? 'America/New_York';
  const isDemo = config.isDemo ?? false;

  if (existing[0]) {
    const updatePayload: Partial<typeof communities.$inferInsert> = {
      name: config.name,
      communityType: config.communityType,
      timezone,
      addressLine1: config.addressLine1,
      city: config.city,
      state: config.state,
      zipCode: config.zipCode,
      updatedAt: new Date(),
    };

    if (config.branding !== undefined) {
      updatePayload.branding = config.branding;
    }

    const [updated] = await db
      .update(communities)
      .set(updatePayload)
      .where(eq(communities.id, existing[0].id))
      .returning();

    debugSeed(`community upserted slug=${config.slug} id=${updated!.id} isDemo=${String(isDemo)}`);
    return updated!.id;
  }

  const [created] = await db
    .insert(communities)
    .values({
      name: config.name,
      slug: config.slug,
      communityType: config.communityType,
      timezone,
      addressLine1: config.addressLine1,
      city: config.city,
      state: config.state,
      zipCode: config.zipCode,
      branding: config.branding,
    })
    .returning();

  debugSeed(`community created slug=${config.slug} id=${created!.id} isDemo=${String(isDemo)}`);
  return created!.id;
}

async function ensureUser(
  email: string,
  fullName: string,
  phone?: string,
  preferredId?: string,
): Promise<string> {
  const normalizedEmail = email.toLowerCase();
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existing[0]) {
    if (preferredId && existing[0].id !== preferredId) {
      debugSeed(`syncing public.users.id for ${normalizedEmail}: ${existing[0].id} -> ${preferredId}`);
      const oldId = existing[0].id;

      const restrictFksResult = await db.execute<{ table_name: string; column_name: string }>(sql`
        SELECT tc.table_name, kcu.column_name
        FROM information_schema.referential_constraints AS rc
        JOIN information_schema.key_column_usage AS kcu
          ON rc.constraint_name = kcu.constraint_name
          AND rc.constraint_schema = kcu.table_schema
        JOIN information_schema.table_constraints AS tc
          ON tc.constraint_name = rc.constraint_name
          AND tc.table_schema = rc.constraint_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON rc.unique_constraint_name = ccu.constraint_name
          AND rc.unique_constraint_schema = ccu.table_schema
        WHERE rc.delete_rule = 'RESTRICT'
          AND ccu.table_name = 'users'
          AND ccu.column_name = 'id'
          AND tc.table_schema = 'public'
      `);
      const fks = extractRows<{ table_name: string; column_name: string }>(restrictFksResult);
      const restrictFkDeletes = fks.map(
        ({ table_name, column_name }) =>
          sql`DELETE FROM ${sql.identifier(table_name)} WHERE ${sql.identifier(column_name)} = ${oldId}`,
      );
      await db.transaction(async (tx) => {
        await Promise.all(restrictFkDeletes.map((stmt) => tx.execute(stmt)));
        await tx.execute(sql`DELETE FROM public.users WHERE id = ${oldId}`);
        await tx.insert(users).values({
          id: preferredId,
          email: normalizedEmail,
          fullName,
          phone,
        });
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

export async function seedRoles(
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

export async function ensureNotificationPreference(communityId: number, userId: string): Promise<void> {
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

async function seedCommunityCompliance(
  communityId: number,
  communityType: 'condo_718' | 'hoa_720' | 'apartment',
): Promise<void> {
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
  tenantUserIds: string[],
): Promise<void> {
  if (tenantUserIds.length === 0) {
    debugSeed('no tenant users supplied for apartment lease seeding');
    return;
  }

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

  const leaseBlueprints: Array<{
    unitNumber: string;
    rentAmount: string;
    leaseStartDays: number;
    leaseEndDays: number;
  }> = [
    { unitNumber: '101', rentAmount: '1250.00', leaseStartDays: -365, leaseEndDays: 15 },
    { unitNumber: '102', rentAmount: '1300.00', leaseStartDays: -200, leaseEndDays: 25 },
    { unitNumber: '201', rentAmount: '1275.00', leaseStartDays: -180, leaseEndDays: 45 },
    { unitNumber: '202', rentAmount: '1350.00', leaseStartDays: -150, leaseEndDays: 50 },
    { unitNumber: '301', rentAmount: '1200.00', leaseStartDays: -120, leaseEndDays: 70 },
    { unitNumber: '302', rentAmount: '1400.00', leaseStartDays: -90, leaseEndDays: 75 },
    { unitNumber: '103', rentAmount: '1325.00', leaseStartDays: -60, leaseEndDays: 90 },
    { unitNumber: '104', rentAmount: '1375.00', leaseStartDays: -45, leaseEndDays: 105 },
    { unitNumber: '105', rentAmount: '1225.00', leaseStartDays: -30, leaseEndDays: 120 },
    { unitNumber: '106', rentAmount: '1450.00', leaseStartDays: -15, leaseEndDays: 135 },
    { unitNumber: '203', rentAmount: '1500.00', leaseStartDays: -300, leaseEndDays: 150 },
    { unitNumber: '204', rentAmount: '1425.00', leaseStartDays: -250, leaseEndDays: 160 },
    { unitNumber: '205', rentAmount: '1475.00', leaseStartDays: -220, leaseEndDays: 165 },
    { unitNumber: '206', rentAmount: '1550.00', leaseStartDays: -190, leaseEndDays: 170 },
    { unitNumber: '303', rentAmount: '1600.00', leaseStartDays: -160, leaseEndDays: 180 },
  ];

  const leaseData = leaseBlueprints.map((config, index) => {
    const unitIndex = unitNumbers.indexOf(config.unitNumber);
    if (unitIndex === -1) {
      throw new Error(`Unit ${config.unitNumber} not found in seeded units`);
    }

    const unitId = unitIds[unitIndex];
    const residentId = tenantUserIds[index % tenantUserIds.length];

    if (!unitId) {
      throw new Error(`Unit ID missing for unit ${config.unitNumber} at index ${unitIndex}`);
    }
    if (!residentId) {
      throw new Error(`Tenant user ID missing for lease index ${index}`);
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
  submitterUserIds: string[],
): Promise<void> {
  if (submitterUserIds.length === 0) {
    debugSeed('no tenant users supplied for apartment maintenance seeding');
    return;
  }

  const requestBlueprints: Array<{
    seedKey: string;
    unitNumber: string;
    title: string;
    description: string;
    status: 'open' | 'in_progress' | 'resolved' | 'closed';
    priority: 'low' | 'normal' | 'high' | 'urgent';
  }> = [
    { seedKey: 'apt-maint-1', unitNumber: '101', title: 'Leaking faucet in kitchen', description: 'Kitchen sink faucet is dripping continuously.', status: 'open', priority: 'normal' },
    { seedKey: 'apt-maint-2', unitNumber: '102', title: 'AC not cooling properly', description: 'Air conditioner is running but not cooling the unit.', status: 'in_progress', priority: 'high' },
    { seedKey: 'apt-maint-3', unitNumber: '201', title: 'Broken window latch', description: 'Bedroom window latch is broken and will not close securely.', status: 'open', priority: 'normal' },
    { seedKey: 'apt-maint-4', unitNumber: '202', title: 'Dishwasher not draining', description: 'Dishwasher leaves standing water after each cycle.', status: 'resolved', priority: 'normal' },
    { seedKey: 'apt-maint-5', unitNumber: '301', title: 'Light fixture flickering', description: 'Living room ceiling light flickers intermittently.', status: 'in_progress', priority: 'low' },
    { seedKey: 'apt-maint-6', unitNumber: '302', title: 'Garbage disposal jammed', description: 'Garbage disposal is stuck and making a grinding noise.', status: 'open', priority: 'normal' },
    { seedKey: 'apt-maint-7', unitNumber: '103', title: 'Water heater issue', description: 'Hot water runs out very quickly during showers.', status: 'in_progress', priority: 'high' },
    { seedKey: 'apt-maint-8', unitNumber: '104', title: 'Carpet stain removal', description: 'Need professional carpet cleaning for the bedroom.', status: 'closed', priority: 'low' },
    { seedKey: 'apt-maint-9', unitNumber: '105', title: 'Door lock sticking', description: 'Front door lock is difficult to turn.', status: 'open', priority: 'normal' },
  ];

  const requestData = requestBlueprints.map((config, index) => {
    const unitIndex = unitNumbers.indexOf(config.unitNumber);
    if (unitIndex === -1) {
      throw new Error(`Unit ${config.unitNumber} not found in seeded units`);
    }

    const unitId = unitIds[unitIndex];
    const submittedById = submitterUserIds[index % submitterUserIds.length];

    if (!unitId) {
      throw new Error(`Unit ID missing for unit ${config.unitNumber} at index ${unitIndex}`);
    }
    if (!submittedById) {
      throw new Error(`Submitter user ID missing for request index ${index}`);
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
      const [updated] = await db
        .update(maintenanceRequests)
        .set({
          communityId,
          unitId: request.unitId,
          submittedById: request.submittedById,
          title: request.title,
          description: request.description,
          status: request.status,
          priority: request.priority,
          deletedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(maintenanceRequests.id, id))
        .returning({ id: maintenanceRequests.id });

      if (updated) {
        await upsertRegistryEntry('maintenance_request', request.seedKey, String(updated.id), communityId);
        continue;
      }
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

async function seedWizardState(communityId: number, wizardType: WizardType): Promise<void> {
  const maxStep = maxStepsByWizardType[wizardType];
  await db.execute(sql`
    INSERT INTO onboarding_wizard_state (community_id, wizard_type, status, last_completed_step, step_data, completed_at)
    VALUES (${communityId}, ${wizardType}, 'completed', ${maxStep}, '{}', now())
    ON CONFLICT (community_id, wizard_type) DO NOTHING
  `);
}

async function attachMeetingDocument(
  communityId: number,
  meetingId: number,
  documentId: number,
  attachedBy: string,
): Promise<void> {
  const existing = await db
    .select()
    .from(meetingDocuments)
    .where(
      and(
        eq(meetingDocuments.meetingId, meetingId),
        eq(meetingDocuments.documentId, documentId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    return;
  }

  await db.insert(meetingDocuments).values({
    meetingId,
    documentId,
    attachedBy,
    communityId,
  });
}

export async function seedCommunity(
  config: SeedCommunityConfig,
  usersToSeed: SeedUserConfig[],
  options: { syncAuthUsers?: boolean } = {},
): Promise<SeedCommunityResult> {
  assertValidConfig(config);

  if (usersToSeed.length === 0) {
    throw new Error('seedCommunity requires at least one user');
  }

  const syncAuthUsers = options.syncAuthUsers ?? true;
  const communityId = await ensureCommunity(config);
  const userIdsByEmail: Record<string, string> = {};
  const seededUsers: SeedCommunityResult['users'] = [];

  const seededUsersData = await Promise.all(
    usersToSeed.map(async (user) => {
      const authUserId = syncAuthUsers
        ? await ensureAuthUser(user.email, user.fullName, DEFAULT_PASSWORD)
        : null;
      const userId = await ensureUser(user.email, user.fullName, user.phone, authUserId ?? undefined);
      return { email: user.email, userId, role: user.role };
    }),
  );
  for (const seededUser of seededUsersData) {
    userIdsByEmail[seededUser.email] = seededUser.userId;
    seededUsers.push(seededUser);
  }

  await seedRoles(
    seededUsers.map((entry) => ({
      communityId,
      userId: entry.userId,
      role: entry.role as CanonicalRole,
    })),
  );

  await Promise.all(seededUsers.map((entry) => ensureNotificationPreference(communityId, entry.userId)));

  const categoryIds = await seedDocumentCategories(communityId, config.communityType);

  const seededDocuments: SeededDocument[] = [];

  if (config.communityType === 'condo_718') {
    seededDocuments.push({
      id: await seedRegistryDocument(
        communityId,
        `${config.slug}-doc-association-bylaws`,
        `${config.name} Association Bylaws`,
        `${config.slug}-association-bylaws.pdf`,
        `${config.name} association bylaws governing documents`,
        categoryIds.declaration ?? null,
      ),
      attachToMeeting: true,
    });

    seededDocuments.push({
      id: await seedRegistryDocument(
        communityId,
        `${config.slug}-doc-annual-budget`,
        `${config.name} Annual Budget`,
        `${config.slug}-annual-budget.pdf`,
        `${config.name} annual budget financial report`,
        categoryIds.rules ?? null,
      ),
      attachToMeeting: false,
    });
  }

  if (config.communityType === 'hoa_720') {
    seededDocuments.push({
      id: await seedRegistryDocument(
        communityId,
        `${config.slug}-doc-hoa-budget-report`,
        `${config.name} HOA Budget Report`,
        `${config.slug}-hoa-budget-report.pdf`,
        `${config.name} hoa annual budget report`,
        categoryIds.rules ?? null,
      ),
      attachToMeeting: true,
    });

    seededDocuments.push({
      id: await seedRegistryDocument(
        communityId,
        `${config.slug}-doc-covenant-restrictions`,
        `${config.name} Covenant & Restrictions`,
        `${config.slug}-covenant-restrictions.pdf`,
        `${config.name} covenant and restrictions declaration`,
        categoryIds.declaration ?? null,
      ),
      attachToMeeting: false,
    });
  }

  if (config.communityType === 'apartment') {
    seededDocuments.push({
      id: await seedRegistryDocument(
        communityId,
        `${config.slug}-doc-community-rules`,
        `${config.name} Community Rules`,
        `${config.slug}-community-rules.pdf`,
        `${config.name} resident community rules and policies`,
        categoryIds.rules ?? null,
      ),
      attachToMeeting: false,
    });

    seededDocuments.push({
      id: await seedRegistryDocument(
        communityId,
        `${config.slug}-doc-move-in-instructions`,
        `${config.name} Move-In Instructions`,
        `${config.slug}-move-in-instructions.pdf`,
        `${config.name} move-in procedures and checklist`,
        categoryIds.move_in_out_docs ?? null,
      ),
      attachToMeeting: true,
    });

    seededDocuments.push({
      id: await seedRegistryDocument(
        communityId,
        `${config.slug}-doc-resident-handbook`,
        `${config.name} Resident Handbook`,
        `${config.slug}-resident-handbook.pdf`,
        `${config.name} resident handbook onboarding guide`,
        categoryIds.community_handbook ?? null,
      ),
      attachToMeeting: false,
    });
  }

  const meetingConfigByType: Record<SeedCommunityConfig['communityType'], {
    seedKey: string;
    title: string;
    meetingType: string;
    startsInDays: number;
    location: string;
  }> = {
    condo_718: {
      seedKey: `${config.slug}-meeting-board-upcoming`,
      title: `${config.name} Board Meeting`,
      meetingType: 'board',
      startsInDays: 14,
      location: `${config.name} Clubhouse`,
    },
    hoa_720: {
      seedKey: `${config.slug}-meeting-annual-upcoming`,
      title: `${config.name} Annual Meeting`,
      meetingType: 'annual',
      startsInDays: 21,
      location: `${config.name} Community Hall`,
    },
    apartment: {
      seedKey: `${config.slug}-meeting-operations-briefing`,
      title: `${config.name} Operations Briefing`,
      meetingType: 'committee',
      startsInDays: 10,
      location: `${config.name} Leasing Office`,
    },
  };

  const meetingConfig = meetingConfigByType[config.communityType];
  const meetingId = await seedRegistryMeeting(
    communityId,
    meetingConfig.seedKey,
    meetingConfig.title,
    meetingConfig.meetingType,
    new Date(Date.now() + meetingConfig.startsInDays * DAY_MS),
    meetingConfig.location,
  );

  const announcementAuthor = usersToSeed.find((user) => ANNOUNCEMENT_AUTHOR_ROLES.has(user.role)) ?? usersToSeed[0];
  if (!announcementAuthor) {
    throw new Error(`Unable to resolve announcement author for ${config.slug}`);
  }

  const authorId = userIdsByEmail[announcementAuthor.email];
  if (!authorId) {
    throw new Error(`Unable to resolve author user id for ${announcementAuthor.email}`);
  }

  if (config.communityType === 'condo_718') {
    await seedRegistryAnnouncement(
      communityId,
      `${config.slug}-announcement-pool-maintenance`,
      `${config.name} Pool Maintenance Notice`,
      `Pool maintenance at ${config.name} is scheduled for next week.`,
      authorId,
      'all',
      true,
    );
    await seedRegistryAnnouncement(
      communityId,
      `${config.slug}-announcement-lobby-refresh`,
      `${config.name} Lobby Refresh`,
      `Lobby painting and lighting updates at ${config.name} begin on Monday morning.`,
      authorId,
      'all',
    );
  }

  if (config.communityType === 'hoa_720') {
    await seedRegistryAnnouncement(
      communityId,
      `${config.slug}-announcement-landscape-update`,
      `${config.name} Landscape Update`,
      `Landscape improvements for ${config.name} begin this Monday.`,
      authorId,
      'all',
    );
  }

  if (config.communityType === 'apartment') {
    await seedRegistryAnnouncement(
      communityId,
      `${config.slug}-announcement-parking`,
      `${config.name} Parking Reminder`,
      `Please update your ${config.name} parking decal by Friday.`,
      authorId,
      'tenants_only',
    );
    await seedRegistryAnnouncement(
      communityId,
      `${config.slug}-announcement-gym-hours`,
      `${config.name} Fitness Center Hours Extended`,
      `The fitness center at ${config.name} is now open from 5 AM to 11 PM daily.`,
      authorId,
      'all',
    );
    await seedRegistryAnnouncement(
      communityId,
      `${config.slug}-announcement-maintenance-window`,
      `${config.name} Scheduled Maintenance Window`,
      `HVAC system maintenance at ${config.name} is scheduled for Saturday from 8 AM to 12 PM.`,
      authorId,
      'all',
    );
    await seedRegistryAnnouncement(
      communityId,
      `${config.slug}-announcement-package-lockers`,
      `${config.name} Package Delivery Update`,
      `New secure package lockers are now available in the ${config.name} main lobby.`,
      authorId,
      'all',
    );
    await seedRegistryAnnouncement(
      communityId,
      `${config.slug}-announcement-community-event`,
      `${config.name} Community Event Next Weekend`,
      `Join the ${config.name} resident appreciation event next Saturday at 4 PM by the pool.`,
      authorId,
      'all',
    );
  }

  const attachment = seededDocuments.find((document) => document.attachToMeeting) ?? seededDocuments[0];
  if (attachment) {
    await attachMeetingDocument(communityId, meetingId, attachment.id, authorId);
  }

  await seedCommunityCompliance(communityId, config.communityType);
  await seedWizardState(communityId, config.communityType === 'apartment' ? 'apartment' : 'condo');

  if (config.communityType === 'apartment') {
    const { unitIds, unitNumbers } = await seedApartmentUnits(communityId);
    const tenantUserIds = usersToSeed
      .filter((user) => user.role === 'tenant')
      .map((user) => userIdsByEmail[user.email])
      .filter((userId): userId is string => userId != null);

    await seedApartmentLeases(communityId, unitIds, unitNumbers, tenantUserIds);
    await seedApartmentMaintenanceRequests(communityId, unitIds, unitNumbers, tenantUserIds);
  }

  return {
    communityId,
    users: seededUsers,
  };
}
