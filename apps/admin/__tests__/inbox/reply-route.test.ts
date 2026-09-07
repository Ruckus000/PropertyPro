import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The reply route is the only path in the product that emails an arbitrary
 * external address from a PropertyPro sender. These tests defend the two rules
 * that follow from that, plus the silent-send guard.
 */
const {
  requirePlatformAdminMock,
  sendEmailMock,
  getThreadDetailMock,
  getReplyParentMock,
  logAdminActionMock,
  insertMock,
  updateMock,
} = vi.hoisted(() => ({
  requirePlatformAdminMock: vi.fn(),
  sendEmailMock: vi.fn(),
  getThreadDetailMock: vi.fn(),
  getReplyParentMock: vi.fn(),
  logAdminActionMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: requirePlatformAdminMock,
}));
vi.mock('@/lib/server/inbox', () => ({
  getThreadDetail: getThreadDetailMock,
  getReplyParent: getReplyParentMock,
}));
vi.mock('@/lib/audit/log-admin-action', () => ({ logAdminAction: logAdminActionMock }));
vi.mock('@propertypro/email', () => ({
  sendEmail: sendEmailMock,
  SupportReplyEmail: (props: unknown) => props,
}));
vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: () => ({
    from: () => ({
      insert: insertMock,
      update: (payload: unknown) => ({
        eq: (...args: unknown[]) => updateMock(payload, ...args),
      }),
    }),
  }),
}));

const { POST } = await import('@/app/api/admin/inbox/[threadId]/reply/route');

const THREAD = {
  id: 42,
  mailbox: 'support' as const,
  mailboxLabel: 'Support',
  subject: 'Question about my documents',
  participantEmail: 'jane@example.com',
  participantName: 'Jane Doe',
  status: 'open' as const,
  messageCount: 1,
  firstMessageAt: '2026-09-05T10:00:00.000Z',
  lastMessageAt: '2026-09-05T10:00:00.000Z',
};

const PARENT = {
  id: 1,
  kind: 'email' as const,
  direction: 'inbound' as const,
  fromEmail: 'jane@example.com',
  fromName: 'Jane Doe',
  subject: 'Question about my documents',
  textBody: 'Where are the minutes?',
  htmlBody: null,
  hasAttachments: false,
  deliveredTo: 'support@getpropertypro.com',
  rfcMessageId: 'orig-1@mail.example.com',
  references: [],
  occurredAt: '2026-09-05T10:00:00.000Z',
  unreadable: false,
};

