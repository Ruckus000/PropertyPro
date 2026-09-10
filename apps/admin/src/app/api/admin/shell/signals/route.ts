/**
 * GET /api/admin/shell/signals — polled by the console shell for nav badge
 * counts, the notification tray, and the critical-alert banner.
 *
 * This reads cross-tenant data through the service-role client (see
 * `getShellSignals`), so `requirePlatformAdmin()` MUST run before any data is
 * read — it is the only thing standing between an anonymous request and
 * every tenant's data.
 */
import { NextResponse } from 'next/server';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { getShellSignals } from '@/lib/server/shell-signals';

export const dynamic = 'force-dynamic';

export const GET = withAdminErrorHandler(async () => {
  await requirePlatformAdmin();
  const data = await getShellSignals();
  return NextResponse.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } });
});
