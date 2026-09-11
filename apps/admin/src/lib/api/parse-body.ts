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
 *
 * ## Why a non-empty body must declare `application/json`
 *
 * This used to parse any body at all, which made the five money-moving routes
 * (`/api/admin/communities/[id]/billing/*`) reachable by a cross-site
 * `<form enctype="text/plain">` — no preflight, cookies attached, `{"confirm":
 * true, …}` smuggled into the field name.
 *
 * There is no exploit today, and the reason is worth stating because it is the
 * reason this check exists anyway: `@supabase/ssr`'s `DEFAULT_COOKIE_OPTIONS`
 * sets `sameSite: 'lax'`, which blocks the session cookie on any cross-site
 * POST. That is the correct control — and it is INHERITED, not asserted. Nothing
 * in this repo chose it; a dependency bump that changed the default, or a
 * `cookieOptions` edit setting `sameSite: 'none'` for some legitimate reason,
 * would silently turn five money endpoints into CSRF targets with nothing
 * failing. (`cookie-config.ts` now states `sameSite` explicitly and a test pins
 * it, which closes the same gap from the other end.)
 *
 * Requiring `application/json` makes the vector structurally impossible
 * regardless of the cookie attribute — two independent controls for one hazard,
 * which is what "defence in depth" means when neither is individually load-
 * bearing enough to bet five money routes on.
 *
 * An ALLOWLIST, not a denylist of the three CORS-safelisted form types, and the
 * difference is not pedantry: a `fetch` with a typeless `Blob` body sends NO
 * `Content-Type` header at all and would walk straight through a denylist.
 * `application/json` cannot be set cross-site without a preflight, and this app
 * answers no `Access-Control-Allow-*`, so requiring it closes the whole shape.
 */
export async function parseJsonBody(request: Request): Promise<unknown | NextResponse> {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return validationError('Could not read the request body.');
  }

  // Checked AFTER the empty-body short-circuit below would apply, but stated
  // here so the empty case is genuinely exempt: a bodyless DELETE sends no
  // content type, and refusing it would break every one of them.
  if (raw.trim() === '') return {};

  // `application/json`, optionally with parameters (`; charset=utf-8`), and
  // nothing else. Suffixed types (`application/merge-patch+json`) are not used
  // by anything here and are not admitted on a guess.
  const mediaType = (request.headers.get('content-type') ?? '')
    .toLowerCase()
    .split(';')[0]!
    .trim();
  if (mediaType !== 'application/json') {
    return validationError('Request body must be sent as application/json.', {
      contentType: mediaType || '(none)',
    });
  }

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
