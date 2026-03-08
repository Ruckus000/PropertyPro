import { pathToFileURL } from 'node:url';
import {
  communities,
  complianceChecklistItems,
  documents,
  meetings,
} from '@propertypro/db';
import { and, eq, inArray, isNull } from '@propertypro/db/filters';
import {
  ensureNotificationPreference,
  seedCommunity,
  seedRoles,
  type SeedCommunityConfig,
  type SeedCommunityResult,
  type SeedUserConfig,
} from '@propertypro/db/seed/seed-community';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { getComplianceTemplate, type CommunityType } from '@propertypro/shared';
import { DEMO_COMMUNITIES, DEMO_USERS } from './config/demo-data';
import { runBackfill } from './backfill-compliance-templates';

const db = createUnscopedClient();

interface DemoSeedOptions {
  syncAuthUsers?: boolean;
}

type CanonicalRole = SeedUserConfig['role'];
type DemoCommunitySlug = (typeof DEMO_COMMUNITIES)[number]['slug'];

interface CommunityRoleAssignment {
  email: string;
  role: CanonicalRole;
}

const DEBUG_DEMO_SEED = process.env.DEBUG_DEMO_SEED === '1';

const PRIMARY_ASSIGNMENTS: Record<DemoCommunitySlug, CommunityRoleAssignment[]> = {
  'sunset-condos': [
    { email: 'board.president@sunset.local', role: 'board_president' },
    { email: 'board.member@sunset.local', role: 'board_member' },
    { email: 'owner.one@sunset.local', role: 'owner' },
    { email: 'tenant.one@sunset.local', role: 'tenant' },
    { email: 'cam.one@sunset.local', role: 'cam' },
    { email: 'pm.admin@sunset.local', role: 'property_manager_admin' },
  ],
  'palm-shores-hoa': [
    { email: 'board.president@sunset.local', role: 'board_president' },
  ],
  'sunset-ridge-apartments': [
    { email: 'site.manager@sunsetridge.local', role: 'site_manager' },
    { email: 'pm.admin@sunset.local', role: 'property_manager_admin' },
    { email: 'tenant.apt101@sunsetridge.local', role: 'tenant' },
    { email: 'tenant.apt102@sunsetridge.local', role: 'tenant' },
    { email: 'tenant.apt201@sunsetridge.local', role: 'tenant' },
    { email: 'tenant.apt202@sunsetridge.local', role: 'tenant' },
    { email: 'tenant.apt301@sunsetridge.local', role: 'tenant' },
    { email: 'tenant.apt302@sunsetridge.local', role: 'tenant' },
    { email: 'tenant.apt103@sunsetridge.local', role: 'tenant' },
    { email: 'tenant.apt104@sunsetridge.local', role: 'tenant' },
    { email: 'tenant.apt105@sunsetridge.local', role: 'tenant' },
    { email: 'tenant.apt106@sunsetridge.local', role: 'tenant' },
    { email: 'tenant.apt203@sunsetridge.local', role: 'tenant' },
    { email: 'tenant.apt204@sunsetridge.local', role: 'tenant' },
    { email: 'tenant.apt205@sunsetridge.local', role: 'tenant' },
    { email: 'tenant.apt206@sunsetridge.local', role: 'tenant' },
    { email: 'tenant.apt303@sunsetridge.local', role: 'tenant' },
  ],
};

const CROSS_COMMUNITY_ASSIGNMENTS: Array<{ slug: DemoCommunitySlug; email: string; role: CanonicalRole }> = [
  { slug: 'palm-shores-hoa', email: 'owner.one@sunset.local', role: 'owner' },
  { slug: 'palm-shores-hoa', email: 'tenant.one@sunset.local', role: 'tenant' },
  { slug: 'palm-shores-hoa', email: 'cam.one@sunset.local', role: 'cam' },
  { slug: 'palm-shores-hoa', email: 'pm.admin@sunset.local', role: 'property_manager_admin' },
];

const GLOBAL_PREF_USER_EMAILS = [
  'board.president@sunset.local',
  'board.member@sunset.local',
  'owner.one@sunset.local',
  'tenant.one@sunset.local',
  'cam.one@sunset.local',
  'pm.admin@sunset.local',
  'site.manager@sunsetridge.local',
] as const;

const demoUsersByEmail = new Map(DEMO_USERS.map((user) => [user.email, user]));

function debugSeed(message: string): void {
  if (DEBUG_DEMO_SEED) {
    // eslint-disable-next-line no-console
    console.log(`[seed-demo] ${message}`);
  }
}

function buildSeedUsers(assignments: CommunityRoleAssignment[]): SeedUserConfig[] {
  return assignments.map((assignment) => {
    const demoUser = demoUsersByEmail.get(assignment.email);
    if (!demoUser) {
      throw new Error(`Missing demo user for assignment email ${assignment.email}`);
    }

    return {
      email: demoUser.email,
      fullName: demoUser.fullName,
      phone: demoUser.phone,
      role: assignment.role,
    };
  });
}

