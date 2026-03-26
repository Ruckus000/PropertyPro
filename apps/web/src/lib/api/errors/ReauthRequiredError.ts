import { AppError } from './AppError';

/**
 * 403 — authentication is valid but a fresh re-authentication is required
 * for this sensitive action. Client should prompt the user to re-enter
 * their password and retry.
 */
export class ReauthRequiredError extends AppError {
  constructor(message = 'Please verify your identity to continue') {
    super(message, 403, 'REAUTH_REQUIRED');
    this.name = 'ReauthRequiredError';
  }
}
