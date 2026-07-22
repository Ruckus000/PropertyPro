/**
 * Integration: cancellation → paid grace → mutation lock.
 *
 * Uses a real community row and the production subscription guard.
 * Requires DATABASE_URL (run via scripts/with-env-local.sh).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { communities } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
// AUTHZ: Integration fixture setup and teardown require direct root-table access.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { PAID_GRACE_DAYS } from '@propertypro/shared';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';

const MS_PER_DAY = 86_400_000;
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;
const db = createUnscopedClient();
const slug = `cancel-grace-lock-${randomUUID()}`;

let communityId: number | null = null;

function requireCommunityId(): number {
  if (communityId === null) {
    throw new Error('Test community was not created');
  }

  return communityId;
}

async function setSubscriptionState({
  status,
  canceledAt,
  freeAccessExpiresAt = null,
}: {
  status: string;
  canceledAt: Date | null;
  freeAccessExpiresAt?: Date | null;
}): Promise<void> {
  await db
    .update(communities)
    .set({
      subscriptionStatus: status,
      subscriptionCanceledAt: canceledAt,
      freeAccessExpiresAt,
    })
    .where(eq(communities.id, requireCommunityId()));
}

describeDb('cancel → grace → lock lifecycle (db-backed integration)', () => {
  beforeAll(async () => {
    const [community] = await db
      .insert(communities)
      .values({
        name: 'Cancel Grace Lock Integration Test',
        slug,
        communityType: 'condo_718',
        subscriptionStatus: 'active',
      })
      .returning({ id: communities.id });

    if (!community) {
      throw new Error('Failed to create lifecycle integration test community');
    }

    communityId = community.id;
  });

  afterAll(async () => {
    if (communityId !== null) {
      await db.delete(communities).where(eq(communities.id, communityId));
    }
  });

  it('allows mutations during the paid grace window after cancellation', async () => {
    await setSubscriptionState({
      status: 'canceled',
      canceledAt: new Date(Date.now() - 2 * MS_PER_DAY),
    });

    await expect(requireActiveSubscriptionForMutation(requireCommunityId())).resolves.toBeUndefined();
  });

  it('blocks mutations after the paid grace window expires', async () => {
    await setSubscriptionState({
      status: 'canceled',
      canceledAt: new Date(Date.now() - (PAID_GRACE_DAYS + 1) * MS_PER_DAY),
    });

    await expect(requireActiveSubscriptionForMutation(requireCommunityId())).rejects.toMatchObject({
      statusCode: 403,
      code: 'SUBSCRIPTION_REQUIRED',
    });
  });

  it('allows expired grace when a future free-access override exists', async () => {
    await setSubscriptionState({
      status: 'canceled',
      canceledAt: new Date(Date.now() - (PAID_GRACE_DAYS + 1) * MS_PER_DAY),
      freeAccessExpiresAt: new Date(Date.now() + MS_PER_DAY),
    });

    await expect(requireActiveSubscriptionForMutation(requireCommunityId())).resolves.toBeUndefined();
  });

  it('blocks unpaid communities immediately without cancellation grace', async () => {
    await setSubscriptionState({
      status: 'unpaid',
      canceledAt: null,
    });

    await expect(requireActiveSubscriptionForMutation(requireCommunityId())).rejects.toMatchObject({
      statusCode: 403,
      code: 'SUBSCRIPTION_REQUIRED',
    });
  });
});
