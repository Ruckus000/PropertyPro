/**
 * Re-export shim. The class now lives in `@propertypro/shared` so that
 * apps/web and apps/admin share one definition — a second copy would make
 * `instanceof AppError` silently false in one of them.
 *
 * This file is kept so the ~340 existing deep imports
 * (`@/lib/api/errors/ReauthRequiredError`) keep resolving unchanged.
 */
export { ReauthRequiredError } from '@propertypro/shared/http';
