import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { defineRoute } from '../define-route';
import { runRoute, type RouteHandlerOutput } from '../run-route';
import { isContractValidationError } from '../errors';

function makeRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost').toString());
}

const itemSchema = z.object({ id: z.number(), name: z.string() });

const contract = defineRoute({
  method: 'GET',
  path: '/api/v1/widgets',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
      cursor: z.string().min(1).max(256).optional(),
      pageSize: z.coerce.number().int().positive().optional(),
    }),
  },
  response: itemSchema,
  paginated: true,
});

describe('runRoute — paginated', () => {
  it('wraps handler output in canonical double envelope', async () => {
    const handler = runRoute(contract, async () => ({
      data: [
        { id: 1, name: 'one' },
        { id: 2, name: 'two' },
      ],
      pagination: { nextCursor: 'abc', hasMore: true, pageSize: 2 },
    }));

    const res = await handler(makeRequest('/api/v1/widgets?communityId=1&pageSize=2'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      data: {
        data: [
          { id: 1, name: 'one' },
          { id: 2, name: 'two' },
        ],
        pagination: { nextCursor: 'abc', hasMore: true, pageSize: 2 },
      },
    });
  });

  it('emits hasMore=false / nextCursor=null for the last page', async () => {
    const handler = runRoute(contract, async () => ({
      data: [{ id: 1, name: 'one' }],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    }));
    const res = await handler(makeRequest('/api/v1/widgets?communityId=1'));
    const body = await res.json();
    expect(body.data.pagination).toEqual({
      nextCursor: null,
      hasMore: false,
      pageSize: 50,
    });
  });

  it('validates each item; throws ContractValidationError(source=response) on a bad item', async () => {
    // Cast bypasses the compile-time contract so we can prove the *runtime*
    // validator catches drift. The whole point of the response check is that
    // production handlers that lie about their return type don't leak bad data.
    const badPayload = {
      data: [{ id: 'oops', name: 'broken' }],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    } as unknown as RouteHandlerOutput<typeof contract>;
    const handler = runRoute(contract, async () => badPayload);
    await expect(
      handler(makeRequest('/api/v1/widgets?communityId=1')),
    ).rejects.toSatisfy(
      (err) => isContractValidationError(err) && err.source === 'response',
    );
  });

  it('throws response-source error if handler returns a non-paginated shape', async () => {
    const malformed = { data: [{ id: 1, name: 'x' }] } as unknown as RouteHandlerOutput<
      typeof contract
    >;
    const handler = runRoute(contract, async () => malformed);
    await expect(
      handler(makeRequest('/api/v1/widgets?communityId=1')),
    ).rejects.toSatisfy(
      (err) => isContractValidationError(err) && err.source === 'response',
    );
  });

  it('propagates query validation failures (source=query)', async () => {
    const handler = runRoute(contract, async () => ({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    }));
    // communityId is required; this is missing.
    await expect(
      handler(makeRequest('/api/v1/widgets?pageSize=2')),
    ).rejects.toSatisfy(
      (err) => isContractValidationError(err) && err.source === 'query',
    );
  });
});
