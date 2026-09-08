/**
 * Platform support inbox — destroy a conversation.
 *
 * DELETE /api/admin/inbox/[threadId]
 *
 * This is the only erasure path for third-party email in the product, and it
 * exists because the privacy policy already promises one: §5.2 says a person
 * may request deletion of their personal data by writing to
 * privacy@getpropertypro.com. Until this route, honouring that meant a
 * hand-typed DELETE in a production SQL console — the highest-privilege tool
 * available, with a hand-written WHERE between the operator and two people's
 * data, and no record that it happened.
 *
 * DELIBERATELY A HARD DELETE, not a soft one. A `deleted_at` row still holds
 * `participant_email`, `text_body` and raw `html_body`, so it would create the
 * appearance of erasure while the personal data survives — worse than not
 * offering it. The non-destructive shelf already exists and is a different
 * feature: `status='spam'`/`'closed'` (see ./status/route.ts).
 *
 * The messages go with the thread through the FK's ON DELETE cascade, declared
 * in 0068_support_inbox.sql. `service_role` was granted DELETE on both tables
 * in the same migration, so this needs no schema change.
 *
 * WHAT THE AUDIT ENTRY KEEPS, and why it is not more: `platform_admin_audit_log`
 * is append-only and admin-readable, so copying an erased body into it would
 * mean the erasure erased nothing. It records the address, the counts and the
 * timestamps — enough to evidence that a specific request was honoured — and no
 * subject line or body, because those are content.
 *
 * Privacy §5.2 discloses that retention explicitly. It did NOT when this route
 * was first written, and this docblock claimed otherwise: the only audit
 * carve-out there covered `compliance_audit_log`, the association-scoped
 * statutory record under §718.111(12), whose `community_id` is NOT NULL and
 * which therefore cannot represent a platform-operator action at all. Citing it
 * as cover for this table was simply wrong. The policy now carries its own
 * bullet naming exactly the fields written below.
 *
 * IT ALSO DESTROYS THE INTERNAL NOTES on the thread, and those are the one
 * thing with no other record: notes are deliberately not written to the admin
 * audit log (see ./notes/route.ts) on the grounds that the row is
 * self-auditing. Once the row is gone, so is the audit. Recording note bodies
 * here instead would defeat the erasure, so the confirm dialog says it plainly
 * rather than the log absorbing it.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { createAdminTypedClient } from '@propertypro/db/supabase/admin';

import { assertNoDbError } from '@/lib/api/assert-no-db-error';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { logAdminAction } from '@/lib/audit/log-admin-action';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';

interface RouteParams {
  params: Promise<{ threadId: string }>;
}

export const DELETE = withAdminErrorHandler(
  async (_request: NextRequest, { params }: RouteParams) => {
    const admin = await requirePlatformAdmin();

    const { threadId: raw } = await params;
    const threadId = Number(raw);
    if (!Number.isInteger(threadId) || threadId <= 0) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid thread id' } },
        { status: 400 },
      );
    }

    const db = createAdminTypedClient();

    /**
     * Count the rows the cascade is about to destroy, BEFORE destroying them.
     *
     * `thread.message_count` is the obvious source and it is wrong: the notes
     * route never increments it, only the reply route and the inbound service
     * do. A thread with 3 emails and 4 notes destroys 7 rows and would record
     * 3 — and the audit entry below is the last trace the notes existed at all,
     * which makes this the one number that has to be right.
     *
     * A second query is unavoidable. The cascade runs inside the DELETE, and
     * the `.select()` reachable after `.delete()` is the transform-builder one,
     * which takes columns only and cannot ask for a count of another table.
     */
    const { count: destroyedMessages, error: countError } = await db
      .from('support_inbox_messages')
      .select('id', { count: 'exact', head: true })
      .eq('thread_id', threadId);
    assertNoDbError(countError, 'Failed to count the messages being deleted');

    /**
     * One round trip does the 404, the delete and the audit payload.
     *
     * Deliberately NOT getThreadDetail first: that is two queries and it
     * hydrates up to 500 messages including every html_body and raw_payload,
     * all of it thrown away — and it leaves a read-then-delete gap. PostgREST
     * returns the deleted rows when asked, which is the same information
     * without either cost.
     */
    const { data, error } = await db
      .from('support_inbox_threads')
      .delete()
      .eq('id', threadId)
      .select('mailbox, participant_email, status, message_count, first_message_at, last_message_at');
    assertNoDbError(error, 'Failed to delete support thread');

    const deleted = data?.[0];
    if (!deleted) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Thread not found' } },
        { status: 404 },
      );
    }

    await logAdminAction({
      admin,
      action: 'support_thread_deleted',
      resourceType: 'support_inbox_thread',
      resourceId: threadId,
      // Platform-level: a support thread belongs to no community.
      communityId: null,
      /**
       * Built FIELD BY FIELD, never spread from the returned row.
       *
       * `platform_admin_audit_log` is append-only, so anything written here is
       * permanent and uncorrectable. Passing the row through would mean that
       * widening the `.select()` above — for a debug session, say — silently
       * copies a subject line or a body into a log that outlives the erasure
       * it documents. Naming the fields makes that impossible by accident.
       */
      oldValues: {
        mailbox: deleted.mailbox,
        participant_email: deleted.participant_email,
        status: deleted.status,
        message_count: deleted.message_count,
        first_message_at: deleted.first_message_at,
        last_message_at: deleted.last_message_at,
      },
      // The true cascade count, not the thread's own tally — see above.
      metadata: { deleted_message_count: destroyedMessages ?? 0 },
    });

    return NextResponse.json({ ok: true });
  },
);
