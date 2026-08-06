/**
 * Deletion Requests API for the admin console.
 *
 * GET /api/admin/deletion-requests — list all deletion requests
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { getDeletionRequestsData } from '@/lib/server/deletion-requests';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { parseAdminQuery } from '@/lib/api/parse-body';

// Both filters were previously passed straight from the query string into a
// PostgREST `.eq()` with only an `as` cast. Enum-check them so an unexpected
// value is a 400 rather than a silent empty result or a DB-level error.
const statusFilter = z
  .enum(['all', 'cooling', 'soft_deleted', 'purged', 'cancelled', 'recovered'])
  .nullish();
const typeFilter = z.enum(['all', 'user', 'community']).nullish();

export const GET = withAdminErrorHandler(async (request: NextRequest) => {
  await requirePlatformAdmin();

  const status = parseAdminQuery(
    request.nextUrl.searchParams.get('status'),
    statusFilter,
    'status',
  );
  if (status instanceof NextResponse) return status;

  const type = parseAdminQuery(request.nextUrl.searchParams.get('type'), typeFilter, 'type');
  if (type instanceof NextResponse) return type;

  try {
    const data = await getDeletionRequestsData({ status, type });
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load deletion requests';
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
});
