import type { z } from 'zod';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/**
 * Optional permission metadata. The runner does NOT enforce this in the
 * foundation PR — it's metadata for future codegen / guards / docs. Caller
 * supplies resource + action as strings (typically narrowed to the project's
 * RBAC matrix at the call site).
 */
export interface RoutePermission {
  resource: string;
  action: string;
}

/**
 * Schema declarations for a route's request inputs. All three fields are
 * optional; the runner skips parsing for any input the contract doesn't
 * declare.
 */
export interface RouteRequestSchemas {
  params?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  body?: z.ZodTypeAny;
}

/**
 * Declares WHERE a route carries its tenant id (`communityId`) so the runner
 * can resolve it once and inject `communityId` into the handler input —
 * instead of every handler hand-calling `resolveEffectiveCommunityId` (Plan
 * B2). Resolution semantics are unchanged; the call is only relocated.
 *
 *   - `in: 'query'` → top-level reads (GET): `?communityId=…`
 *   - `in: 'body'`  → top-level mutations (POST/PATCH/PUT) carrying the id in
 *                     the JSON body
 *   - `in: 'path'`  → nested resources `/communities/[id]/…`; the validated
 *                     path segment is authoritative (no header cross-check),
 *                     matching how nested routes resolve tenancy today
 *
 * `field` defaults to `'communityId'` for `query`/`body` and `'id'` for
 * `path`. The field must exist in the matching request schema; the
 * `guard:tenant-scope` check enforces that.
 */
export interface RouteTenantScope {
  in: 'query' | 'body' | 'path';
  field?: string;
}

/**
 * A route contract. When `paginated: true`, `response` is the schema for one
 * ITEM in the list; the runner wraps the items in the canonical paginated
 * envelope. When `paginated: false` (the default), `response` is the schema
 * for the full payload (post `requestJson` unwrap).
 */
export interface RouteContract<
  TParams extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
  TQuery extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
  TBody extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
  TResponse extends z.ZodTypeAny = z.ZodTypeAny,
  TPaginated extends boolean = false,
  TScope extends RouteTenantScope | undefined = undefined,
> {
  method: HttpMethod;
  path: string;
  request: {
    params?: TParams;
    query?: TQuery;
    body?: TBody;
  };
  response: TResponse;
  paginated?: TPaginated;
  permission?: RoutePermission;
  /**
   * Optional (Plan B2). When set, the runner resolves `communityId` from the
   * declared location and injects it into the handler input. Defaults to
   * `undefined` so existing contracts are byte-identical and their handler
   * input gains no `communityId` field.
   */
  tenantScope?: TScope;
}

/**
 * Identity function used purely for type inference. Mirrors the pattern used
 * by Zod's own `z.object(...)` / tRPC's `t.router(...)`: at runtime it just
 * returns the object, but the explicit generic parameters preserve the
 * literal types of each field so `Infer<typeof contract>` can read them.
 */
export function defineRoute<
  TParams extends z.ZodTypeAny | undefined = undefined,
  TQuery extends z.ZodTypeAny | undefined = undefined,
  TBody extends z.ZodTypeAny | undefined = undefined,
  TResponse extends z.ZodTypeAny = z.ZodTypeAny,
  TPaginated extends boolean = false,
  TScope extends RouteTenantScope | undefined = undefined,
>(
  contract: RouteContract<TParams, TQuery, TBody, TResponse, TPaginated, TScope>,
): RouteContract<TParams, TQuery, TBody, TResponse, TPaginated, TScope> {
  return contract;
}
