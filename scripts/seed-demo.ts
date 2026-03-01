import { pathToFileURL } from 'node:url';
import { units } from '@propertypro/db';
import {
  ensureNotificationPreference,
  seedCommunity,
  seedRoles,
  type SeedCommunityConfig,
  type SeedCommunityResult,
  type SeedUserConfig,
} from '@propertypro/db/seed/seed-community';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { DEMO_COMMUNITIES, DEMO_USERS } from './config/demo-data';

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

const APARTMENT_TENANT_EMAILS = DEMO_USERS
  .filter((user) => user.email.startsWith('tenant.apt'))
  .map((user) => user.email);

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

  await db
    .insert(units)
    .values({
      communityId: sunsetCommunityId,
      unitNumber: 'A-101',
    })
    .onConflictDoNothing();

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

  const apartmentTenantAssignments = APARTMENT_TENANT_EMAILS.map((email) => ({
    communityId: apartmentCommunityId,
    userId: resolveUserId(userIdsByEmail, email),
    role: 'tenant' as const,
  }));

  await seedRoles(apartmentTenantAssignments);

  await Promise.all(
    apartmentTenantAssignments.map((a) => ensureNotificationPreference(a.communityId, a.userId)),
  );

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
