import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  communities,
  createScopedClient,
  electionCandidates,
  electionEligibilitySnapshots,
  elections,
  units,
  userRoles,
  users,
} from '@propertypro/db';
import { eq, sql } from '@propertypro/db/filters';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { castElectionVoteForCommunity } from '@/lib/services/elections-service';
import { UnprocessableEntityError } from '@/lib/api/errors';

/**
 * Integration tests for the transactional vote submission path.
 *
 * Exercises castElectionVoteForCommunity against a real database to verify:
 * 1. A valid vote is recorded and totalBallotsCast increments
 * 2. A duplicate vote returns the existing receipt (idempotency)
 * 3. A vote after closesAt is rejected
 *
 * Run via: scripts/with-env-local.sh pnpm exec vitest run \
 *   --config apps/web/vitest.integration.config.ts \
 *   apps/web/__tests__/elections/vote-integration.test.ts
 */
describe('vote submission integration', () => {
  const db = createUnscopedClient();
  const testUserId = randomUUID();
  let communityId: number;
  let openElectionId: number;
  let expiredElectionId: number;
  let candidateId: number;
  let expiredCandidateId: number;
  let unitId: number;

  beforeAll(async () => {
    // Seed a user
    await db.insert(users).values({
      id: testUserId,
      email: `test-vote-integration-${Date.now()}@test.local`,
      fullName: 'Test Voter',
    });

    // Seed a community
    const [community] = await db
      .insert(communities)
      .values({
        name: 'Vote Integration Test Community',
        slug: `vote-integ-${Date.now()}`,
        communityType: 'condo_718',
      })
      .returning();
    communityId = community!.id;

    // Seed a unit owned by the test user
    const [unit] = await db
      .insert(units)
      .values({
        communityId,
        unitNumber: '101',
        ownerUserId: testUserId,
      })
      .returning();
    unitId = unit!.id;

    // Seed a user role linking the user to the community + unit
    await db.insert(userRoles).values({
      userId: testUserId,
      communityId,
      role: 'resident',
      unitId,
      isUnitOwner: true,
    });

    // Use DB-relative timestamps (via SQL expressions) to avoid client/server clock skew.
    // Seed an election that is currently open (opensAt in past, closesAt in future)
    const [openElection] = await db
      .insert(elections)
      .values({
        communityId,
        title: 'Open Election',
        electionType: 'board_election',
        status: 'open',
        ballotSalt: randomUUID(),
        maxSelections: 1,
        opensAt: sql`NOW() - interval '1 hour'`,
        closesAt: sql`NOW() + interval '1 hour'`,
        quorumPercentage: 50,
        eligibleUnitCount: 1,
        createdByUserId: testUserId,
      })
      .returning();
    openElectionId = openElection!.id;

    // Seed an election whose closesAt has already passed (status still 'open')
    const [expiredElection] = await db
      .insert(elections)
      .values({
        communityId,
        title: 'Expired Election',
        electionType: 'board_election',
        status: 'open',
        ballotSalt: randomUUID(),
        maxSelections: 1,
        opensAt: sql`NOW() - interval '2 hours'`,
        closesAt: sql`NOW() - interval '1 hour'`,
        quorumPercentage: 50,
        eligibleUnitCount: 1,
        createdByUserId: testUserId,
      })
      .returning();
    expiredElectionId = expiredElection!.id;

    // Seed candidates
    const [openCandidate] = await db
      .insert(electionCandidates)
      .values({ communityId, electionId: openElectionId, label: 'Candidate A' })
      .returning();
    candidateId = openCandidate!.id;

    const [expCandidate] = await db
      .insert(electionCandidates)
      .values({ communityId, electionId: expiredElectionId, label: 'Candidate B' })
      .returning();
    expiredCandidateId = expCandidate!.id;

    // Seed eligibility snapshots for both elections
    await db.insert(electionEligibilitySnapshots).values([
      {
        communityId,
        electionId: openElectionId,
        unitId,
        ownerUserId: testUserId,
        isEligible: true,
      },
      {
        communityId,
        electionId: expiredElectionId,
        unitId,
        ownerUserId: testUserId,
        isEligible: true,
      },
    ]);
  });

  afterAll(async () => {
    // compliance_audit_log has a PL/pgSQL trigger that blocks DELETE.
    // Temporarily disable it for test cleanup, then re-enable.
    await db.execute(sql`ALTER TABLE compliance_audit_log DISABLE TRIGGER compliance_audit_log_append_only_guard`);
    await db.execute(
      sql`DELETE FROM compliance_audit_log WHERE community_id = ${communityId}`,
    );
    await db.execute(sql`ALTER TABLE compliance_audit_log ENABLE TRIGGER compliance_audit_log_append_only_guard`);

    // Deleting the community cascades to elections, candidates, ballots,
    // submissions, snapshots, units, and user_roles
    await db.delete(communities).where(eq(communities.id, communityId));

    // Finally remove the test user
    await db.delete(users).where(eq(users.id, testUserId));
  });

  it('records a valid vote and increments totalBallotsCast', async () => {
    const receipt = await castElectionVoteForCommunity(
      communityId,
      openElectionId,
      testUserId,
      { selectedCandidateIds: [candidateId] },
    );

    expect(receipt.hasVoted).toBe(true);
    expect(receipt.submittedAt).toBeDefined();
    expect(receipt.submissionFingerprint).toMatch(/^[a-f0-9]{24}$/);
    expect(receipt.viaProxy).toBe(false);

    // Verify totalBallotsCast was incremented in the database
    const scoped = createScopedClient(communityId);
    const rows = await scoped.selectFrom<{ totalBallotsCast: number }>(
      elections,
      { totalBallotsCast: elections.totalBallotsCast },
      eq(elections.id, openElectionId),
    );
    expect(rows[0]!.totalBallotsCast).toBe(1);
  });

  it('returns the existing receipt for a duplicate vote (idempotency)', async () => {
    // Submit the exact same vote a second time — should return the original receipt
    const receipt = await castElectionVoteForCommunity(
      communityId,
      openElectionId,
      testUserId,
      { selectedCandidateIds: [candidateId] },
    );

    expect(receipt.hasVoted).toBe(true);
    expect(receipt.viaProxy).toBe(false);

    // totalBallotsCast must still be 1 (not incremented again)
    const scoped = createScopedClient(communityId);
    const rows = await scoped.selectFrom<{ totalBallotsCast: number }>(
      elections,
      { totalBallotsCast: elections.totalBallotsCast },
      eq(elections.id, openElectionId),
    );
    expect(rows[0]!.totalBallotsCast).toBe(1);
  });

  it('rejects a vote after closesAt with UnprocessableEntityError', async () => {
    await expect(
      castElectionVoteForCommunity(
        communityId,
        expiredElectionId,
        testUserId,
        { selectedCandidateIds: [expiredCandidateId] },
      ),
    ).rejects.toThrow(UnprocessableEntityError);
  });
});
