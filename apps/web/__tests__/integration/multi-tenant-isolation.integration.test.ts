import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { NextRequest, NextResponse } from 'next/server';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { middleware } from '../../src/middleware';
import {
  MULTI_TENANT_COMMUNITIES,
  type MultiTenantCommunityKey,
} from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS, type MultiTenantUserKey } from '../fixtures/multi-tenant-users';
import {
  apiUrl,
  jsonRequest,
  parseJson,
  requireInsertedRow,
  readNumberField,
  mapValueOrThrow,
} from './helpers/multi-tenant-test-kit';

if (process.env.CI && !process.env.DATABASE_URL) {
  throw new Error('P2-43 multi-tenant isolation integration tests require DATABASE_URL in CI');
}

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const {
  requireAuthenticatedUserIdMock,
  createMiddlewareClientMock,
  getUserMock,
  fromMock,
  selectMock,
  eqMock,
  isMock,
  limitMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  createMiddlewareClientMock: vi.fn(),
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
  selectMock: vi.fn(),
  eqMock: vi.fn(),
  isMock: vi.fn(),
  limitMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@propertypro/db/supabase/middleware', () => ({
  createMiddlewareClient: createMiddlewareClientMock,
}));

type DbModule = typeof import('@propertypro/db');
type DocumentsRouteModule = typeof import('../../src/app/api/v1/documents/route');
type DocumentVersionsRouteModule = typeof import('../../src/app/api/v1/documents/[id]/versions/route');
type DocumentDownloadRouteModule = typeof import('../../src/app/api/v1/documents/[id]/download/route');
type MeetingsRouteModule = typeof import('../../src/app/api/v1/meetings/route');
type AnnouncementsRouteModule = typeof import('../../src/app/api/v1/announcements/route');
type ResidentsRouteModule = typeof import('../../src/app/api/v1/residents/route');
type ComplianceRouteModule = typeof import('../../src/app/api/v1/compliance/route');

interface RouteModules {
  documents: DocumentsRouteModule;
  documentVersions: DocumentVersionsRouteModule;
  documentDownload: DocumentDownloadRouteModule;
  meetings: MeetingsRouteModule;
  announcements: AnnouncementsRouteModule;
  residents: ResidentsRouteModule;
  compliance: ComplianceRouteModule;
}

interface SeededData {
  runSuffix: string;
  communityAId: number;
  communityBId: number;
  actorAId: string;
  actorBId: string;
  residentAId: string;
  residentBId: string;
  documentAId: number;
  documentBId: number;
  documentAFileName: string;
  documentASoftDeletedFileName: string;
  documentBFileName: string;
  meetingAId: number;
  meetingBId: number;
  meetingATitle: string;
  meetingASoftDeletedTitle: string;
  meetingBTitle: string;
  announcementAId: number;
  announcementBId: number;
  announcementATitle: string;
  announcementArchivedATitle: string;
  announcementBTitle: string;
  complianceAKey: string;
  complianceASoftDeletedKey: string;
  complianceBKey: string;
  cleanupCommunityIds: number[];
  cleanupUserIds: string[];
}

interface MiddlewareUser {
  id: string;
  email_confirmed_at: string | null;
}

interface MiddlewareConfig {
  slugToCommunityId: Record<string, number | null>;
  user: MiddlewareUser | null;
}

let dbModule: DbModule | null = null;
let routes: RouteModules | null = null;
let sqlClient: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle> | null = null;
let seededData: SeededData | null = null;
let currentActorUserId: string | null = null;

function requireDbModule(): DbModule {
  if (!dbModule) {
    throw new Error('DB module has not been initialized');
  }
  return dbModule;
}

function requireRoutes(): RouteModules {
  if (!routes) {
    throw new Error('Route modules have not been initialized');
  }
  return routes;
}

function requireDb(): ReturnType<typeof drizzle> {
  if (!db) {
    throw new Error('Database client has not been initialized');
  }
  return db;
}

function requireSeededData(): SeededData {
  if (!seededData) {
    throw new Error('Seeded data has not been initialized');
  }
  return seededData;
}

