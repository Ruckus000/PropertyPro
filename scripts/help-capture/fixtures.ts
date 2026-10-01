/* eslint-disable no-console -- CLI script; console output is intentional */
/**
 * Help-capture fixtures — the demo rows the help screenshots need that
 * `pnpm seed:demo` does not create. Local only; safe to re-run (each row is
 * looked up by its title or marker before it is inserted).
 *
 * Usage (after the demo seed):
 *   scripts/agent-env.sh exec pnpm help:capture:fixtures
 *   DATABASE_URL=postgres://…@127.0.0.1:54322/postgres pnpm help:capture:fixtures
 *
 * Writes go straight to the tables, or through the service helpers that send
 * nothing, so no notification or email leaves the machine.
 */
import { randomUUID } from 'node:crypto';
import {
  accessRequests,
  announcements,
  arcSubmissions,
  communities,
  contractBids,
  contracts,
  createScopedClient,
  documents,
  electionCandidates,
  elections,
  insurancePolicies,
  leases,
  meetingDocuments,
  meetings,
  moveChecklists,
  packageLog,
  polls,
  units,
  userRoles,
  users,
  visitorLog,
} from '@propertypro/db';
import { and, eq, inArray, isNotNull, isNull, ne, sql } from '@propertypro/db/filters';
// AUTHZ: local-only capture fixtures; refuses any non-loopback DATABASE_URL before touching the database.
import { closeUnscopedClient, createUnscopedClient } from '@propertypro/db/unsafe';
import { createAnnouncementForCommunity } from '@/lib/services/announcement-service';
import { createContractBidForCommunity, createContractForCommunity } from '@/lib/services/contract-service';
import {
  castElectionVoteForCommunity,
  closeElectionForCommunity,
  openElectionForCommunity,
} from '@/lib/services/elections-service';
import { createInsurancePolicy } from '@/lib/services/insurance-service';
import { createMoveChecklist } from '@/lib/services/move-checklist-service';
import { createVisitorForCommunity } from '@/lib/services/package-visitor-service';
import { createPollForCommunity } from '@/lib/services/polls-service';
import { setCommunitySnowbirdEnabled } from '@/lib/services/snowbird-digest-subscription-service';
import { createArcSubmissionForCommunity } from '@/lib/services/violations-service';
import { CAPTURE_COMMUNITIES } from './manifest-schema';

type Scoped = ReturnType<typeof createScopedClient>;

const DAY = 24 * 60 * 60 * 1000;
const PACKAGE_MARKER = 'HELP-CAPTURE-PKG';

function assertLocalDatabase(): void {
  const url = process.env.DATABASE_URL;
  let host = '';
  try {
    host = new URL(url ?? '').hostname;
  } catch {
    /* reported below */
  }
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`Refusing to run: DATABASE_URL must point at localhost or 127.0.0.1 (got "${host || 'unset'}").`);
  }
}

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

/** First row of a scoped select (its builder is awaitable but not typed as a promise). */
async function first<T>(query: unknown): Promise<T | undefined> {
  return ((await query) as T[])[0];
}

