import { describe, it, expect } from 'vitest';
import { z } from '@propertypro/api-contract';
import { analyzeContract } from './analyze';
import { runInputCheck } from './run-input-check';

const make = (overrides: Record<string, unknown>) =>
  ({ method: 'POST', path: '/meta', request: {}, response: z.unknown(), ...overrides }) as any;

describe('meta — the checks can fail/flag', () => {
  it('check (b) FAILS on a bogus RBAC resource', () => {
    const a = analyzeContract(make({ permission: { resource: 'not_a_resource', action: 'read' } }), 'bogus');
    expect(a.rbac.status).toBe('fail');
  });

  it('check (a) classifies a z.unknown() body as input-permissive (not "covered")', () => {
    const a = analyzeContract(make({ request: { body: z.unknown() } }), 'permissiveBody');
    expect(a.input.kind).toBe('input-permissive');
  });

  it('check (a) classifies an empty request as no-input', () => {
    const a = analyzeContract(make({ request: {} }), 'noInput');
    expect(a.input.kind).toBe('no-input');
  });

  it('flags a z.unknown() response', () => {
    const a = analyzeContract(make({ response: z.unknown() }), 'unknownResp');
    expect(a.unknownResponse).toBe(true);
  });

  it('a "covered" synthetic contract really 400s end-to-end', async () => {
    const contract = make({ request: { body: z.object({ n: z.number().int().positive() }) } });
    const a = analyzeContract(contract, 'covered');
    expect(a.input.kind).toBe('covered');
    if (a.input.kind === 'covered') {
      const r = await runInputCheck(contract, a.input.location, a.input.bad);
      expect(r.status).toBe(400);
      expect(r.handlerCalled).toBe(false);
    }
  });
});
