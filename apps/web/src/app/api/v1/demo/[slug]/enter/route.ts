/**
 * Demo entry endpoint.
 *
 * Accepts a role selection (board or resident) from the demo landing page,
 * creates an authenticated Supabase session for the corresponding demo user,
 * and redirects to the appropriate portal.
 *
 * Handles both HTML form submissions (application/x-www-form-urlencoded)
 * and JSON bodies to support both the landing page forms and direct API calls.
 *
 * Security model: Slug knowledge grants access. This is by design — demo
 * links are meant to be shareable with prospects. The demo community contains
 * only synthetic seed data, and slugs include 6 random hex characters
 * (~16M combinations) on top of a sanitized prospect name, making blind
 * enumeration impractical. Rate limited at 30 req/min per IP by middleware.
 *
 * Token-authenticated (no session required) — listed in middleware allowlist
 * via the /api/v1/demo/.../enter startsWith match.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createDemoSession } from '@/lib/services/demo-session';
import { emitConversionEvent } from '@/lib/services/conversion-events';
import { getDemoInstanceForEntry } from '@/lib/services/demo-conversion';
import { withErrorHandler } from '@/lib/api/error-handler';
import { AppError, BadRequestError, NotFoundError } from '@/lib/api/errors';

const RoleSchema = z.object({
  role: z.enum(['board', 'resident']),
});

type RouteParams = { params: Promise<{ slug: string }> };

async function parseRole(request: Request): Promise<{ role: 'board' | 'resident' } | null> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await request.text();
    const params = new URLSearchParams(text);
    const result = RoleSchema.safeParse({ role: params.get('role') });
    return result.success ? result.data : null;
  }

  if (contentType.includes('application/json')) {
    try {
      const body = await request.json();
      const result = RoleSchema.safeParse(body);
      return result.success ? result.data : null;
    } catch (err) {
      console.warn('[demo/enter] malformed JSON body:', err instanceof Error ? err.message : err);
      return null;
    }
  }

  return null;
}

export const POST = withErrorHandler(async (request: NextRequest, context: RouteParams) => {
  const { slug } = await context.params;

  // 1. Parse and validate role from request body
  const parsed = await parseRole(request);
  if (!parsed) {
    throw new BadRequestError('Invalid request. Role must be "board" or "resident".');
  }
  const { role } = parsed;

  // 2. Look up demo instance by slug, joined with community
  const instance = await getDemoInstanceForEntry(slug);

  // 3. Validate instance exists, is a demo community, and has not expired
  if (!instance || !instance.isDemo) {
    throw new NotFoundError('Not found.');
  }

  if (instance.demoExpiresAt && new Date(instance.demoExpiresAt) < new Date()) {
    // HTML form POST — redirect to the landing page so the client sees the friendly expiry message
    const landing = new URL(`/demo/${slug}`, request.url);
    const response = NextResponse.redirect(landing, { status: 303 });
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Pragma', 'no-cache');
    return response;
  }

  const communityId = instance.seededCommunityId;
  if (!communityId) {
    throw new NotFoundError('Demo setup incomplete.');
  }

  // 4. Determine target email based on role
  const email = role === 'board' ? instance.demoBoardEmail : instance.demoResidentEmail;

  if (!email) {
    console.error(`[demo/enter] Missing email for role "${role}" on slug "${slug}"`);
    throw new AppError('Demo user not configured.', 500, 'INTERNAL_ERROR');
  }

  // 5. Create an authenticated session for the demo user
  const sessionResult = await createDemoSession(email);
  if (!sessionResult.ok) {
    console.error(`[demo/enter] Session creation failed for slug "${slug}":`, sessionResult.error);
    throw new AppError('Failed to create demo session.', 500, 'INTERNAL_ERROR');
  }

  // 6. Emit demo_entered conversion event (awaited best-effort)
  const targetUserId = role === 'board' ? instance.demoBoardUserId : instance.demoResidentUserId;
  const requestId = crypto.randomUUID();
  await emitConversionEvent({
    demoId: instance.id,
    communityId,
    eventType: 'demo_entered',
    source: 'web_app',
    dedupeKey: `demo:${instance.id}:entered:${targetUserId}:${requestId}`,
    userId: targetUserId,
    metadata: { role },
  });

  // 7. Redirect to the appropriate portal with session cookies
  const redirectPath =
    role === 'board'
      ? `/dashboard?communityId=${communityId}`
      : `/mobile?communityId=${communityId}`;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const redirectUrl = new URL(redirectPath, baseUrl).toString();

  const response = NextResponse.redirect(redirectUrl, { status: 303 });
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Pragma', 'no-cache');

  for (const cookie of sessionResult.cookies) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }

  return response;
});
