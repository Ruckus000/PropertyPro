/**
 * Platform support inbox — one thread with its messages.
 *
 * GET /api/admin/inbox/[threadId]
 */
import { NextResponse, type NextRequest } from 'next/server';

import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { getThreadDetail } from '@/lib/server/inbox';

interface RouteParams {
  params: Promise<{ threadId: string }>;
}

export const GET = withAdminErrorHandler(
  async (_request: NextRequest, { params }: RouteParams) => {
    await requirePlatformAdmin();

    const { threadId: raw } = await params;
    const threadId = Number(raw);
    if (!Number.isInteger(threadId) || threadId <= 0) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid thread id' } },
        { status: 400 },
      );
    }

    const detail = await getThreadDetail(threadId);
    if (!detail) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Thread not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json(detail);
  },
);
