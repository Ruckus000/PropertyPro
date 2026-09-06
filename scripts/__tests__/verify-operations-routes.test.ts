import { describe, expect, it } from 'vitest';
import { verifyRoutes, type Violation } from '../verify-operations-routes';

type FixtureName = 'good-registry' | 'missing-community-id-registry' | 'phantom-page-registry';

async function loadFixture(name: FixtureName) {
  const mod = await import(`./fixtures/operations-routes/${name}.ts`);
  return mod.registry;
}

describe('verify-operations-routes', () => {
  it('passes on a good registry', async () => {
    const violations: Violation[] = verifyRoutes(await loadFixture('good-registry'));
    expect(violations).toHaveLength(0);
  });

  it('fails when an operations-family href omits communityId', async () => {
    const violations = verifyRoutes(await loadFixture('missing-community-id-registry'));
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]!.code).toBe('OPS001');
    expect(violations[0]!.message).toMatch(/communityId|communities\/\[id\]/i);
  });

  it('fails on a phantom (nonexistent) non-operations page route', async () => {
    const violations = verifyRoutes(await loadFixture('phantom-page-registry'));
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]!.code).toBe('OPS002');
    expect(violations[0]!.message).toMatch(/does not resolve/i);
  });
});
