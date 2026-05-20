import { NextResponse, type NextRequest } from 'next/server';
import type { z } from 'zod';
import type { RouteContract, HttpMethod } from './define-route';
import type { PaginationResult } from './pagination';
import { ContractValidationError } from './errors';

/**
 * A `RouteContract` with any combination of generic parameters. Used as the
 * upper bound where we accept *any* contract regardless of its `TPaginated` /
 * schema parameters — falling back to bare `RouteContract` would pin the
 * defaults (TPaginated=false, schemas=undefined) and reject narrower variants
 * like `paginated: true`.
 */
export type AnyRouteContract = RouteContract<
  z.ZodTypeAny | undefined,
  z.ZodTypeAny | undefined,
  z.ZodTypeAny | undefined,
  z.ZodTypeAny,
  boolean
>;

/**
 * Resolved + validated inputs passed to the user handler.
 *
 * Each field's type comes from the contract:
 *   - undefined if the contract did not declare a schema for that input
 *   - z.infer<schema> if it did
 */
export interface RouteHandlerInput<C extends AnyRouteContract> {
  params: ParamsOf<C>;
  query: QueryOf<C>;
  body: BodyOf<C>;
  req: NextRequest;
}

/**
 * What the handler must return.
 *
 * - Paginated contracts: handler returns the INNER paginated shape
 *   `{ data: Item[]; pagination }`. The runner wraps the outer `data`.
 * - Non-paginated: handler returns the full payload that the response schema
 *   describes. The runner wraps it as `{ data: payload }`.
 */
export type RouteHandlerOutput<C extends AnyRouteContract> =
  C extends RouteContract<
    z.ZodTypeAny | undefined,
    z.ZodTypeAny | undefined,
    z.ZodTypeAny | undefined,
    infer TResponse,
    infer TPaginated
  >
    ? TPaginated extends true
      ? { data: z.infer<TResponse>[]; pagination: PaginationResult }
      : z.infer<TResponse>
    : never;

/** Next.js dynamic-route context shape (Next 15: params is a Promise). */
export interface NextRouteContext {
  params?: Promise<Record<string, string | string[]>> | Record<string, string | string[]>;
}

export type RouteHandlerFn<C extends AnyRouteContract> = (
  input: RouteHandlerInput<C>,
) => Promise<RouteHandlerOutput<C>>;

export type WrappedRouteHandler = (
  req: NextRequest,
  ctx?: NextRouteContext,
) => Promise<NextResponse>;

/**
 * Wrap a contract + handler into a Next.js route handler that:
 *   1. Validates `params` / `query` / `body` against the contract's Zod schemas
 *      (throws `ContractValidationError` with the offending source on failure).
 *   2. Calls the handler with the parsed inputs.
 *   3. Validates the handler's return value against the contract's response
 *      schema (per item when `paginated`, otherwise the full payload).
 *   4. Wraps the result in the canonical envelope:
 *        - non-paginated → `{ data: payload }`
 *        - paginated    → `{ data: { data: items, pagination } }`
 *
 * The runner does NOT call `withErrorHandler` itself. Compose:
 *
 *     export const GET = withErrorHandler(runRoute(contract, async (input) => { ... }));
 *
 * The app's `withErrorHandler` recognizes `ContractValidationError` via
 * `isContractValidationError` and renders the correct 400 / 500 envelope.
 */
export function runRoute<C extends AnyRouteContract>(
  contract: C,
  handler: RouteHandlerFn<C>,
): WrappedRouteHandler {
  return async (req, ctx) => {
    const params = await parseParams(contract, ctx);
    const query = parseQuery(contract, req);
    const body = await parseBody(contract, req);

    const result = await handler({
      params: params as ParamsOf<C>,
      query: query as QueryOf<C>,
      body: body as BodyOf<C>,
      req,
    });

    return buildResponse(contract, result);
  };
}

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------

async function parseParams<C extends AnyRouteContract>(
  contract: C,
  ctx: NextRouteContext | undefined,
): Promise<unknown> {
  const schema = contract.request.params;
  if (!schema) return undefined;
  const rawMaybePromise = ctx?.params;
  const raw =
    rawMaybePromise && typeof (rawMaybePromise as Promise<unknown>).then === 'function'
      ? await (rawMaybePromise as Promise<Record<string, string | string[]>>)
      : (rawMaybePromise as Record<string, string | string[]> | undefined);
  const parsed = schema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new ContractValidationError('params', parsed.error);
  }
  return parsed.data;
}

