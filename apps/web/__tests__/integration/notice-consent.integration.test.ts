/**
 * Electronic-notice consent against a real database: an owner gives, reads and
 * withdraws their own consent through /api/v1/notice-consent; a tenant is
 * refused; history is append-only (withdraw stamps, re-consent inserts, one
 * active row at most); every change is audited; and the manager-only residents
 * list reports it. Nothing is mocked.
 */
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from '@propertypro/db/filters';
import { NOTICE_CONSENT_VERSION, noticeConsentText } from '@propertypro/shared';
import { listResidentsForCommunity } from '../../src/lib/services/resident-service';
import {
  getDescribeDb,
  initTestKit,
  requireDatabaseUrlInCI,
  setActorById,
  teardownTestKit,
  trackCommunityForCleanup,
  trackUserForCleanup,
  type TestKitState,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('notice-consent');
const describeDb = getDescribeDb();

type Handler = (req: NextRequest) => Promise<Response>;
interface ConsentJson {
  consented: boolean;
  givenAt: string | null;
  version: string | null;
  email: string | null;
  currentEmail: string | null;
}

describeDb('notice consent (integration)', () => {
  let state: TestKitState;
  let communityId = 0;
  let routes: { GET: Handler; POST: Handler; DELETE: Handler };
  const owner = randomUUID();
  const tenant = randomUUID();
  let ownerEmail = '';

  const call = (handler: Handler, method: string, cid = communityId) =>
    handler(
      new NextRequest(`http://localhost:3000/api/v1/notice-consent?communityId=${cid}`, {
        method,
        headers: { 'user-agent': 'IntegrationBrowser/1.0', 'x-forwarded-for': '198.51.100.4' },
      }),
    );
  const dataOf = async (res: Response) => ((await res.json()) as { data: ConsentJson }).data;

  beforeAll(async () => {
    state = await initTestKit();
    const m = state.dbModule;
    const [c] = await state.db
      .insert(m.communities)
      .values({ name: `Notice consent ${state.runSuffix}`, slug: `nc-${randomUUID().slice(0, 8)}`, communityType: 'condo_718' })
      .returning({ id: m.communities.id });
    trackCommunityForCleanup(state, c!.id);
    communityId = c!.id;
    const scoped = m.createScopedClient(communityId);
    const unit = (await scoped.insert(m.units, { unitNumber: '101' }))[0]!['id'] as number;

    ownerEmail = `nc-owner+${state.runSuffix}@example.com`;
    for (const [id, email] of [
      [owner, ownerEmail],
      [tenant, `nc-tenant+${state.runSuffix}@example.com`],
    ] as const) {
      trackUserForCleanup(state, id);
      await state.db.insert(m.users).values({ id, email, fullName: 'NC' });
    }
    await scoped.insert(m.userRoles, { userId: owner, role: 'resident', unitId: unit, isUnitOwner: true, displayTitle: 'Owner' });
    await scoped.insert(m.userRoles, { userId: tenant, role: 'resident', unitId: unit, isUnitOwner: false, displayTitle: 'Tenant' });

    const mod = await import('../../src/app/api/v1/notice-consent/route');
    routes = { GET: mod.GET, POST: mod.POST, DELETE: mod.DELETE };
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  beforeEach(async () => {
    const { noticeConsent } = state.dbModule;
    await state.db.delete(noticeConsent).where(eq(noticeConsent.communityId, communityId));
    setActorById(state, owner);
  });

  it('an owner starts with no consent and sees the address a consent would cover', async () => {
    const res = await call(routes.GET, 'GET');
    expect(res.status).toBe(200);
    expect(await dataOf(res)).toEqual({ consented: false, givenAt: null, version: null, email: null, currentEmail: ownerEmail });
  });

  it('give → withdraw → give keeps both rows, at most one active, each audited', async () => {
    const given = await dataOf(await call(routes.POST, 'POST'));
    expect(given).toMatchObject({ consented: true, version: NOTICE_CONSENT_VERSION, email: ownerEmail });

    // Giving again is a no-op, not a second row (and not a unique-index error).
    expect((await call(routes.POST, 'POST')).status).toBe(200);

    expect(await dataOf(await call(routes.DELETE, 'DELETE'))).toMatchObject({ consented: false });
    expect((await dataOf(await call(routes.POST, 'POST'))).consented).toBe(true);

    const m = state.dbModule;
    const rows = await state.db
      .select()
      .from(m.noticeConsent)
      .where(eq(m.noticeConsent.communityId, communityId))
      .orderBy(m.noticeConsent.id);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.revokedAt).not.toBeNull();
    expect(rows[1]!.revokedAt).toBeNull();
    expect(rows[1]).toMatchObject({
      userId: owner,
      email: ownerEmail,
      consentText: noticeConsentText(ownerEmail),
      consentVersion: NOTICE_CONSENT_VERSION,
      ipAddress: '198.51.100.4',
      userAgent: 'IntegrationBrowser/1.0',
    });

    const audits = await state.db
      .select({ action: m.complianceAuditLog.action })
      .from(m.complianceAuditLog)
      .where(and(eq(m.complianceAuditLog.communityId, communityId), eq(m.complianceAuditLog.resourceType, 'notice_consent')))
      .orderBy(m.complianceAuditLog.id);
    expect(audits.map((a) => a.action)).toEqual(['notice_consent_given', 'notice_consent_withdrawn', 'notice_consent_given']);
  });

  it('the database refuses a second active row for the same owner', async () => {
    const m = state.dbModule;
    const scoped = m.createScopedClient(communityId);
    const row = { userId: owner, email: ownerEmail, consentText: 'x', consentVersion: 'v' };
    await scoped.insert(m.noticeConsent, row);
    await expect(scoped.insert(m.noticeConsent, row)).rejects.toThrow();
  });

  it('a tenant cannot give consent', async () => {
    setActorById(state, tenant);
    expect((await call(routes.POST, 'POST')).status).toBe(403);
    const m = state.dbModule;
    expect(await state.db.select().from(m.noticeConsent).where(eq(m.noticeConsent.userId, tenant))).toHaveLength(0);
  });

  it('managers see it in the residents list; other readers do not', async () => {
    await call(routes.POST, 'POST');
    const forManager = await listResidentsForCommunity(communityId, {}, { includePortalActivity: true });
    expect(forManager.find((r) => r.userId === owner)?.noticeConsent).toBe(true);
    expect(forManager.find((r) => r.userId === tenant)?.noticeConsent).toBe(false);
    const forResident = await listResidentsForCommunity(communityId);
    expect(forResident.find((r) => r.userId === owner)).not.toHaveProperty('noticeConsent');
  });
});
