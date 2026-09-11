/**
 * POST /api/admin/preferences/read-all — move this operator's notification tray
 * read watermark to now.
 *
 * The instant is stamped SERVER-side (`markAllRead` defaults to `new Date()`)
 * and is not accepted from the body. A watermark supplied by the caller would
 * let a browser with a skewed clock — or a stale tab replaying an old value —
 * write a watermark that silently pre-reads future arrivals, and the tray has no
 * way to show that it happened.
 *
 * Self-scoped: the `userId` comes from `requirePlatformAdmin()`, never from the
 * request. Like the sibling route, no audit entry — see its docblock.
 */
import { NextResponse } from 'next/server';

import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { markAllRead } from '@/lib/server/preferences';

export const dynamic = 'force-dynamic';

export const POST = withAdminErrorHandler(async () => {
  const admin = await requirePlatformAdmin();
  const data = await markAllRead(admin.id);
  return NextResponse.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } });
});