function collectUserIds(results: SeedCommunityResult[]): Record<string, string> {
  const userIdsByEmail: Record<string, string> = {};

  for (const result of results) {
    for (const seededUser of result.users) {
      userIdsByEmail[seededUser.email] = seededUser.userId;
    }
  }

  return userIdsByEmail;
}

function resolveUserId(userIdsByEmail: Record<string, string>, email: string): string {
  const userId = userIdsByEmail[email];
  if (!userId) {
    throw new Error(`Missing seeded user ID for ${email}`);
  }
  return userId;
}

function addDays(source: Date, days: number): Date {
  const value = new Date(source);
  value.setUTCDate(value.getUTCDate() + days);
  return value;
}

function subDays(source: Date, days: number): Date {
  const value = new Date(source);
  value.setUTCDate(value.getUTCDate() - days);
  return value;
}

function addHours(source: Date, hours: number): Date {
  const value = new Date(source);
  value.setUTCHours(value.getUTCHours() + hours);
  return value;
}

function monthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  return `${year}-${month}`;
}

async function upsertDocument(
  communityId: number,
  filePath: string,
  title: string,
  uploadedBy: string,
  postedAt: Date,
): Promise<number> {
  const existing = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.communityId, communityId),
        eq(documents.filePath, filePath),
        isNull(documents.deletedAt),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(documents)
      .set({
        title,
        description: `${title} (demo transparency seed)`,
        fileName: filePath.split('/').at(-1) ?? `${title}.pdf`,
        fileSize: 1024,
        mimeType: 'application/pdf',
        uploadedBy,
        createdAt: postedAt,
        updatedAt: postedAt,
      })
      .where(eq(documents.id, existing[0].id));
    return existing[0].id;
  }

  const [created] = await db
    .insert(documents)
    .values({
      communityId,
      title,
      description: `${title} (demo transparency seed)`,
      filePath,
      fileName: filePath.split('/').at(-1) ?? `${title}.pdf`,
      fileSize: 1024,
      mimeType: 'application/pdf',
      uploadedBy,
      createdAt: postedAt,
      updatedAt: postedAt,
    })
    .returning({ id: documents.id });

  if (!created) {
    throw new Error(`Failed to create document for ${filePath}`);
  }

  return created.id;
}

async function setChecklistDocument(
  communityId: number,
  templateKey: string,
  documentId: number | null,
  postedAt: Date | null,
): Promise<void> {
  await db
    .update(complianceChecklistItems)
    .set({
      documentId,
      documentPostedAt: postedAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(complianceChecklistItems.communityId, communityId),
        eq(complianceChecklistItems.templateKey, templateKey),
        isNull(complianceChecklistItems.deletedAt),
      ),
    );
}

async function upsertMeeting(
  communityId: number,
  title: string,
  meetingType: 'board' | 'annual' | 'special' | 'budget' | 'committee',
  startsAt: Date,
  noticePostedAt: Date | null,
): Promise<void> {
  const existing = await db
    .select({ id: meetings.id })
    .from(meetings)
    .where(
      and(
        eq(meetings.communityId, communityId),
        eq(meetings.title, title),
        isNull(meetings.deletedAt),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(meetings)
      .set({
        meetingType,
        startsAt,
        noticePostedAt,
        location: 'Community Clubhouse',
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, existing[0].id));
    return;
  }

  await db.insert(meetings).values({
    communityId,
    title,
    meetingType,
    startsAt,
    noticePostedAt,
    location: 'Community Clubhouse',
  });
}

async function seedTransparencyDemoData(
  communityId: number,
  communityType: CommunityType,
  slug: DemoCommunitySlug,
  uploadedBy: string,
): Promise<void> {
  const template = getComplianceTemplate(communityType);
  if (template.length === 0) {
    return;
  }

  const conditionalNotRequired = slug === 'sunset-condos'
    ? new Set(['718_conflict_contracts', '718_sirs'])
    : slug === 'palm-shores-hoa'
      ? new Set(['720_bids'])
      : new Set<string>();

  const intentionallyNotPosted = slug === 'sunset-condos'
    ? new Set(['718_insurance'])
    : slug === 'palm-shores-hoa'
      ? new Set(['720_contracts'])
      : new Set<string>();

  const now = new Date();
  for (const item of template) {
    if (conditionalNotRequired.has(item.templateKey) || intentionallyNotPosted.has(item.templateKey)) {
      await setChecklistDocument(communityId, item.templateKey, null, null);
      continue;
    }

    const postedAt = subDays(now, Math.floor(Math.random() * 40) + 2);
    const documentId = await upsertDocument(
      communityId,
      `transparency/${slug}/${item.templateKey}.pdf`,
      `${item.title} (${slug})`,
      uploadedBy,
      postedAt,
    );

    await setChecklistDocument(communityId, item.templateKey, documentId, postedAt);
  }

  // Seed 10/12 months of minutes documents for condo demo community.
  if (slug === 'sunset-condos') {
    for (let offset = 11; offset >= 2; offset -= 1) {
      const monthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 15, 14, 0, 0));
      await upsertDocument(
        communityId,
        `transparency/${slug}/minutes/${monthKey(monthDate)}.pdf`,
        `Board Minutes ${monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`,
        uploadedBy,
        monthDate,
      );
    }
  }

  // Seed meeting notice timing examples.
  const annualMeetingStart = addDays(now, 30);
  await upsertMeeting(
    communityId,
    `${slug} Owner Meeting (21-day notice)`,
    'annual',
    annualMeetingStart,
    subDays(annualMeetingStart, 21),
  );

  const missedAnnualStart = addDays(now, 45);
  await upsertMeeting(
    communityId,
    `${slug} Owner Meeting (10-day notice)`,
    'annual',
    missedAnnualStart,
    subDays(missedAnnualStart, 10),
  );

  const boardMeetingStart = addDays(now, 12);
  await upsertMeeting(
    communityId,
    `${slug} Board Meeting (52-hour notice)`,
    'board',
    boardMeetingStart,
    addHours(boardMeetingStart, -52),
  );

  const missedBoardStart = addDays(now, 18);
  await upsertMeeting(
    communityId,
    `${slug} Board Meeting (36-hour notice)`,
    'board',
    missedBoardStart,
    addHours(missedBoardStart, -36),
  );
}