function post(body: unknown, threadId = '42'): [NextRequest, { params: Promise<{ threadId: string }> }] {
  const request = new NextRequest('https://admin.getpropertypro.com/api/admin/inbox/42/reply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return [request, { params: Promise.resolve({ threadId }) }];
}

describe('POST /api/admin/inbox/[threadId]/reply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformAdminMock.mockResolvedValue({
      id: 'admin-uuid',
      email: 'ops@getpropertypro.com',
      role: 'super_admin',
    });
    getThreadDetailMock.mockResolvedValue({ thread: THREAD, messages: [PARENT] });
    getReplyParentMock.mockResolvedValue(PARENT);
    sendEmailMock.mockResolvedValue({ id: 're_abc123' });
    insertMock.mockResolvedValue({ error: null });
    updateMock.mockResolvedValue({ error: null });
    logAdminActionMock.mockResolvedValue(undefined);
  });

  it('sends to the thread participant and records the reply', async () => {
    const response = await POST(...post({ body: 'Here they are.' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, delivered: true });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0]?.[0]).toMatchObject({
      to: 'jane@example.com',
      subject: 'Re: Question about my documents',
      category: 'transactional',
    });
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(logAdminActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'support_thread_replied', communityId: null }),
    );
  });

  describe('the recipient is server-derived', () => {
    it('IGNORES a body-supplied `to` and still sends to the thread participant', async () => {
      // The highest-consequence guard in the feature. Without it, an
      // authenticated-admin XSS or CSRF turns the console into an open relay
      // sending from support@getpropertypro.com with our SPF and DKIM behind it.
      await POST(...post({ body: 'hi', to: 'attacker@evil.test' }));

      const sent = sendEmailMock.mock.calls[0]?.[0] as { to: string };
      expect(sent.to).toBe('jane@example.com');
      expect(JSON.stringify(sendEmailMock.mock.calls[0])).not.toContain('attacker@evil.test');
    });

    it('ignores body-supplied cc and bcc as well', async () => {
      await POST(...post({ body: 'hi', cc: 'x@evil.test', bcc: 'y@evil.test' }));

      const payload = JSON.stringify(sendEmailMock.mock.calls[0]);
      expect(payload).not.toContain('evil.test');
    });
  });

  describe('the From matches the mailbox the thread arrived on', () => {
    it('answers a privacy@ thread from privacy@', async () => {
      getThreadDetailMock.mockResolvedValue({
        thread: { ...THREAD, mailbox: 'privacy' },
        messages: [PARENT],
      });

      await POST(...post({ body: 'hi' }));

      expect(sendEmailMock.mock.calls[0]?.[0]).toMatchObject({
        from: 'PropertyPro Privacy <privacy@getpropertypro.com>',
      });
    });

    it('answers a support@ thread from support@ — the control case', async () => {
      await POST(...post({ body: 'hi' }));
      expect(sendEmailMock.mock.calls[0]?.[0]).toMatchObject({
        from: 'PropertyPro Support <support@getpropertypro.com>',
      });
    });

    it('never falls back to the noreply default', async () => {
      await POST(...post({ body: 'hi' }));
      const sent = sendEmailMock.mock.calls[0]?.[0] as { from: string };
      expect(sent.from).not.toContain('noreply@');
    });
  });

  describe('RFC threading', () => {
    it('sets In-Reply-To and References from the parent inbound message', async () => {
      await POST(...post({ body: 'hi' }));

      expect(sendEmailMock.mock.calls[0]?.[0]).toMatchObject({
        headers: {
          'In-Reply-To': '<orig-1@mail.example.com>',
          References: '<orig-1@mail.example.com>',
        },
      });
    });

    it('omits the headers rather than emitting a malformed one when the parent has no Message-ID', async () => {
      getReplyParentMock.mockResolvedValue({ ...PARENT, rfcMessageId: null });

      await POST(...post({ body: 'hi' }));

      expect(sendEmailMock.mock.calls[0]?.[0]).toMatchObject({ headers: {} });
    });
  });

  describe('an internal note can never become the reply parent', () => {
    const NOTE = {
      ...PARENT,
      id: 2,
      kind: 'note' as const,
      direction: 'internal' as const,
      fromEmail: null,
      rfcMessageId: null,
      subject: null,
      textBody: 'INTERNAL: this person is a known time-waster',
    };

    it('quotes the last inbound EMAIL, not the newer note', async () => {
      // The database's kind-shape CHECK stops a note being *addressed*, but not
      // being *quoted*. Quoting it would paste private triage commentary into a
      // message sent to the customer.
      getThreadDetailMock.mockResolvedValue({
        thread: THREAD,
        messages: [PARENT, NOTE],
      });
      getReplyParentMock.mockResolvedValue(PARENT);

      await POST(...post({ body: 'hi' }));

      const payload = JSON.stringify(sendEmailMock.mock.calls[0]);
      expect(payload).not.toContain('INTERNAL:');
      expect(payload).toContain('Where are the minutes?');
    });

    it('sends nothing derived from a note when the thread has only notes', async () => {
      getThreadDetailMock.mockResolvedValue({ thread: THREAD, messages: [NOTE] });
      getReplyParentMock.mockResolvedValue(null);

      await POST(...post({ body: 'hi' }));

      const payload = JSON.stringify(sendEmailMock.mock.calls[0]);
      expect(payload).not.toContain('INTERNAL:');
      // No parent means no threading headers rather than a malformed one.
      expect(sendEmailMock.mock.calls[0]?.[0]).toMatchObject({ headers: {} });
    });
  });

  describe('the silent-send guard', () => {
    it('reports delivered: false for a test-mode send id', async () => {
      // sendEmail resolves { id: 'test_N' } when RESEND_API_KEY is unset, so on
      // a misconfigured admin deployment every reply would otherwise report
      // "Sent" and go nowhere. The readiness probe lives on the WEB app and
      // would not catch it.
      sendEmailMock.mockResolvedValue({ id: 'test_1' });

      const response = await POST(...post({ body: 'hi' }));

      await expect(response.json()).resolves.toEqual({ ok: true, delivered: false });
    });

    it('reports delivered: true for a real Resend id — the control', async () => {
      sendEmailMock.mockResolvedValue({ id: 're_abc123' });
      const response = await POST(...post({ body: 'hi' }));
      await expect(response.json()).resolves.toEqual({ ok: true, delivered: true });
    });
  });

  describe('validation and authorization', () => {
    it('rejects an empty body without sending', async () => {
      const response = await POST(...post({ body: '   ' }));
      expect(response.status).toBe(400);
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it('404s an unknown thread without sending', async () => {
      getThreadDetailMock.mockResolvedValue(null);
      const response = await POST(...post({ body: 'hi' }));
      expect(response.status).toBe(404);
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it('rejects a non-numeric thread id without sending', async () => {
      const response = await POST(...post({ body: 'hi' }, 'abc'));
      expect(response.status).toBe(400);
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it('checks platform-admin authorization BEFORE anything else', async () => {
      const { ForbiddenError } = await import('@propertypro/shared/http');
      requirePlatformAdminMock.mockRejectedValue(new ForbiddenError('nope'));

      const response = await POST(...post({ body: 'hi' }));

      expect(response.status).toBe(403);
      expect(sendEmailMock).not.toHaveBeenCalled();
      expect(getThreadDetailMock).not.toHaveBeenCalled();
    });
  });

  it('counts the reply, so the thread list does not undercount it', async () => {
    // message_count is what the inbox list renders as "N messages", and it
    // counts inbound AND outbound. Advancing last_message_at without it left
    // every replied-to thread short by exactly its number of replies — two
    // real threads read "1 message" and "2 messages" while holding 2 and 3.
    await POST(...post({ body: 'Here they are.' }));

    expect(updateMock).toHaveBeenCalledTimes(1);
    const [payload] = updateMock.mock.calls[0] as [Record<string, unknown>];
    expect(payload.message_count).toBe(THREAD.messageCount + 1);
    // Control: the timestamps that already worked must still be written, so a
    // regression here is distinguishable from the update being dropped.
    expect(payload).toHaveProperty('last_message_at');
    expect(payload).toHaveProperty('updated_at');
  });

  describe('idempotency key', () => {
    it('changes when the parent changes, so an unchanged body is not a 409', async () => {
      // Resend honours a key for 24h. A DUPLICATE payload under an existing key
      // is replayed without sending; a DIFFERENT payload under an existing key
      // is rejected with 409. Subject, In-Reply-To, References and the quoted
      // text all derive from the parent — so keying on the body alone meant a
      // repeated short reply ("Thanks!") after a new inbound arrived changed
      // the payload but not the key, and threw a 500 for the next 24 hours.
      await POST(...post({ body: 'Thanks!' }));
      const first = sendEmailMock.mock.calls[0]?.[0]?.idempotencyKey;

      sendEmailMock.mockClear();
      getReplyParentMock.mockResolvedValue({ ...PARENT, id: PARENT.id + 1 });
      await POST(...post({ body: 'Thanks!' }));
      const second = sendEmailMock.mock.calls[0]?.[0]?.idempotencyKey;

      expect(first).toBeTruthy();
      expect(second).not.toBe(first);
    });

    it('is stable for the same body and the same parent (double-click)', async () => {
      // Control: the reason the key exists at all. Two submissions of the same
      // reply against an unchanged thread must still collapse to one send.
      await POST(...post({ body: 'Same text' }));
      await POST(...post({ body: 'Same text' }));

      const [a, b] = sendEmailMock.mock.calls.map((c) => c[0].idempotencyKey);
      expect(a).toBe(b);
    });
  });
});
