/**
 * Higher-order function that wraps admin Route Handlers with structured error
 * handling — the apps/admin counterpart of apps/web's `withErrorHandler`.
 *
 * Why this exists rather than importing web's copy: the error *classes* are
 * shared (`@propertypro/shared`), but the handler itself needs `next/server`
 * and `@sentry/nextjs`, neither of which `@propertypro/shared` depends on.
 * Adding both to a zod-only package to share ~60 lines costs more than this
 * deliberate, documented duplication. The contract it implements is identical:
 *
 * - Known `AppError` subclasses → structured JSON with the correct status code
 * - Unknown errors            → 500 `INTERNAL_ERROR`, never a stack trace or a
 *                               raw Postgres/Stripe/Storage message
 * - `X-Request-ID` propagated on every error response
 * - Unknown errors reported to Sentry with request_id correlation
 *
 * apps/admin differs from apps/web in one way: it does not use
 * `@propertypro/api-contract`, so there is no contract-validation branch.
 */
import { NextResponse, type NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { AppError, extractSentryRequestContext } from '@propertypro/shared/http';

/**
 * Wrap an admin Route Handler with structured error handling.
 *
 * The generic rest-parameter preserves each handler's own context type, so
 * `(request, { params }: RouteParams)` keeps its typing through the wrapper.
 *
 * @example
 * ```ts
 * export const GET = withAdminErrorHandler(async (request) => {
 *   await requirePlatformAdmin();
 *   return NextResponse.json({ data });
 * });
 * ```
 */
export function withAdminErrorHandler<TArgs extends unknown[]>(
  handler: (request: NextRequest, ...args: TArgs) => Promise<Response>,
): (request: NextRequest, ...args: TArgs) => Promise<Response> {
  return async (request, ...args) => {
    try {
      return await handler(request, ...args);
    } catch (error) {
      // `request` is always supplied by Next, but a few handlers are declared
      // with no parameters at all; guard so the error path can never itself throw.
      const sentryContext = extractSentryRequestContext(
        request?.headers ?? new Headers(),
      );
      const requestId = sentryContext.requestId;

      if (error instanceof AppError) {
        return NextResponse.json(error.toJSON(), {
          status: error.statusCode,
          headers: { 'X-Request-ID': requestId },
        });
      }

      // Unknown error — 500, nothing internal exposed [AGENTS #43].
      console.error('Unhandled admin error:', error);

      // NOTE: no `app` tag here — sentry.server.config.ts / sentry.edge.config.ts
      // set it via `initialScope`, so it lands on EVERY admin event including the
      // ones this handler never sees (error boundaries, direct captureException
      // calls). Setting it again here would just be duplication.
      Sentry.withScope((scope) => {
        scope.setTag('request_id', requestId);
        if (sentryContext.communityId) {
          scope.setTag('community_id', sentryContext.communityId);
        }
        if (sentryContext.userId) {
          scope.setUser({ id: sentryContext.userId });
        }
        Sentry.captureException(error);
      });

      return NextResponse.json(
        {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred',
          },
        },
        { status: 500, headers: { 'X-Request-ID': requestId } },
      );
    }
  };
}
