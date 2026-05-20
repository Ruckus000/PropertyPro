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
>(
  contract: RouteContract<TParams, TQuery, TBody, TResponse, TPaginated>,
): RouteContract<TParams, TQuery, TBody, TResponse, TPaginated> {
  return contract;
}
