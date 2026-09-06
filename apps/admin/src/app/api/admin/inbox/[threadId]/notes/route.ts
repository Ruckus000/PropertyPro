/**
 * Platform support inbox — internal notes.
 *
 * POST /api/admin/inbox/[threadId]/notes
 *
 * A note shares `support_inbox_messages` with real emails so the thread
 * timeline is one index scan rather than a re-sorted UNION. What makes that
 * safe is not this handler but the database: `support_inbox_messages_kind_shape_check`
 * denies a `kind='note'` row any `from_email`, `to_emails` or `rfc_message_id`,
 * so a note is structurally unaddressable and cannot be emailed to anyone.
 *
 * Deliberately NOT audited via logAdminAction: the row already carries
 * `author_user_id` and `created_at`, so it is self-auditing, and a second write
 * would duplicate the record for no recall benefit.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

import { createAdminTypedClient } from '@propertypro/db/supabase/admin';

import { assertNoDbError } from '@/lib/api/assert-no-db-error';
import { parseAdminBody } from '@/lib/api/parse-body';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { getThreadDetail } from '@/lib/server/inbox';

const noteSchema = z.object({ body: z.string().trim().min(1).max(10_000) });

interface RouteParams {
  params: Promise<{ threadId: string }>;
}

export const POST = withAdminErrorHandler(
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

    const parsed = await parseAdminBody(request, noteSchema);
    if (parsed instanceof NextResponse) return parsed;

    const detail = await getThreadDetail(threadId);
    if (!detail) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Thread not found' } },
        { status: 404 },
      );
    }

    const db = createAdminTypedClient();
    const { error } = await db.from('support_inbox_messages').insert({
      thread_id: threadId,
      kind: 'note',
      direction: 'internal',
      // A note is never a duplicate of anything, so the fence just needs to be
      // unique; a random component is the honest way to say that.
      dedupe_key: createHash('sha256').update(`note\n${threadId}\n${randomUUID()}`).digest('hex'),
      rfc_message_id: null,
      in_reply_to: null,
      references_ids: null,
      delivered_to: null,
      from_email: null,
      from_name: null,
      to_emails: null,
      cc_emails: null,
      subject: null,
      text_body: parsed.body,
      html_body: null,
      sent_at: null,
      provider_message_id: null,
      author_user_id: admin.id,
    });
    assertNoDbError(error, 'Failed to add note');

    return NextResponse.json({ ok: true });
  },
);
