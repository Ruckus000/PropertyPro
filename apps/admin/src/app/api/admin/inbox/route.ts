/**
 * Platform support inbox — thread list.
 *
 * GET /api/admin/inbox?mailbox=&status=
 */
import { NextResponse, type NextRequest } from 'next/server';

import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { getInboxThreads } from '@/lib/server/inbox';

export const GET = withAdminErrorHandler(async (request: NextRequest) => {
  await requirePlatformAdmin();

  const mailbox = request.nextUrl.searchParams.get('mailbox');
  const status = request.nextUrl.searchParams.get('status');

  // Unrecognised filter values are ignored rather than rejected: the query is a
  // view preference, and a stale bookmark should show the unfiltered inbox, not
  // a 400. An invalid value simply matches nothing at the database.
  const result = await getInboxThreads({ mailbox, status });

  return NextResponse.json(result);
});
