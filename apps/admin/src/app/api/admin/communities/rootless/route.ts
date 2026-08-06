/**
 * Rootless-communities report API for the admin platform.
 *
 * GET /api/admin/communities/rootless — list non-deleted communities that
 * have NO root_manager role row. Until the claim-root flow (role-v3 Phase 2b)
 * runs, every backfilled community is rootless; this report tracks convergence.
 */
import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
// AUTHZ: platform-admin report — cross-community read, gated by the requirePlatformAdmin() session check immediately below before any data read.
import { findRootlessCommunities } from '@propertypro/db/unsafe';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';

export const dynamic = 'force-dynamic';

export const GET = withAdminErrorHandler(async () => {
  await requirePlatformAdmin();

  const communities = await findRootlessCommunities();

  return NextResponse.json({ communities });
});
