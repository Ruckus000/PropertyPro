import { AppError } from './AppError';

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