async function main(): Promise<void> {
  assertLocalDatabase();
  const db = createUnscopedClient();

  const communityRows = await db
    .select({ id: communities.id, slug: communities.slug })
    .from(communities)
    .where(inArray(communities.slug, Object.values(CAPTURE_COMMUNITIES)));
  const communityId = (slug: string) => {
    const row = communityRows.find((r) => r.slug === slug);
    if (!row) throw new Error(`Community "${slug}" not found — run pnpm seed:demo first`);
    return row.id;
  };
  const condoId = communityId(CAPTURE_COMMUNITIES.condo);
  const apartmentId = communityId(CAPTURE_COMMUNITIES.apartment);
  const condo = createScopedClient(condoId);
  const apartment = createScopedClient(apartmentId);

  const emails = {
    owner: 'owner.one@sunset.local',
    tenant: 'tenant.one@sunset.local',
    boardMember: 'board.member@sunset.local',
    cam: 'cam.one@sunset.local',
    siteManager: 'site.manager@sunsetridge.local',
  };
  const userRows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.email, Object.values(emails)));
  const userId = (email: string) => {
    const row = userRows.find((r) => r.email === email);
    if (!row) throw new Error(`User "${email}" not found — run pnpm seed:demo first`);
    return row.id;
  };
  const camId = userId(emails.cam);
  const ownerId = userId(emails.owner);
  const tenantId = userId(emails.tenant);
  const siteManagerId = userId(emails.siteManager);

  const ownerUnit = await first<{ id: number; unitNumber: string }>(
    condo.selectFrom(units, { id: units.id, unitNumber: units.unitNumber }, eq(units.ownerUserId, ownerId)).limit(1),
  );
  if (!ownerUnit) throw new Error(`${emails.owner} owns no unit at Sunset Condos`);
  const tenantRole = await first<{ unitId: number | null }>(
    condo.selectFrom(userRoles, { unitId: userRoles.unitId }, and(eq(userRoles.userId, tenantId), isNotNull(userRoles.unitId))).limit(1),
  );
  if (!tenantRole?.unitId) throw new Error(`${emails.tenant} has no unit at Sunset Condos`);
  const tenantUnitId = tenantRole.unitId;
  const lease = await first<{ id: number; unitId: number; residentId: string }>(
    apartment
      .selectFrom(leases, { id: leases.id, unitId: leases.unitId, residentId: leases.residentId }, isNull(leases.deletedAt))
      .orderBy(leases.id)
      .limit(1),
  );
  if (!lease) throw new Error('Sunset Ridge has no lease — run pnpm seed:demo first');

  const done: string[] = [];
  const step = async (label: string, run: () => Promise<boolean>) => {
    const created = await run();
    done.push(`${created ? '+' : '='} ${label}`);
  };

  // pk-pending, pk-pickup (site manager) and pk-mine (tenant). Inserted
  // directly: createPackageForCommunity notifies the unit's residents.
  for (const [scoped, unitId, recipient] of [
    [apartment, lease.unitId, 'Sam Patel'],
    [condo, tenantUnitId, 'Taylor Tenant'],
  ] as const) {
    await step(`pending package (community ${scoped.communityId})`, async () => {
      const existing = await first(
        scoped
          .selectFrom(packageLog, { id: packageLog.id }, and(eq(packageLog.trackingNumber, PACKAGE_MARKER), ne(packageLog.status, 'picked_up')))
          .limit(1),
      );
      if (existing) return false;
      await scoped.insert(packageLog, {
        unitId,
        recipientName: recipient,
        carrier: 'UPS',
        trackingNumber: PACKAGE_MARKER,
        status: 'received',
        receivedByStaffId: scoped === apartment ? siteManagerId : camId,
        notes: 'Medium box, front desk shelf B',
      });
      return true;
    });
  }

  // vs-list, vs-revoke (site manager) and the tenant's own pass list.
  for (const [scoped, unitId, hostId] of [
    [apartment, lease.unitId, lease.residentId],
    [condo, tenantUnitId, tenantId],
  ] as const) {
    await step(`expected visitor (community ${scoped.communityId})`, async () => {
      const existing = await first(
        scoped
          .selectFrom(
            visitorLog,
            { id: visitorLog.id },
            and(
              eq(visitorLog.visitorName, 'Maria Lopez'),
              eq(visitorLog.hostUnitId, unitId),
              isNull(visitorLog.checkedInAt),
              isNull(visitorLog.revokedAt),
            ),
          )
          .limit(1),
      );
      if (existing) return false;
      await createVisitorForCommunity(scoped.communityId, hostId, {
        visitorName: 'Maria Lopez',
        purpose: 'Family visit',
        hostUnitId: unitId,
        expectedArrival: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        validUntil: null,
      });
      return true;
    });
  }

  // mio-list, mio-card
  await step('move-in checklist (Sunset Ridge)', async () => {
    const existing = await first(
      apartment.selectFrom(moveChecklists, { id: moveChecklists.id }, eq(moveChecklists.leaseId, lease.id)).limit(1),
    );
    if (existing) return false;
    await createMoveChecklist(
      { communityId: apartmentId, leaseId: lease.id, unitId: lease.unitId, residentId: lease.residentId, type: 'move_in' },
      siteManagerId,
    );
    return true;
  });

  // ct-alerts (endDate inside the 90-day window), ct-bids (bidding closed, so bids show)
  await step('expiring contract with bids', async () => {
    const title = 'Landscaping Services';
    const existing = await first<{ id: number }>(
      condo.selectFrom(contracts, { id: contracts.id }, eq(contracts.title, title)).limit(1),
    );
    if (existing) {
      await condo.update(contracts, { endDate: isoDate(new Date(Date.now() + 45 * DAY)) }, eq(contracts.id, existing.id));
      return false;
    }
    const contract = await createContractForCommunity(condo, {
      title,
      vendorName: 'GreenScape Lawn Care',
      description: 'Weekly mowing, hedge trimming and irrigation checks.',
      contractValue: '18000.00',
      startDate: isoDate(new Date(Date.now() - 320 * DAY)),
      endDate: isoDate(new Date(Date.now() + 45 * DAY)),
      biddingClosesAt: new Date(Date.now() - 10 * DAY),
      status: 'active',
      createdBy: camId,
    });
    if (!contract) throw new Error('Failed to create contract');
    for (const [vendorName, bidAmount] of [
      ['GreenScape Lawn Care', '18600.00'],
      ['Coastal Grounds Co.', '17250.00'],
    ]) {
      await createContractBidForCommunity(condo, {
        contractId: contract['id'],
        vendorName,
        bidAmount,
        notes: 'Renewal quote for the next 12 months.',
        createdBy: camId,
      });
    }
    return true;
  });

  // poll-vote
  await step('active poll', async () => {
    const title = 'Pool hours for the winter season';
    const existing = await first(condo.selectFrom(polls, { id: polls.id }, eq(polls.title, title)).limit(1));
    if (existing) return false;
    await createPollForCommunity(condoId, camId, {
      title,
      description: 'Help the board choose the pool schedule from November to March.',
      pollType: 'single_choice',
      options: ['8 am – 8 pm', '9 am – 6 pm', 'Keep the current hours'],
      endsAt: new Date(Date.now() + 21 * DAY).toISOString(),
    });
    return true;
  });

  // ins-coi: the lender-certificate request needs an agent email.
  await step('insurance policy with agent email', async () => {
    const carrierName = 'Citizens Property Insurance';
    const existing = await first(
      condo
        .selectFrom(insurancePolicies, { id: insurancePolicies.id }, and(eq(insurancePolicies.carrierName, carrierName), isNotNull(insurancePolicies.agentEmail)))
        .limit(1),
    );
    if (existing) return false;
    await createInsurancePolicy(condo, {
      policyType: 'property',
      carrierName,
      policyNumber: 'CPI-2026-04418',
      coverageSummary: 'Building replacement cost $42,000,000',
      deductibleSummary: 'Hurricane 3% of building value; all other perils $10,000',
      effectiveAt: isoDate(new Date(Date.now() - 120 * DAY)),
      expiresAt: isoDate(new Date(Date.now() + 245 * DAY)),
      agentName: 'Coastal Risk Partners',
      agentEmail: 'agent@coastalrisk.local',
      agentPhone: '(305) 555-0142',
      createdBy: camId,
    });
    return true;
  });

  // dig-card
  await step('snowbird digest enabled', async () => {
    await setCommunitySnowbirdEnabled(condo, true);
    return false;
  });

  // dash-ann, an-list, an-pin. Demo communities hide every announcement the
  // demo seed registry tracks (lib/announcements/read-visibility.ts), so this
  // one is deliberately not registered.
  await step('pinned announcement', async () => {
    const title = 'Pool resurfacing starts Monday';
    const existing = await first(condo.selectFrom(announcements, { id: announcements.id }, eq(announcements.title, title)).limit(1));
    if (existing) return false;
    await createAnnouncementForCommunity(condoId, {
      title,
      body: '<p>The pool and spa close for resurfacing from Monday for about two weeks. The fitness room stays open.</p>',
      audience: 'all',
      isPinned: true,
      publishedBy: camId,
    });
    return true;
  });

  // jr-queue, jr-deny
  await step('pending access request', async () => {
    const email = 'jordan.rivera@sunset.local';
    const existing = await first(
      condo.selectFrom(accessRequests, { id: accessRequests.id }, and(eq(accessRequests.email, email), eq(accessRequests.status, 'pending'))).limit(1),
    );
    if (existing) return false;
    await condo.insert(accessRequests, {
      email,
      fullName: 'Jordan Rivera',
      unitId: ownerUnit.id,
      claimedUnitNumber: ownerUnit.unitNumber,
      roleRequested: 'resident',
      isUnitOwner: true,
      status: 'pending',
      emailVerifiedAt: new Date(),
    });
    return true;
  });

  // arcr-queue, arcr-panel, arcr-decide
  await step('ARC submission', async () => {
    const title = 'Replace patio privacy fence';
    const existing = await first(condo.selectFrom(arcSubmissions, { id: arcSubmissions.id }, eq(arcSubmissions.title, title)).limit(1));
    if (existing) return false;
    await createArcSubmissionForCommunity(condoId, ownerId, {
      unitId: ownerUnit.id,
      title,
      description: 'Replace the existing wood patio fence with an 8-foot white vinyl privacy fence on the same footprint.',
      projectType: 'Fence',
      estimatedStartDate: isoDate(new Date(Date.now() + 30 * DAY)),
      estimatedCompletionDate: isoDate(new Date(Date.now() + 37 * DAY)),
    });
    return true;
  });

  await seedElections(db, condo, camId);
  done.push('+/= elections (draft, open, closed with ballots)');

  await seedMeetings(condo, camId);
  done.push('+/= meetings (this month; past with minutes)');

  console.log(`Help-capture fixtures (+ created, = already present):\n  ${done.join('\n  ')}`);
}