function requireCurrentActor(): string {
  if (!currentActorUserId) {
    throw new Error('Current test actor user ID is not set');
  }
  return currentActorUserId;
}

function setActor(userId: string): void {
  currentActorUserId = userId;
}

async function seedData(): Promise<SeededData> {
  const database = requireDb();
  const dbPkg = requireDbModule();
  const runSuffix = randomUUID().slice(0, 8);

  // Only seed communities A + B (this test pre-dates communityC)
  const abCommunities = MULTI_TENANT_COMMUNITIES.filter(
    (c) => c.key === 'communityA' || c.key === 'communityB',
  );
  // Only seed the original 4 elevated-role users
  const abUsers = MULTI_TENANT_USERS.filter(
    (u) => u.key === 'actorA' || u.key === 'actorB' || u.key === 'residentA' || u.key === 'residentB',
  );

  const communityIds = new Map<MultiTenantCommunityKey, number>();
  for (const community of abCommunities) {
    const [insertedCommunity] = await database
      .insert(dbPkg.communities)
      .values({
        name: `${community.name} ${runSuffix}`,
        slug: `${community.slugBase}-${runSuffix}`,
        communityType: community.communityType,
        timezone: community.timezone,
      })
      .returning({ id: dbPkg.communities.id });

    if (!insertedCommunity) {
      throw new Error(`Failed to seed community "${community.key}"`);
    }

    communityIds.set(community.key, insertedCommunity.id);
  }

  const communityAId = mapValueOrThrow(communityIds, 'communityA', 'communityA id');
  const communityBId = mapValueOrThrow(communityIds, 'communityB', 'communityB id');

  const userIds = new Map<MultiTenantUserKey, string>();
  for (const user of abUsers) {
    const userId = randomUUID();
    userIds.set(user.key, userId);
    await database.insert(dbPkg.users).values({
      id: userId,
      email: `${user.emailPrefix}+${runSuffix}@example.com`,
      fullName: `${user.fullName} ${runSuffix}`,
      phone: null,
    });
  }

  for (const user of abUsers) {
    const userId = mapValueOrThrow(userIds, user.key, `${user.key} id`);
    const communityId = mapValueOrThrow(communityIds, user.communityKey, `${user.communityKey} id`);
    const scoped = dbPkg.createScopedClient(communityId);
    await scoped.insert(dbPkg.userRoles, {
      userId,
      role: user.role,
      isUnitOwner: user.isUnitOwner,
      displayTitle: user.displayTitle,
      presetKey: user.presetKey ?? null,
      permissions: user.permissions ?? null,
      unitId: null,
    });
  }

  const actorAId = mapValueOrThrow(userIds, 'actorA', 'actorA id');
  const actorBId = mapValueOrThrow(userIds, 'actorB', 'actorB id');
  const residentAId = mapValueOrThrow(userIds, 'residentA', 'residentA id');
  const residentBId = mapValueOrThrow(userIds, 'residentB', 'residentB id');

  const scopedA = dbPkg.createScopedClient(communityAId);
  const scopedB = dbPkg.createScopedClient(communityBId);

  const documentAFileName = `p2-43-doc-a-active-${runSuffix}.pdf`;
  const documentASoftDeletedFileName = `p2-43-doc-a-soft-${runSuffix}.pdf`;
  const documentBFileName = `p2-43-doc-b-active-${runSuffix}.pdf`;

  const [documentA] = await scopedA.insert(dbPkg.documents, {
    title: `P2-43 Document A Active ${runSuffix}`,
    filePath: `communities/${communityAId}/documents/${documentAFileName}`,
    fileName: documentAFileName,
    fileSize: 2048,
    mimeType: 'application/pdf',
    uploadedBy: actorAId,
  });
  const [documentASoftDeleted] = await scopedA.insert(dbPkg.documents, {
    title: `P2-43 Document A Soft Deleted ${runSuffix}`,
    filePath: `communities/${communityAId}/documents/${documentASoftDeletedFileName}`,
    fileName: documentASoftDeletedFileName,
    fileSize: 2048,
    mimeType: 'application/pdf',
    uploadedBy: actorAId,
  });
  const [documentB] = await scopedB.insert(dbPkg.documents, {
    title: `P2-43 Document B Active ${runSuffix}`,
    filePath: `communities/${communityBId}/documents/${documentBFileName}`,
    fileName: documentBFileName,
    fileSize: 2048,
    mimeType: 'application/pdf',
    uploadedBy: actorBId,
  });

  const documentAId = readNumberField(requireInsertedRow(documentA, 'documentA'), 'id');
  const documentASoftDeletedId = readNumberField(
    requireInsertedRow(documentASoftDeleted, 'documentASoftDeleted'),
    'id',
  );
  const documentBId = readNumberField(requireInsertedRow(documentB, 'documentB'), 'id');

  await database
    .update(dbPkg.documents)
    .set({ deletedAt: new Date() })
    .where(eq(dbPkg.documents.id, documentASoftDeletedId));

  const meetingATitle = `P2-43 Meeting A Active ${runSuffix}`;
  const meetingASoftDeletedTitle = `P2-43 Meeting A Soft Deleted ${runSuffix}`;
  const meetingBTitle = `P2-43 Meeting B Active ${runSuffix}`;

  const [meetingA] = await scopedA.insert(dbPkg.meetings, {
    title: meetingATitle,
    meetingType: 'board',
    startsAt: new Date('2026-03-01T15:00:00.000Z'),
    location: 'Sunset Clubhouse',
  });
  const [meetingASoftDeleted] = await scopedA.insert(dbPkg.meetings, {
    title: meetingASoftDeletedTitle,
    meetingType: 'annual',
    startsAt: new Date('2026-04-01T15:00:00.000Z'),
    location: 'Sunset Clubhouse',
  });
  const [meetingB] = await scopedB.insert(dbPkg.meetings, {
    title: meetingBTitle,
    meetingType: 'board',
    startsAt: new Date('2026-03-10T15:00:00.000Z'),
    location: 'Palm Shores Hall',
  });

  const meetingAId = readNumberField(requireInsertedRow(meetingA, 'meetingA'), 'id');
  const meetingASoftDeletedId = readNumberField(
    requireInsertedRow(meetingASoftDeleted, 'meetingASoftDeleted'),
    'id',
  );
  const meetingBId = readNumberField(requireInsertedRow(meetingB, 'meetingB'), 'id');

  await database
    .update(dbPkg.meetings)
    .set({ deletedAt: new Date() })
    .where(eq(dbPkg.meetings.id, meetingASoftDeletedId));

  const announcementATitle = `P2-43 Announcement A Active ${runSuffix}`;
  const announcementArchivedATitle = `P2-43 Announcement A Archived ${runSuffix}`;
  const announcementBTitle = `P2-43 Announcement B Active ${runSuffix}`;

  const [announcementA] = await scopedA.insert(dbPkg.announcements, {
    title: announcementATitle,
    body: 'Active announcement for community A',
    audience: 'all',
    isPinned: false,
    publishedBy: actorAId,
  });
  await scopedA.insert(dbPkg.announcements, {
    title: announcementArchivedATitle,
    body: 'Archived announcement for community A',
    audience: 'all',
    isPinned: false,
    publishedBy: actorAId,
    archivedAt: new Date(),
  });
  const [announcementB] = await scopedB.insert(dbPkg.announcements, {
    title: announcementBTitle,
    body: 'Active announcement for community B',
    audience: 'all',
    isPinned: false,
    publishedBy: actorBId,
  });

  const announcementAId = readNumberField(requireInsertedRow(announcementA, 'announcementA'), 'id');
  const announcementBId = readNumberField(requireInsertedRow(announcementB, 'announcementB'), 'id');

  const complianceAKey = `p2-43-compliance-a-active-${runSuffix}`;
  const complianceASoftDeletedKey = `p2-43-compliance-a-soft-${runSuffix}`;
  const complianceBKey = `p2-43-compliance-b-active-${runSuffix}`;

  await scopedA.insert(dbPkg.complianceChecklistItems, {
    templateKey: complianceAKey,
    title: 'Community A Compliance Active',
    category: 'meeting_records',
    statuteReference: '§718.111(12)(a)',
    lastModifiedBy: actorAId,
  });
  const [complianceASoftDeleted] = await scopedA.insert(dbPkg.complianceChecklistItems, {
    templateKey: complianceASoftDeletedKey,
    title: 'Community A Compliance Soft Deleted',
    category: 'meeting_records',
    statuteReference: '§718.111(12)(a)',
    lastModifiedBy: actorAId,
  });
  await scopedB.insert(dbPkg.complianceChecklistItems, {
    templateKey: complianceBKey,
    title: 'Community B Compliance Active',
    category: 'meeting_records',
    statuteReference: '§720.303(4)(l)',
    lastModifiedBy: actorBId,
  });

  const complianceASoftDeletedId = readNumberField(
    requireInsertedRow(complianceASoftDeleted, 'complianceASoftDeleted'),
    'id',
  );
  await database
    .update(dbPkg.complianceChecklistItems)
    .set({ deletedAt: new Date() })
    .where(eq(dbPkg.complianceChecklistItems.id, complianceASoftDeletedId));

  return {
    runSuffix,
    communityAId,
    communityBId,
    actorAId,
    actorBId,
    residentAId,
    residentBId,
    documentAId,
    documentBId,
    documentAFileName,
    documentASoftDeletedFileName,
    documentBFileName,
    meetingAId,
    meetingBId,
    meetingATitle,
    meetingASoftDeletedTitle,
    meetingBTitle,
    announcementAId,
    announcementBId,
    announcementATitle,
    announcementArchivedATitle,
    announcementBTitle,
    complianceAKey,
    complianceASoftDeletedKey,
    complianceBKey,
    cleanupCommunityIds: [communityAId, communityBId],
    cleanupUserIds: [actorAId, actorBId, residentAId, residentBId],
  };
}

