/**
 * Platform stats aggregation API for the admin dashboard.
 *
 * GET /api/admin/stats — returns platform-wide metrics
 */
import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { getPlatformDashboardStats } from '@/lib/server/dashboard';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';

export const GET = withAdminErrorHandler(async () => {
  await requirePlatformAdmin();

  try {
    const stats = await getPlatformDashboardStats();
    return NextResponse.json(stats);
  } catch (error) {
    // Rethrow — the wrapper renders the opaque 500 and reports to Sentry.
    throw error;
  }
});
