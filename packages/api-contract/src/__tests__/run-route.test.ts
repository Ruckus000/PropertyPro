import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { defineRoute } from '../define-route';
import { runRoute } from '../run-route';
import { isContractValidationError } from '../errors';

// NextRequest in next/server uses a slightly stricter RequestInit (signal
// cannot be null), so we type the helper with the constructor's expected
// parameter to avoid TS2345 from `signal: AbortSignal | null | undefined`.
type NextRequestInit = ConstructorParameters<typeof NextRequest>[1];

function makeRequest(url: string, init?: NextRequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost').toString(), init);
}

describe('runRoute — non-paginated', () => {
  const contract = defineRoute({
    method: 'GET',
    path: '/api/v1/widget',
    request: {
      query: z.object({
        id: z.coerce.number().int().positive(),
        verbose: z
          .preprocess((v) => v === 'true' || v === true, z.boolean())
          .optional(),
      }),
    },
    response: z.object({ id: z.number(), name: z.string() }),
  });

  it('wraps the handler result in { data: payload }', async () => {
    const handler = runRoute(contract, async ({ query }) => ({
      id: query.id,
      name: `widget-${query.id}`,
    }));

    const res = await handler(makeRequest('/api/v1/widget?id=7'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ data: { id: 7, name: 'widget-7' } });
  });

  it('preserves first-wins semantics for repeated query keys', async () => {
    // Mirrors the behaviour of `searchParams.get(name)` — the first occurrence
    // of a repeated key wins, matching what migrated routes did before runRoute
    // was introduced. Future array-valued params should preprocess via
    // `searchParams.getAll()` in their own schema, not rely on iteration order.
    const handler = runRoute(contract, async ({ query }) => ({
      id: query.id,
      name: `widget-${query.id}`,
    }));
    const res = await handler(makeRequest('/api/v1/widget?id=7&id=99'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ data: { id: 7, name: 'widget-7' } });
  });

  it('collapses empty-string query params to undefined', async () => {
    const handler = runRoute(contract, async ({ query }) => ({
      id: query.id,
      name: query.verbose === true ? 'verbose' : 'plain',
    }));
    // `?id=7&verbose=` — verbose is empty; without collapsing, z.preprocess
    // would coerce '' → false (per the preprocess fn), but the runner
    // collapses it to undefined and `.optional()` accepts that.
    const res = await handler(makeRequest('/api/v1/widget?id=7&verbose='));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ data: { id: 7, name: 'plain' } });
  });

  it('throws ContractValidationError(source=query) when query fails Zod', async () => {
    const handler = runRoute(contract, async () => ({ id: 1, name: 'x' }));
    await expect(
      handler(makeRequest('/api/v1/widget?id=-1')),
    ).rejects.toSatisfy((err) => isContractValidationError(err) && err.source === 'query');
  });

  it('throws ContractValidationError(source=response) when handler returns wrong shape', async () => {
    // Cast bypasses the compile-time contract so we can prove the *runtime*
    // validator catches envelope drift.
    const bad = { id: 'not-a-number', name: 1 } as unknown as {
      id: number;
      name: string;
    };
    const handler = runRoute(contract, async () => bad);
    await expect(
      handler(makeRequest('/api/v1/widget?id=1')),
    ).rejects.toSatisfy((err) => isContractValidationError(err) && err.source === 'response');
  });

  it('re-throws non-contract errors from the handler unchanged', async () => {
    class Boom extends Error {
      override name = 'Boom';
    }
    const handler = runRoute(contract, async () => {
      throw new Boom('kaboom');
    });
    await expect(
      handler(makeRequest('/api/v1/widget?id=1')),
    ).rejects.toMatchObject({ name: 'Boom', message: 'kaboom' });
  });
});

describe('runRoute — body parsing', () => {
  const postContract = defineRoute({
    method: 'POST',
    path: '/api/v1/widgets',
    request: {
      body: z.object({ name: z.string().min(1) }),
    },
    response: z.object({ id: z.number() }),
  });

  it('parses body for POST', async () => {
    const handler = runRoute(postContract, async ({ body }) => ({
      id: body.name.length,
    }));
    const res = await handler(
      makeRequest('/api/v1/widgets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'hello' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ data: { id: 5 } });
  });

  it('throws ContractValidationError(source=body) on invalid body', async () => {
    const handler = runRoute(postContract, async () => ({ id: 1 }));
    await expect(
      handler(
        makeRequest('/api/v1/widgets', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: '' }),
        }),
      ),
    ).rejects.toSatisfy(
      (err) => isContractValidationError(err) && err.source === 'body',
    );
  });

  it('skips body parsing for GET even if body schema is declared (silent)', async () => {
    const getWithBody = defineRoute({
      method: 'GET',
      path: '/api/v1/anything',
      request: {
        // Authors shouldn't do this; the runner tolerates it rather than
        // throwing at request time. A future guard:contracts check is the
        // right enforcement point.
        body: z.object({ x: z.number() }),
      },
      response: z.object({ ok: z.literal(true) }),
    });
    const handler = runRoute(getWithBody, async () => ({ ok: true as const }));
    const res = await handler(makeRequest('/api/v1/anything'));
    expect(res.status).toBe(200);
  });
});