async function teardownSeededData(): Promise<void> {
  if (!dbModule || !db || !seededData) {
    return;
  }

  try {
    await db
      .delete(dbModule.communities)
      .where(inArray(dbModule.communities.id, seededData.cleanupCommunityIds));
  } catch {
    // compliance_audit_log is append-only with FK restrict; audited runs may pin communities.
  }

  try {
    await db
      .delete(dbModule.users)
      .where(inArray(dbModule.users.id, seededData.cleanupUserIds));
  } catch {
    // Best-effort cleanup only; users referenced by append-only audit rows cannot be deleted.
  }
}

function configureMiddlewareClient(config: MiddlewareConfig): { getRequestedSlug: () => string | null } {
  let requestedSlug: string | null = null;

  limitMock.mockImplementation(async () => {
    const communityId =
      requestedSlug == null ? null : (config.slugToCommunityId[requestedSlug] ?? null);
    return {
      data: communityId == null ? [] : [{ id: communityId }],
      error: null,
    };
  });

  isMock.mockImplementation(() => ({ limit: limitMock }));
  eqMock.mockImplementation((column: unknown, value: unknown) => {
    if (column === 'slug') {
      requestedSlug = String(value);
    }
    return { is: isMock };
  });
  selectMock.mockImplementation(() => ({ eq: eqMock }));
  fromMock.mockImplementation(() => ({ select: selectMock }));

  getUserMock.mockResolvedValue({
    data: { user: config.user },
  });

  createMiddlewareClientMock.mockResolvedValue({
    supabase: {
      auth: { getUser: getUserMock },
      from: fromMock,
    },
    response: NextResponse.next(),
  });

  return {
    getRequestedSlug: () => requestedSlug,
  };
}

