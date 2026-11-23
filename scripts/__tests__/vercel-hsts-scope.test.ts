/**
 * HSTS `includeSubDomains` / `preload` go only to our own domain.
 *
 * The web project serves every host attached to it, and association custom
 * domains (apex ones included) attach to this project. Sending
 * `includeSubDomains; preload` there would force HTTPS on every subdomain of a
 * domain we do not own, for two years, and invite a preload-list submission
 * for it. So `apps/web/vercel.json` carries two rules: the full value for
 * `getpropertypro.com` and its subdomains, `max-age` alone for every other
 * host (2026-11-23 security sweep, finding 9).
 *
 * Regex flavour: Vercel's vercel.json docs (checked 2026-11-23) treat a `has`
 * value as a regex but do not say whether it is anchored, and name PCRE only for
 * `routes`. The pattern therefore carries its own `^…$`, and this test checks it
 * with JavaScript `RegExp` under BOTH readings: a full match and a substring
 * search. The pattern uses only syntax PCRE and JavaScript agree on.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(
  readFileSync(join(here, '..', '..', 'apps', 'web', 'vercel.json'), 'utf8'),
) as { headers: HeaderRule[] };

interface Condition {
  type: string;
  key?: string;
  value?: unknown;
}

interface HeaderRule {
  source: string;
  has?: Condition[];
  missing?: Condition[];
  headers: { key: string; value: string }[];
}

const HSTS = 'strict-transport-security';
const FULL_VALUE = 'max-age=63072000; includeSubDomains; preload';
const PLAIN_VALUE = 'max-age=63072000';

const PLATFORM_HOSTS = ['getpropertypro.com', 'www.getpropertypro.com', 'sunset-condos.getpropertypro.com'];
const OTHER_HOSTS = ['sunsetcondos.org', 'getpropertypro.com.evil.org', 'evilgetpropertypro.com'];

function hstsValue(rule: HeaderRule): string | undefined {
  return rule.headers.find((h) => h.key.toLowerCase() === HSTS)?.value;
}

function hostPattern(conditions: Condition[] | undefined): string | undefined {
  const host = conditions?.find((c) => c.type === 'host');
  return typeof host?.value === 'string' ? host.value : undefined;
}

/** True only if the pattern gives `expected` under both a full match and a substring search. */
function matchesUnderBothReadings(pattern: string, host: string): boolean {
  const full = new RegExp(`^(?:${pattern})$`).test(host);
  const search = new RegExp(pattern).test(host);
  expect(full, `full-match and search disagree for ${host}`).toBe(search);
  return full;
}

const hstsRules = config.headers.filter((rule) => hstsValue(rule) !== undefined);

describe('apps/web/vercel.json — HSTS scope', () => {
  it('has exactly two HSTS rules, both on every path', () => {
    expect(hstsRules).toHaveLength(2);
    for (const rule of hstsRules) expect(rule.source).toBe('/(.*)');
  });

  it('sends includeSubDomains / preload only under a host condition for our domain', () => {
    const strong = hstsRules.filter((rule) => /includeSubDomains|preload/i.test(hstsValue(rule)!));
    expect(strong).toHaveLength(1);

    const [rule] = strong;
    expect(hstsValue(rule!)).toBe(FULL_VALUE);
    expect(rule!.missing).toBeUndefined();
    const pattern = hostPattern(rule!.has);
    expect(pattern, 'the includeSubDomains rule must have a `has` host condition').toBeDefined();

    for (const host of PLATFORM_HOSTS) {
      expect(matchesUnderBothReadings(pattern!, host), host).toBe(true);
    }
    for (const host of OTHER_HOSTS) {
      expect(matchesUnderBothReadings(pattern!, host), host).toBe(false);
    }
  });

  it('every other host gets max-age only, from the exact complement condition', () => {
    const strongRule = hstsRules.find((rule) => hstsValue(rule) === FULL_VALUE);
    const plain = hstsRules.filter((rule) => rule !== strongRule);
    expect(plain).toHaveLength(1);

    const [rule] = plain;
    expect(hstsValue(rule!)).toBe(PLAIN_VALUE);
    expect(rule!.has).toBeUndefined();
    // Same pattern under `missing` as under `has`: every host hits exactly one rule.
    expect(hostPattern(rule!.missing)).toBe(hostPattern(strongRule?.has));
  });
});
