/**
 * P4-55 RLS validation — APPLICATION-LAYER isolation tests.
 *
 * Despite the "RLS validation" name, this file tests application-layer tenant isolation,
 * NOT PostgreSQL Row-Level Security enforcement at the database layer.
 *
 * What is tested: route handlers return structured 401/403/404 for unauthorized access,
 * and createScopedClient scopes queries to the actor's community. The 403s originate from
 * requireCommunityMembership() in app code — NOT from Postgres RLS policy violations.
 *
 * DB-layer RLS enforcement (actual Postgres policy behavior) is covered separately in:
 *   packages/db/__tests__/rls-policies.integration.test.ts
 *
 * This distinction matters: the app's DATABASE_URL connects as the postgres superuser,
 * which bypasses RLS. Scoped isolation is enforced via TypeScript WHERE-clause injection,
 * not Postgres policies. DB-layer RLS defends against direct connections using the
 * authenticated role (e.g., Supabase client-side queries).
 */
import { randomUUID } from 'node:crypto';
import { and, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { NextRequest } from 'next/server';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiUrl, jsonRequest, parseJson } from './helpers/multi-tenant-test-kit';

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const { requireAuthenticatedUserIdMock } = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

type DbModule = typeof import('@propertypro/db');
type DocumentsRouteModule = typeof import('../../src/app/api/v1/documents/route');
type MeetingsRouteModule = typeof import('../../src/app/api/v1/meetings/route');

interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

interface SeededData {
  runSuffix: string;
  communityAId: number;
  communityBId: number;
  actorAId: string;
  actorBId: string;
  documentAFileName: string;
  documentBFileName: string;
}

let dbModule: DbModule | null = null;
let documentsRoute: DocumentsRouteModule | null = null;
let meetingsRoute: MeetingsRouteModule | null = null;
let sqlClient: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle> | null = null;
let seeded: SeededData | null = null;
let currentActorUserId: string | null = null;

function setActor(userId: string): void {
  currentActorUserId = userId;
}

function requireCurrentActor(): string {
  if (!currentActorUserId) {
    throw new Error('Current test actor user ID is not set');
  }
  return currentActorUserId;
}

function requireSeeded(): SeededData {
  if (!seeded) {
    throw new Error('Seeded data has not been initialized');
  }
  return seeded;
}

