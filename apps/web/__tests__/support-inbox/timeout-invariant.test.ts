/**
 * The database must give up before the platform kills the function.
 *
 * NO RUNTIME TEST CAN REACH THIS. A Vercel function timeout is platform
 * behaviour: the process is killed and the route's own catch never runs, so
 * there is nothing to assert from inside. What CAN be pinned is the invariant
 * that makes the incident impossible, and it spans two files that nothing else
 * relates to each other.
 *
 * The incident: postgres.js defaults `connect_timeout` to 30 and this route
 * defaulted `maxDuration` to 30. Equal clocks, but the platform's starts at
 * t=0 while the connect only begins after signature verification, JSON parsing
 * and normalization — so the driver could never reject first. On a connect
 * hang Vercel returned 504, and a 5xx is returned verbatim by Forward Email as
 * a PERMANENT failure, bouncing the message the deferral existed to hold.
 *
 * Reading the source is deliberate, and follows the precedent of
 * packages/db/__tests__/support-inbox-migration.test.ts: when the only honest
 * assertion is about an artifact rather than a behaviour, assert the artifact.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');

function readSource(relative: string): string {
  return readFileSync(join(ROOT, relative), 'utf8');
}

describe('inbound webhook timeout invariant', () => {
  const drizzle = readSource('packages/db/src/drizzle.ts');
  const route = readSource('apps/web/src/app/api/v1/webhooks/inbound-email/route.ts');

  const connectTimeout = Number(/connect_timeout:\s*(\d+)/.exec(drizzle)?.[1]);
  const maxDuration = Number(/export const maxDuration = (\d+)/.exec(route)?.[1]);

  it('sets an explicit connect_timeout rather than inheriting the 30s default', () => {
    // Without this the driver's clock ties the platform's and always loses.
    expect(Number.isInteger(connectTimeout)).toBe(true);
    expect(connectTimeout).toBeGreaterThan(0);
  });

  it('gives the driver a strictly smaller budget than the platform', () => {
    expect(Number.isInteger(maxDuration)).toBe(true);
    // The whole invariant, in one line: the DB must lose the race on purpose,
    // so the catch runs and the sender is told to hold rather than to bounce.
    expect(connectTimeout).toBeLessThan(maxDuration);
  });

  it('leaves headroom for the provider to time out first as well', () => {
    // Forward Email's own HTTP timeout is ~30s. If ours is not comfortably
    // larger, a stall we do not control still ends as a platform 504 rather
    // than as their retryable client-side timeout.
    expect(maxDuration).toBeGreaterThan(30);
  });
});