export async function runDemoSeed(options: DemoSeedOptions = {}): Promise<void> {
  const syncAuthUsers = options.syncAuthUsers ?? true;
  debugSeed(`runDemoSeed start (syncAuthUsers=${String(syncAuthUsers)})`);

  const communityIdsBySlug: Partial<Record<DemoCommunitySlug, number>> = {};
  const communitySeedResults: SeedCommunityResult[] = [];

  for (const community of DEMO_COMMUNITIES) {
    const usersToSeed = buildSeedUsers(PRIMARY_ASSIGNMENTS[community.slug]);

    const result = await seedCommunity(
      {
        ...community,
        isDemo: true,
      } as SeedCommunityConfig,
      usersToSeed,
      { syncAuthUsers },
    );

    communityIdsBySlug[community.slug] = result.communityId;
    communitySeedResults.push(result);
  }
  debugSeed('communities seeded via seedCommunity');

  const userIdsByEmail = collectUserIds(communitySeedResults);

  const sunsetCommunityId = communityIdsBySlug['sunset-condos'];
  const palmCommunityId = communityIdsBySlug['palm-shores-hoa'];
  const apartmentCommunityId = communityIdsBySlug['sunset-ridge-apartments'];

  if (!sunsetCommunityId || !palmCommunityId || !apartmentCommunityId) {
    throw new Error('Missing seeded community IDs');
  }

  const crossAssignments = CROSS_COMMUNITY_ASSIGNMENTS.map((assignment) => ({
    communityId: communityIdsBySlug[assignment.slug]!,
    userId: resolveUserId(userIdsByEmail, assignment.email),
    role: assignment.role,
  }));

  await seedRoles(crossAssignments);

  await Promise.all(
    crossAssignments.map((a) => ensureNotificationPreference(a.communityId, a.userId)),
  );

  await Promise.all(
    DEMO_COMMUNITIES.flatMap((community) => {
      const communityId = communityIdsBySlug[community.slug]!;
      return GLOBAL_PREF_USER_EMAILS.map((email) => {
        const userId = resolveUserId(userIdsByEmail, email);
        return ensureNotificationPreference(communityId, userId);
      });
    }),
  );

  await runBackfill();

  const condoAndHoa = await db
    .select({
      id: communities.id,
      slug: communities.slug,
      communityType: communities.communityType,
    })
    .from(communities)
    .where(
      and(
        inArray(communities.slug, ['sunset-condos', 'palm-shores-hoa', 'sunset-ridge-apartments']),
        isNull(communities.deletedAt),
      ),
    );

  const boardPresidentId = resolveUserId(userIdsByEmail, 'board.president@sunset.local');
  for (const community of condoAndHoa) {
    if (community.communityType === 'apartment') {
      await db
        .update(communities)
        .set({
          transparencyEnabled: false,
          transparencyAcknowledgedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(communities.id, community.id));
      continue;
    }

    await seedTransparencyDemoData(
      community.id,
      community.communityType,
      community.slug as DemoCommunitySlug,
      boardPresidentId,
    );

    await db
      .update(communities)
      .set({
        transparencyEnabled: true,
        transparencyAcknowledgedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(communities.id, community.id));
  }

  debugSeed('cross-community role and notification fixups complete');
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
