/**
 * `mergeCommunitySettings` against a real database: a write touches only the
 * keys it names. The merge lives in SQL (`coalesce(col, '{}') || patch`), so a
 * mocked query builder cannot prove it. Before this, the fee-policy writer did a
 * JS read-modify-write that could drop a concurrent update to another key.
 *
 * Inserts one run-unique community row and deletes it in afterAll.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { communities } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
// AUTHZ: Integration test fixture — creates and reads its own community row.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { mergeCommunitySettings } from '../../src/lib/services/community-settings-service';
import { getDescribeDb, requireDatabaseUrlInCI } from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('community-settings-merge');
const describeDb = getDescribeDb();

const SLUG = `settings-merge-${randomUUID().slice(0, 8)}`;

describeDb('community_settings merge (integration)', () => {
  const db = createUnscopedClient();
  let communityId = 0;
  const settings = async () =>
    (await db.select({ s: communities.communitySettings }).from(communities).where(eq(communities.id, communityId)))[0]!.s;

  beforeAll(async () => {
    const [row] = await db
      .insert(communities)
      .values({ name: 'Settings Merge', slug: SLUG, communityType: 'condo_718' })
      .returning({ id: communities.id });
    communityId = row!.id;
  });

  afterAll(async () => {
    await db.delete(communities).where(eq(communities.id, communityId));
  });

  it('keeps every key it does not name', async () => {
    expect(await settings()).toEqual({}); // column default
    await mergeCommunitySettings(communityId, { allowResidentVisitorRevoke: true });
    await mergeCommunitySettings(communityId, { paymentFeePolicy: 'owner_pays' });
    expect(await settings()).toEqual({ allowResidentVisitorRevoke: true, paymentFeePolicy: 'owner_pays' });
  });

  it('concurrent writers of different keys both survive', async () => {
    await Promise.all([
      mergeCommunitySettings(communityId, { paymentFeePolicy: 'association_absorbs' }),
      mergeCommunitySettings(communityId, { announcementsWriteLevel: 'admin_only' }),
    ]);
    expect(await settings()).toEqual({
      allowResidentVisitorRevoke: true,
      paymentFeePolicy: 'association_absorbs',
      announcementsWriteLevel: 'admin_only',
    });
  });
});
