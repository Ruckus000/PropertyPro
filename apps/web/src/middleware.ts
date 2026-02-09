/**
 * Next.js middleware — runs on every matched request.
 *
 * Responsibilities:
 * 1. Refresh Supabase auth session without blocking rendering
 * 2. Attach X-Request-ID (UUID) header for request tracing [AGENTS #45]
 */
import { type NextRequest } from 'next/server';
import { createMiddlewareClient } from '@propertypro/db/supabase/middleware';

export async function middleware(request: NextRequest) {
  // Refresh Supabase session (reads + writes cookies)
  const { response } = await createMiddlewareClient(request);

  // AGENTS #45: Generate a UUID request ID for tracing
  response.headers.set('X-Request-ID', crypto.randomUUID());

  return response;
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
