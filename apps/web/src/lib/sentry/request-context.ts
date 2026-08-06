/**
 * Re-export shim. The implementation now lives in `@propertypro/shared`
 * (`packages/shared/src/http/request-context.ts`) so that apps/admin's error
 * handler tags Sentry events with the same correlation fields as apps/web.
 *
 * Kept so existing `@/lib/sentry/request-context` imports resolve unchanged.
 */
export {
  extractSentryRequestContext,
  type SentryRequestContext,
} from '@propertypro/shared/http';
