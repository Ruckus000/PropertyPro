import { AppError } from './AppError';

/**
 * 401 Unauthorized — missing or invalid authentication credentials.
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}
