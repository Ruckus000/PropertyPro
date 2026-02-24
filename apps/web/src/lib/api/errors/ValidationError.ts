import { AppError } from './AppError';

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
