import { AppError } from './AppError';

/**
 * 503 Service Unavailable — transient signup verification email delivery failure.
 *
 * This is used when the signup flow cannot deliver the verification email due to
 * provider/configuration issues, but the request itself is otherwise valid and
 * may succeed on retry.
 */
export class SignupEmailDeliveryError extends AppError {
  constructor(
    message = 'We could not send your verification email right now. Please try again.',
    details?: Record<string, unknown>,
  ) {
    super(message, 503, 'SIGNUP_EMAIL_DELIVERY_FAILED', details);
    this.name = 'SignupEmailDeliveryError';
  }
}