async function seedElections(db: ReturnType<typeof createUnscopedClient>, condo: Scoped, camId: string): Promise<void> {
  // Local only. The elections legal gate is deliberately left out of
  // demo:enable-gates (no attorney review yet); the capture database still
  // needs it on to show the election screens.
  await db
    .update(communities)
    .set({
      communitySettings: sql`coalesce(${communities.communitySettings}, '{}'::jsonb) || '{"electionsAttorneyReviewed": true}'::jsonb`,
    })
    .where(eq(communities.id, condo.communityId));

  const now = Date.now();
  const specs = [
    { title: '2027 Board of Directors Election', status: 'draft', opensAt: now + 14 * DAY, closesAt: now + 28 * DAY },
    { title: 'Special Election: Vacant Board Seat', status: 'open', opensAt: now - 2 * DAY, closesAt: now + 12 * DAY },
    { title: '2026 Annual Board Election', status: 'closed', opensAt: now - 21 * DAY, closesAt: now + 60 * 60 * 1000 },
  ] as const;

  for (const spec of specs) {
    const existing = await first(
      condo.selectFrom(elections, { id: elections.id }, and(eq(elections.title, spec.title), isNull(elections.deletedAt))).limit(1),
    );
    if (existing) continue;

    const [created] = (await condo.insert(elections, {
      title: spec.title,
      description: 'Vote for one candidate.',
      electionType: 'board_election',
      status: 'draft',
      ballotSalt: randomUUID(),
      maxSelections: 1,
      opensAt: new Date(spec.opensAt),
      closesAt: new Date(spec.closesAt),
      quorumPercentage: 50,
      createdByUserId: camId,
    })) as { id: number }[];
    const electionId = created!.id;
    const candidates = (await condo.insert(
      electionCandidates,
      ['Alicia Gomez', 'Robert Chen', 'Denise Walker'].map((label, sortOrder) => ({ electionId, label, sortOrder })),
    )) as { id: number }[];
    if (spec.status === 'draft') continue;

    await openElectionForCommunity(condo.communityId, electionId, camId);
    if (spec.status === 'open') continue;

    const owners = (await condo.selectFrom(units, { id: units.id, ownerUserId: units.ownerUserId }, isNotNull(units.ownerUserId))) as {
      id: number;
      ownerUserId: string;
    }[];
    for (const [index, unit] of owners.slice(0, 5).entries()) {
      await castElectionVoteForCommunity(condo.communityId, electionId, unit.ownerUserId, {
        unitId: unit.id,
        selectedCandidateIds: [candidates[index % 2]!.id],
      });
    }
    await closeElectionForCommunity(condo.communityId, electionId, camId);
    await condo.update(elections, { closesAt: new Date() }, eq(elections.id, electionId));
  }
}

