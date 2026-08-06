/**
 * Barrel for the HTTP error hierarchy.
 *
 * The classes themselves live in `@propertypro/shared` (see
 * `packages/shared/src/http/errors.ts`) so apps/web and apps/admin share a
 * single definition. This barrel and the sibling per-class shims exist purely
 * to keep every existing `@/lib/api/errors/...` import path working.
 */
export {
  AppError,
  BadRequestError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ReauthRequiredError,
  NotFoundError,
  UnprocessableEntityError,
  RateLimitError,
  DataIntegrityError,
  SignupEmailDeliveryError,
  ConflictError,
} from '@propertypro/shared/http';
