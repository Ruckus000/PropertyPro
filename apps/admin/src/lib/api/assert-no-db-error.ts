/**
 * Turn a Supabase/PostgREST `{ error }` result into a thrown error, so that
 * `withAdminErrorHandler` renders the opaque 500 envelope.
 *
 * ## Why
 *
 * Admin routes used to do this, in 31 places:
 *
 * ```ts
 * const { data, error } = await db.from('access_plans').select('*');
 * if (error) {
 *   return NextResponse.json({ error: { message: error.message } }, { status: 500 });
 * }
 * ```
 *
 * That `return` happens INSIDE the wrapped handler, so `withAdminErrorHandler`
 * never sees it — the wrapper only governs what escapes as an exception. The
 * verbatim `error.message` is a PostgREST/Postgres/Storage/Stripe string
 * naming tables, columns and constraints, which is precisely what web's
 * `withErrorHandler` contract exists to keep out of responses.
 *
 * ## How this restores the contract
 *
 * It throws a plain `Error`, deliberately NOT an `AppError`. `AppError`
 * subclasses are treated as *intentional, client-facing* outcomes: the wrapper
 * echoes their message and does not report them to Sentry. A database failure
 * is neither. Throwing a plain `Error` routes it down the unknown-error branch,
 * which logs it, captures it to Sentry with request-id correlation, and returns
 * `{ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } }`.
 *
 * So the raw message is not lost — it moves from the response body to the place
 * that can act on it.
 *
 * Use `ForbiddenError`/`NotFoundError`/`ValidationError` from
 * `@propertypro/shared/http` for outcomes the caller is *meant* to see; use
 * this only for "the query failed".
 */

/** The subset of a Supabase error this needs. Structural, so PostgrestError, StorageError and friends all satisfy it. */
export interface DbErrorLike {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

/**
 * @param error   the `error` field of a Supabase result — `null` when the query succeeded
 * @param context what was being attempted, e.g. `'Failed to list access plans'`.
 *                Ends up in the server log and the Sentry title, so make it
 *                identify the call site without needing a stack trace.
 */
export function assertNoDbError(
  error: DbErrorLike | null | undefined,
  context: string,
): void {
  if (!error) return;

  const code = error.code ? ` (code ${error.code})` : '';
  throw new Error(`${context}: ${error.message}${code}`);
}
