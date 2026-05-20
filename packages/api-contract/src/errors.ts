import type { ZodError, z } from 'zod';

/**
 * Source of a contract validation failure. Determines the user-facing message
 * and (in `withErrorHandler`) the HTTP status code:
 *   - `params` / `query` / `body` → 400 (caller's fault)
 *   - `response` → 500 (server returned an envelope-drifted payload; this is
 *     the "envelope drift" canary)
 */
export type ContractViolationSource = 'params' | 'query' | 'body' | 'response';

/**
 * Single field-level error formatted from a Zod issue. Shape mirrors the
 * project's existing `formatZodErrors` output so the app-side error renderer
 * can pass it through unchanged.
 */
export interface ContractFieldError {
  field: string;
  message: string;
}

/**
 * Thrown by `runRoute()` when input or output validation fails. The
 * app-level `withErrorHandler` recognizes this via `isContractValidationError`
 * and renders the canonical 400/500 envelope.
 *
 * This package deliberately does NOT depend on `apps/web` — that's why we
 * define a sentinel error here rather than throwing the app's `ValidationError`
 * directly. Keep the shape minimal so it's easy to handle.
 */
export class ContractValidationError extends Error {
  readonly name = 'ContractValidationError';
  readonly source: ContractViolationSource;
  readonly fields: ContractFieldError[];
  readonly zodError: ZodError;

  constructor(source: ContractViolationSource, zodError: ZodError, message?: string) {
    super(message ?? defaultMessage(source));
    this.source = source;
    this.zodError = zodError;
    this.fields = zodErrorToFields(zodError);
  }
}

/**
 * Type guard used by `withErrorHandler` to recognize a contract violation
 * without taking a direct dependency on this package's class identity
 * (which can fail across realm boundaries in some test setups).
 */
export function isContractValidationError(err: unknown): err is ContractValidationError {
  return (
    err instanceof Error &&
    (err as { name?: unknown }).name === 'ContractValidationError' &&
    typeof (err as { source?: unknown }).source === 'string' &&
    Array.isArray((err as { fields?: unknown }).fields)
  );
}

function defaultMessage(source: ContractViolationSource): string {
  switch (source) {
    case 'params':
      return 'Invalid path parameters';
    case 'query':
      return 'Invalid query parameters';
    case 'body':
      return 'Invalid request body';
    case 'response':
      return 'Response payload failed contract validation';
  }
}

/**
 * Convert a Zod error to the `{ field, message }[]` shape the app's
 * `ValidationError` already uses. Mirrors the conventions in
 * `apps/web/src/lib/api/zod/error-formatter.ts`.
 */
function zodErrorToFields(error: ZodError): ContractFieldError[] {
  // zod v4 exposes issues via `error.issues`.
  const issues: ReadonlyArray<z.core.$ZodIssue> = error.issues;
  return issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join('.') : '_root',
    message: issue.message,
  }));
}
