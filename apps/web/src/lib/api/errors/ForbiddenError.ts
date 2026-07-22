import { AppError } from './AppError';

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
