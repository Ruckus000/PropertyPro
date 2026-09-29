/**
 * `updateUserProfile` against a real database: a NEW phone number loses its
 * verification; the SAME number (resent by a name-only form save) keeps it.
 *
 * The rule lives in SQL (`case when phone is not distinct from $new …`), so a
 * mocked query builder cannot prove it. Before the fix, PATCH account/profile
 * rewrote `phone` and left `phoneVerifiedAt` set, and emergency broadcasts
 * (`phoneVerified = phoneVerifiedAt != null`) then texted a number nobody had
 * confirmed — reachable by the user and, since support sessions may edit
 * profiles, by a support operator.
 *
 * Inserts one run-unique users row directly and deletes it in afterAll.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { users } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
// AUTHZ: Integration test for the platform-level users table (no community_id).
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { updateUserProfile } from '../../src/lib/services/user-profile-service';
import { getDescribeDb, requireDatabaseUrlInCI } from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('profile-phone-verification-reset');
const describeDb = getDescribeDb();

const USER_ID = randomUUID();
const EMAIL = `phone-reset-${USER_ID}@profiletest.invalid`;
const VERIFIED_AT = new Date('2026-01-01T00:00:00.000Z');

describeDb('profile phone change clears verification (integration)', () => {
  const db = createUnscopedClient();
  const row = async () => (await db.select().from(users).where(eq(users.id, USER_ID)))[0]!;
  const resetVerified = (phone: string) =>
    db.update(users).set({ phone, phoneVerifiedAt: VERIFIED_AT }).where(eq(users.id, USER_ID));

  beforeAll(async () => {
    await db.insert(users).values({
      id: USER_ID,
      email: EMAIL,
      fullName: 'Pat Phone',
      phone: '+13055550001',
      phoneVerifiedAt: VERIFIED_AT,
    });
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, USER_ID));
  });

  it('keeps verification when the same number is resent with a name change', async () => {
    await resetVerified('+13055550001');
    await updateUserProfile(USER_ID, { fullName: 'Pat Renamed', phone: '+13055550001' });
    const r = await row();
    expect(r.fullName).toBe('Pat Renamed');
    expect(r.phoneVerifiedAt?.toISOString()).toBe(VERIFIED_AT.toISOString());
  });

  it('keeps verification on a name-only patch', async () => {
    await resetVerified('+13055550001');
    await updateUserProfile(USER_ID, { fullName: 'Pat Again' });
    expect((await row()).phoneVerifiedAt?.toISOString()).toBe(VERIFIED_AT.toISOString());
  });

  it('clears verification when the number changes', async () => {
    await resetVerified('+13055550001');
    await updateUserProfile(USER_ID, { phone: '+13055559999' });
    const r = await row();
    expect(r.phone).toBe('+13055559999');
    expect(r.phoneVerifiedAt).toBeNull();
  });

  it('clears verification when the number is removed', async () => {
    await resetVerified('+13055550001');
    await updateUserProfile(USER_ID, { phone: null });
    const r = await row();
    expect(r.phone).toBeNull();
    expect(r.phoneVerifiedAt).toBeNull();
  });
});
