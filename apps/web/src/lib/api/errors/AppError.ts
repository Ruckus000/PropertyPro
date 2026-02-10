/**
 * Base application error class.
 *
 * All custom errors extend this class to provide structured JSON responses
 * with consistent error codes and HTTP status codes.
 *
 * AGENTS #43: Unknown errors must never expose stack traces or internal details.
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