describeDb('P4-55 RLS validation (integration)', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) return;

    dbModule = await import('@propertypro/db');
    documentsRoute = await import('../../src/app/api/v1/documents/route');
    meetingsRoute = await import('../../src/app/api/v1/meetings/route');

    sqlClient = postgres(databaseUrl, { prepare: false });
    db = drizzle(sqlClient);

    const runSuffix = randomUUID().slice(0, 8);

    const [communityA] = await db
      .insert(dbModule.communities)
      .values({
        name: `P4-55 RLS Validation A ${runSuffix}`,
        slug: `p4-55-rls-a-${runSuffix}`,
        communityType: 'condo_718',
        timezone: 'America/New_York',
      })
      .returning({ id: dbModule.communities.id });

    const [communityB] = await db
      .insert(dbModule.communities)
      .values({
        name: `P4-55 RLS Validation B ${runSuffix}`,
        slug: `p4-55-rls-b-${runSuffix}`,
        communityType: 'hoa_720',
        timezone: 'America/Chicago',
      })
      .returning({ id: dbModule.communities.id });

    if (!communityA || !communityB) {
      throw new Error('Failed to seed communities for RLS validation tests');
    }

    const actorAId = randomUUID();
    const actorBId = randomUUID();

    await db.insert(dbModule.users).values([
      {
        id: actorAId,
        email: `p4-55-rls-actor-a+${runSuffix}@example.com`,
        fullName: `P4-55 Actor A ${runSuffix}`,
      },
      {
        id: actorBId,
        email: `p4-55-rls-actor-b+${runSuffix}@example.com`,
        fullName: `P4-55 Actor B ${runSuffix}`,
      },
    ]);

    const scopedA = dbModule.createScopedClient(communityA.id);
    const scopedB = dbModule.createScopedClient(communityB.id);

    await scopedA.insert(dbModule.userRoles, {
      userId: actorAId,
      role: 'manager', isUnitOwner: false, displayTitle: 'Board President', presetKey: 'board_president', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } },
      unitId: null,
    });
    await scopedB.insert(dbModule.userRoles, {
      userId: actorBId,
      role: 'manager', isUnitOwner: false, displayTitle: 'Board President', presetKey: 'board_president', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } },
      unitId: null,
    });

    const documentAFileName = `p4-55-rls-doc-a-${runSuffix}.pdf`;
    const documentBFileName = `p4-55-rls-doc-b-${runSuffix}.pdf`;

    await scopedA.insert(dbModule.documents, {
      title: `P4-55 Document A ${runSuffix}`,
      filePath: `communities/${communityA.id}/documents/${documentAFileName}`,
      fileName: documentAFileName,
      fileSize: 1024,
      mimeType: 'application/pdf',
      uploadedBy: actorAId,
    });
    await scopedB.insert(dbModule.documents, {
      title: `P4-55 Document B ${runSuffix}`,
      filePath: `communities/${communityB.id}/documents/${documentBFileName}`,
      fileName: documentBFileName,
      fileSize: 1024,
      mimeType: 'application/pdf',
      uploadedBy: actorBId,
    });

    seeded = {
      runSuffix,
      communityAId: communityA.id,
      communityBId: communityB.id,
      actorAId,
      actorBId,
      documentAFileName,
      documentBFileName,
    };
  });

  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockImplementation(async () => requireCurrentActor());
    if (seeded) {
      currentActorUserId = seeded.actorAId;
    }
  });

  afterAll(async () => {
    if (db && dbModule && seeded) {
      // Delete dependents first (reverse creation order)
      await db
        .delete(dbModule.documents)
        .where(inArray(dbModule.documents.communityId, [seeded.communityAId, seeded.communityBId]));
      await db
        .delete(dbModule.userRoles)
        .where(
          and(
            inArray(dbModule.userRoles.userId, [seeded.actorAId, seeded.actorBId]),
            inArray(dbModule.userRoles.communityId, [seeded.communityAId, seeded.communityBId]),
          ),
        );

      // Then parents (best-effort)
      try {
        await db
          .delete(dbModule.communities)
          .where(inArray(dbModule.communities.id, [seeded.communityAId, seeded.communityBId]));
      } catch {
        // FK-restricted cleanup tolerated
      }

      try {
        await db
          .delete(dbModule.users)
          .where(inArray(dbModule.users.id, [seeded.actorAId, seeded.actorBId]));
      } catch {
        // Best-effort cleanup
      }
    }

    if (sqlClient) {
      await sqlClient.end();
    }
  });

  it('returns structured 401 JSON when no authenticated session exists', async () => {
    const { UnauthorizedError } = await import('@/lib/api/errors');
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());

    const s = requireSeeded();
    const testRequestId = `test-${s.runSuffix}-401`;
    const response = await documentsRoute!.GET(
      new NextRequest(apiUrl(`/api/v1/documents?communityId=${s.communityAId}`), {
        headers: { 'x-request-id': testRequestId },
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('X-Request-ID')).toBe(testRequestId);

    const body = await parseJson<ErrorResponseBody>(response);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(typeof body.error.message).toBe('string');
  });

  it('returns structured 403 JSON when actor lacks community membership', async () => {
    const s = requireSeeded();
    setActor(s.actorAId);

    const documentsResponse = await documentsRoute!.GET(
      new NextRequest(apiUrl(`/api/v1/documents?communityId=${s.communityBId}`)),
    );
    expect(documentsResponse.status).toBe(403);
    const documentsBody = await parseJson<ErrorResponseBody>(documentsResponse);
    expect(documentsBody.error.code).toBe('FORBIDDEN');
    expect(typeof documentsBody.error.message).toBe('string');

    const meetingsResponse = await meetingsRoute!.GET(
      new NextRequest(apiUrl(`/api/v1/meetings?communityId=${s.communityBId}`)),
    );
    expect(meetingsResponse.status).toBe(403);
    const meetingsBody = await parseJson<ErrorResponseBody>(meetingsResponse);
    expect(meetingsBody.error.code).toBe('FORBIDDEN');
    expect(typeof meetingsBody.error.message).toBe('string');
  });

  it('returns 404 when header/payload community mismatch is detected', async () => {
    const s = requireSeeded();
    setActor(s.actorAId);

    const response = await documentsRoute!.POST(
      jsonRequest(
        apiUrl('/api/v1/documents'),
        'POST',
        {
          communityId: s.communityBId,
          title: 'Mismatch test',
          description: null,
          categoryId: null,
          filePath: 'communities/mismatch/documents/mismatch.pdf',
          fileName: `mismatch-${s.runSuffix}.pdf`,
          fileSize: 1024,
          mimeType: 'application/pdf',
        },
        { 'x-community-id': String(s.communityAId) },
      ),
    );

    expect(response.status).toBe(404);
    const body = await parseJson<ErrorResponseBody>(response);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(typeof body.error.message).toBe('string');
  });

  it('tenant-scoped reads return only own-community data through route handlers', async () => {
    const s = requireSeeded();

    // Actor A reads community A
    setActor(s.actorAId);
    const responseA = await documentsRoute!.GET(
      new NextRequest(apiUrl(`/api/v1/documents?communityId=${s.communityAId}`)),
    );
    expect(responseA.status).toBe(200);
    const bodyA = await parseJson<{ data: Array<Record<string, unknown>> }>(responseA);
    const fileNamesA = bodyA.data.map((row) => String(row['fileName']));
    expect(fileNamesA).toContain(s.documentAFileName);
    expect(fileNamesA).not.toContain(s.documentBFileName);

    // Actor B reads community B
    setActor(s.actorBId);
    const responseB = await documentsRoute!.GET(
      new NextRequest(apiUrl(`/api/v1/documents?communityId=${s.communityBId}`)),
    );
    expect(responseB.status).toBe(200);
    const bodyB = await parseJson<{ data: Array<Record<string, unknown>> }>(responseB);
    const fileNamesB = bodyB.data.map((row) => String(row['fileName']));
    expect(fileNamesB).toContain(s.documentBFileName);
    expect(fileNamesB).not.toContain(s.documentAFileName);
  });

  it('cross-tenant mutation returns 403 and leaves target data intact', async () => {
    const s = requireSeeded();
    setActor(s.actorAId);

    // Actor A attempts to create a document in community B
    const mutationResponse = await documentsRoute!.POST(
      jsonRequest(apiUrl('/api/v1/documents'), 'POST', {
        communityId: s.communityBId,
        title: 'Cross-tenant ghost attempt',
        description: null,
        categoryId: null,
        filePath: `communities/${s.communityBId}/documents/ghost-${s.runSuffix}.pdf`,
        fileName: `ghost-${s.runSuffix}.pdf`,
        fileSize: 1024,
        mimeType: 'application/pdf',
      }),
    );
    expect(mutationResponse.status).toBe(403);

    // Verify community B data is unchanged — no ghost rows
    setActor(s.actorBId);
    const verifyResponse = await documentsRoute!.GET(
      new NextRequest(apiUrl(`/api/v1/documents?communityId=${s.communityBId}`)),
    );
    expect(verifyResponse.status).toBe(200);
    const verifyBody = await parseJson<{ data: Array<Record<string, unknown>> }>(verifyResponse);
    const ghostFileNames = verifyBody.data
      .map((row) => String(row['fileName']))
      .filter((name) => name.includes('ghost'));
    expect(ghostFileNames).toHaveLength(0);
  });
});
