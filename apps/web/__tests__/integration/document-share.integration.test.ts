/**
 * `shareDocuments` against a real database: per-recipient document access
 * (the same SQL filter as the documents list), email preferences, digest
 * dedupe, and the audit record. A mocked query builder cannot prove the access
 * filter or the digest unique index, which are the parts that keep a tenant
 * from being emailed an owners-only document and a retry from double-sending.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { clearTestInbox, testInbox } from '@propertypro/email';
import { and, eq } from '@propertypro/db/filters';
import { shareDocuments } from '../../src/lib/services/document-share-service';
import {
  getDescribeDb,
  initTestKit,
  requireDatabaseUrlInCI,
  teardownTestKit,
  trackCommunityForCleanup,
  trackUserForCleanup,
  type TestKitState,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('document-share');
const describeDb = getDescribeDb();

describeDb('shareDocuments (integration)', () => {
  let state: TestKitState;
  let communityId = 0;
  const ids = {} as Record<'actor' | 'owner' | 'tenant' | 'digest' | 'never' | 'outsider', string>;
  const docs = {} as Record<'rules' | 'minutes' | 'deleted' | 'evidence', number>;

  const send = (documentIds: number[], userIds: string[], sendId = randomUUID()) =>
    shareDocuments({
      communityId,
      communityType: 'condo_718',
      documentIds,
      userIds,
      sendId,
      actorUserId: ids.actor,
      senderName: 'Pat Manager',
    });

  beforeAll(async () => {
    state = await initTestKit();
    const m = state.dbModule;
    const [community] = await state.db
      .insert(m.communities)
      .values({ name: `Doc Share ${state.runSuffix}`, slug: `doc-share-${state.runSuffix}`, communityType: 'condo_718' })
      .returning({ id: m.communities.id });
    communityId = community!.id;
    trackCommunityForCleanup(state, communityId);

    const people: Array<[keyof typeof ids, 'resident' | 'property_manager' | null, boolean, string | null]> = [
      ['actor', 'property_manager', false, null],
      ['owner', 'resident', true, null],
      ['tenant', 'resident', false, null],
      ['digest', 'resident', true, 'daily_digest'],
      ['never', 'resident', true, 'never'],
      ['outsider', null, false, null],
    ];
    const scoped = m.createScopedClient(communityId);
    for (const [key, role, isUnitOwner, frequency] of people) {
      const id = randomUUID();
      ids[key] = id;
      trackUserForCleanup(state, id);
      await state.db.insert(m.users).values({ id, email: `share-${key}+${state.runSuffix}@example.com`, fullName: `Share ${key}` });
      if (role) await scoped.insert(m.userRoles, { userId: id, role, isUnitOwner, displayTitle: key });
      if (frequency) await scoped.insert(m.notificationPreferences, { userId: id, emailFrequency: frequency });
    }

    const category = async (name: string) =>
      ((await scoped.insert(m.documentCategories, { name, sortOrder: 1, isActive: true }))[0] as { id: number }).id;
    const rulesCat = await category('Rules and regulations');
    const minutesCat = await category('Meeting minutes');
    const doc = async (title: string, categoryId: number, extra: Record<string, unknown> = {}) =>
      ((await scoped.insert(m.documents, {
        title,
        categoryId,
        filePath: `communities/${communityId}/documents/${title}.pdf`,
        fileName: `${title}.pdf`,
        fileSize: 10,
        mimeType: 'application/pdf',
        ...extra,
      }))[0] as { id: number }).id;
    docs.rules = await doc('Rules 2026', rulesCat);
    docs.minutes = await doc('September minutes', minutesCat);
    docs.deleted = await doc('Old rules', rulesCat, { deletedAt: new Date() });
    docs.evidence = await doc('Violation photo', rulesCat, { sourceType: 'violation_evidence' });
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  beforeEach(() => clearTestInbox());

  it('sends each recipient only what their role may open, respecting email preferences', async () => {
    const results = await send([docs.rules, docs.minutes], [ids.owner, ids.tenant, ids.digest, ids.never, ids.outsider]);
    const byUser = new Map(results.map((r) => [r.userId, r]));

    expect(byUser.get(ids.owner)).toEqual({ userId: ids.owner, status: 'emailed', documentIds: [docs.rules, docs.minutes] });
    // Condo tenants may not open minutes: they get the rules only.
    expect(byUser.get(ids.tenant)).toEqual({ userId: ids.tenant, status: 'emailed', documentIds: [docs.rules] });
    expect(byUser.get(ids.digest)?.status).toBe('digest');
    expect(byUser.get(ids.never)).toEqual({ userId: ids.never, status: 'opted_out', documentIds: [docs.rules, docs.minutes] });
    expect(byUser.get(ids.outsider)).toEqual({ userId: ids.outsider, status: 'not_member', documentIds: [] });

    expect(testInbox.map((mail) => mail.to).sort()).toEqual(
      [`share-owner+${state.runSuffix}@example.com`, `share-tenant+${state.runSuffix}@example.com`].sort(),
    );
    const tenantMail = testInbox.find((mail) => mail.to === `share-tenant+${state.runSuffix}@example.com`)!;
    expect(tenantMail.subject).toContain('Rules 2026');
    expect(tenantMail.headers['List-Unsubscribe']).toBeTruthy();
  });

  it('reports no_access when a recipient may open none of the documents', async () => {
    const [result] = await send([docs.minutes], [ids.tenant]);
    expect(result).toEqual({ userId: ids.tenant, status: 'no_access', documentIds: [] });
    expect(testInbox).toHaveLength(0);
  });

  it('a retry with the same sendId reuses the email idempotency key and does not re-queue the digest', async () => {
    const sendId = randomUUID();
    await send([docs.rules], [ids.owner, ids.digest], sendId);
    await send([docs.rules], [ids.owner, ids.digest], sendId);
    const keys = testInbox.map((mail) => mail.idempotencyKey);
    expect(keys).toEqual([`document-share/${communityId}/${sendId}/${ids.owner}`, `document-share/${communityId}/${sendId}/${ids.owner}`]);

    const m = state.dbModule;
    const queued = await state.db
      .select({ id: m.notificationDigestQueue.id })
      .from(m.notificationDigestQueue)
      .where(and(eq(m.notificationDigestQueue.userId, ids.digest), eq(m.notificationDigestQueue.sourceId, String(docs.rules))));
    expect(queued).toHaveLength(1);
  });

  it('refuses deleted or non-library documents before sending anything', async () => {
    await expect(send([docs.rules, docs.deleted], [ids.owner])).rejects.toThrow(/not found/i);
    await expect(send([docs.evidence], [ids.owner])).rejects.toThrow(/not found/i);
    expect(testInbox).toHaveLength(0);
  });

  it('writes one audit row per send with the document versions and every result', async () => {
    const sendId = randomUUID();
    await send([docs.rules], [ids.owner, ids.never], sendId);
    const m = state.dbModule;
    const rows = await state.db
      .select({ action: m.complianceAuditLog.action, metadata: m.complianceAuditLog.metadata, userId: m.complianceAuditLog.userId })
      .from(m.complianceAuditLog)
      .where(and(eq(m.complianceAuditLog.communityId, communityId), eq(m.complianceAuditLog.resourceId, sendId)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'notification_sent',
      userId: ids.actor,
      metadata: {
        courtesyCopy: true,
        documents: [{ id: docs.rules, title: 'Rules 2026' }],
        results: [
          { userId: ids.owner, status: 'emailed', documentIds: [docs.rules] },
          { userId: ids.never, status: 'opted_out', documentIds: [docs.rules] },
        ],
      },
    });
  });
});
