import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { and, eq, sql } from 'drizzle-orm';
import {
  announcements,
  communities,
  complianceChecklistItems,
  demoSeedRegistry,
  documents,
  meetingDocuments,
  meetings,
  notificationPreferences,
  units,
  users,
} from '../packages/db/src/schema/index';
import { db } from '../packages/db/src/drizzle';
import { createAdminClient } from '../packages/db/src/supabase/admin';
import { getComplianceTemplate } from '../packages/shared/src/compliance/templates';
import { DEMO_COMMUNITIES, DEMO_USERS } from './config/demo-data';

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
      emailDocuments: true,
      emailMeetings: true,
      emailMaintenance: true,
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

async function seedRegistryDocument(
  communityId: number,
  seedKey: string,
  title: string,
  fileName: string,
  searchText: string,
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

async function seedCoreEntities(context: SeedContext): Promise<void> {
  const sunsetCommunityId = context.communityIds['sunset-condos'];
  const palmCommunityId = context.communityIds['palm-shores-hoa'];
  const bayCommunityId = context.communityIds['bay-view-apartments'];
  if (!sunsetCommunityId || !palmCommunityId || !bayCommunityId) {
    throw new Error('Missing seeded community IDs');
  }

  const boardPresidentId = context.userIdsByEmail['board.president@sunset.local'];
  const boardMemberId = context.userIdsByEmail['board.member@sunset.local'];
  const ownerId = context.userIdsByEmail['owner.one@sunset.local'];
  const tenantId = context.userIdsByEmail['tenant.one@sunset.local'];
  const camId = context.userIdsByEmail['cam.one@sunset.local'];
  const pmAdminId = context.userIdsByEmail['pm.admin@sunset.local'];
  const siteManagerId = context.userIdsByEmail['site.manager@bayview.local'];

  if (!boardPresidentId || !boardMemberId || !ownerId || !tenantId || !camId || !pmAdminId || !siteManagerId) {
    throw new Error('Missing required seeded users');
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
    { communityId: bayCommunityId, userId: tenantId, role: 'tenant' },
    { communityId: bayCommunityId, userId: siteManagerId, role: 'site_manager' },
    { communityId: bayCommunityId, userId: pmAdminId, role: 'property_manager_admin' },
  ]);
  debugSeed('roles seeded');

  for (const communityId of [sunsetCommunityId, palmCommunityId, bayCommunityId]) {
    for (const userId of [boardPresidentId, boardMemberId, ownerId, tenantId, camId, pmAdminId, siteManagerId]) {
      await ensureNotificationPreference(communityId, userId);
    }
  }
  debugSeed('notification preferences seeded');

  const sunsetDoc = await seedRegistryDocument(
    sunsetCommunityId,
    'sunset-doc-bylaws',
    'Sunset Bylaws',
    'sunset-bylaws.pdf',
    'association bylaws governing documents',
  );
  const palmDoc = await seedRegistryDocument(
    palmCommunityId,
    'palm-doc-budget',
    'Palm HOA Budget',
    'palm-budget.pdf',
    'annual budget financial report',
  );
  const bayDoc = await seedRegistryDocument(
    bayCommunityId,
    'bay-doc-lease-rules',
    'Bay View Resident Rules',
    'bay-rules.pdf',
    'resident handbook lease rules',
  );

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
  const bayMeeting = await seedRegistryMeeting(
    bayCommunityId,
    'bay-meeting-ops-upcoming',
    'Bay Operations Briefing',
    'committee',
    new Date(now + 10 * 24 * 60 * 60 * 1000),
    'Bay Leasing Office',
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
    bayCommunityId,
    'bay-announcement-tenants',
    'Parking Reminder',
    'Please update your parking decal by Friday.',
    siteManagerId,
    'tenants_only',
  );

  const meetingDocumentPairs: Array<{ meetingId: number; documentId: number; attachedBy: string }> = [
    { meetingId: sunsetMeeting, documentId: sunsetDoc, attachedBy: boardPresidentId },
    { meetingId: palmMeeting, documentId: palmDoc, attachedBy: boardPresidentId },
    { meetingId: bayMeeting, documentId: bayDoc, attachedBy: siteManagerId },
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
              : bayCommunityId,
      });
    }
  }
  debugSeed('meeting documents seeded');

  await seedCommunityCompliance(sunsetCommunityId, 'condo_718');
  debugSeed('sunset compliance seeded');
  await seedCommunityCompliance(palmCommunityId, 'hoa_720');
  debugSeed('palm compliance seeded');
  await seedCommunityCompliance(bayCommunityId, 'apartment');
  debugSeed('bay compliance seeded');
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
