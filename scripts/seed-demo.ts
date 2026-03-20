import { pathToFileURL } from 'node:url';
import {
  assessmentLineItems,
  assessments,
  communities,
  complianceChecklistItems,
  documents,
  emergencyBroadcastRecipients,
  emergencyBroadcasts,
  esignSigners,
  esignSubmissions,
  esignTemplates,
  meetings,
  notificationPreferences,
  units,
  users,
  violations,
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
  // Tenants are excluded: a tenant belongs to exactly one community.
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

async function seedViolationsData(
  communityId: number,
  reportedByUserId: string,
): Promise<void> {
  // Look up existing units for this community
  const communityUnits = await db
    .select({ id: units.id, unitNumber: units.unitNumber })
    .from(units)
    .where(
      and(
        eq(units.communityId, communityId),
        isNull(units.deletedAt),
      ),
    )
    .limit(4);

  if (communityUnits.length === 0) {
    debugSeed(`no units found for community ${communityId}, skipping violations seed`);
    return;
  }

  const now = new Date();
  const violationData = [
    {
      communityId,
      unitId: communityUnits[0]!.id,
      reportedByUserId,
      category: 'noise',
      description: 'Loud music playing after 10 PM on multiple occasions. Neighbors on the floor above and adjacent units have reported repeated disturbances.',
      status: 'reported' as const,
      severity: 'moderate' as const,
      evidenceDocumentIds: [],
      createdAt: subDays(now, 3),
      updatedAt: subDays(now, 3),
    },
    {
      communityId,
      unitId: communityUnits[Math.min(1, communityUnits.length - 1)]!.id,
      reportedByUserId,
      category: 'unauthorized_modification',
      description: 'Installed a satellite dish on the balcony without prior ARC approval. The dish is visible from the common area and does not comply with association guidelines.',
      status: 'noticed' as const,
      severity: 'major' as const,
      evidenceDocumentIds: [],
      noticeDate: subDays(now, 5).toISOString().slice(0, 10),
      createdAt: subDays(now, 10),
      updatedAt: subDays(now, 5),
    },
    {
      communityId,
      unitId: communityUnits[Math.min(2, communityUnits.length - 1)]!.id,
      reportedByUserId,
      category: 'parking',
      description: 'Vehicle consistently parked in the fire lane near Building C entrance. License plate observed multiple times over the past week.',
      status: 'hearing_scheduled' as const,
      severity: 'major' as const,
      evidenceDocumentIds: [],
      noticeDate: subDays(now, 14).toISOString().slice(0, 10),
      hearingDate: addDays(now, 7),
      createdAt: subDays(now, 18),
      updatedAt: subDays(now, 7),
    },
    {
      communityId,
      unitId: communityUnits[Math.min(3, communityUnits.length - 1)]!.id,
      reportedByUserId,
      category: 'pet',
      description: 'Unleashed dog observed in the pool area on three separate occasions. Community rules require all pets to be leashed in common areas.',
      status: 'fined' as const,
      severity: 'moderate' as const,
      evidenceDocumentIds: [],
      noticeDate: subDays(now, 25).toISOString().slice(0, 10),
      hearingDate: subDays(now, 10),
      createdAt: subDays(now, 30),
      updatedAt: subDays(now, 8),
    },
  ];

  // Delete existing violations for this community to avoid duplicates on re-seed
  await db.delete(violations).where(eq(violations.communityId, communityId));

  for (const data of violationData) {
    await db.insert(violations).values(data);
  }

  debugSeed(`seeded ${violationData.length} violations for community ${communityId}`);
}

/**
 * Seed emergency broadcast data for a community.
 * Adds phone verification + SMS consent for select users, plus a past broadcast.
 */
async function seedEmergencyBroadcastData(
  communityId: number,
  initiatedByUserId: string,
  recipientUserIds: string[],
): Promise<void> {
  const now = new Date();
  const consentDate = subDays(now, 30);

  // 1. Set phone_verified_at for initiator + recipients (simulate verified phones)
  const allUserIds = [initiatedByUserId, ...recipientUserIds];
  for (const userId of allUserIds) {
    await db
      .update(users)
      .set({ phoneVerifiedAt: consentDate, updatedAt: now })
      .where(eq(users.id, userId));
  }

  // 2. Enable SMS consent on notification_preferences for these users
  for (const userId of allUserIds) {
    await db
      .update(notificationPreferences)
      .set({
        smsEnabled: true,
        smsEmergencyOnly: true,
        smsConsentGivenAt: consentDate,
        smsConsentMethod: 'web_form',
        updatedAt: now,
      })
      .where(
        and(
          eq(notificationPreferences.userId, userId),
          eq(notificationPreferences.communityId, communityId),
        ),
      );
  }

  // 3. Delete any existing emergency broadcasts for this community (re-seed safe)
  await db.delete(emergencyBroadcasts).where(eq(emergencyBroadcasts.communityId, communityId));

  // 4. Insert a past completed broadcast (hurricane prep alert from 5 days ago)
  const broadcastDate = subDays(now, 5);
  const [broadcast] = await db
    .insert(emergencyBroadcasts)
    .values({
      communityId,
      title: 'Hurricane Preparation Advisory',
      body: 'A tropical storm is approaching our area and may strengthen into a hurricane. Please take the following precautions: secure loose items on balconies, stock water and non-perishable food, charge devices, and review the community evacuation plan posted in the lobby.',
      smsBody: 'EMERGENCY: Hurricane warning for Sunset Condos. Secure items, stock supplies, follow evacuation orders. Details via email.',
      severity: 'emergency',
      templateKey: 'hurricane_prep',
      targetAudience: 'all',
      channels: 'sms,email',
      recipientCount: recipientUserIds.length,
      sentCount: recipientUserIds.length,
      deliveredCount: recipientUserIds.length,
      failedCount: 0,
      initiatedBy: initiatedByUserId,
      initiatedAt: broadcastDate,
      completedAt: addDays(broadcastDate, 0), // completed same day
      createdAt: broadcastDate,
      updatedAt: broadcastDate,
    })
    .returning({ id: emergencyBroadcasts.id });

  if (!broadcast) {
    debugSeed(`failed to insert emergency broadcast for community ${communityId}`);
    return;
  }

  // 5. Insert recipient delivery records (all delivered successfully)
  for (const userId of recipientUserIds) {
    await db.insert(emergencyBroadcastRecipients).values({
      communityId,
      broadcastId: broadcast.id,
      userId,
      email: `demo-${userId.slice(0, 8)}@example.com`,
      phone: '+13055551234',
      smsStatus: 'delivered',
      smsProviderSid: `SM${userId.slice(0, 32)}`,
      smsSentAt: broadcastDate,
      smsDeliveredAt: addDays(broadcastDate, 0),
      emailStatus: 'sent',
      emailProviderId: `resend-${userId.slice(0, 16)}`,
      emailSentAt: broadcastDate,
      createdAt: broadcastDate,
      updatedAt: broadcastDate,
    });
  }

  debugSeed(`seeded emergency broadcast with ${recipientUserIds.length} recipients for community ${communityId}`);
}

// ---------------------------------------------------------------------------
// E-Sign seed data
// ---------------------------------------------------------------------------

/**
 * Prebuilt e-sign template definitions for seeding.
 * Inlined here to avoid importing from apps/web/src (no path alias from scripts/).
 * Source of truth: apps/web/src/lib/esign/prebuilt-templates.ts
 */
const ESIGN_SEED_TEMPLATES = [
  {
    name: 'Proxy Designation Form',
    templateType: 'proxy',
    description:
      'Standard proxy form allowing unit owners to designate a voting representative for association meetings.',
    fieldsSchema: {
      version: 1,
      signerRoles: ['owner', 'proxy_holder'],
      fields: [
        { id: 'owner_name', type: 'text', signerRole: 'owner', page: 0, x: 10, y: 25, width: 35, height: 4, required: true, label: 'Owner Name' },
        { id: 'owner_unit', type: 'text', signerRole: 'owner', page: 0, x: 55, y: 25, width: 20, height: 4, required: true, label: 'Unit Number' },
        { id: 'proxy_holder_name', type: 'text', signerRole: 'owner', page: 0, x: 10, y: 35, width: 35, height: 4, required: true, label: 'Proxy Holder Name' },
        { id: 'meeting_date', type: 'date', signerRole: 'owner', page: 0, x: 55, y: 35, width: 20, height: 4, required: true, label: 'Meeting Date' },
        { id: 'owner_signature', type: 'signature', signerRole: 'owner', page: 0, x: 10, y: 70, width: 35, height: 8, required: true, label: 'Owner Signature' },
        { id: 'owner_sign_date', type: 'date', signerRole: 'owner', page: 0, x: 55, y: 72, width: 20, height: 4, required: true, label: 'Date' },
        { id: 'proxy_holder_signature', type: 'signature', signerRole: 'proxy_holder', page: 0, x: 10, y: 82, width: 35, height: 8, required: true, label: 'Proxy Holder Signature' },
        { id: 'proxy_holder_sign_date', type: 'date', signerRole: 'proxy_holder', page: 0, x: 55, y: 84, width: 20, height: 4, required: true, label: 'Date' },
      ],
    },
  },
  {
    name: 'Violation Acknowledgment',
    templateType: 'violation_ack',
    description:
      'Acknowledgment form for unit owners to confirm receipt of a violation notice and agree to corrective action.',
    fieldsSchema: {
      version: 1,
      signerRoles: ['owner'],
      fields: [
        { id: 'owner_name', type: 'text', signerRole: 'owner', page: 0, x: 10, y: 20, width: 35, height: 4, required: true, label: 'Owner Name' },
        { id: 'owner_unit', type: 'text', signerRole: 'owner', page: 0, x: 55, y: 20, width: 20, height: 4, required: true, label: 'Unit Number' },
        { id: 'violation_description', type: 'text', signerRole: 'owner', page: 0, x: 10, y: 32, width: 65, height: 4, required: false, label: 'Violation Description' },
        { id: 'corrective_deadline', type: 'date', signerRole: 'owner', page: 0, x: 10, y: 42, width: 20, height: 4, required: true, label: 'Correction Deadline' },
        { id: 'acknowledge_checkbox', type: 'checkbox', signerRole: 'owner', page: 0, x: 10, y: 55, width: 3, height: 3, required: true, label: 'I acknowledge receipt of this violation notice' },
        { id: 'agree_checkbox', type: 'checkbox', signerRole: 'owner', page: 0, x: 10, y: 62, width: 3, height: 3, required: true, label: 'I agree to take corrective action by the deadline' },
        { id: 'owner_signature', type: 'signature', signerRole: 'owner', page: 0, x: 10, y: 75, width: 35, height: 8, required: true, label: 'Owner Signature' },
        { id: 'sign_date', type: 'date', signerRole: 'owner', page: 0, x: 55, y: 77, width: 20, height: 4, required: true, label: 'Date' },
      ],
    },
  },
] as const;

/**
 * Seed e-sign templates and (optionally) a demo submission for a community.
 */
async function seedEsignData(
  communityId: number,
  createdByUserId: string,
  ownerUserId?: string,
): Promise<void> {
  // Idempotent: delete existing e-sign data for this community
  await db.delete(esignTemplates).where(eq(esignTemplates.communityId, communityId));

  const insertedTemplates: Array<{ id: number; name: string }> = [];

  for (const tpl of ESIGN_SEED_TEMPLATES) {
    const [row] = await db
      .insert(esignTemplates)
      .values({
        communityId,
        externalId: crypto.randomUUID(),
        name: tpl.name,
        description: tpl.description,
        templateType: tpl.templateType,
        fieldsSchema: tpl.fieldsSchema,
        status: 'active',
        createdBy: createdByUserId,
      })
      .returning({ id: esignTemplates.id, name: esignTemplates.name });

    if (row) insertedTemplates.push(row);
  }

  debugSeed(`seeded ${insertedTemplates.length} esign templates for community ${communityId}`);

  // For Sunset Condos: create a demo submission so the my-pending widget has data
  if (ownerUserId) {
    const proxyTemplate = insertedTemplates.find((t) => t.name === 'Proxy Designation Form');
    if (!proxyTemplate) return;

    const [submission] = await db
      .insert(esignSubmissions)
      .values({
        communityId,
        templateId: proxyTemplate.id,
        externalId: crypto.randomUUID(),
        status: 'pending',
        signingOrder: 'sequential',
        sendEmail: false,
        messageSubject: 'Annual Meeting Proxy Form',
        messageBody: 'Please designate your proxy holder for the upcoming annual meeting.',
        expiresAt: addDays(new Date(), 30),
        createdBy: createdByUserId,
      })
      .returning({ id: esignSubmissions.id });

    if (!submission) return;

    await db.insert(esignSigners).values({
      communityId,
      submissionId: submission.id,
      externalId: crypto.randomUUID(),
      userId: ownerUserId,
      email: 'owner.one@sunset.local',
      name: 'Owner One',
      role: 'owner',
      slug: crypto.randomUUID(),
      sortOrder: 0,
      status: 'pending',
    });

    await db.insert(esignSigners).values({
      communityId,
      submissionId: submission.id,
      externalId: crypto.randomUUID(),
      email: 'board.president@sunset.local',
      name: 'Board President',
      role: 'proxy_holder',
      slug: crypto.randomUUID(),
      sortOrder: 1,
      status: 'pending',
    });

    debugSeed(`seeded demo esign submission with 2 signers for community ${communityId}`);
  }
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

  const communityTypeBySlug = Object.fromEntries(
    DEMO_COMMUNITIES.map((c) => [c.slug, c.communityType]),
  ) as Record<DemoCommunitySlug, CommunityType>;

  const crossBySlug = new Map<DemoCommunitySlug, Array<{ communityId: number; userId: string; role: CanonicalRole }>>();
  for (const assignment of CROSS_COMMUNITY_ASSIGNMENTS) {
    const entry = {
      communityId: communityIdsBySlug[assignment.slug]!,
      userId: resolveUserId(userIdsByEmail, assignment.email),
      role: assignment.role,
    };
    const existing = crossBySlug.get(assignment.slug) ?? [];
    existing.push(entry);
    crossBySlug.set(assignment.slug, existing);
  }

  for (const [slug, assignments] of crossBySlug) {
    await seedRoles(assignments, communityTypeBySlug[slug]);
  }

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

  // Seed violation data for condo and HOA communities (apartments don't have violations)
  const ownerUserId = resolveUserId(userIdsByEmail, 'owner.one@sunset.local');
  await seedViolationsData(sunsetCommunityId, ownerUserId);
  // Palm Shores gets 2 violations (reported + resolved via the same function, we re-use first 2)
  await seedViolationsData(palmCommunityId, boardPresidentId);
  debugSeed('violations seed complete');

  // Seed emergency broadcast data for Sunset Condos
  const camUserId = resolveUserId(userIdsByEmail, 'cam.one@sunset.local');
  const tenantUserId = resolveUserId(userIdsByEmail, 'tenant.one@sunset.local');
  const emergencyRecipientIds = [ownerUserId, boardPresidentId, tenantUserId];
  await seedEmergencyBroadcastData(sunsetCommunityId, camUserId, emergencyRecipientIds);
  debugSeed('emergency broadcast seed complete');

  // Seed e-sign templates for all communities, demo submission for Sunset only
  await seedEsignData(sunsetCommunityId, boardPresidentId, ownerUserId);
  await seedEsignData(palmCommunityId, boardPresidentId);
  await seedEsignData(apartmentCommunityId, resolveUserId(userIdsByEmail, 'site.manager@sunsetridge.local'));
  debugSeed('esign seed complete');

  // Seed assessment + line item data for Sunset Condos
  await seedAssessmentData(sunsetCommunityId, boardPresidentId);
  debugSeed('assessment seed complete');

  debugSeed('runDemoSeed complete');
}

/**
 * Seeds assessment and line item data for a demo community.
 * Creates two assessments (monthly maintenance + one-time special) with
 * line items for all units in the community.
 */
async function seedAssessmentData(communityId: number, createdByUserId: string): Promise<void> {
  // Check if assessments already exist for this community
  const existing = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(and(eq(assessments.communityId, communityId), isNull(assessments.deletedAt)));
  if (existing.length > 0) {
    debugSeed(`assessments already seeded for community ${communityId}, skipping`);
    return;
  }

  // Get all units for this community
  const communityUnits = await db
    .select({ id: units.id })
    .from(units)
    .where(and(eq(units.communityId, communityId), isNull(units.deletedAt)));

  if (communityUnits.length === 0) {
    debugSeed(`no units found for community ${communityId}, skipping assessment seed`);
    return;
  }

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

  // 1. Monthly maintenance assessment
  const [monthlyAssessment] = await db
    .insert(assessments)
    .values({
      communityId,
      title: 'Monthly Maintenance Assessment',
      description: 'Regular monthly assessment for common area maintenance, insurance, and reserves.',
      amountCents: 35000, // $350.00
      frequency: 'monthly',
      dueDay: 1,
      lateFeeAmountCents: 2500, // $25.00
      lateFeeDaysGrace: 15,
      startDate: `${lastMonthStr}-01`,
      isActive: true,
      createdByUserId,
    })
    .returning({ id: assessments.id });

  // 2. One-time special assessment
  const [specialAssessment] = await db
    .insert(assessments)
    .values({
      communityId,
      title: 'Special Assessment — Roof Repair',
      description: 'One-time special assessment for emergency roof repairs approved at March board meeting.',
      amountCents: 150000, // $1,500.00
      frequency: 'one_time',
      dueDay: 15,
      lateFeeAmountCents: 5000, // $50.00
      lateFeeDaysGrace: 30,
      startDate: `${thisMonth}-15`,
      isActive: true,
      createdByUserId,
    })
    .returning({ id: assessments.id });

  // Generate line items for monthly assessment — last month (overdue) + this month (pending)
  const lastMonthDue = `${lastMonthStr}-01`;
  const thisMonthDue = `${thisMonth}-01`;
  const specialDue = `${thisMonth}-15`;

  const lineItemValues = [];

  for (const unit of communityUnits) {
    // Last month's assessment — overdue (due date has passed)
    lineItemValues.push({
      assessmentId: monthlyAssessment.id,
      communityId,
      unitId: unit.id,
      amountCents: 35000,
      dueDate: lastMonthDue,
      status: 'overdue' as const,
      lateFeeCents: 2500, // grace period elapsed
    });

    // This month's assessment — pending
    lineItemValues.push({
      assessmentId: monthlyAssessment.id,
      communityId,
      unitId: unit.id,
      amountCents: 35000,
      dueDate: thisMonthDue,
      status: 'pending' as const,
      lateFeeCents: 0,
    });

    // Special assessment — pending
    lineItemValues.push({
      assessmentId: specialAssessment.id,
      communityId,
      unitId: unit.id,
      amountCents: 150000,
      dueDate: specialDue,
      status: 'pending' as const,
      lateFeeCents: 0,
    });
  }

  await db.insert(assessmentLineItems).values(lineItemValues);

  debugSeed(`seeded 2 assessments with ${lineItemValues.length} line items for community ${communityId}`);
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
