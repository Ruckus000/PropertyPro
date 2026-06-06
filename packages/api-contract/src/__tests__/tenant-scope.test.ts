import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { defineRoute } from '../define-route';
import { runRoute, type RunRouteOptions } from '../run-route';
import type { Infer } from '../infer';

type NextRequestInit = ConstructorParameters<typeof NextRequest>[1];

function makeRequest(url: string, init?: NextRequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost').toString(), init);
}

describe('runRoute — tenantScope injection (Plan B2)', () => {
  it("in:'query' resolves communityId from the query field and injects it", async () => {
    const seen: Array<number | null | undefined> = [];
    const options: RunRouteOptions = {
      resolveCommunityId: (_req, explicit) => {
        seen.push(explicit);
        return (explicit ?? 0) + 1000;
      },
    };

    const contract = defineRoute({
      method: 'GET',
      path: '/api/v1/widgets',
      request: { query: z.object({ communityId: z.coerce.number().int().positive() }) },
      response: z.object({ communityId: z.number() }),
      tenantScope: { in: 'query' },
    });

    const handler = runRoute(
      contract,
      async ({ communityId }) => ({ communityId }),
      options,
    );

    const res = await handler(makeRequest('/api/v1/widgets?communityId=42'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { communityId: 1042 } });
    // The runner handed the explicit query value to the injected resolver.
    expect(seen).toEqual([42]);
  });

  it("in:'body' resolves communityId from the body field and injects it", async () => {
    const options: RunRouteOptions = {
      resolveCommunityId: (_req, explicit) => explicit as number,
    };

    const contract = defineRoute({
      method: 'POST',
      path: '/api/v1/widgets',
      request: {
        body: z.object({
          communityId: z.number().int().positive(),
          name: z.string(),
        }),
      },
      response: z.object({ communityId: z.number(), name: z.string() }),
      tenantScope: { in: 'body' },
    });

    const handler = runRoute(
      contract,
      async ({ communityId, body }) => ({ communityId, name: body.name }),
      options,
    );

    const res = await handler(
      makeRequest('/api/v1/widgets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 7, name: 'w' }),
      }),
    );
    expect(await res.json()).toEqual({ data: { communityId: 7, name: 'w' } });
  });

  it("in:'path' reads the validated path param directly — no resolver needed", async () => {
    const contract = defineRoute({
      method: 'POST',
      path: '/api/v1/communities/[id]/cancel',
      request: {
        params: z.object({ id: z.coerce.number().int().positive() }),
      },
      response: z.object({ communityId: z.number() }),
      tenantScope: { in: 'path', field: 'id' },
    });

    // No options passed — path scope is self-contained.
    const handler = runRoute(contract, async ({ communityId }) => ({ communityId }));

    const res = await handler(makeRequest('/api/v1/communities/9/cancel', { method: 'POST' }), {
      params: Promise.resolve({ id: '9' }),
    });
    expect(await res.json()).toEqual({ data: { communityId: 9 } });
  });

  it("throws a descriptive error when a query/body scope is used without a resolver", async () => {
    const contract = defineRoute({
      method: 'GET',
      path: '/api/v1/widgets',
      request: { query: z.object({ communityId: z.coerce.number().int().positive() }) },
      response: z.object({ communityId: z.number() }),
      tenantScope: { in: 'query' },
    });

    // Intentionally omit options to simulate using the bare package runRoute.
    const handler = runRoute(contract, async ({ communityId }) => ({ communityId }));

    await expect(
      handler(makeRequest('/api/v1/widgets?communityId=42')),
    ).rejects.toThrow(/resolveCommunityId was provided/);
  });

  it("path scope throws ContractValidationError when the param is missing/invalid", async () => {
    const contract = defineRoute({
      method: 'POST',
      path: '/api/v1/communities/[id]/cancel',
      // params schema intentionally omitted so the runner can't coerce `id`.
      request: {},
      response: z.object({ communityId: z.number() }),
      tenantScope: { in: 'path', field: 'id' },
    });
    const handler = runRoute(contract, async ({ communityId }) => ({ communityId }));
    await expect(
      handler(makeRequest('/api/v1/communities/x/cancel', { method: 'POST' }), {
        params: Promise.resolve({ id: 'not-a-number' }),
      }),
    ).rejects.toThrow();
  });
});

describe('runRoute — backward compatibility (no tenantScope)', () => {
  it('does not inject communityId and behaves exactly as before', async () => {
    const contract = defineRoute({
      method: 'GET',
      path: '/api/v1/widgets',
      request: { query: z.object({ id: z.coerce.number().int().positive() }) },
      response: z.object({ id: z.number() }),
    });

    // No options, no tenantScope — handler never receives communityId.
    const handler = runRoute(contract, async ({ query }) => ({ id: query.id }));
    const res = await handler(makeRequest('/api/v1/widgets?id=5'));
    expect(await res.json()).toEqual({ data: { id: 5 } });
  });
});

// ---------------------------------------------------------------------------
// Type-level assertions (enforced by `tsc --noEmit` over this test file).
// These prove the 6th generic didn't break Infer and that CommunityIdOf gates
// the handler-input `communityId` on the presence of `tenantScope`.
// ---------------------------------------------------------------------------

const scopedContract = defineRoute({
  method: 'GET',
  path: '/api/v1/widgets',
  request: { query: z.object({ communityId: z.coerce.number().int().positive() }) },
  response: z.object({ id: z.number(), name: z.string() }),
  tenantScope: { in: 'query' },
});

const paginatedScopedContract = defineRoute({
  method: 'GET',
  path: '/api/v1/widgets',
  request: { query: z.object({ communityId: z.coerce.number().int().positive() }) },
  response: z.object({ id: z.number() }),
  paginated: true,
  tenantScope: { in: 'query' },
});

const unscopedContract = defineRoute({
  method: 'GET',
  path: '/api/v1/widgets',
  request: { query: z.object({ id: z.coerce.number() }) },
  response: z.object({ id: z.number() }),
});

// Infer must NOT collapse to `never` once a tenantScope generic exists.
const _inferScoped: Infer<typeof scopedContract> = { id: 1, name: 'x' };
const _inferPaginated: Infer<typeof paginatedScopedContract> = {
  data: [{ id: 1 }],
  pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
};

// Scoped contract: handler input HAS communityId: number.
runRoute(scopedContract, async (input) => {
  const _cid: number = input.communityId;
  void _cid;
  return { id: 1, name: 'x' };
}, { resolveCommunityId: () => 1 });

// Unscoped contract: handler input has NO communityId.
runRoute(unscopedContract, async (input) => {
  // @ts-expect-error - no tenantScope ⇒ no communityId on the handler input
  void input.communityId;
  return { id: 1 };
});

void _inferScoped;
void _inferPaginated;
