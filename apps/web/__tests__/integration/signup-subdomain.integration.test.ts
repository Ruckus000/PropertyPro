/**
 * Integration test: subdomain availability check advisory behavior.
 *
 * Exercises the GET preflight + POST authoritative path against a real DB:
 *  - GET returns 'available' for an unseeded slug.
 *  - GET returns 'taken' for an existing community slug (log branch: taken.community).
 *  - POST with a taken slug returns 400 with details.field='candidateSlug'
 *    BEFORE any Supabase auth call — the authoritative re-check still blocks
 *    the write path even though the preflight is now advisory.
 *
 * No mocks — per repository no-mock-guard, integration tests must hit the
 * real DB via createUnscopedClient.
 */
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type TestKitState,
  apiUrl,
  getDescribeDb,
  initTestKit,
  jsonRequest,
  parseJson,
  requireDatabaseUrlInCI,
  teardownTestKit,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('signup subdomain advisory integration tests');

const describeDb = getDescribeDb();

type SignupRouteModule = typeof import('../../src/app/api/v1/auth/signup/route');

let state: TestKitState | null = null;
let routes: { signup: SignupRouteModule } | null = null;

function requireState(): TestKitState {
  if (!state) throw new Error('Test state not initialized');
  return state;
}

function requireRoutes(): { signup: SignupRouteModule } {
  if (!routes) throw new Error('Route modules not loaded');
  return routes;
}

async function seedCommunityWithSlug(slug: string): Promise<number> {
  const s = requireState();
  const [inserted] = await s.db
    .insert(s.dbModule.communities)
    .values({
      name: `Advisory Test ${s.runSuffix}`,
      slug,
      communityType: 'condo_718',
      timezone: 'America/New_York',
    })
    .returning({ id: s.dbModule.communities.id });
  if (!inserted) throw new Error('Failed to seed community');
  return inserted.id;
}

describeDb('signup subdomain availability — advisory behavior', () => {
  beforeAll(async () => {
    state = await initTestKit();
    routes = {
      signup: await import('../../src/app/api/v1/auth/signup/route'),
    };
  });

  afterAll(async () => {
    if (state) {
      await teardownTestKit(state);
      state = null;
    }
    routes = null;
  });

  it('GET returns reason="available" for an unseeded slug', async () => {
    const freshSlug = `advisory-fresh-${randomUUID().slice(0, 8)}`;
    const url = apiUrl(
      `/api/v1/auth/signup?subdomain=${encodeURIComponent(freshSlug)}`,
    );
    const req = new NextRequest(url, { method: 'GET' });
    const res = await requireRoutes().signup.GET(req);

    expect(res.status).toBe(200);
    const body = await parseJson<{
      data: { reason: string; available: boolean };
    }>(res);
    expect(body.data.reason).toBe('available');
    expect(body.data.available).toBe(true);
  });

  it('GET returns reason="taken" for an existing community slug', async () => {
    const takenSlug = `advisory-taken-${randomUUID().slice(0, 8)}`;
    await seedCommunityWithSlug(takenSlug);

    const url = apiUrl(
      `/api/v1/auth/signup?subdomain=${encodeURIComponent(takenSlug)}`,
    );
    const req = new NextRequest(url, { method: 'GET' });
    const res = await requireRoutes().signup.GET(req);

    expect(res.status).toBe(200);
    const body = await parseJson<{
      data: { reason: string; available: boolean };
    }>(res);
    expect(body.data.reason).toBe('taken');
    expect(body.data.available).toBe(false);
  });

  it('POST with a taken slug is rejected by the authoritative re-check (400, field=candidateSlug)', async () => {
    const takenSlug = `advisory-posttaken-${randomUUID().slice(0, 8)}`;
    await seedCommunityWithSlug(takenSlug);

    const req = jsonRequest(apiUrl('/api/v1/auth/signup'), 'POST', {
      signupRequestId: randomUUID(),
      primaryContactName: 'Advisory Tester',
      email: `advisory+${randomUUID().slice(0, 8)}@example.com`,
      password: 'Secure!123',
      communityName: 'Advisory Test Community',
      address: '100 Test Ln, Miami, FL 33101',
      county: 'Miami-Dade',
      unitCount: 10,
      communityType: 'condo_718',
      planKey: 'essentials',
      candidateSlug: takenSlug,
      termsAccepted: true,
    });

    const res = await requireRoutes().signup.POST(req);
    expect(res.status).toBe(400);

    const body = await parseJson<{
      error: {
        code: string;
        message: string;
        details?: { field?: string; reason?: string };
      };
    }>(res);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.field).toBe('candidateSlug');
    expect(body.error.details?.reason).toBe('taken');
  });
});
