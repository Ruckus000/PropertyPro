import { AppError } from './AppError';

/**
 * 403 Forbidden — authenticated but not authorized.
 */
export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}
