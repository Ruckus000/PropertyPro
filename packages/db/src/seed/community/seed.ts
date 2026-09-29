/** seedCommunity: the orchestrator that runs every seed module in order for one community. */
import { inArray, sql } from '../../filters';
import { users } from '../../schema';
import { seedApartmentLeases, seedApartmentMaintenanceRequests } from './apartment';
import { seedRegistryAnnouncement } from './announcements';
import { assertValidConfig, ensureCommunity } from './community';
import { seedCommunityCompliance } from './compliance';
import { DAY_MS, db } from './context';
import { seedDocumentCategories, seedRegistryDocument } from './documents';
import { attachMeetingDocument, seedRegistryMeeting } from './meetings';
import { ensureNotificationPreference, isAnnouncementAuthorRole, seedRoles } from './roles';
import type {
  SeedCommunityConfig,
  SeedCommunityResult,
  SeededDocument,
  SeedRole,
  SeedUserConfig,
} from './types';
import { linkSeededResidentUnits, seedApartmentUnits, seedCondoHoaUnits } from './units';
import {
  ensureAuthUser,
  ensureLocalAuthUserMirror,
  ensureUser,
  findExistingAuthUserByEmail,
  getDefaultPassword,
} from './users';
import { seedWizardState } from './wizard';

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

  const usersWithAuth = await Promise.all(
    usersToSeed.map(async (user) => {
      const authUserId = syncAuthUsers
        ? await ensureAuthUser(user.email, user.fullName, getDefaultPassword())
        : (await findExistingAuthUserByEmail(user.email))?.id ?? null;

      if (authUserId) {
        await ensureLocalAuthUserMirror(authUserId, user.email, user.fullName);
      }

      return {
        authUserId: authUserId ?? undefined,
        normalizedEmail: user.email.toLowerCase(),
        user,
      };
    }),
  );

  const normalizedEmails = [...new Set(usersWithAuth.map((entry) => entry.normalizedEmail))];
  const existingUsersByEmail = normalizedEmails.length === 0
    ? []
    : await db
      .select({ email: users.email, id: users.id })
      .from(users)
      .where(inArray(users.email, normalizedEmails));
  const existingUserIdsByEmail = new Map(existingUsersByEmail.map((row) => [row.email, row.id]));
  const needsReconcile = usersWithAuth.some((entry) => {
    const existingId = existingUserIdsByEmail.get(entry.normalizedEmail);
    return Boolean(entry.authUserId && existingId && existingId !== entry.authUserId);
  });

  const seededUsersData: SeedCommunityResult['users'] = [];
  // Reconciles serialize at DDL; parallel is safe when no reconcile is needed.
  if (needsReconcile) {
    for (const entry of usersWithAuth) {
      const userId = await ensureUser(
        entry.user.email,
        entry.user.fullName,
        entry.user.phone,
        entry.authUserId,
      );
      seededUsersData.push({ email: entry.user.email, userId, role: entry.user.role });
    }
  } else {
    seededUsersData.push(...(await Promise.all(
      usersWithAuth.map(async (entry) => {
        const userId = await ensureUser(
          entry.user.email,
          entry.user.fullName,
          entry.user.phone,
          entry.authUserId,
        );
        return { email: entry.user.email, userId, role: entry.user.role };
      }),
    )));
  }

  for (const seededUser of seededUsersData) {
    userIdsByEmail[seededUser.email] = seededUser.userId;
    seededUsers.push(seededUser);
  }

  const designationByEmail = new Map(
    usersToSeed.map((user) => [user.email, user.designation]),
  );
  await seedRoles(
    seededUsers.map((entry) => ({
      communityId,
      userId: entry.userId,
      role: entry.role as SeedRole,
      designation: designationByEmail.get(entry.email),
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

  // --- seedHints: documentBias extra documents ---
  if (config.seedHints) {
    const { documentBias } = config.seedHints;
    if (documentBias === 'compliance') {
      seededDocuments.push({
        id: await seedRegistryDocument(
          communityId,
          `${config.slug}-doc-hints-meeting-notice`,
          `${config.name} Board Meeting Notice`,
          `${config.slug}-board-meeting-notice.pdf`,
          `${config.name} statutory meeting notice compliance`,
          categoryIds.meeting_minutes ?? categoryIds.announcements ?? null,
        ),
        attachToMeeting: true,
      });
      seededDocuments.push({
        id: await seedRegistryDocument(
          communityId,
          `${config.slug}-doc-hints-bylaws-amendment`,
          `${config.name} Bylaws Amendment`,
          `${config.slug}-bylaws-amendment.pdf`,
          `${config.name} bylaws amendment governing documents`,
          categoryIds.declaration ?? categoryIds.rules ?? null,
        ),
        attachToMeeting: false,
      });
    } else if (documentBias === 'maintenance') {
      seededDocuments.push({
        id: await seedRegistryDocument(
          communityId,
          `${config.slug}-doc-hints-maintenance-log`,
          `${config.name} Maintenance Log`,
          `${config.slug}-maintenance-log.pdf`,
          `${config.name} property maintenance work orders log`,
          categoryIds.maintenance_records ?? categoryIds.inspection_reports ?? null,
        ),
        attachToMeeting: false,
      });
      seededDocuments.push({
        id: await seedRegistryDocument(
          communityId,
          `${config.slug}-doc-hints-inspection-report`,
          `${config.name} Property Inspection Report`,
          `${config.slug}-property-inspection.pdf`,
          `${config.name} annual property inspection safety report`,
          categoryIds.inspection_reports ?? categoryIds.maintenance_records ?? null,
        ),
        attachToMeeting: true,
      });
    } else if (documentBias === 'financial') {
      seededDocuments.push({
        id: await seedRegistryDocument(
          communityId,
          `${config.slug}-doc-hints-reserve-study`,
          `${config.name} Reserve Fund Study`,
          `${config.slug}-reserve-fund-study.pdf`,
          `${config.name} reserve fund financial study report`,
          categoryIds.rules ?? categoryIds.declaration ?? null,
        ),
        attachToMeeting: false,
      });
      seededDocuments.push({
        id: await seedRegistryDocument(
          communityId,
          `${config.slug}-doc-hints-budget-summary`,
          `${config.name} Budget Summary`,
          `${config.slug}-budget-summary.pdf`,
          `${config.name} annual budget summary financial disclosure`,
          categoryIds.rules ?? null,
        ),
        attachToMeeting: true,
      });
    }
    // documentBias === 'general' — no extra documents beyond the defaults
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

  // --- seedHints: meetingDensity extra meetings ---
  // Default seeding creates 1 meeting. low=1-2, medium=3-4, high=5-6.
  // We already have 1 default meeting so we add 0-1 more for low, 2-3 for medium, 4-5 for high.
  if (config.seedHints) {
    const { meetingDensity } = config.seedHints;
    type ExtraMeetingBlueprint = { seedKeySuffix: string; titleSuffix: string; meetingType: string; startsInDays: number };
    const extraMeetingsByDensity: Record<typeof meetingDensity, ExtraMeetingBlueprint[]> = {
      low: [
        { seedKeySuffix: 'extra-1', titleSuffix: 'Committee Meeting', meetingType: 'committee', startsInDays: 30 },
      ],
      medium: [
        { seedKeySuffix: 'extra-1', titleSuffix: 'Committee Meeting', meetingType: 'committee', startsInDays: 30 },
        { seedKeySuffix: 'extra-2', titleSuffix: 'Board Workshop', meetingType: 'board', startsInDays: 45 },
        { seedKeySuffix: 'extra-3', titleSuffix: 'Special Meeting', meetingType: 'special', startsInDays: 60 },
      ],
      high: [
        { seedKeySuffix: 'extra-1', titleSuffix: 'Committee Meeting', meetingType: 'committee', startsInDays: 30 },
        { seedKeySuffix: 'extra-2', titleSuffix: 'Board Workshop', meetingType: 'board', startsInDays: 45 },
        { seedKeySuffix: 'extra-3', titleSuffix: 'Special Meeting', meetingType: 'special', startsInDays: 60 },
        { seedKeySuffix: 'extra-4', titleSuffix: 'Annual Planning Session', meetingType: 'annual', startsInDays: 75 },
        { seedKeySuffix: 'extra-5', titleSuffix: 'Budget Review Meeting', meetingType: 'board', startsInDays: 90 },
      ],
    };
    const extraMeetingBlueprints = extraMeetingsByDensity[meetingDensity] ?? [];
    for (const blueprint of extraMeetingBlueprints) {
      await seedRegistryMeeting(
        communityId,
        `${config.slug}-meeting-${blueprint.seedKeySuffix}`,
        `${config.name} ${blueprint.titleSuffix}`,
        blueprint.meetingType,
        new Date(Date.now() + blueprint.startsInDays * DAY_MS),
        meetingConfig.location,
      );
    }
  }

  const announcementAuthor = usersToSeed.find((user) => isAnnouncementAuthorRole(user.role)) ?? usersToSeed[0];
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

  // --- seedHints: announcementTone extra announcement ---
  if (config.seedHints) {
    const { announcementTone } = config.seedHints;
    const toneAnnouncements: Record<typeof announcementTone, { title: string; body: string }> = {
      formal: {
        title: `${config.name} — Official Board Notice`,
        body: `The Board of Directors of ${config.name} hereby provides notice of the following community update. Residents are requested to review and acknowledge this communication at their earliest convenience.`,
      },
      friendly: {
        title: `Hey ${config.name} Neighbors!`,
        body: `We have some exciting updates to share with our ${config.name} community! Thanks for being a great neighbor — here is what is happening this month.`,
      },
      urgent: {
        title: `ACTION REQUIRED: ${config.name} Deadline Notice`,
        body: `URGENT: Residents of ${config.name} must respond by the deadline indicated. Failure to act may result in additional fees or loss of access. Please contact management immediately with any questions.`,
      },
    };
    const toneContent = toneAnnouncements[announcementTone] ?? toneAnnouncements.friendly;
    await seedRegistryAnnouncement(
      communityId,
      `${config.slug}-announcement-hints-tone`,
      toneContent.title,
      toneContent.body,
      authorId,
      'all',
      announcementTone === 'urgent',
    );
  }

  // --- seedHints: complianceScore — adjust createdAt on hint-seeded documents ---
  // A high complianceScore means documents were posted within the 30-day window.
  // A low complianceScore means documents were posted late (>30 days ago).
  // Only the hint-driven extra documents (file_name pattern *-hints-*) are affected;
  // default documents retain their natural createdAt.
  if (config.seedHints) {
    const score = Math.max(0, Math.min(100, config.seedHints.complianceScore));
    // Linear interpolation: score=100 → 5 days ago (compliant); score=0 → 45 days ago (overdue).
    const postingOffsetDays = Math.round(5 + (1 - score / 100) * 40);
    // `.toISOString()`, not the Date: postgres-js has no serialiser for a bare
    // `Date` in an untyped bind parameter and throws ERR_INVALID_ARG_TYPE on the
    // client. Nothing passes `seedHints` today, which is the only reason this
    // has never fired — the same shape took the scheduled-publish cron down.
    const createdAt = new Date(Date.now() - postingOffsetDays * DAY_MS).toISOString();
    await db.execute(sql`
      UPDATE documents
      SET created_at = ${createdAt}
      WHERE community_id = ${communityId}
        AND file_name LIKE ${`${config.slug}-%-hints-%`}
    `);
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
  } else {
    await seedCondoHoaUnits(communityId);
  }

  // After units AND leases exist: link every resident role to its unit.
  await linkSeededResidentUnits(
    communityId,
    seededUsers
      .filter((entry) => entry.role === 'owner' || entry.role === 'tenant')
      .map((entry) => ({ userId: entry.userId, role: entry.role as SeedRole })),
  );

  return {
    communityId,
    users: seededUsers,
  };
}
