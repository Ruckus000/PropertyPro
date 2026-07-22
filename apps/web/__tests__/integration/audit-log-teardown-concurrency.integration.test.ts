import { describe, expect, it } from 'vitest';
import { inArray, sql } from 'drizzle-orm';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import {
  getDescribeDb,
  initTestKit,
  seedCommunities,
  teardownTestKit,
  type TestKitState,
} from './helpers/multi-tenant-test-kit';

const describeDb = getDescribeDb();

describeDb('audit-log teardown concurrency (db-backed integration)', () => {
  it('serializes trigger overrides and leaves the append-only guard enabled', async () => {
    let first: TestKitState | null = null;
    let second: TestKitState | null = null;
    let verifier: TestKitState | null = null;
    let cleanupAttempted = false;

    try {
      [first, second, verifier] = await Promise.all([initTestKit(), initTestKit(), initTestKit()]);

      await Promise.all([
        seedCommunities(first, MULTI_TENANT_COMMUNITIES.filter((community) => community.key === 'communityA')),
        seedCommunities(second, MULTI_TENANT_COMMUNITIES.filter((community) => community.key === 'communityB')),
      ]);

      const firstCommunityId = [...first.communities.values()][0]?.id;
      const secondCommunityId = [...second.communities.values()][0]?.id;
      expect(firstCommunityId).toBeDefined();
      expect(secondCommunityId).toBeDefined();

      await Promise.all([
        first.dbModule.createScopedClient(firstCommunityId!).insert(first.dbModule.complianceAuditLog, {
          communityId: firstCommunityId!,
          action: 'test_cleanup',
          resourceType: 'test',
          resourceId: first.runSuffix,
        }),
        second.dbModule.createScopedClient(secondCommunityId!).insert(second.dbModule.complianceAuditLog, {
          communityId: secondCommunityId!,
          action: 'test_cleanup',
          resourceType: 'test',
          resourceId: second.runSuffix,
        }),
      ]);

      const cleanupResults = await Promise.allSettled([teardownTestKit(first), teardownTestKit(second)]);
      cleanupAttempted = true;
      expect(cleanupResults).toEqual([
        expect.objectContaining({ status: 'fulfilled' }),
        expect.objectContaining({ status: 'fulfilled' }),
      ]);

      const remainingCommunities = await verifier.db
        .select({ id: verifier.dbModule.communities.id })
        .from(verifier.dbModule.communities)
        .where(
          inArray(verifier.dbModule.communities.id, [
            firstCommunityId!,
            secondCommunityId!,
          ]),
        );
      expect(remainingCommunities).toEqual([]);

      const triggerRows = (await verifier.db.execute(sql`
        SELECT tgenabled
        FROM pg_trigger
        WHERE tgname = 'compliance_audit_log_append_only_guard'
      `)) as Array<{ tgenabled: string }>;
      expect(triggerRows).toEqual([expect.objectContaining({ tgenabled: 'O' })]);
    } finally {
      if (!cleanupAttempted) {
        await Promise.allSettled(
          [first, second].filter((state): state is TestKitState => state !== null).map(teardownTestKit),
        );
      }
      if (verifier) await teardownTestKit(verifier);
    }
  });
});
