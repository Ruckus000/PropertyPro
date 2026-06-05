import { describe, it, expect } from 'vitest';
import { loadContractRegistry } from './contract-registry';
import { analyzeContract, type AnalyzedContract } from './analyze';
import { runInputCheck } from './run-input-check';

const registry = loadContractRegistry();
const analyzed: AnalyzedContract[] = registry.map((e) =>
  analyzeContract(e.contract, e.exportName),
);

describe('contract suite — per-contract checks', () => {
  describe.each(analyzed)('$label', (a) => {
    it('(a) malformed input is rejected with 400 before the handler runs', async () => {
      if (a.input.kind !== 'covered') {
        // input-permissive / no-input: (a) is inapplicable. Counted below.
        return;
      }
      const r = await runInputCheck(a.contract, a.input.location, a.input.bad);
      expect(r.handlerCalled).toBe(false);
      expect(r.status).toBe(400);
      expect(r.code).toBe('VALIDATION_ERROR');
    });

    it('(b) declared RBAC permission resolves to a matrix entry (or allowlist)', () => {
      if (a.rbac.status === 'fail') {
        throw new Error(a.rbac.message);
      }
      expect(['ok', 'allowlisted', 'inapplicable']).toContain(a.rbac.status);
    });
  });
});

describe('contract suite — coverage report', () => {
  const counts = {
    total: analyzed.length,
    covered: analyzed.filter((a) => a.input.kind === 'covered').length,
    inputPermissive: analyzed.filter((a) => a.input.kind === 'input-permissive').length,
    noInput: analyzed.filter((a) => a.input.kind === 'no-input').length,
    rbacChecked: analyzed.filter((a) => a.rbac.status === 'ok').length,
    rbacAllowlisted: analyzed.filter((a) => a.rbac.status === 'allowlisted').length,
    rbacInapplicable: analyzed.filter((a) => a.rbac.status === 'inapplicable').length,
    unknownResponse: analyzed.filter((a) => a.unknownResponse).length,
  };

  it('logs the coverage table', () => {
    // eslint-disable-next-line no-console
    console.table(counts);
    expect(counts.total).toBe(analyzed.length);
  });

  it('floor: a strong majority of contracts get a real (a) assertion', () => {
    // Set from the FIRST real run of this location-aware suite (Step 2). The
    // value below is the floor, not the actual — it guards against erosion.
    expect(counts.covered).toBeGreaterThanOrEqual(237);
  });

  it('no contract is left in an RBAC "fail" state', () => {
    const failures = analyzed.filter((a) => a.rbac.status === 'fail');
    expect(failures.map((a) => a.label)).toEqual([]);
  });
});
