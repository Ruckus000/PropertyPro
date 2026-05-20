import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { defineRoute, type RouteContract } from '../define-route';
import type { Infer, InferBody, InferQuery } from '../infer';

describe('defineRoute', () => {
  it('returns the contract unchanged at runtime (identity)', () => {
    const contract = defineRoute({
      method: 'GET',
      path: '/api/v1/example',
      request: {},
      response: z.object({ ok: z.literal(true) }),
    });
    expect(contract.method).toBe('GET');
    expect(contract.path).toBe('/api/v1/example');
  });

  it('preserves literal types so Infer can resolve the response schema', () => {
    const contract = defineRoute({
      method: 'GET',
      path: '/api/v1/widget/[id]',
      request: {
        params: z.object({ id: z.coerce.number().int().positive() }),
        query: z.object({ verbose: z.coerce.boolean().optional() }),
      },
      response: z.object({ id: z.number(), name: z.string() }),
    });

    expectTypeOf<Infer<typeof contract>>().toEqualTypeOf<{
      id: number;
      name: string;
    }>();

    expectTypeOf<InferQuery<typeof contract>>().toEqualTypeOf<{
      verbose?: boolean | undefined;
    }>();
  });

  it('paginated contracts resolve Infer to { data: Item[]; pagination }', () => {
    const itemSchema = z.object({ id: z.number(), name: z.string() });
    const contract = defineRoute({
      method: 'GET',
      path: '/api/v1/widgets',
      request: { query: z.object({ communityId: z.coerce.number() }) },
      response: itemSchema,
      paginated: true,
    });

    expectTypeOf<Infer<typeof contract>>().toMatchTypeOf<{
      data: Array<{ id: number; name: string }>;
      pagination: { nextCursor: string | null; hasMore: boolean; pageSize: number };
    }>();
  });

  it('contracts without a body schema infer InferBody as undefined', () => {
    const contract = defineRoute({
      method: 'GET',
      path: '/api/v1/example',
      request: {},
      response: z.object({}),
    });
    expectTypeOf<InferBody<typeof contract>>().toEqualTypeOf<undefined>();
  });

  it('supports POST contracts with a body schema', () => {
    const contract = defineRoute({
      method: 'POST',
      path: '/api/v1/widgets',
      request: {
        body: z.object({ name: z.string().min(1), enabled: z.boolean() }),
      },
      response: z.object({ id: z.number() }),
    });
    expectTypeOf<InferBody<typeof contract>>().toEqualTypeOf<{
      name: string;
      enabled: boolean;
    }>();
    // RouteContract<...> is preserved structurally.
    expectTypeOf(contract).toMatchTypeOf<RouteContract>();
  });
});
