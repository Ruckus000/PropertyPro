/**
 * GET /api/admin/communities/[id]/billing — one community's billing detail.
 *
 * Feeds the workspace Billing tab: the subscription row, recent invoices, a
 * lifecycle timeline and the Stripe dashboard deep link.
 *
 * Deliberately does NOT use `resolveAndVerifyCommunity`. That helper filters out
 * soft-deleted communities and (by default) demos, and this is the one surface
 * that must render for them: a deleted community still carrying a live
 * subscription is a customer still being charged, and hiding it is how that stays
 * unnoticed. `getCommunityBilling` does its own primary-key lookup with the
 * reasoning recorded at the read.
 *
 * Not gated on Stripe mode — see `lib/server/billing.ts`. Only the five writes are.
 *
 * AUTHZ: requirePlatformAdmin() — super_admin only, enforced on the first line.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { getCommunityBilling } from '@/lib/server/billing';
import { parseCommunityIdParam } from '@/lib/api/parse-community-id';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const GET = withAdminErrorHandler(async (_request: NextRequest, context: RouteContext) => {
  await requirePlatformAdmin();

  const { id } = await context.params;
  const communityId = parseCommunityIdParam(id);
  if (communityId instanceof NextResponse) return communityId;

  return NextResponse.json({ data: await getCommunityBilling(communityId) });
});
