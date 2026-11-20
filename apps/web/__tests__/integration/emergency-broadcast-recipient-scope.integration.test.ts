/**
 * Emergency broadcasts as a non-manager sees them, against a real database.
 *
 * The delivery report names and emails every recipient in the community, so a
 * non-manager may only read the MESSAGE, and only for a broadcast that was sent
 * to them. Recipient rows are written at DRAFT time, so "has a recipient row"
 * alone is not "received": the rule also needs `completed_at` set and
 * `canceled_at` null. That predicate is SQL, which a mocked builder cannot
 * prove — hence this file.
 *
 * Seeds communityA with a manager (sender) and a tenant (recipient), then four
 * broadcasts: sent to the tenant, a draft with a recipient row, a canceled one
 * (completed AND canceled — the cancel/send race) with a recipient row, and one
 * sent to someone else.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
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
import {
  getBroadcastForRecipient,
  listBroadcastsForRecipient,
  paginateEmergencyBroadcasts,
} from '@/lib/services/emergency-broadcast-service';

requireDatabaseUrlInCI('emergency-broadcast-recipient-scope');

const describeDb = getDescribeDb();

describeDb('emergency broadcasts — a non-manager sees only what was sent to them', () => {
  let state: TestKitState;
  let communityId: number;
  let recipientId: string;
  const ids = { sent: 0, draft: 0, canceled: 0, otherRecipient: 0 };

  beforeAll(async () => {
    state = await initTestKit();
    const communityA = MULTI_TENANT_COMMUNITIES.find((c) => c.key === 'communityA')!;
    await seedCommunities(state, [communityA]);
    communityId = requireCommunity(state, 'communityA').id;
    await seedUsers(
      state,
      MULTI_TENANT_USERS.filter((u) => u.key === 'camA' || u.key === 'tenantA'),
    );
    const senderId = requireUser(state, 'camA').id;
    recipientId = requireUser(state, 'tenantA').id;

    const { emergencyBroadcasts, emergencyBroadcastRecipients, createScopedClient } = state.dbModule;
    const scoped = createScopedClient(communityId);
    const now = new Date();
    const insertBroadcast = async (title: string, extra: Record<string, unknown>) => {
      const [row] = (await scoped.insert(emergencyBroadcasts, {
        title,
        body: `${title} body`,
        severity: 'urgent',
        initiatedBy: senderId,
        ...extra,
      })) as Array<{ id: number }>;
      return Number(row!.id);
    };

    ids.sent = await insertBroadcast('Sent to tenant', { completedAt: now });
    ids.draft = await insertBroadcast('Draft', {});
    // Both stamps: cancel and send are each check-then-write, so a race can
    // leave a canceled broadcast with completed_at set. Only the canceled_at
    // filter excludes it — a never-sent cancel is already excluded by completed_at.
    ids.canceled = await insertBroadcast('Canceled', { completedAt: now, canceledAt: now });
    ids.otherRecipient = await insertBroadcast('Sent to manager only', { completedAt: now });

    for (const [broadcastId, userId] of [
      [ids.sent, recipientId],
      [ids.draft, recipientId],
      [ids.canceled, recipientId],
      [ids.otherRecipient, senderId],
    ] as const) {
      await scoped.insert(emergencyBroadcastRecipients, {
        broadcastId,
        userId,
        email: 'someone@example.com',
      });
    }
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  it('returns the sent broadcast as message-only fields', async () => {
    const copy = await getBroadcastForRecipient(ids.sent, communityId, recipientId);
    expect(copy).toEqual({
      id: ids.sent,
      title: 'Sent to tenant',
      body: 'Sent to tenant body',
      severity: 'urgent',
      completedAt: expect.any(Date),
    });
  });

  it('returns null for a draft, a canceled broadcast, and one sent to someone else', async () => {
    for (const id of [ids.draft, ids.canceled, ids.otherRecipient]) {
      expect(await getBroadcastForRecipient(id, communityId, recipientId)).toBeNull();
    }
  });

  it('lists only the sent broadcast', async () => {
    const list = await listBroadcastsForRecipient(communityId, recipientId);
    expect(list.map((b) => b.id)).toEqual([ids.sent]);
  });

  it('paginates only the sent broadcast, without delivery fields', async () => {
    const page = await paginateEmergencyBroadcasts({ communityId, recipientUserId: recipientId });
    expect(page.data.map((b) => b['id'])).toEqual([ids.sent]);
    expect(page.data[0]).not.toHaveProperty('recipientCount');
    expect(page.pagination.hasMore).toBe(false);
  });

  it('still pages over every broadcast for a manager (control)', async () => {
    const page = await paginateEmergencyBroadcasts({ communityId });
    expect(page.data.map((b) => b['id']).sort()).toEqual(
      [ids.sent, ids.draft, ids.canceled, ids.otherRecipient].sort(),
    );
  });
});