describeDb('p2-43 multi-tenant isolation (db-backed integration)', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return;
    }

    dbModule = await import('@propertypro/db');
    routes = {
      documents: await import('../../src/app/api/v1/documents/route'),
      documentVersions: await import('../../src/app/api/v1/documents/[id]/versions/route'),
      documentDownload: await import('../../src/app/api/v1/documents/[id]/download/route'),
      meetings: await import('../../src/app/api/v1/meetings/route'),
      announcements: await import('../../src/app/api/v1/announcements/route'),
      residents: await import('../../src/app/api/v1/residents/route'),
      compliance: await import('../../src/app/api/v1/compliance/route'),
    };

    sqlClient = postgres(databaseUrl, { prepare: false });
    db = drizzle(sqlClient);
    seededData = await seedData();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockImplementation(async () => requireCurrentActor());
    if (seededData) {
      currentActorUserId = seededData.actorAId;
    }
  });

  afterAll(async () => {
    try {
      await teardownSeededData();
    } finally {
      if (sqlClient) {
        await sqlClient.end();
      }
    }
  });

  it('keeps read endpoints tenant-isolated with tenant-correct soft-delete filtering', async () => {
    const seeded = requireSeededData();
    const appRoutes = requireRoutes();
    setActor(seeded.actorAId);

    const documentsResponse = await appRoutes.documents.GET(
      new NextRequest(apiUrl(`/api/v1/documents?communityId=${seeded.communityAId}`)),
    );
    expect(documentsResponse.status).toBe(200);
    const documentsJson = await parseJson<{ data: Array<Record<string, unknown>> }>(
      documentsResponse,
    );
    const documentFileNames = documentsJson.data.map((row) => String(row['fileName']));
    expect(documentFileNames).toContain(seeded.documentAFileName);
    expect(documentFileNames).not.toContain(seeded.documentASoftDeletedFileName);
    expect(documentFileNames).not.toContain(seeded.documentBFileName);

    const meetingsResponse = await appRoutes.meetings.GET(
      new NextRequest(apiUrl(`/api/v1/meetings?communityId=${seeded.communityAId}`)),
    );
    expect(meetingsResponse.status).toBe(200);
    const meetingsJson = await parseJson<{ data: Array<Record<string, unknown>> }>(meetingsResponse);
    const meetingTitles = meetingsJson.data.map((row) => String(row['title']));
    expect(meetingTitles).toContain(seeded.meetingATitle);
    expect(meetingTitles).not.toContain(seeded.meetingASoftDeletedTitle);
    expect(meetingTitles).not.toContain(seeded.meetingBTitle);

    const residentsResponse = await appRoutes.residents.GET(
      new NextRequest(apiUrl(`/api/v1/residents?communityId=${seeded.communityAId}`)),
    );
    expect(residentsResponse.status).toBe(200);
    const residentsJson = await parseJson<{ data: Array<Record<string, unknown>> }>(
      residentsResponse,
    );
    const residentUserIds = residentsJson.data.map((row) => String(row['userId']));
    expect(residentUserIds).toContain(seeded.actorAId);
    expect(residentUserIds).toContain(seeded.residentAId);
    expect(residentUserIds).not.toContain(seeded.actorBId);
    expect(residentUserIds).not.toContain(seeded.residentBId);

    const complianceResponse = await appRoutes.compliance.GET(
      new NextRequest(apiUrl(`/api/v1/compliance?communityId=${seeded.communityAId}`)),
    );
    expect(complianceResponse.status).toBe(200);
    const complianceJson = await parseJson<{ data: Array<Record<string, unknown>> }>(
      complianceResponse,
    );
    const complianceKeys = complianceJson.data.map((row) => String(row['templateKey']));
    expect(complianceKeys).toContain(seeded.complianceAKey);
    expect(complianceKeys).not.toContain(seeded.complianceASoftDeletedKey);
    expect(complianceKeys).not.toContain(seeded.complianceBKey);
  });

  it('keeps announcement reads tenant-isolated and archive-aware', async () => {
    const seeded = requireSeededData();
    const appRoutes = requireRoutes();
    setActor(seeded.actorAId);

    const defaultResponse = await appRoutes.announcements.GET(
      new NextRequest(apiUrl(`/api/v1/announcements?communityId=${seeded.communityAId}`)),
    );
    expect(defaultResponse.status).toBe(200);
    const defaultJson = await parseJson<{ data: Array<Record<string, unknown>> }>(defaultResponse);
    const defaultTitles = defaultJson.data.map((row) => String(row['title']));
    expect(defaultTitles).toContain(seeded.announcementATitle);
    expect(defaultTitles).not.toContain(seeded.announcementArchivedATitle);
    expect(defaultTitles).not.toContain(seeded.announcementBTitle);

    const includeArchivedResponse = await appRoutes.announcements.GET(
      new NextRequest(
        apiUrl(`/api/v1/announcements?communityId=${seeded.communityAId}&includeArchived=true`),
      ),
    );
    expect(includeArchivedResponse.status).toBe(200);
    const includeArchivedJson = await parseJson<{ data: Array<Record<string, unknown>> }>(
      includeArchivedResponse,
    );
    const includeArchivedTitles = includeArchivedJson.data.map((row) => String(row['title']));
    expect(includeArchivedTitles).toContain(seeded.announcementATitle);
    expect(includeArchivedTitles).toContain(seeded.announcementArchivedATitle);
    expect(includeArchivedTitles).not.toContain(seeded.announcementBTitle);
  });

  it('returns 403 when community A actor queries community B read endpoints', async () => {
    const seeded = requireSeededData();
    const appRoutes = requireRoutes();
    setActor(seeded.actorAId);

    const checks: Array<{ name: string; run: () => Promise<Response> }> = [
      {
        name: 'documents GET',
        run: () =>
          appRoutes.documents.GET(
            new NextRequest(apiUrl(`/api/v1/documents?communityId=${seeded.communityBId}`)),
          ),
      },
      {
        name: 'meetings GET',
        run: () =>
          appRoutes.meetings.GET(
            new NextRequest(apiUrl(`/api/v1/meetings?communityId=${seeded.communityBId}`)),
          ),
      },
      {
        name: 'announcements GET',
        run: () =>
          appRoutes.announcements.GET(
            new NextRequest(apiUrl(`/api/v1/announcements?communityId=${seeded.communityBId}`)),
          ),
      },
      {
        name: 'residents GET',
        run: () =>
          appRoutes.residents.GET(
            new NextRequest(apiUrl(`/api/v1/residents?communityId=${seeded.communityBId}`)),
          ),
      },
      {
        name: 'compliance GET',
        run: () =>
          appRoutes.compliance.GET(
            new NextRequest(apiUrl(`/api/v1/compliance?communityId=${seeded.communityBId}`)),
          ),
      },
    ];

    for (const check of checks) {
      const response = await check.run();
      expect(response.status, `${check.name} should reject cross-tenant reads`).toBe(403);
    }
  });

  it('returns 403 for cross-tenant mutation endpoints with matching community payload', async () => {
    const seeded = requireSeededData();
    const appRoutes = requireRoutes();
    setActor(seeded.actorAId);

    const documentsCreateResponse = await appRoutes.documents.POST(
      jsonRequest(apiUrl('/api/v1/documents'), 'POST', {
        communityId: seeded.communityBId,
        title: 'Cross-tenant create attempt',
        description: null,
        categoryId: null,
        filePath: `communities/${seeded.communityBId}/documents/membership-check.pdf`,
        fileName: 'membership-check.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      }),
    );
    expect(documentsCreateResponse.status).toBe(403);

    const documentsDeleteResponse = await appRoutes.documents.DELETE(
      new NextRequest(
        apiUrl(`/api/v1/documents?id=${seeded.documentBId}&communityId=${seeded.communityBId}`),
        { method: 'DELETE' },
      ),
    );
    expect(documentsDeleteResponse.status).toBe(403);

    const complianceCreateResponse = await appRoutes.compliance.POST(
      jsonRequest(apiUrl('/api/v1/compliance'), 'POST', {
        communityId: seeded.communityBId,
      }),
    );
    expect(complianceCreateResponse.status).toBe(403);
  });

  it('returns 404 for direct-id cross-tenant access attempts', async () => {
    const seeded = requireSeededData();
    const appRoutes = requireRoutes();
    setActor(seeded.actorAId);

    const versionsResponse = await appRoutes.documentVersions.GET(
      new NextRequest(
        apiUrl(`/api/v1/documents/${seeded.documentBId}/versions?communityId=${seeded.communityAId}`),
      ),
      { params: Promise.resolve({ id: String(seeded.documentBId) }) },
    );
    expect(versionsResponse.status).toBe(404);

    const downloadResponse = await appRoutes.documentDownload.GET(
      new NextRequest(
        apiUrl(`/api/v1/documents/${seeded.documentBId}/download?communityId=${seeded.communityAId}`),
      ),
      { params: Promise.resolve({ id: String(seeded.documentBId) }) },
    );
    expect(downloadResponse.status).toBe(404);

    const meetingsUpdateResponse = await appRoutes.meetings.POST(
      jsonRequest(apiUrl('/api/v1/meetings'), 'POST', {
        action: 'update',
        id: seeded.meetingBId,
        communityId: seeded.communityAId,
        title: 'Cross-tenant meeting update attempt',
      }),
    );
    expect(meetingsUpdateResponse.status).toBe(404);

    const announcementsUpdateResponse = await appRoutes.announcements.POST(
      jsonRequest(apiUrl('/api/v1/announcements'), 'POST', {
        action: 'update',
        id: seeded.announcementBId,
        communityId: seeded.communityAId,
        title: 'Cross-tenant announcement update attempt',
      }),
    );
    expect(announcementsUpdateResponse.status).toBe(404);

    const residentsPatchResponse = await appRoutes.residents.PATCH(
      jsonRequest(apiUrl('/api/v1/residents'), 'PATCH', {
        communityId: seeded.communityAId,
        userId: seeded.residentBId,
        fullName: 'Cross-tenant resident update attempt',
      }),
    );
    expect(residentsPatchResponse.status).toBe(404);
  });

  it('returns 404 for tenant-header and payload community mismatch on mutation endpoints', async () => {
    const seeded = requireSeededData();
    const appRoutes = requireRoutes();
    setActor(seeded.actorAId);

    const mismatchHeaders = {
      'x-community-id': String(seeded.communityAId),
    };

    const documentsMismatchResponse = await appRoutes.documents.POST(
      jsonRequest(
        apiUrl('/api/v1/documents'),
        'POST',
        {
          communityId: seeded.communityBId,
          title: 'Cross-tenant payload mismatch',
          description: null,
          categoryId: null,
          filePath: 'communities/mismatch/documents/mismatch.pdf',
          fileName: `mismatch-${seeded.runSuffix}.pdf`,
          fileSize: 1024,
          mimeType: 'application/pdf',
        },
        mismatchHeaders,
      ),
    );
    expect(documentsMismatchResponse.status).toBe(404);

    const meetingsMismatchResponse = await appRoutes.meetings.POST(
      jsonRequest(
        apiUrl('/api/v1/meetings'),
        'POST',
        {
          communityId: seeded.communityBId,
        },
        mismatchHeaders,
      ),
    );
    expect(meetingsMismatchResponse.status).toBe(404);

    const announcementsMismatchResponse = await appRoutes.announcements.POST(
      jsonRequest(
        apiUrl('/api/v1/announcements'),
        'POST',
        {
          communityId: seeded.communityBId,
        },
        mismatchHeaders,
      ),
    );
    expect(announcementsMismatchResponse.status).toBe(404);

    const residentsMismatchResponse = await appRoutes.residents.POST(
      jsonRequest(
        apiUrl('/api/v1/residents'),
        'POST',
        {
          communityId: seeded.communityBId,
          email: `mismatch-${seeded.runSuffix}@example.com`,
          fullName: 'Mismatch Resident',
          phone: null,
          role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board Member', presetKey: 'board_member', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } },
          unitId: null,
        },
        mismatchHeaders,
      ),
    );
    expect(residentsMismatchResponse.status).toBe(404);

    const complianceMismatchResponse = await appRoutes.compliance.POST(
      jsonRequest(
        apiUrl('/api/v1/compliance'),
        'POST',
        {
          communityId: seeded.communityBId,
        },
        mismatchHeaders,
      ),
    );
    expect(complianceMismatchResponse.status).toBe(404);
  });

  it('keeps audit log scoped reads tenant-isolated after audited route mutations', async () => {
    const seeded = requireSeededData();
    const appRoutes = requireRoutes();
    const dbPkg = requireDbModule();

    setActor(seeded.actorAId);
    const createMeetingAResponse = await appRoutes.meetings.POST(
      jsonRequest(apiUrl('/api/v1/meetings'), 'POST', {
        communityId: seeded.communityAId,
        title: `P2-43 Audit Meeting A ${seeded.runSuffix}`,
        meetingType: 'board',
        startsAt: '2026-05-01T18:00:00.000Z',
        location: 'Audit Hall A',
      }),
    );
    expect(createMeetingAResponse.status).toBe(201);

    setActor(seeded.actorBId);
    const createMeetingBResponse = await appRoutes.meetings.POST(
      jsonRequest(apiUrl('/api/v1/meetings'), 'POST', {
        communityId: seeded.communityBId,
        title: `P2-43 Audit Meeting B ${seeded.runSuffix}`,
        meetingType: 'board',
        startsAt: '2026-05-02T18:00:00.000Z',
        location: 'Audit Hall B',
      }),
    );
    expect(createMeetingBResponse.status).toBe(201);

    const auditRowsForA = await dbPkg
      .createScopedClient(seeded.communityAId)
      .query(dbPkg.complianceAuditLog);
    const auditRowsForB = await dbPkg
      .createScopedClient(seeded.communityBId)
      .query(dbPkg.complianceAuditLog);

    expect(auditRowsForA.length).toBeGreaterThan(0);
    expect(auditRowsForB.length).toBeGreaterThan(0);

    for (const row of auditRowsForA) {
      expect(row['communityId']).toBe(seeded.communityAId);
    }
    for (const row of auditRowsForB) {
      expect(row['communityId']).toBe(seeded.communityBId);
    }
  });
});

