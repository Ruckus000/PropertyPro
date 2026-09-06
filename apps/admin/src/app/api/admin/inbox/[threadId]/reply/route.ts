/**
 * Send a reply from the platform support inbox.
 *
 * POST /api/admin/inbox/[threadId]/reply
 *
 * ── This is the only path in the product that emails an arbitrary external
 *    address from a PropertyPro sender. Two rules follow. ──
 *
 * 1. THE RECIPIENT IS SERVER-DERIVED. The body schema accepts `{ body }` and
 *    nothing else; `to` comes from the thread row after it is loaded. Accepting
 *    a client-supplied recipient would turn an authenticated-admin XSS or CSRF
 *    into an open relay sending from support@getpropertypro.com — with our SPF,
 *    our DKIM and our domain reputation behind it.
 *
 * 2. NO AUTOMATIC SEND, EVER. This handler is reached only through
 *    `requirePlatformAdmin()`; the inbound webhook must never call it. No
 *    auto-acknowledgement, no vacation responder, no bounce-on-spam. Replying
 *    automatically to mail arriving at a published address is how a domain ends
 *    up on a blocklist.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';

import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { sendEmail, SupportReplyEmail } from '@propertypro/email';

import { assertNoDbError } from '@/lib/api/assert-no-db-error';
import { parseAdminBody } from '@/lib/api/parse-body';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { logAdminAction } from '@/lib/audit/log-admin-action';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { getReplyParent, getThreadDetail } from '@/lib/server/inbox';
import {
  buildQuotedText,
  buildReplyHeaders,
  buildReplyReferences,
  buildReplySubject,
  replyFromAddress,
} from '@/lib/server/inbox-threading';

/**
 * `to` is deliberately absent. See rule 1 above — this is the single
 * highest-consequence line in the feature.
 */
const replySchema = z.object({
  body: z.string().trim().min(1).max(50_000),
});

/** A send id from the package's test/dry-run mode, which transmitted nothing. */
const UNDELIVERED_ID = /^(test|dryrun)_/;

interface RouteParams {
  params: Promise<{ threadId: string }>;
}

export const POST = withAdminErrorHandler(
  async (request: NextRequest, { params }: RouteParams) => {
    const admin = await requirePlatformAdmin();

    const { threadId: rawThreadId } = await params;
    const threadId = Number(rawThreadId);
    if (!Number.isInteger(threadId) || threadId <= 0) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid thread id' } },
        { status: 400 },
      );
    }

    const parsed = await parseAdminBody(request, replySchema);
    if (parsed instanceof NextResponse) return parsed;

    const detail = await getThreadDetail(threadId);
    if (!detail) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Thread not found' } },
        { status: 404 },
      );
    }

    const { thread } = detail;

    // `kind='email' AND direction='inbound'` — an internal note must never
    // become the parent, or its text is quoted back to the customer.
    const parent = await getReplyParent(threadId);

    const subject = buildReplySubject(parent?.subject ?? thread.subject);
    const headers = parent
      ? buildReplyHeaders({
          rfcMessageId: parent.rfcMessageId,
          references: parent.references,
        })
      : {};
    const from = replyFromAddress(thread.mailbox);

    const sent = await sendEmail({
      // SERVER-DERIVED. Never from the request body.
      to: thread.participantEmail,
      from,
      subject,
      category: 'transactional',
      headers,
      // A double-click or a platform retry cannot double-send.
      idempotencyKey: `support-reply:${threadId}:${createHash('sha256')
        .update(parsed.body)
        .digest('hex')
        .slice(0, 16)}`,
      react: SupportReplyEmail({
        bodyText: parsed.body,
        quotedText: parent ? buildQuotedText({ textBody: parent.textBody }) : undefined,
        mailboxAddress: from,
      }),
    });

    /**
     * `sendEmail` resolves with `{ id: 'test_N' }` when RESEND_API_KEY is
     * unset, so on a misconfigured admin deployment every reply would report
     * "Sent" and go nowhere. The readiness probe lives on the WEB app and would
     * not catch it. Surfacing it is the only thing that does.
     */
    const delivered = !UNDELIVERED_ID.test(sent.id);

    // Send FIRST, then record. A failed insert after a successful send leaves a
    // sent-but-unrecorded reply, which is recoverable; the reverse would show
    // the operator a reply in the thread that was never delivered.
    const db = createAdminTypedClient();
    const now = new Date().toISOString();

    const { error: insertError } = await db.from('support_inbox_messages').insert({
      thread_id: threadId,
      kind: 'email',
      direction: 'outbound',
      // Outbound rows carry no RFC Message-ID: Resend does not return the one
      // it stamps. Threading survives via the References chain instead — see
      // buildReplyReferences.
      dedupe_key: createHash('sha256')
        .update(`outbound\n${threadId}\n${sent.id}\n${now}`)
        .digest('hex'),
      rfc_message_id: null,
      in_reply_to: parent?.rfcMessageId ?? null,
      references_ids: parent
        ? buildReplyReferences({
            rfcMessageId: parent.rfcMessageId,
            references: parent.references,
          })
        : null,
      delivered_to: null,
      from_email: from,
      from_name: 'PropertyPro Support',
      to_emails: [thread.participantEmail],
      cc_emails: null,
      subject,
      text_body: parsed.body,
      html_body: null,
      sent_at: now,
      received_at: now,
      provider_message_id: delivered ? sent.id : null,
      author_user_id: admin.id,
    });
    assertNoDbError(insertError, 'Failed to record the sent reply');

    await db
      .from('support_inbox_threads')
      .update({ last_message_at: now, updated_at: now })
      .eq('id', threadId);

    await logAdminAction({
      admin,
      action: 'support_thread_replied',
      resourceType: 'support_inbox_thread',
      resourceId: threadId,
      // Platform-level: a support thread belongs to no community, which is the
      // case this column is nullable for.
      communityId: null,
      metadata: {
        mailbox: thread.mailbox,
        to: thread.participantEmail,
        subject,
        delivered,
        provider_message_id: delivered ? sent.id : null,
      },
    });

    return NextResponse.json({ ok: true, delivered });
  },
);
