/**
 * GET /api/admin/onboarding — the pipeline as JSON.
 *
 * The Onboarding page does not need this: it is a Server Component and calls
 * `getPipeline()` directly. This exists for a client-side refresh and for an
 * operator who wants the rows themselves rather than reading them off tiles.
 *
 * `?community=` focuses the returned checklist on one trial, exactly as the page
 * does — same parser, same fallback.
 *
 * Why the gate is not optional: the body names every open lead, every
 * unconverted demo prospect and every trialing community on the platform. That
 * is the whole commercial pipeline, so it is `super_admin` only.
 *
 * AUTHZ: requirePlatformAdmin() — super_admin only.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { getPipeline } from '@/lib/server/onboarding';

export const dynamic = 'force-dynamic';

/** Anything that is not a positive integer is dropped, not passed through. */
function parseCommunityParam(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export const GET = withAdminErrorHandler(async (request: NextRequest) => {
  await requirePlatformAdmin();

  const community = parseCommunityParam(new URL(request.url).searchParams.get('community'));

  return NextResponse.json({ data: await getPipeline(community) });
});
