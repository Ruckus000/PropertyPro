import { AppError } from './AppError';

/**
 * 404 Not Found — requested resource does not exist.
 */
export class NotFoundError extends AppError {
  constructor(message = 'The requested resource was not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}
