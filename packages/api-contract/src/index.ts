/**
 * `@propertypro/api-contract` — typed route contracts for `/api/v1/*`.
 *
 * Public surface (Plan A1 foundation PR):
 *   - `defineRoute(contract)`   — identity helper that preserves literal types
 *   - `runRoute(contract, fn)`  — wraps a handler with request/response
 *                                  validation and canonical envelope wrapping
 *   - `Infer<typeof contract>`  — client-side response type, post `requestJson`
 *                                  unwrap (paginated vs non-paginated handled)
 *   - `ContractValidationError` + `isContractValidationError` — for the app's
 *                                  `withErrorHandler` to recognize runner
 *                                  failures and render the canonical 400 / 500
 *
 * Re-exports `z` from `zod` so consumers don't need a direct zod import.
 *
 * Out of scope for this PR (follow-ups):
 *   - OpenAPI codegen
 *   - `pnpm guard:contracts` CI check
 *   - Auto-injected auth / RBAC / audit-log
 *   - Migration of routes beyond the single document-categories pilot
 */
export { z } from 'zod';

export type {
  HttpMethod,
  RouteContract,
  RoutePermission,
  RouteRequestSchemas,
} from './define-route';
export { defineRoute } from './define-route';

export type { PaginationResult } from './pagination';

export type {
  Infer,
  InferBody,
  InferParams,
  InferQuery,
} from './infer';

export type {
  ContractFieldError,
  ContractViolationSource,
} from './errors';
export { ContractValidationError, isContractValidationError } from './errors';

export type {
  RouteHandlerInput,
  RouteHandlerOutput,
  RouteHandlerFn,
  WrappedRouteHandler,
  NextRouteContext,
} from './run-route';
export { runRoute } from './run-route';
