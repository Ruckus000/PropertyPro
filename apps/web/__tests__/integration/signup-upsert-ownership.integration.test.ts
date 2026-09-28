/**
 * The pending-signup upsert, against a real database: only the caller who holds
 * a live signup's id may update it; an expired signup is free for anyone.
 *
 * The property lives in SQL (the upsert's `setWhere`), so a mocked query builder
 * cannot prove it — the unit suite (`__tests__/signup/service.test.ts`) emulates
 * the clause and so would stay green if the real one regressed. Before this was
 * fixed (route-authz census F1, 2026-09-28) the upsert updated ANY pre-payment
 * row for the email and returned its signupRequestId — the only key to
 * `GET /auth/provisioning-status`, whose first poller after provisioning is
 * handed a login token for the new root manager.
 *
 * Calls `upsertPendingSignup` directly (no Supabase Auth needed). Every row is
 * keyed by a run-unique email and deleted in afterAll.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { pendingSignups } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
// AUTHZ: Integration test for the platform-level pending_signups table; signups precede any community.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { _testInternals } from '../../src/lib/auth/signup';
import { getDescribeDb, requireDatabaseUrlInCI } from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('signup-upsert-ownership');
const describeDb = getDescribeDb();

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const EMAIL = `owner-${RUN}@signuptest.invalid`;

function input(signupRequestId: string, communityName: string) {
  return {
    signupRequestId,
    primaryContactName: 'Pat Prospect',
    email: EMAIL,
    password: 'Secure!123',
    communityName,
    address: '101 Coastal Dr, Naples, FL 34102',
    addressLine1: '101 Coastal Dr',
    city: 'Naples',
    state: 'FL',
    zipCode: '34102',
    county: 'Collier',
    unitCount: 40,
    communityType: 'condo_718' as const,
    planKey: 'essentials' as const,
    candidateSlug: `own-${RUN}`,
    termsAccepted: true as const,
  };
}

describeDb('pending signup upsert ownership (integration)', () => {
  const db = createUnscopedClient();
  const rowFor = async () =>
    (await db.select().from(pendingSignups).where(eq(pendingSignups.emailNormalized, EMAIL)))[0];

  afterAll(async () => {
    await db.delete(pendingSignups).where(eq(pendingSignups.emailNormalized, EMAIL));
  });

  const ownerId = randomUUID();

  it('creates the signup for its first submitter', async () => {
    const row = await _testInternals.upsertPendingSignup(input(ownerId, 'Seaside Villas'));
    expect(row?.signupRequestId).toBe(ownerId);
  });

  it('refuses a different caller: returns null, discloses nothing, changes nothing', async () => {
    const row = await _testInternals.upsertPendingSignup(input(randomUUID(), 'Attacker Towers'));

    expect(row).toBeNull();
    const stored = await rowFor();
    expect(stored?.signupRequestId).toBe(ownerId);
    expect(stored?.communityName).toBe('Seaside Villas');
  });

  it('lets the owner update their own signup', async () => {
    const row = await _testInternals.upsertPendingSignup(input(ownerId, 'Seaside Villas II'));

    expect(row?.signupRequestId).toBe(ownerId);
    expect((await rowFor())?.communityName).toBe('Seaside Villas II');
  });

  it('lets anyone restart an EXPIRED signup, rotating its id', async () => {
    await db
      .update(pendingSignups)
      .set({ expiresAt: new Date('2020-01-01T00:00:00Z') })
      .where(eq(pendingSignups.emailNormalized, EMAIL));
    const newcomerId = randomUUID();

    const row = await _testInternals.upsertPendingSignup(input(newcomerId, 'Fresh Start'));

    expect(row?.signupRequestId).toBe(newcomerId);
    const stored = await rowFor();
    expect(stored?.signupRequestId).toBe(newcomerId);
    expect(stored?.communityName).toBe('Fresh Start');
  });
});
