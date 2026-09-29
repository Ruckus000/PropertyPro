/**
 * CON-04 — envelope siblings (`contract.envelope` + `withEnvelope`).
 *
 * The runner's invariant is that a contract WITHOUT `envelope` produces
 * exactly the pre-CON-04 wire bytes; these tests assert on `res.text()`
 * rather than a parsed object wherever byte-identity (including key order:
 * `data` first) is the claim.
 */
import { describe, expect, expectTypeOf, it } from 'vitest';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { defineRoute } from '../define-route';
import { runRoute, withEnvelope } from '../run-route';
import { isContractValidationError } from '../errors';
import type { Infer, InferEnvelope } from '../infer';

function post(url: string, body: unknown): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost').toString(), {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

async function captureError(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (err) {
    return err;
  }
  throw new Error('expected the handler to throw');
}

const warningSchema = z.object({ code: z.string(), message: z.string() });

const withWarnings = defineRoute({
  method: 'POST',
  path: '/api/v1/widget',
  request: { body: z.object({ name: z.string() }) },
  response: z.object({ id: z.number(), name: z.string() }),
  envelope: z.object({ warnings: z.array(warningSchema).optional() }),
});

const plain = defineRoute({
  method: 'POST',
  path: '/api/v1/widget',
  request: { body: z.object({ name: z.string() }) },
  response: z.object({ id: z.number(), name: z.string() }),
});

const WARNING = { code: 'late_notice', message: 'Inside the notice window' };

