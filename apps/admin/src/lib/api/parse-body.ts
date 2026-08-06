/**
 * Request-body parsing for admin routes.
 *
 * Two problems this fixes, both of which were spread across ~20 route files:
 *
 * 1. **Unguarded `await request.json()`.** A malformed body — or NO body, which
 *    several of these endpoints are legitimately called with — throws a
 *    `SyntaxError`. `withAdminErrorHandler` does not special-case it, so the
 *    caller got a 500 and a Sentry event for what is plainly a 400.
 * 2. **Hand-rolled validation.** Routes variously used truthiness checks,
 *    `Number.isInteger(Number(x))` (which accepts `0` and negatives), or a
 *    `safeParse` block copy-pasted with slightly different error shapes.
 *
 * Both helpers return a `NextResponse` on failure rather than throwing, keeping
 * the existing early-return style of these routes:
 *
 *     const parsed = await parseAdminBody(request, schema);
 *     if (parsed instanceof NextResponse) return parsed;
 *     // parsed is fully typed here
 */
import { NextResponse } from 'next/server';
import type { z } from 'zod';

function validationError(message: string, details?: Record<string, unknown>): NextResponse {
  return NextResponse.json(
    { error: { code: 'VALIDATION_ERROR', message, ...(details && { details }) } },
    { status: 400 },
  );
}

/**
 * Read and JSON-parse a request body without letting a malformed payload
 * become a 500.
 *
 * An EMPTY body resolves to `{}` rather than an error: several admin endpoints
 * (e.g. deletion-request intervene) take an entirely optional body, and their
 * clients legitimately send none. Schemas whose fields are all optional accept
 * `{}`; schemas with required fields still reject it, which is the correct
 * outcome either way.
 */
export async function parseJsonBody(request: Request): Promise<unknown | NextResponse> {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return validationError('Could not read the request body.');
  }

  if (raw.trim() === '') return {};

  try {
    return JSON.parse(raw);
  } catch {
    return validationError('Request body is not valid JSON.');
  }
}

/**
 * Parse and validate a request body against a Zod schema.
 *
 * Returns the parsed value, or a 400 `NextResponse` for malformed JSON or a
 * schema failure.
 */
export async function parseAdminBody<TSchema extends z.ZodTypeAny>(
  request: Request,
  schema: TSchema,
): Promise<z.infer<TSchema> | NextResponse> {
  const body = await parseJsonBody(request);
  if (body instanceof NextResponse) return body;

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return validationError(issue?.message ?? 'Invalid input', {
      fields: parsed.error.issues.map((i) => ({
        field: i.path.join('.') || '(root)',
        message: i.message,
      })),
    });
  }

  return parsed.data;
}

/**
 * Validate a query-string value against a schema, returning a 400 rather than
 * letting an unvalidated string reach a `.eq()` filter.
 */
export function parseAdminQuery<TSchema extends z.ZodTypeAny>(
  value: unknown,
  schema: TSchema,
  fieldName: string,
): z.infer<TSchema> | NextResponse {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return validationError(
      `Invalid \`${fieldName}\`: ${parsed.error.issues[0]?.message ?? 'not allowed'}`,
    );
  }
  return parsed.data;
}
