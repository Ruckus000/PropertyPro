import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEASE_HELP_CATEGORY, LEASE_HELP_SLUGS, leaseHelpPath } from '../help-slugs';

// The Leases page opens these articles by slug; a renamed or deleted article
// would otherwise become a dead help link with no build error.
const helpDir = path.resolve(__dirname, '../../../../content/help', LEASE_HELP_CATEGORY);

describe('LEASE_HELP_SLUGS', () => {
  it.each(Object.entries(LEASE_HELP_SLUGS))('%s → %s.mdx exists with a matching slug', (_key, slug) => {
    const file = path.join(helpDir, `${slug}.mdx`);
    expect(existsSync(file), `missing ${file}`).toBe(true);
    const source = readFileSync(file, 'utf8');
    expect(source).toMatch(new RegExp(`^slug: "${slug}"$`, 'm'));
    expect(source).toMatch(new RegExp(`^category: "${LEASE_HELP_CATEGORY}"$`, 'm'));
  });

  it('has no duplicate slugs', () => {
    const slugs = Object.values(LEASE_HELP_SLUGS);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('builds the in-app help path', () => {
    expect(leaseHelpPath(LEASE_HELP_SLUGS.renewingALease)).toBe('/help/apartment/renewing-a-lease');
  });
});
