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
    const message = error instanceof Error ? error.message : 'Failed to load dashboard stats';
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
});