describe('runRoute — envelope siblings (CON-04)', () => {
  it('a plain return on an envelope contract is the bare { data } (byte-identical)', async () => {
    const handler = runRoute(withWarnings, async ({ body }) => ({ id: 1, name: body.name }));
    const res = await handler(post('/api/v1/widget', { name: 'a' }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"data":{"id":1,"name":"a"}}');
  });

  it('emits a declared sibling at the top level, AFTER data', async () => {
    const handler = runRoute(withWarnings, async ({ body }) =>
      withEnvelope({ id: 1, name: body.name }, { warnings: [WARNING] }),
    );
    const res = await handler(post('/api/v1/widget', { name: 'a' }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(
      '{"data":{"id":1,"name":"a"},"warnings":[{"code":"late_notice","message":"Inside the notice window"}]}',
    );
  });

  it('an undefined sibling is omitted — same bytes as a plain return', async () => {
    const handler = runRoute(withWarnings, async ({ body }) =>
      withEnvelope({ id: 1, name: body.name }, { warnings: undefined }),
    );
    const res = await handler(post('/api/v1/widget', { name: 'a' }));
    expect(await res.text()).toBe('{"data":{"id":1,"name":"a"}}');
  });

  it('still validates the payload against `response` when siblings are present', async () => {
    const handler = runRoute(withWarnings, async () =>
      // Deliberately wrong payload type; the sibling is valid.
      withEnvelope({ id: 'nope', name: 'a' } as unknown as { id: number; name: string }, {
        warnings: [WARNING],
      }),
    );
    const err = await captureError(handler(post('/api/v1/widget', { name: 'a' })));
    expect(isContractValidationError(err)).toBe(true);
    expect((err as { source: string }).source).toBe('response');
    expect((err as { fields: { field: string }[] }).fields[0]?.field).toBe('id');
  });

  it('validates siblings against the envelope schema (bad sibling → response violation)', async () => {
    const handler = runRoute(withWarnings, async () =>
      withEnvelope({ id: 1, name: 'a' }, {
        warnings: [{ code: 7 }],
      } as unknown as { warnings: { code: string; message: string }[] }),
    );
    const err = await captureError(handler(post('/api/v1/widget', { name: 'a' })));
    expect(isContractValidationError(err)).toBe(true);
    expect((err as { source: string }).source).toBe('response');
    expect((err as { fields: { field: string }[] }).fields[0]?.field).toMatch(
      /^warnings\.0\./,
    );
  });

  it('emits the PARSED siblings — an undeclared key never reaches the wire', async () => {
    const handler = runRoute(withWarnings, async () =>
      withEnvelope({ id: 1, name: 'a' }, {
        warnings: [WARNING],
        secret: 'leak',
      } as unknown as { warnings: { code: string; message: string }[] }),
    );
    const res = await handler(post('/api/v1/widget', { name: 'a' }));
    const json = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(json)).toEqual(['data', 'warnings']);
  });

  it('refuses siblings on a contract that declares no envelope', async () => {
    const handler = runRoute(plain, async () =>
      // @ts-expect-error — `withEnvelope` is a type error on a contract without `envelope`.
      withEnvelope({ id: 1, name: 'a' }, { warnings: [WARNING] }),
    );
    const err = await captureError(handler(post('/api/v1/widget', { name: 'a' })));
    expect(isContractValidationError(err)).toBe(true);
    expect((err as { source: string }).source).toBe('response');
    expect((err as Error).message).toMatch(/does not declare/);
  });

  it.each(['data', 'error'])("rejects a reserved sibling name '%s'", async (key) => {
    const reservedContract = defineRoute({
      method: 'POST',
      path: '/api/v1/widget',
      request: {},
      response: z.object({ id: z.number() }),
      envelope: z.object({ [key]: z.string().optional() }),
    });
    const handler = runRoute(reservedContract, async () =>
      withEnvelope({ id: 1 }, { [key]: 'x' }),
    );
    const err = await captureError(handler(post('/api/v1/widget', {})));
    expect(isContractValidationError(err)).toBe(true);
    expect(JSON.stringify((err as { fields: unknown }).fields)).toContain(
      `envelope sibling '${key}' is reserved`,
    );
  });

  it('a non-reserved sibling beside a reserved-looking name still passes (control)', async () => {
    const ok = defineRoute({
      method: 'POST',
      path: '/api/v1/widget',
      request: {},
      response: z.object({ id: z.number() }),
      envelope: z.object({ errors: z.array(z.string()).optional() }),
    });
    const handler = runRoute(ok, async () => withEnvelope({ id: 1 }, { errors: ['e'] }));
    const res = await handler(post('/api/v1/widget', {}));
    expect(await res.text()).toBe('{"data":{"id":1},"errors":["e"]}');
  });

  it('refuses siblings at RUNTIME on a z.unknown()-response contract with no envelope (no compile error there)', async () => {
    const loose = defineRoute({
      method: 'POST',
      path: '/api/v1/widget',
      request: {},
      response: z.unknown(),
    });
    // No @ts-expect-error: with `response: z.unknown()` the handler returns
    // `unknown`, which absorbs `Enveloped<...>`, so this compiles. The runtime
    // refusal is the only guarantee here.
    const handler = runRoute(loose, async () => withEnvelope({ id: 1 }, { warnings: [WARNING] }));
    const err = await captureError(handler(post('/api/v1/widget', {})));
    expect(isContractValidationError(err)).toBe(true);
    expect((err as Error).message).toMatch(/does not declare/);
  });

  it('paginated: sibling sits beside the OUTER data, inner envelope unchanged', async () => {
    const paged = defineRoute({
      method: 'GET',
      path: '/api/v1/widgets',
      request: {},
      response: z.object({ id: z.number() }),
      paginated: true,
      envelope: z.object({ meta: z.object({ total: z.number() }).optional() }),
    });
    const pagination = { nextCursor: null, hasMore: false, pageSize: 50 };
    const handler = runRoute(paged, async () =>
      withEnvelope({ data: [{ id: 1 }], pagination }, { meta: { total: 1 } }),
    );
    const res = await handler(
      new NextRequest(new URL('/api/v1/widgets', 'http://localhost').toString()),
    );
    expect(await res.text()).toBe(
      '{"data":{"data":[{"id":1}],"pagination":{"nextCursor":null,"hasMore":false,"pageSize":50}},"meta":{"total":1}}',
    );
  });

  it('types: Infer is unchanged by envelope; InferEnvelope reads the sibling schema', () => {
    expectTypeOf<Infer<typeof withWarnings>>().toEqualTypeOf<{ id: number; name: string }>();
    expectTypeOf<InferEnvelope<typeof withWarnings>>().toEqualTypeOf<{
      warnings?: { code: string; message: string }[] | undefined;
    }>();
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- asserting the no-envelope identity
    expectTypeOf<InferEnvelope<typeof plain>>().toEqualTypeOf<{}>();
  });
});
