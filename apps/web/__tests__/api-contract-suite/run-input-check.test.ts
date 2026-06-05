import { describe, it, expect } from 'vitest';
import { z, runRoute } from '@propertypro/api-contract';
import { runInputCheck } from './run-input-check';

describe('runInputCheck', () => {
  it('drives a bad BODY to a 400 with handler never called', async () => {
    const contract = {
      method: 'POST' as const, path: '/x',
      request: { body: z.object({ communityId: z.number().int().positive() }) },
      response: z.unknown(),
    };
    const r = await runInputCheck(contract, 'body', { communityId: -1 });
    expect(r).toEqual({ status: 400, code: 'VALIDATION_ERROR', handlerCalled: false });
  });

  it('drives a bad QUERY string to a 400', async () => {
    const contract = {
      method: 'GET' as const, path: '/x',
      request: { query: z.object({ communityId: z.coerce.number().int().positive() }) },
      response: z.unknown(),
    };
    const r = await runInputCheck(contract, 'query', { communityId: 'abc' });
    expect(r.status).toBe(400);
    expect(r.handlerCalled).toBe(false);
  });

  it('drives bad PARAMS (Next15 promise ctx) to a 400', async () => {
    const contract = {
      method: 'GET' as const, path: '/x/[id]',
      request: { params: z.object({ id: z.coerce.number().int().positive() }) },
      response: z.unknown(),
    };
    const r = await runInputCheck(contract, 'params', { id: 'abc' });
    expect(r.status).toBe(400);
    expect(r.handlerCalled).toBe(false);
  });
});
