import { NextResponse, type NextRequest } from 'next/server';
import { ZodError, type z } from 'zod';
import type { RouteContract, HttpMethod, RouteTenantScope } from './define-route';
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
  boolean,
  RouteTenantScope | undefined,
  z.ZodTypeAny | undefined
>;

/**
 * Adds `communityId: number` to the handler input ONLY when the contract
 * declares a `tenantScope` (Plan B2). A contract without `tenantScope` has
 * `tenantScope` typed as `undefined`, so this resolves to `{}` and the handler
 * input is byte-identical to the pre-B2 shape. The tuple wrap defeats union
 * distribution (an optional member reads as `TScope | undefined`).
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentional intersection identity; must stay byte-identical to the pre-B2 shape
type IntersectionIdentity = {};

type CommunityIdOf<C extends AnyRouteContract> = [C['tenantScope']] extends [undefined]
  ? IntersectionIdentity
  : { communityId: number };

/**
 * Resolved + validated inputs passed to the user handler.
 *
 * Each field's type comes from the contract:
 *   - undefined if the contract did not declare a schema for that input
 *   - z.infer<schema> if it did
 *
 * Plus `communityId: number` when the contract declares a `tenantScope`.
 */
export type RouteHandlerInput<C extends AnyRouteContract> = {
  params: ParamsOf<C>;
  query: QueryOf<C>;
  body: BodyOf<C>;
  req: NextRequest;
} & CommunityIdOf<C>;

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
    infer TPaginated,
    RouteTenantScope | undefined,
    z.ZodTypeAny | undefined
  >
    ? TPaginated extends true
      ? { data: z.infer<TResponse>[]; pagination: PaginationResult }
      : z.infer<TResponse>
    : never;

/** Next.js dynamic-route context shape (Next 15: params is a Promise). */
export interface NextRouteContext {
  params?: Promise<Record<string, string | string[]>> | Record<string, string | string[]>;
}

/**
 * What a handler may emit as envelope siblings (CON-04): the INPUT side of
 * the contract's `envelope` schema, or `never` when the contract declares
 * none.
 *
 * That `never` is only a compile-time check when the contract's `response`
 * is typed. With a loose `response: z.unknown()` (the posture of ~150
 * contracts, documents POST included) the handler's return type collapses to
 * `unknown`, which absorbs `Enveloped<…>`, so the compiler accepts
 * `withEnvelope` on a contract with no `envelope`. The RUNTIME refusal in
 * `parseEnvelope` is the real guarantee; the type is a convenience.
 */
export type RouteEnvelopeOf<C extends AnyRouteContract> = [C['envelope']] extends [undefined]
  ? never
  : z.input<NonNullable<C['envelope']>>;

export const ENVELOPED: unique symbol = Symbol.for('@propertypro/api-contract/enveloped');

/**
 * A handler result carrying top-level envelope siblings. Built only by
 * `withEnvelope`; the runner recognises it by a registered-symbol brand (so a
 * second copy of this module — src vs dist — still agrees), which a route's
 * own payload can never carry by accident.
 */
export interface Enveloped<TPayload, TSiblings> {
  readonly [ENVELOPED]: true;
  readonly payload: TPayload;
  readonly siblings: TSiblings;
}

/**
 * Return this from a `runRoute` handler to emit top-level keys beside `data`
 * (CON-04). `payload` is exactly what the handler would otherwise return —
 * validated against `response` and wrapped as before — and `siblings` is
 * validated against the contract's `envelope` schema and spread after `data`:
 *
 *     return withEnvelope(row, { warnings: warnings.length > 0 ? warnings : undefined });
 *     // → { data: <row> }                  when warnings is empty
 *     // → { data: <row>, warnings: [...] } otherwise
 *
 * An `undefined` sibling is omitted from the wire, so conditional keys need
 * no spread gymnastics. The contract MUST declare `envelope`; the runner
 * refuses siblings otherwise (a compile error too, but only for a typed
 * `response` — see `RouteEnvelopeOf`). Siblings are validated AFTER the
 * handler ran, i.e. after any write it committed, so keep the `envelope`
 * schema at least as loose as the values the handler can produce. This replaces carrying siblings out of the handler in
 * a request-keyed `WeakMap` and re-serialising the runner's response.
 */
