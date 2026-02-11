/**
 * Next.js middleware — runs on every matched request.
 *
 * Responsibilities:
 * 1. Refresh Supabase auth session without blocking rendering
 * 2. Attach X-Request-ID (UUID) header for request tracing [AGENTS #45]
 */
import { type NextRequest, NextResponse } from 'next/server';
import { createMiddlewareClient } from '@propertypro/db/supabase/middleware';

/**
 * NOTE: pnpm may resolve separate `next` virtual packages for the web app
 * and the db package (due to differing optional peers from @sentry/nextjs).
 * The NextRequest/NextResponse types are structurally identical at runtime,
 * but TypeScript sees them as distinct nominal types because of private
 * symbols like [INTERNALS]. We cast through `unknown` at the boundary.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  // Refresh Supabase session (reads + writes cookies)
  const { response } = await createMiddlewareClient(
    request as unknown as Parameters<typeof createMiddlewareClient>[0],
  );

  // AGENTS #45: Generate a UUID request ID for tracing
  response.headers.set('X-Request-ID', request.headers.get('x-request-id') || crypto.randomUUID());

  return response as unknown as NextResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon)
     * - Public assets (svg, png, jpg, jpeg, gif, webp, ico)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