async function upsertMeeting(condo: Scoped, values: { title: string; startsAt: Date; minutesApprovedAt?: Date }): Promise<number> {
  const fields = {
    meetingType: 'board',
    startsAt: values.startsAt,
    location: 'Community Clubhouse',
    noticePostedAt: new Date(values.startsAt.getTime() - 14 * DAY),
    minutesApprovedAt: values.minutesApprovedAt ?? null,
  };
  const existing = await first<{ id: number }>(
    condo.selectFrom(meetings, { id: meetings.id }, eq(meetings.title, values.title)).limit(1),
  );
  if (existing) {
    await condo.update(meetings, fields, eq(meetings.id, existing.id));
    return existing.id;
  }
  const [created] = (await condo.insert(meetings, { title: values.title, ...fields })) as { id: number }[];
  return created!.id;
}

async function seedMeetings(condo: Scoped, camId: string): Promise<void> {
  const today = new Date();
  // mt-day: a meeting in the month the calendar opens on (7 pm Eastern).
  await upsertMeeting(condo, {
    title: 'Monthly Board Meeting',
    startsAt: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 15, 23, 0)),
  });

  // mt-past, min-list: a past meeting with its minutes on the record, linked
  // to the minutes document seed-demo posts for that month.
  const pastStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 15, 23, 0));
  const meetingId = await upsertMeeting(condo, {
    title: 'Quarterly Board Meeting',
    startsAt: pastStart,
    minutesApprovedAt: new Date(pastStart.getTime() + 10 * DAY),
  });
  const minutesTitle = `Board Minutes ${pastStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`;
  const minutes = await first<{ id: number }>(
    condo.selectFrom(documents, { id: documents.id }, eq(documents.title, minutesTitle)).limit(1),
  );
  if (!minutes) throw new Error(`Minutes document "${minutesTitle}" not found — run pnpm seed:demo first`);
  const linked = await first(
    condo
      .selectFrom(meetingDocuments, { id: meetingDocuments.id }, and(eq(meetingDocuments.meetingId, meetingId), eq(meetingDocuments.documentId, minutes.id)))
      .limit(1),
  );
  if (!linked) {
    await condo.insert(meetingDocuments, { meetingId, documentId: minutes.id, attachedBy: camId });
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeUnscopedClient());
