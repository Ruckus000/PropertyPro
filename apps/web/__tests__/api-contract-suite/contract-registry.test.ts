import { describe, it, expect } from 'vitest';
import { loadContractRegistry } from './contract-registry';

describe('contract registry', () => {
  const registry = loadContractRegistry();

  it('enumerates a large set of contracts (floor guards against a glob regression)', () => {
    // Spike on 2026-06-05 found 285. Floor is deliberately well below that.
    expect(registry.length).toBeGreaterThanOrEqual(180);
  });

  it('every entry is well-shaped', () => {
    expect(registry.length).toBeGreaterThan(0);
    for (const entry of registry) {
      expect(typeof entry.file).toBe('string');
      expect(typeof entry.exportName).toBe('string');
      expect(typeof entry.contract.method).toBe('string');
      expect(typeof entry.contract.path).toBe('string');
      expect(typeof entry.contract.response.safeParse).toBe('function');
    }
  });

  it('is sorted deterministically', () => {
    const keys = registry.map((e) => `${e.file}#${e.exportName}`);
    expect([...keys].sort((a, b) => a.localeCompare(b))).toEqual(keys);
  });
});