export function withEnvelope<TPayload, TSiblings extends Record<string, unknown>>(
  payload: TPayload,
  siblings: TSiblings,
): Enveloped<TPayload, TSiblings> {
  return { [ENVELOPED]: true, payload, siblings };
}

function isEnveloped(value: unknown): value is Enveloped<unknown, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<PropertyKey, unknown>)[ENVELOPED] === true
  );
}

export type RouteHandlerFn<C extends AnyRouteContract> = (
  input: RouteHandlerInput<C>,
) => Promise<RouteHandlerOutput<C> | Enveloped<RouteHandlerOutput<C>, RouteEnvelopeOf<C>>>;

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
/**
 * Options for `runRoute`. `resolveCommunityId` is dependency-injected because
 * `@propertypro/api-contract` must not import app code — the app supplies its
 * `resolveEffectiveCommunityId` via the bound wrapper at
 * `apps/web/src/lib/api/run-route.ts`. Only consulted when `tenantScope.in` is
 * `'query'` / `'body'`; `'path'` reads the validated path param directly.
 */
export interface RunRouteOptions {
  resolveCommunityId?: (
    req: NextRequest,
    explicit: number | null | undefined,
  ) => number;
}

export function runRoute<C extends AnyRouteContract>(
  contract: C,
  handler: RouteHandlerFn<C>,
  options?: RunRouteOptions,
): WrappedRouteHandler {
  return async (req, ctx) => {
    const params = await parseParams(contract, ctx);
    const query = parseQuery(contract, req);
    const body = await parseBody(contract, req);

    // The cast is sound because `RouteHandlerInput<C>` only adds the optional
    // `communityId` member (via `CommunityIdOf<C>`), which is assigned below
    // exactly when the contract declares a `tenantScope`.
    const input = {
      params: params as ParamsOf<C>,
      query: query as QueryOf<C>,
      body: body as BodyOf<C>,
      req,
    } as RouteHandlerInput<C>;

    if (contract.tenantScope) {
      (input as { communityId: number }).communityId = resolveTenantId(
        contract.tenantScope,
        { params, query, body },
        req,
        options,
      );
    }

    const result = await handler(input);

    return buildResponse(contract, result);
  };
}

// ---------------------------------------------------------------------------
// Tenant resolution (Plan B2)
// ---------------------------------------------------------------------------

/**
 * Resolve the effective `communityId` from the contract's declared
 * `tenantScope`. Semantics mirror the app's prior in-handler pattern, only
 * relocated here:
 *   - `path` → the validated path segment is authoritative (no header
 *     cross-check), matching how nested `/communities/[id]/…` routes resolve.
 *   - `query` / `body` → the explicit value is handed to the injected
 *     `resolveCommunityId`, which reconciles it against the middleware
 *     `x-community-id` header (header authoritative).
 */
