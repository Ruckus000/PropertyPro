/**
 * Structured HTTP error classes shared by every app's route layer.
 *
 * These live here — rather than in `apps/web` where they started — because
 * `apps/admin` needs the identical hierarchy and duplicating it is what let the
 * two apps' error contracts drift apart in the first place. The module has no
 * dependencies (no Next, no Sentry, no zod), so it costs `@propertypro/shared`
 * nothing to host it.
 *
 * There must only ever be ONE definition of these classes per app build: the
 * handlers branch on `error instanceof AppError`, and a second copy would make
 * that check silently false. `apps/web/src/lib/api/errors/*` are therefore
 * re-export shims, not copies.
 *
 * AGENTS #43: Unknown errors must never expose stack traces or internal details.
 */

/**
 * Base application error class.
 *
 * All custom errors extend this class to provide structured JSON responses
 * with consistent error codes and HTTP status codes.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }

  /**
   * Serialize to a structured JSON response body.
   * Only includes `details` when present.
   */
  toJSON(): { error: { code: string; message: string; details?: Record<string, unknown> } } {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

/**
 * 400 Bad Request — malformed or structurally invalid request (e.g. missing
 * required query parameters, non-parseable IDs).
 *
 * Use UnprocessableEntityError (422) for semantically invalid but structurally valid
 * payloads (e.g. Zod field failures on a well-formed JSON body).
 */
export class BadRequestError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, 'BAD_REQUEST', details);
    this.name = 'BadRequestError';
  }
}

/**
 * 400 Bad Request — invalid input data.
 *
 * Use UnprocessableEntityError (422) for semantically invalid but structurally valid
 * payloads (e.g. Zod field failures on a well-formed JSON body with fields present).
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

/**
 * 401 Unauthorized — missing or invalid authentication credentials.
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

/**
 * 403 Forbidden — authenticated but not authorized.
 *
 * `code`/`details` default to a generic FORBIDDEN, but callers may pass a more
 * specific machine-readable code (and structured details) so the client can
 * branch on the *reason* for the 403 — e.g. `ADMIN_LIMIT_REACHED` with the
 * plan's `maxAdmins` — without string-matching the human message.
 */
export class ForbiddenError extends AppError {
  constructor(
    message = 'You do not have permission to perform this action',
    code = 'FORBIDDEN',
    details?: Record<string, unknown>,
  ) {
    super(message, 403, code, details);
    this.name = 'ForbiddenError';
  }
}

/**
 * 403 — authentication is valid but a fresh re-authentication is required
 * for this sensitive action. Client should prompt the user to re-enter
 * their password and retry.
 */
export class ReauthRequiredError extends AppError {
  constructor(message = 'Please verify your identity to continue') {
    super(message, 403, 'REAUTH_REQUIRED');
    this.name = 'ReauthRequiredError';
  }
}

/**
 * 404 Not Found — requested resource does not exist.
 */
export class NotFoundError extends AppError {
  constructor(message = 'The requested resource was not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

/**
 * 409 Conflict — the request conflicts with the current state of the resource.
 * Used for duplicate submissions, eligibility guard violations, etc.
 */
export class ConflictError extends AppError {
  constructor(message = 'Request conflicts with current state', details?: Record<string, unknown>) {
    super(message, 409, 'CONFLICT', details);
    this.name = 'ConflictError';
  }
}

/**
 * 422 Unprocessable Entity — syntactically valid request but semantically invalid payload.
 */
export class UnprocessableEntityError extends AppError {
  constructor(
    message = 'Request payload is semantically invalid',
    details?: Record<string, unknown>,
  ) {
    super(message, 422, 'UNPROCESSABLE_ENTITY', details);
    this.name = 'UnprocessableEntityError';
  }
}

/**
 * 429 Too Many Requests — rate limit exceeded.
 */
export class RateLimitError extends AppError {
  constructor(message = 'Too many requests. Please try again later.') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.name = 'RateLimitError';
  }
}

/**
 * 500 Internal Server Error — persisted data violated domain invariants.
 */
export class DataIntegrityError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 500, 'DATA_INTEGRITY_ERROR', details);
    this.name = 'DataIntegrityError';
  }
}

/**
 * 503 Service Unavailable — transient signup verification email delivery failure.
 *
 * This is used when the signup flow cannot deliver the verification email due to
 * provider/configuration issues, but the request itself is otherwise valid and
 * may succeed on retry.
 */
export class SignupEmailDeliveryError extends AppError {
  constructor(
    message = 'We could not send your verification email right now. Please try again.',
    details?: Record<string, unknown>,
  ) {
    super(message, 503, 'SIGNUP_EMAIL_DELIVERY_FAILED', details);
    this.name = 'SignupEmailDeliveryError';
  }
}