// Direct route-handler tests above bypass middleware by design.
// These middleware tests cover tenant precedence + header sanitization behavior.
describe('p2-43 middleware tenant precedence and header sanitization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers tenant query over conflicting host subdomain', async () => {
    const tracker = configureMiddlewareClient({
      slugToCommunityId: {
        'tenant-query-wins': 501,
        'tenant-host-conflict': 999,
      },
      user: {
        id: 'middleware-user-a',
        email_confirmed_at: '2026-02-01T00:00:00.000Z',
      },
    });

    const response = await middleware(
      new NextRequest(apiUrl('/api/v1/documents?tenant=tenant-query-wins'), {
        headers: {
          host: 'tenant-host-conflict.propertyprofl.com',
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(tracker.getRequestedSlug()).toBe('tenant-query-wins');
    expect(response.headers.get('x-middleware-request-x-community-id')).toBe('501');
    expect(response.headers.get('x-middleware-request-x-tenant-slug')).toBe('tenant-query-wins');
    expect(response.headers.get('x-middleware-request-x-tenant-source')).toBe('tenant_query');
  });

  it('sanitizes spoofed inbound tenant headers and forwards server-owned values', async () => {
    configureMiddlewareClient({
      slugToCommunityId: {
        'tenant-sanitized': 777,
      },
      user: {
        id: 'middleware-user-b',
        email_confirmed_at: '2026-02-01T00:00:00.000Z',
      },
    });

    const response = await middleware(
      new NextRequest(apiUrl('/api/v1/documents'), {
        headers: {
          host: 'tenant-sanitized.propertyprofl.com',
          'x-community-id': '999',
          'x-tenant-slug': 'spoofed-slug',
          'x-tenant-source': 'spoofed-source',
          'x-user-id': 'spoofed-user',
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-request-x-community-id')).toBe('777');
    expect(response.headers.get('x-middleware-request-x-tenant-slug')).toBe('tenant-sanitized');
    expect(response.headers.get('x-middleware-request-x-tenant-source')).toBe('host_subdomain');
    expect(response.headers.get('x-middleware-request-x-user-id')).toBe('middleware-user-b');

    const overrideHeaders = response.headers.get('x-middleware-override-headers') ?? '';
    expect(overrideHeaders).toContain('x-community-id');
    expect(overrideHeaders).toContain('x-tenant-slug');
    expect(overrideHeaders).toContain('x-tenant-source');
    expect(overrideHeaders).toContain('x-user-id');
  });
});
