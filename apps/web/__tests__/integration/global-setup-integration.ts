/**
 * Vitest `globalSetup` for the integration suite.
 *
 * Runs ONCE in the main process before any worker starts (and its returned
 * teardown runs once after all workers finish). Unlike per-suite `afterAll`,
 * this executes even when a worker is killed by a timeout or hard crash — so it
 * is the right place to sweep integration-test communities that a crashed worker
 * failed to tear down.
 *
 * The reaper only touches test-pattern slugs older than the age threshold, so it
 * cleans up leaks from PRIOR runs (and never races an in-flight suite). Leaks from
 * the CURRENT run's crashes are collected by the NEXT run's setup sweep.
 */
import { reapOrphanedTestCommunities } from '../../../../scripts/reap-test-communities';

export default async function setup(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    // No DB configured — integration suites `describe.skip`, nothing to reap.
    return;
  }

  const maxAgeHours = process.env.TEST_COMMUNITY_REAP_MAX_AGE_HOURS
    ? Number(process.env.TEST_COMMUNITY_REAP_MAX_AGE_HOURS)
    : undefined;

  try {
    const result = await reapOrphanedTestCommunities({
      maxAgeHours,
      log: (message) => console.log(`[reap] ${message}`),
    });
    if (result.reaped > 0) {
      console.log(`[reap] removed ${result.reaped} orphaned test communities before run`);
    }
  } catch (error) {
    // Best-effort: a reaper failure must not block the test run.
    console.warn('[reap] pre-run sweep failed (continuing):', error);
  }
}
