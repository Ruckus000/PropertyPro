/**
 * Integration test: subdomain availability check advisory behavior.
 *
 * Exercises the GET preflight + the authoritative re-check against a real DB:
 *  - GET returns 'available' for an unseeded slug.
 *  - GET returns 'taken' for an existing community slug (log branch: taken.community).
 *  - Saving signup answers (`submitSignupDetails`, behind
 *    POST /api/v1/auth/signup/details) with a taken slug is refused with
 *    details.field='candidateSlug' and writes no row — the authoritative
 *    re-check still blocks the write path even though the preflight is advisory.
 *    The service is called directly: the route reads a real Supabase session,
 *    which this harness has no Auth server to mint.
 *
 * No mocks — per repository no-mock-guard, integration tests must hit the
 * real DB via createUnscopedClient.
 */
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from '@propertypro/db/filters';
import {
  type TestKitState,
  apiUrl,
  getDescribeDb,
  initTestKit,
  parseJson,
  requireDatabaseUrlInCI,
  teardownTestKit,
  trackCommunityForCleanup,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('signup subdomain advisory integration tests');

const describeDb = getDescribeDb();

type SignupRouteModule = typeof import('../../src/app/api/v1/auth/signup/route');
type EmailFirstModule = typeof import('../../src/lib/auth/signup-email-first');

let state: TestKitState | null = null;
let routes: { signup: SignupRouteModule; emailFirst: EmailFirstModule } | null = null;

function requireState(): TestKitState {
  if (!state) throw new Error('Test state not initialized');
  return state;
}

function requireRoutes(): { signup: SignupRouteModule; emailFirst: EmailFirstModule } {
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
  // Register for teardown — these communities are inserted directly rather than
  // through `seedCommunities`, so they are NOT in `state.communities` and would
  // otherwise leak on every run.
  trackCommunityForCleanup(s, inserted.id);
  return inserted.id;
}

describeDb('signup subdomain availability — advisory behavior', () => {
  beforeAll(async () => {
    state = await initTestKit();
    routes = {
      signup: await import('../../src/app/api/v1/auth/signup/route'),
      emailFirst: await import('../../src/lib/auth/signup-email-first'),
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

  it('saving signup answers with a taken slug is refused by the authoritative re-check (field=candidateSlug)', async () => {
    const takenSlug = `advisory-posttaken-${randomUUID().slice(0, 8)}`;
    await seedCommunityWithSlug(takenSlug);
    const email = `advisory+${randomUUID().slice(0, 8)}@example.com`;
    // A fresh house number: the duplicate-address check runs first and must pass.
    const houseNumber = 1000 + Math.floor(Math.random() * 89_000);

    const attempt = requireRoutes().emailFirst.submitSignupDetails(
      { id: randomUUID(), email, email_confirmed_at: new Date().toISOString() },
      {
        primaryContactName: 'Advisory Tester',
        communityName: 'Advisory Test Community',
        addressLine1: `${houseNumber} Test Ln`,
        city: 'Miami',
        state: 'FL',
        zipCode: '33101',
        county: 'Miami-Dade',
        unitCount: 10,
        communityType: 'condo_718',
        planKey: 'essentials',
        candidateSlug: takenSlug,
        termsAccepted: true,
      },
    );

    await expect(attempt).rejects.toMatchObject({
      statusCode: 400,
      details: { field: 'candidateSlug', reason: 'taken' },
    });

    const s = requireState();
    const rows = await s.db
      .select({ id: s.dbModule.pendingSignups.id })
      .from(s.dbModule.pendingSignups)
      .where(eq(s.dbModule.pendingSignups.emailNormalized, email));
    expect(rows).toHaveLength(0);
  });
});
