import { AppError } from './AppError';

/**
 * 422 Unprocessable Entity — syntactically valid request but semantically invalid payload.
 */
export class UnprocessableEntityError extends AppError {
  constructor(message = 'Request payload is semantically invalid', details?: Record<string, unknown>) {
    super(message, 422, 'UNPROCESSABLE_ENTITY', details);
    this.name = 'UnprocessableEntityError';
  }
}
