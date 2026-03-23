/**
 * GET /api/v1/admin/deletion-requests — List all deletion requests
 *
 * Query params:
 * - status (optional): 'cooling' | 'soft_deleted' | 'purged' | 'cancelled' | 'recovered'
 * - type   (optional): 'user' | 'community'
 *
 * Auth: platform admin (platform_admin_users row)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { eq, and } from '@propertypro/db/filters';
import { accountDeletionRequests } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requirePlatformAdmin } from '@/lib/api/require-platform-admin';
import { corsHeaders, handleOptions } from '@/lib/api/admin-cors';
import { ValidationError } from '@/lib/api/errors/ValidationError';

export { handleOptions as OPTIONS };

const VALID_STATUSES = new Set(['cooling', 'soft_deleted', 'purged', 'cancelled', 'recovered']);
const VALID_TYPES = new Set(['user', 'community']);

export const GET = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const adminUserId = await requirePlatformAdmin();
  void adminUserId;
  const origin = req.headers.get('origin');

  const url = new URL(req.url);
  const statusParam = url.searchParams.get('status');
  const typeParam = url.searchParams.get('type');

  if (statusParam && !VALID_STATUSES.has(statusParam)) {
    throw new ValidationError('Invalid status filter', {
      status: `Must be one of: ${[...VALID_STATUSES].join(', ')}`,
    });
  }

  if (typeParam && !VALID_TYPES.has(typeParam)) {
    throw new ValidationError('Invalid type filter', {
      type: 'Must be one of: user, community',
    });
  }

  const db = createUnscopedClient();
  const conditions = [];
  if (statusParam) conditions.push(eq(accountDeletionRequests.status, statusParam));
  if (typeParam) conditions.push(eq(accountDeletionRequests.requestType, typeParam));

  let rows;
  if (conditions.length === 0) {
    rows = await db.select().from(accountDeletionRequests);
  } else if (conditions.length === 1) {
    rows = await db.select().from(accountDeletionRequests).where(conditions[0]!);
  } else {
    rows = await db.select().from(accountDeletionRequests).where(and(...conditions));
  }

  return NextResponse.json({ data: rows }, { headers: corsHeaders(origin) });
});