function parseQuery<C extends AnyRouteContract>(contract: C, req: NextRequest): unknown {
  const schema = contract.request.query;
  if (!schema) return undefined;
  const { searchParams } = new URL(req.url);
  // Collapse empty-string params (`?cursor=`, `?pageSize=`) to undefined so
  // optional Zod schemas don't 400 on `min(1)` / `positive()` constraints.
  // Matches the `||` convention in .claude/rules/api-patterns.md.
  const raw: Record<string, string | undefined> = {};
  for (const [key, value] of searchParams.entries()) {
    raw[key] = value || undefined;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ContractValidationError('query', parsed.error);
  }
  return parsed.data;
}

const METHODS_WITHOUT_BODY: ReadonlySet<HttpMethod> = new Set(['GET']);

async function parseBody<C extends AnyRouteContract>(
  contract: C,
  req: NextRequest,
): Promise<unknown> {
  const schema = contract.request.body;
  if (!schema) return undefined;
  if (METHODS_WITHOUT_BODY.has(contract.method)) {
    // Method doesn't carry a body; schema is ignored silently. (Catching at
    // contract-author time is the job of a future `guard:contracts` check.)
    return undefined;
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = undefined;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ContractValidationError('body', parsed.error);
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Response building
// ---------------------------------------------------------------------------

function buildResponse<C extends AnyRouteContract>(
  contract: C,
  result: unknown,
): NextResponse {
  if (contract.paginated) {
    // Handler is expected to have returned `{ data: items, pagination }`.
    const inner = result as { data?: unknown; pagination?: unknown };
    if (
      !inner ||
      typeof inner !== 'object' ||
      !Array.isArray(inner.data) ||
      !isPaginationResult(inner.pagination)
    ) {
      throw new ContractValidationError(
        'response',
        makeStandaloneZodError('paginated handler must return { data: [], pagination }'),
        'Paginated handler returned a non-paginated shape',
      );
    }
    // Validate each item against the per-item response schema.
    const items: unknown[] = inner.data;
    const validated: unknown[] = [];
    for (let i = 0; i < items.length; i++) {
      const itemResult = contract.response.safeParse(items[i]);
      if (!itemResult.success) {
        throw new ContractValidationError('response', itemResult.error);
      }
      validated.push(itemResult.data);
    }
    return NextResponse.json({
      data: {
        data: validated,
        pagination: inner.pagination,
      },
    });
  }

  // Non-paginated path: validate the whole payload, wrap once.
  const parsed = contract.response.safeParse(result);
  if (!parsed.success) {
    throw new ContractValidationError('response', parsed.error);
  }
  return NextResponse.json({ data: parsed.data });
}

function isPaginationResult(value: unknown): value is PaginationResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    (v['nextCursor'] === null || typeof v['nextCursor'] === 'string') &&
    typeof v['hasMore'] === 'boolean' &&
    typeof v['pageSize'] === 'number'
  );
}

// `ContractValidationError` requires a ZodError; construct a synthetic one
// for our own runner-side asserts (e.g. paginated-shape check) so the same
// rendering path applies.
function makeStandaloneZodError(message: string): z.ZodError {
  // Lazy require avoids a top-level value import (we already import the type).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ZodError } = require('zod') as typeof import('zod');
  return new ZodError([
    {
      code: 'custom',
      path: ['_root'],
      message,
      input: undefined,
    },
  ]);
}

// ---------------------------------------------------------------------------
// Inferred-input helpers (kept local; users use `Infer` for the response side)
// ---------------------------------------------------------------------------

// `request.query?: TQuery` widens to `TQuery | undefined`, which would make a
// naive `extends z.ZodTypeAny` conditional distribute and re-add `undefined`
// back into the inferred handler-input type. Wrapping in a tuple disables
// distribution, and `NonNullable` then strips the `undefined` branch before we
// hand the schema to `z.infer`.
type ParamsOf<C extends AnyRouteContract> = [C['request']['params']] extends [undefined]
  ? undefined
  : z.infer<NonNullable<C['request']['params']>>;

type QueryOf<C extends AnyRouteContract> = [C['request']['query']] extends [undefined]
  ? undefined
  : z.infer<NonNullable<C['request']['query']>>;

type BodyOf<C extends AnyRouteContract> = [C['request']['body']] extends [undefined]
  ? undefined
  : z.infer<NonNullable<C['request']['body']>>;
