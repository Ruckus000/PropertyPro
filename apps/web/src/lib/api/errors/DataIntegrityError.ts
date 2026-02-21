import { AppError } from './AppError';

/**
 * 500 Internal Server Error — persisted data violated domain invariants.
 */
export class DataIntegrityError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 500, 'DATA_INTEGRITY_ERROR', details);
    this.name = 'DataIntegrityError';
  }
}
