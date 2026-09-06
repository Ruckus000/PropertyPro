/**
 * Platform support inbox — triage state.
 *
 * PATCH /api/admin/inbox/[threadId]/status
 *
 * `spam` is a shelf, not a delete: the thread leaves the default list but stays
 * readable. A false positive on a statutory records request is not recoverable
 * from a deleted row, and §718 response clocks do not stop for a misfiling.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { SUPPORT_THREAD_STATUSES } from '@propertypro/shared';

import { assertNoDbError } from '@/lib/api/assert-no-db-error';
import { parseAdminBody } from '@/lib/api/parse-body';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { logAdminAction } from '@/lib/audit/log-admin-action';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { getThreadDetail } from '@/lib/server/inbox';

// Built from the shared constant, so a new status cannot be accepted here
// without also existing in the vocabulary and the database CHECK.
const statusSchema = z.object({ status: z.enum(SUPPORT_THREAD_STATUSES) });

interface RouteParams {
  params: Promise<{ threadId: string }>;
}

export const PATCH = withAdminErrorHandler(
  async (request: NextRequest, { params }: RouteParams) => {
    const admin = await requirePlatformAdmin();

    const { threadId: raw } = await params;
    const threadId = Number(raw);
    if (!Number.isInteger(threadId) || threadId <= 0) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid thread id' } },
        { status: 400 },
      );
    }

    const parsed = await parseAdminBody(request, statusSchema);
    if (parsed instanceof NextResponse) return parsed;

    const detail = await getThreadDetail(threadId);
    if (!detail) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Thread not found' } },
        { status: 404 },
      );
    }

    const previous = detail.thread.status;

    const db = createAdminTypedClient();
    const { error } = await db
      .from('support_inbox_threads')
      .update({ status: parsed.status, updated_at: new Date().toISOString() })
      .eq('id', threadId);
    assertNoDbError(error, 'Failed to update thread status');

    await logAdminAction({
      admin,
      action: 'support_thread_status_changed',
      resourceType: 'support_inbox_thread',
      resourceId: threadId,
      communityId: null,
      oldValues: { status: previous },
      newValues: { status: parsed.status },
      metadata: { mailbox: detail.thread.mailbox },
    });

    return NextResponse.json({ ok: true, status: parsed.status });
  },
);
