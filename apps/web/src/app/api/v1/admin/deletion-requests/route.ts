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
import { withErrorHandler } from '@/lib/api/error-handler';
import { requirePlatformAdmin } from '@/lib/api/require-platform-admin';
import { corsHeaders, handleOptions } from '@/lib/api/admin-cors';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import {
  listDeletionRequests,
  type DeletionRequestStatus,
  type DeletionRequestType,
} from '@/lib/services/account-lifecycle-service';

export { handleOptions as OPTIONS };

const VALID_STATUSES = new Set<DeletionRequestStatus>([
  'cooling',
  'soft_deleted',
  'purged',
  'cancelled',
  'recovered',
]);
const VALID_TYPES = new Set<DeletionRequestType>(['user', 'community']);

export const GET = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const adminUserId = await requirePlatformAdmin();
  void adminUserId;
  const origin = req.headers.get('origin');

  const url = new URL(req.url);
  const statusParam = url.searchParams.get('status');
  const typeParam = url.searchParams.get('type');

  if (statusParam && !VALID_STATUSES.has(statusParam as DeletionRequestStatus)) {
    throw new ValidationError('Invalid status filter', {
      status: `Must be one of: ${[...VALID_STATUSES].join(', ')}`,
    });
  }

  if (typeParam && !VALID_TYPES.has(typeParam as DeletionRequestType)) {
    throw new ValidationError('Invalid type filter', {
      type: 'Must be one of: user, community',
    });
  }

  const rows = await listDeletionRequests({
    status: statusParam ? (statusParam as DeletionRequestStatus) : undefined,
    requestType: typeParam ? (typeParam as DeletionRequestType) : undefined,
  });

  return NextResponse.json({ data: rows }, { headers: corsHeaders(origin) });
});
