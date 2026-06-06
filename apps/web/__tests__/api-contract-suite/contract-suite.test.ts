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
    const covered = a.input.kind === 'covered' ? a.input : null;
    const itA = covered ? it : it.skip;

    itA('(a) malformed input is rejected with 400 before the handler runs', async () => {
      // `covered` is non-null whenever this test actually runs (itA === it).
      const r = await runInputCheck(a.contract, covered!.location, covered!.bad);
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

  it('logs the coverage table and partition identities hold', () => {
    // eslint-disable-next-line no-console
    console.table(counts);
    expect(counts.total).toBeGreaterThanOrEqual(180);
    expect(counts.covered + counts.inputPermissive + counts.noInput).toBe(counts.total);
    expect(counts.rbacChecked + counts.rbacAllowlisted + counts.rbacInapplicable).toBe(counts.total);
  });

  it('floor: a strong majority of contracts get a real (a) assertion', () => {
    // First real run (2026-06-05): 264 of 285 contracts covered (~93%). Floor is
    // 237 (≈0.9× that run) — it guards against erosion, not perfection. When new
    // contracts are added and covered, raise this toward 0.9× the new actual.
    expect(counts.covered).toBeGreaterThanOrEqual(237);
  });

  it('no contract is left in an RBAC "fail" state', () => {
    const failures = analyzed.filter((a) => a.rbac.status === 'fail');
    expect(failures.map((a) => a.label)).toEqual([]);
  });
});
