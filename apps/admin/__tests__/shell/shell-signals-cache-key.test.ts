/**
 * `getShellSignals` is `cache()`d on its first argument, so its three real call
 * sites must pass the SAME expression or the cache silently stops working.
 *
 * This is the failure mode the wrapper exists to prevent and that nothing else
 * can see: a literal `10` in one of them, or a bare `getShellSignals()`, still
 * renders correctly and still passes every behavioural test — it just runs all
 * seven providers (six outbound probes among them) a second time per request.
 * A source read is the only instrument that catches it, so the file paths are
 * asserted to exist first; a renamed file must fail here rather than vacuously
 * pass on an empty match set.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '../../src');

/** Every place that composes the shell signals for a real request. */
const CALL_SITES = [
  'app/(console)/layout.tsx',
  'app/(console)/dashboard/page.tsx',
  'app/api/admin/shell/signals/route.ts',
];

const EXPECTED_ARGUMENT = 'getShellSignals(preferences.alertPrefs.errorSpikeThreshold)';

describe('getShellSignals cache key', () => {
  it.each(CALL_SITES)('%s passes the operator threshold', (relative) => {
    const path = join(SRC, relative);
    expect(existsSync(path), `${relative} must exist — a rename must fail here, not pass`).toBe(
      true,
    );

    const source = readFileSync(path, 'utf8');
    expect(source).toContain(EXPECTED_ARGUMENT);
    // The threshold has to come from the shared, `cache()`d read — not a
    // literal, which would be a second cache key AND a second default.
    expect(source).toContain('getPreferences(');
    expect(source).not.toMatch(/getShellSignals\(\s*\)/);
  });

  it('checked a non-zero population', () => {
    expect(CALL_SITES.length).toBe(3);
  });
});
