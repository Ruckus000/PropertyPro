/**
 * The no-login community-email opt-out against a real database.
 *
 * The opt-out and its `compliance_audit_log` row are written in one
 * transaction, with a system actor (`user_id` null): the token proves who held
 * the link, not who clicked it. This proves both rows land and that the real
 * table accepts the audit row. That the audit insert runs on the transaction
 * handle is pinned by the unit test (community-email-unsubscribe.test.ts),
 * because forcing the real insert to fail here would need a mock or DDL.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from '@propertypro/db/filters';
import {
  initTestKit,
  seedCommunities,
  seedUsers,
  teardownTestKit,
  requireCommunity,
  requireUser,
  getDescribeDb,
  requireDatabaseUrlInCI,
  type TestKitState,
} from './helpers/multi-tenant-test-kit';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS } from '../fixtures/multi-tenant-users';
import { applyCommunityEmailUnsubscribe } from '@/lib/services/community-email-unsubscribe-service';

requireDatabaseUrlInCI('community-email-unsubscribe');

const describeDb = getDescribeDb();

describeDb('community email opt-out — preferences and audit row in one transaction', () => {
  let state: TestKitState;
  let communityId: number;
  let userId: string;

  beforeAll(async () => {
    state = await initTestKit();
    await seedCommunities(
      state,
      MULTI_TENANT_COMMUNITIES.filter((c) => c.key === 'communityA'),
    );
    communityId = requireCommunity(state, 'communityA').id;
    await seedUsers(
      state,
      MULTI_TENANT_USERS.filter((u) => u.key === 'tenantA'),
    );
    userId = requireUser(state, 'tenantA').id;
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  it('a confirmed notifications opt-out sets frequency never and audits it as the system', async () => {
    const { notificationPreferences, complianceAuditLog } = state.dbModule;

    await applyCommunityEmailUnsubscribe(
      { communityId, userId, topic: 'notifications' },
      { confirmedVia: 'confirmation_page' },
    );

    const [prefs] = await state.db
      .select({ emailFrequency: notificationPreferences.emailFrequency })
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.communityId, communityId),
          eq(notificationPreferences.userId, userId),
        ),
      );
    expect(prefs?.emailFrequency).toBe('never');

    const audit = await state.db
      .select({
        userId: complianceAuditLog.userId,
        action: complianceAuditLog.action,
        resourceType: complianceAuditLog.resourceType,
        resourceId: complianceAuditLog.resourceId,
        newValues: complianceAuditLog.newValues,
        metadata: complianceAuditLog.metadata,
      })
      .from(complianceAuditLog)
      .where(
        and(
          eq(complianceAuditLog.communityId, communityId),
          eq(complianceAuditLog.resourceId, `${userId}:${communityId}`),
        ),
      );
    expect(audit).toEqual([
      {
        userId: null,
        action: 'settings_changed',
        resourceType: 'notification_preferences',
        resourceId: `${userId}:${communityId}`,
        newValues: { emailFrequency: 'never' },
        metadata: { source: 'email_unsubscribe', topic: 'notifications', confirmedVia: 'confirmation_page' },
      },
    ]);
  });
});
