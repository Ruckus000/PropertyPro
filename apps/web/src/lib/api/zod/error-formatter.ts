/**
 * Zod error formatter — converts ZodError to human-readable field messages.
 *
 * Handles:
 * - Simple field errors: { field: "email", message: "..." }
 * - Nested fields with dot notation: { field: "address.zipCode", message: "..." }
 * - Array fields: { field: "items.0.name", message: "..." }
 */
import type { ZodError, ZodIssue } from 'zod';

export interface FieldError {
  field: string;
  message: string;
}

/**
 * Convert a ZodError into a flat array of user-friendly field errors.
 *
 * @example
 * ```ts
 * const result = schema.safeParse(body);
 * if (!result.success) {
 *   const errors = formatZodErrors(result.error);
 *   throw new ValidationError('Validation failed', { fields: errors });
 * }
 * ```
 */
export function formatZodErrors(error: ZodError): FieldError[] {
  return error.issues.map(issueToFieldError);
}

function issueToFieldError(issue: ZodIssue): FieldError {
  const field = issue.path.join('.');
  return {
    field: field || '_root',
    message: issue.message,
  };
}
