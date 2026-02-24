import { AppError } from './AppError';

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
