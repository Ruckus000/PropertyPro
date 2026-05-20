import type { z } from 'zod';
import type { RouteContract } from './define-route';
import type { PaginationResult } from './pagination';

/**
 * Infer the client-side response payload for a contract — the shape the
 * caller sees AFTER `requestJson` strips the outer `data` envelope.
 *
 * - Paginated contracts resolve to `{ data: Item[]; pagination }`.
 * - Non-paginated contracts resolve to `z.infer<contract.response>`.
 *
 * @example
 * ```ts
 * type Categories = Infer<typeof documentCategoriesListContract>;
 * //   ^? { data: { id: number; name: string }[]; pagination: PaginationResult }
 * ```
 */
export type Infer<C> =
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

/** Infer the request `query` type from a contract. */
export type InferQuery<C> =
  C extends RouteContract<
    z.ZodTypeAny | undefined,
    infer TQuery,
    z.ZodTypeAny | undefined,
    z.ZodTypeAny,
    boolean
  >
    ? TQuery extends z.ZodTypeAny
      ? z.infer<TQuery>
      : undefined
    : never;

/** Infer the request `body` type from a contract. */
export type InferBody<C> =
  C extends RouteContract<
    z.ZodTypeAny | undefined,
    z.ZodTypeAny | undefined,
    infer TBody,
    z.ZodTypeAny,
    boolean
  >
    ? TBody extends z.ZodTypeAny
      ? z.infer<TBody>
      : undefined
    : never;

/** Infer the request `params` type from a contract. */
export type InferParams<C> =
  C extends RouteContract<
    infer TParams,
    z.ZodTypeAny | undefined,
    z.ZodTypeAny | undefined,
    z.ZodTypeAny,
    boolean
  >
    ? TParams extends z.ZodTypeAny
      ? z.infer<TParams>
      : undefined
    : never;