function resolveTenantId(
  scope: RouteTenantScope,
  parsed: { params: unknown; query: unknown; body: unknown },
  req: NextRequest,
  options: RunRouteOptions | undefined,
): number {
  if (scope.in === 'path') {
    const field = scope.field ?? 'id';
    const raw = (parsed.params as Record<string, unknown> | undefined)?.[field];
    const value = typeof raw === 'string' ? Number(raw) : raw;
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      throw new ContractValidationError(
        'params',
        makeStandaloneZodError(
          `tenantScope path field '${field}' is missing or not a positive integer`,
        ),
      );
    }
    return value;
  }

  const field = scope.field ?? 'communityId';
  const source = scope.in === 'query' ? parsed.query : parsed.body;
  const explicit = (source as Record<string, unknown> | undefined)?.[field] as
    | number
    | null
    | undefined;

  if (!options?.resolveCommunityId) {
    throw new Error(
      `runRoute: contract declares tenantScope.in='${scope.in}' but no ` +
        `resolveCommunityId was provided. Import runRoute from ` +
        `'@/lib/api/run-route' (the app-bound wrapper), not directly from ` +
        `'@propertypro/api-contract'.`,
    );
  }

  return options.resolveCommunityId(req, explicit);
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
  //
  // For repeated keys (`?tag=a&tag=b`) we preserve the prior
  // `searchParams.get(name)` first-wins semantics — `.get()` returns the first
  // occurrence. If a future route needs array-valued params, declare it as
  // `z.array(...)` and read via `searchParams.getAll()`-aware preprocessing in
  // a follow-up PR rather than relying on last-wins iteration here.
  const raw: Record<string, string | undefined> = {};
  for (const [key, value] of searchParams.entries()) {
    if (raw[key] !== undefined) continue; // first-wins
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
  handlerResult: unknown,
): NextResponse {
  // Unwrap envelope siblings first; `result` is then exactly what a handler
  // without siblings would have returned, so everything below is unchanged.
  let result: unknown = handlerResult;
  let siblings: Record<string, unknown> | undefined;
  if (isEnveloped(handlerResult)) {
    result = handlerResult.payload;
    siblings = parseEnvelope(contract, handlerResult.siblings);
  }

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
      ...siblings,
    });
  }

  // Non-paginated path: validate the whole payload, wrap once.
  const parsed = contract.response.safeParse(result);
  if (!parsed.success) {
    throw new ContractValidationError('response', parsed.error);
  }
  return NextResponse.json({ data: parsed.data, ...siblings });
}

/**
 * Top-level keys a sibling may never take: `data` would clobber the payload,
 * and `error` is the key clients read the failure envelope from on a non-ok
 * response — a 200 carrying one would be misread by any consumer that checks
 * `body.error` before `res.ok`.
 */
const RESERVED_SIBLINGS = ['data', 'error'] as const;

/**
 * Validate a handler's envelope siblings against the contract's `envelope`
 * schema and return the PARSED object (undeclared keys already stripped).
 * Refuses (as a response-contract violation → 500) when the contract declares
 * no envelope, when the parse fails or yields a non-object, or when a sibling
 * takes a reserved key (`data`, `error`).
 */
function parseEnvelope<C extends AnyRouteContract>(
  contract: C,
  siblings: unknown,
): Record<string, unknown> {
  if (!contract.envelope) {
    throw new ContractValidationError(
      'response',
      makeStandaloneZodError('handler returned envelope siblings but the contract declares no envelope'),
      'Handler emitted envelope siblings the contract does not declare',
    );
  }
  const parsed = contract.envelope.safeParse(siblings);
  if (!parsed.success) {
    throw new ContractValidationError('response', parsed.error);
  }
  const value = parsed.data as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ContractValidationError(
      'response',
      makeStandaloneZodError('envelope schema must produce a plain object of sibling keys'),
    );
  }
  for (const reserved of RESERVED_SIBLINGS) {
    if (Object.prototype.hasOwnProperty.call(value, reserved)) {
      throw new ContractValidationError(
        'response',
        makeStandaloneZodError(`envelope sibling '${reserved}' is reserved`),
      );
    }
  }
  // An `undefined` member needs no stripping: `NextResponse.json` serialises
  // with `JSON.stringify`, which omits it — `{ data, warnings: undefined }`
  // is byte-identical to `{ data }` on the wire.
  return value as Record<string, unknown>;
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
// rendering path applies. Uses the static `ZodError` value-import at the top
// of this file — no runtime `require()`.
function makeStandaloneZodError(message: string): z.ZodError {
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
