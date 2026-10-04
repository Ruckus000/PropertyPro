import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * A demo whose trial has ended is read-only until it expires
 * (`assertNotDemoGrace`). Twelve PM site routes once wrote anyway, because the
 * check is a per-route call and nothing noticed a route without it. This scans
 * every route under `api/v1/pm/site/` plus the onboarding website step and
 * requires the call in any file exporting a write verb.
 *
 * It checks the FILE, not each verb: a route whose GET and PATCH share one
 * access helper passes on the helper's call. The per-route unit tests pin the
 * verb-level behaviour (writes refused, reads allowed) for the routes that
 * share a helper with a GET.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pmApi = path.resolve(__dirname, '../../src/app/api/v1/pm');

const WRITE_VERB = /^export const (POST|PUT|PATCH|DELETE)\b/m;

/** Write routes deliberately left without the check, each with its reason. */
const EXEMPT = new Map<string, string>();

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === 'route.ts' ? [full] : [];
  });
}

const files = [
  ...routeFiles(path.join(pmApi, 'site')),
  path.join(pmApi, 'onboarding/website/route.ts'),
];
const writeRoutes = files.filter((f) => WRITE_VERB.test(fs.readFileSync(f, 'utf8')));

describe('every PM site write route refuses a demo in its grace window', () => {
  it('scans a real population', () => {
    // 17 route files and 14 with a write verb on 2026-10-04. A scan that
    // found nothing must not pass.
    expect(files.length).toBeGreaterThanOrEqual(15);
    expect(writeRoutes.length).toBeGreaterThanOrEqual(13);
  });

  it.each(writeRoutes.map((f) => [path.relative(pmApi, f), f]))('%s', (rel, file) => {
    if (EXEMPT.has(rel)) return;
    expect(fs.readFileSync(file, 'utf8')).toMatch(/\bassertNotDemoGrace\(/);
  });
});
