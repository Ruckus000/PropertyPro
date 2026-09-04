/**
 * Account-lifecycle cron — the purge phase's dry-run and safety cap.
 *
 * Phase 2 is the irreversible one: `purgeUserPII` scrubs a user's identity and
 * `purgeCommunityData` destroys a community's site assets and export archives.
 * It ran unbounded over whatever `findPurgeReadyDeletionRequests` returned, with
 * no way to ask what it would do first — while `scripts/reap-test-communities.ts`,
 * a script nobody schedules, has had a dry-run, a safety cap and a protected-id
 * list for months.
 *
 * The two properties under test:
 *
 *  1. `?purgeDryRun=1` reports without destroying. The key match is TOLERANT
 *     (`purgedryrun`, `purge_dry_run`) so a misspelling lands on the SAFE mode,
 *     but the VALUE is strict — an unrecognised one is a 400, never a silent
 *     fall-through to live. An operator who believes they are dry-running must
 *     not trigger an irreversible purge on a typo.
 *  2. Over the cap, the phase purges NOTHING. Not "the first N" — if the
 *     candidate set is wrong, purging 50 of it is still purging 50 wrong things,
 *     and spreading the damage across nights removes the signal. A circuit
 *     breaker, not a rate limiter.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireCronSecretMock,
  findPurgeReadyDeletionRequestsMock,
  purgeCommunityDataMock,
  purgeUserPIIMock,
} = vi.hoisted(() => ({
  requireCronSecretMock: vi.fn(),
  findPurgeReadyDeletionRequestsMock: vi.fn(async () => [] as unknown[]),
  purgeCommunityDataMock: vi.fn(async () => undefined),
  purgeUserPIIMock: vi.fn(async () => undefined),
}));

vi.mock('@/lib/api/cron-auth', () => ({ requireCronSecret: requireCronSecretMock }));

const { cleanupSoftDeletedSiteBlocksMock, pruneSitePublishSnapshotsMock } = vi.hoisted(() => ({
  cleanupSoftDeletedSiteBlocksMock: vi.fn(async () => 0),
  pruneSitePublishSnapshotsMock: vi.fn(async () => 0),
}));

vi.mock('@/lib/services/site-blocks-service', () => ({
  cleanupSoftDeletedSiteBlocks: cleanupSoftDeletedSiteBlocksMock,
  pruneSitePublishSnapshots: pruneSitePublishSnapshotsMock,
}));

// Mock the service module COMPLETELY — a partial factory throws at module load
// for whichever export the route reaches first, which reads as an unrelated
// failure rather than a short mock.
vi.mock('@/lib/services/account-lifecycle-service', () => ({
  computeAccessPlanStatus: vi.fn(() => ({ status: 'active', daysRemaining: 30 })),
  executeCommunitySoftDelete: vi.fn(async () => []),
  executeUserSoftDelete: vi.fn(async () => []),
  findCoolingExpiredDeletionRequests: vi.fn(async () => []),
  findPurgeReadyDeletionRequests: findPurgeReadyDeletionRequestsMock,
  getCommunityNameForLifecycleEmail: vi.fn(async () => 'Test Community'),
  listActiveAccessPlansForLifecycleCron: vi.fn(async () => []),
  lookupLifecycleAdminRecipients: vi.fn(async () => []),
  markAccessPlanNotificationSent: vi.fn(async () => undefined),
  purgeCommunityData: purgeCommunityDataMock,
  purgeUserPII: purgeUserPIIMock,
}));

vi.mock('@propertypro/email', () => ({
  sendEmail: vi.fn(async () => undefined),
  FreeAccessExpiringEmail: () => null,
  FreeAccessExpiredEmail: () => null,
}));

import { GET } from '@/app/api/v1/internal/account-lifecycle/route';
// Not from the route module: a Next.js App Router route may only export its
// HTTP verbs and a fixed set of config symbols, so the cap lives in a pure
// sibling that imports no framework code.
import { PURGE_SAFETY_CAP } from '@/lib/account-lifecycle/purge-guards';

interface PurgeSummary {
  purged: { users: number; communities: number };
  purge: { dryRun: boolean; candidates: number; cap: number };
  errors: string[];
}

function cronRequest(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/v1/internal/account-lifecycle${query}`, {
    method: 'GET',
  });
}

async function runCron(query = ''): Promise<{ status: number; summary: PurgeSummary }> {
  const res = await GET(cronRequest(query));
  const body = (await res.json()) as { summary?: PurgeSummary };
  return { status: res.status, summary: body.summary as PurgeSummary };
}

function candidates(count: number, type: 'user' | 'community' = 'community') {
  return Array.from({ length: count }, (_, i) => ({ id: i + 1, requestType: type }));
}

describe('account-lifecycle cron — purge guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findPurgeReadyDeletionRequestsMock.mockResolvedValue([]);
  });

  // -- live behaviour, which must not change ---------------------------------

  it('purges normally with no query string — the scheduled path stays destructive', async () => {
    findPurgeReadyDeletionRequestsMock.mockResolvedValue([
      { id: 1, requestType: 'community' },
      { id: 2, requestType: 'user' },
    ]);

    const { status, summary } = await runCron();

    expect(status).toBe(200);
    expect(purgeCommunityDataMock).toHaveBeenCalledWith(1);
    expect(purgeUserPIIMock).toHaveBeenCalledWith(2);
    expect(summary.purged).toEqual({ users: 1, communities: 1 });
    expect(summary.purge.dryRun).toBe(false);
  });

  // -- dry run ---------------------------------------------------------------

  it('dry run reports what it would purge without purging', async () => {
    findPurgeReadyDeletionRequestsMock.mockResolvedValue([
      { id: 1, requestType: 'community' },
      { id: 2, requestType: 'user' },
    ]);

    const { status, summary } = await runCron('?purgeDryRun=1');

    expect(status).toBe(200);
    expect(purgeCommunityDataMock).not.toHaveBeenCalled();
    expect(purgeUserPIIMock).not.toHaveBeenCalled();
    // The counts still report — that is the point of a dry run — and
    // `purge.dryRun` in the same payload says how to read them.
    expect(summary.purged).toEqual({ users: 1, communities: 1 });
    expect(summary.purge.dryRun).toBe(true);
  });

  it('accepts misspelled keys, because the safe mode is the one to fall into', async () => {
    for (const query of ['?purgedryrun=1', '?purge_dry_run=true', '?PurgeDryRun=1']) {
      vi.clearAllMocks();
      findPurgeReadyDeletionRequestsMock.mockResolvedValue([{ id: 1, requestType: 'community' }]);

      const { summary } = await runCron(query);

      expect(summary.purge.dryRun, `${query} should be recognised as dry-run`).toBe(true);
      expect(purgeCommunityDataMock).not.toHaveBeenCalled();
    }
  });

  it('rejects an unrecognised value with 400 rather than defaulting to live', async () => {
    findPurgeReadyDeletionRequestsMock.mockResolvedValue([{ id: 1, requestType: 'community' }]);

    const { status } = await runCron('?purgeDryRun=yes');

    expect(status).toBe(400);
    expect(purgeCommunityDataMock).not.toHaveBeenCalled();
    // Parsed BEFORE phase 1, so a bad value costs no destructive work at all.
    expect(findPurgeReadyDeletionRequestsMock).not.toHaveBeenCalled();
  });

  // -- safety cap ------------------------------------------------------------

  it('purges a batch exactly at the cap', async () => {
    findPurgeReadyDeletionRequestsMock.mockResolvedValue(candidates(PURGE_SAFETY_CAP));

    const { summary } = await runCron();

    expect(purgeCommunityDataMock).toHaveBeenCalledTimes(PURGE_SAFETY_CAP);
    expect(summary.errors).toEqual([]);
  });

  it('purges NOTHING when the candidate set exceeds the cap', async () => {
    findPurgeReadyDeletionRequestsMock.mockResolvedValue(candidates(PURGE_SAFETY_CAP + 1));

    const { status, summary } = await runCron();

    expect(
      purgeCommunityDataMock,
      'over the cap the phase must refuse entirely — purging the first N of a ' +
        'wrong candidate set is still purging N wrong things',
    ).not.toHaveBeenCalled();
    expect(status).toBe(200); // not a throw: phases 3-5 must still run
    expect(summary.purged).toEqual({ users: 0, communities: 0 });
  });

  it('records the breach in summary.errors', async () => {
    // Deliberately a SEPARATE case from the one above. A cap can be vacuously
    // "tested" by asserting only that it complains; these two split reporting
    // the breach from acting on it, so a probe can tell them apart.
    findPurgeReadyDeletionRequestsMock.mockResolvedValue(candidates(PURGE_SAFETY_CAP + 1));

    const { summary } = await runCron();

    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]).toContain(String(PURGE_SAFETY_CAP + 1));
    expect(summary.errors[0]).toContain(String(PURGE_SAFETY_CAP));
    expect(summary.purge.candidates).toBe(PURGE_SAFETY_CAP + 1);
  });

  it('a tripped cap does not cost the later phases', async () => {
    // The cap RECORDS rather than throws, specifically so phases 3-5 still run.
    // Throwing would trade one safety property for another: the sweeps test
    // exists because a failure in a late phase must not abort work that already
    // succeeded, and the same reasoning applies to work that has not run yet.
    findPurgeReadyDeletionRequestsMock.mockResolvedValue(candidates(PURGE_SAFETY_CAP + 1));

    const { status } = await runCron();

    expect(status).toBe(200);
    expect(cleanupSoftDeletedSiteBlocksMock).toHaveBeenCalled();
    expect(pruneSitePublishSnapshotsMock).toHaveBeenCalled();
  });

  it('evaluates the cap in dry run too, so a breach can be discovered safely', async () => {
    findPurgeReadyDeletionRequestsMock.mockResolvedValue(candidates(PURGE_SAFETY_CAP + 1));

    const { summary } = await runCron('?purgeDryRun=1');

    expect(purgeCommunityDataMock).not.toHaveBeenCalled();
    expect(summary.errors).toHaveLength(1);
  });
});
