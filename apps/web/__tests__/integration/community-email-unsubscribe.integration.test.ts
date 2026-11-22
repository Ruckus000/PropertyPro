/**
 * The no-login community-email opt-out against a real database.
 *
 * The opt-out and its `compliance_audit_log` row are written in one
 * transaction, with a system actor (`user_id` null): the token proves who held
 * the link, not who clicked it. A mocked builder cannot prove that the audit
 * insert runs inside the transaction or that the table accepts the row.
 */
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
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

/**
 * The real `logAuditEvent`, with a switch that makes its INSERT fail in the
 * database: a null `resource_type` violates NOT NULL. The failure is
 * Postgres's own, raised on the transaction handle the service passes in.
 */
const audit = vi.hoisted(() => ({ failNext: false }));
vi.mock('@propertypro/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@propertypro/db')>();
  return {
    ...actual,
    logAuditEvent: (
      params: Parameters<typeof actual.logAuditEvent>[0],
      executor?: Parameters<typeof actual.logAuditEvent>[1],
    ) => {
      if (!audit.failNext) return actual.logAuditEvent(params, executor);
      audit.failNext = false;
      return actual.logAuditEvent({ ...params, resourceType: null as unknown as string }, executor);
    },
  };
});

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

  // Runs first, on a recipient with no preferences row yet: if the audit
  // insert fails, the opt-out must not land without its record.
  it('rolls the opt-out back when its audit row cannot be written', async () => {
    const { notificationPreferences, complianceAuditLog } = state.dbModule;
    audit.failNext = true;

    const error = await applyCommunityEmailUnsubscribe(
      { communityId, userId, topic: 'notifications' },
      { confirmedVia: 'confirmation_page' },
    ).catch((e: unknown) => e);
    // Postgres refused the audit INSERT (not_null_violation), inside the tx.
    const pgError = (error as { cause?: { code?: string } }).cause ?? error;
    expect((pgError as { code?: string }).code).toBe('23502');

    const prefs = await state.db
      .select({ id: notificationPreferences.id })
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.communityId, communityId),
          eq(notificationPreferences.userId, userId),
        ),
      );
    expect(prefs).toEqual([]);

    const auditRows = await state.db
      .select({ id: complianceAuditLog.id })
      .from(complianceAuditLog)
      .where(
        and(
          eq(complianceAuditLog.communityId, communityId),
          eq(complianceAuditLog.resourceId, `${userId}:${communityId}`),
        ),
      );
    expect(auditRows).toEqual([]);
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
