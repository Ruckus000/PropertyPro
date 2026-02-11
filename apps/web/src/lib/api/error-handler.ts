/**
 * Higher-order function that wraps Next.js Route Handlers with
 * structured error handling.
 *
 * AGENTS #43: Every API Route Handler must use withErrorHandler.
 * - Known AppError subclasses → structured JSON with correct status code
 * - Unknown errors → 500 with INTERNAL_ERROR (no stack trace exposed)
 * - X-Request-ID header propagated on every error response
 * - Unknown errors are reported to Sentry with request_id correlation
 */
import { NextResponse, type NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { AppError } from './errors/AppError';
import { extractSentryRequestContext } from '../sentry/request-context';

type RouteHandler = (
  req: NextRequest,
  context?: { params: Promise<Record<string, string>> },
) => Promise<NextResponse>;

/**
 * Wrap a Route Handler with structured error handling.
 *
 * @example
 * ```ts
 * export const GET = withErrorHandler(async (req) => {
 *   // ... handler logic
 *   return NextResponse.json({ data });
 * });
 * ```
 */
export function withErrorHandler(handler: RouteHandler): RouteHandler {
  return async (req, context) => {
    try {
      const response = await handler(req, context);
      return response;
    } catch (error) {
      const sentryContext = extractSentryRequestContext(req.headers);
      const requestId = sentryContext.requestId;

      if (error instanceof AppError) {
        return NextResponse.json(error.toJSON(), {
          status: error.statusCode,
          headers: { 'X-Request-ID': requestId },
        });
      }

      // Unknown error — 500, no stack trace exposed [AGENTS #43]
      console.error('Unhandled error:', error);

      // Report to Sentry with request_id for correlation
      Sentry.withScope((scope) => {
        scope.setTag('request_id', sentryContext.requestId);
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
        {
          status: 500,
          headers: { 'X-Request-ID': requestId },
        },
      );
    }
  };
}
