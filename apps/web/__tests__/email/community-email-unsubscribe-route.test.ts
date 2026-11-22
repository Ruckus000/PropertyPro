/**
 * Route tests for the no-login community-email unsubscribe page.
 *
 * The `notifications` topic writes `emailFrequency: 'never'` — the master
 * switch for the notification pipeline, the digest and announcement delivery —
 * so it stops every email from that community, statutory notices included.
 *
 * - A GET must change nothing: mail scanners prefetch links, forwarded mail
 *   is clicked by others, and clients fetch List-Unsubscribe URLs. It shows
 *   what would stop and a button.
 * - The button POSTs `confirm=1`; only that applies the notifications opt-out.
 * - A bare one-click POST is honoured only for topics that stop no statutory
 *   notice.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { verifyMock, applyMock } = vi.hoisted(() => ({
  verifyMock: vi.fn(),
  applyMock: vi.fn(),
}));

// The real `topicAllowsOneClick`, so the POST refusal is tested against the
// rule the senders use, not a copy of it.
vi.mock('@/lib/services/community-email-unsubscribe-token', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/community-email-unsubscribe-token')>()),
  verifyCommunityEmailUnsubscribeToken: verifyMock,
}));
vi.mock('@/lib/services/community-email-unsubscribe-service', () => ({
  applyCommunityEmailUnsubscribe: applyMock,
  TOPIC_LABELS: {
    notifications: 'notification emails',
    announcements: 'announcement emails',
    calendar: 'event reminder emails',
  },
}));

import { GET, POST } from '../../src/app/api/v1/notifications/unsubscribe/route';

const url = (token?: string) =>
  `http://localhost:3000/api/v1/notifications/unsubscribe${token ? `?token=${token}` : ''}`;

const getReq = (token?: string) => new NextRequest(url(token), { method: 'GET' });

/** A POST with a urlencoded body, as the page's form or a mail client sends it. */
const postReq = (token: string | undefined, body: string) =>
  new NextRequest(url(token), {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });

/** RFC 8058's one-click body: what a mail client POSTs. */
const ONE_CLICK = 'List-Unsubscribe=One-Click';

describe('community email unsubscribe route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyMock.mockResolvedValue(undefined);
  });

  describe('GET (the link) changes nothing', () => {
    it('leaves preferences unchanged and renders a confirm form for the notifications topic', async () => {
      verifyMock.mockReturnValue({ communityId: 7, userId: 'u1', topic: 'notifications' });
      const res = await GET(getReq('good'));
      expect(res.status).toBe(200);
      expect(applyMock).not.toHaveBeenCalled();

      const html = await res.text();
      expect(html).toContain('<form method="post" action="/api/v1/notifications/unsubscribe?token=good">');
      expect(html).toContain('<input type="hidden" name="confirm" value="1">');
      expect(html).toContain('Unsubscribe from all email');
    });

    it('says, before anything changes, that it stops ALL community email, legal notices by name', async () => {
      verifyMock.mockReturnValue({ communityId: 7, userId: 'u1', topic: 'notifications' });
      const html = await (await GET(getReq('good'))).text();
      expect(html).toContain('stops all email from this community');
      expect(html).toContain('meeting notices');
      expect(html).toContain('violation notices');
      expect(html).toContain('decisions on your ARC requests');
      expect(html).toContain('announcements');
      expect(html).not.toContain("You're unsubscribed");
    });

    it('is read-only for announcements and calendar too', async () => {
      for (const topic of ['announcements', 'calendar'] as const) {
        verifyMock.mockReturnValue({ communityId: 3, userId: 'u1', topic });
        const html = await (await GET(getReq('good'))).text();
        expect(html).toContain('name="confirm"');
      }
      expect(applyMock).not.toHaveBeenCalled();
    });

    it('links to the notification preferences of THAT community', async () => {
      verifyMock.mockReturnValue({ communityId: 7, userId: 'u1', topic: 'notifications' });
      const html = await (await GET(getReq('good'))).text();
      expect(html).toContain('href="/settings?communityId=7#notifications"');
    });

    it('escapes the token it echoes into the form action', async () => {
      verifyMock.mockReturnValue({ communityId: 7, userId: 'u1', topic: 'notifications' });
      const html = await (await GET(getReq('a%22b'))).text();
      expect(html).toContain('action="/api/v1/notifications/unsubscribe?token=a%22b"');
      expect(html).not.toContain('token=a"b');
    });

    it('an invalid token neither writes nor shows a form or preferences link', async () => {
      verifyMock.mockReturnValue(null);
      const res = await GET(getReq('bad'));
      expect(res.status).toBe(400);
      expect(applyMock).not.toHaveBeenCalled();
      const html = await res.text();
      expect(html).not.toContain('href=');
      expect(html).not.toContain('<form');
    });
  });

  describe('POST', () => {
    // D3: a PERSON who read the page may stop everything, statutory notices included.
    it('with confirm=1 applies the notifications opt-out, audited as confirmed on the page', async () => {
      verifyMock.mockReturnValue({ communityId: 7, userId: 'u1', topic: 'notifications' });
      const res = await POST(postReq('good', 'confirm=1'));
      expect(res.status).toBe(200);
      expect(applyMock).toHaveBeenCalledWith(
        { communityId: 7, userId: 'u1', topic: 'notifications' },
        { confirmedVia: 'confirmation_page' },
      );
      const html = await res.text();
      expect(html).toContain("You're unsubscribed from all email from this community");
      expect(html).toContain('violation notices');
      expect(html).toContain('href="/settings?communityId=7#notifications"');
    });

    // A provider one-click on the notifications topic would set email_frequency
    // to 'never' and stop meeting, violation and ARC notices unseen.
    it('refuses a bare one-click POST on the notifications topic and writes nothing', async () => {
      verifyMock.mockReturnValue({ communityId: 7, userId: 'u1', topic: 'notifications' });
      const res = await POST(postReq('good', ONE_CLICK));
      expect(res.status).toBe(400);
      expect(await res.text()).toContain('Use the unsubscribe link in the email');
      expect(applyMock).not.toHaveBeenCalled();
    });

    it('refuses an empty-bodied POST on the notifications topic', async () => {
      verifyMock.mockReturnValue({ communityId: 7, userId: 'u1', topic: 'notifications' });
      const res = await POST(postReq('good', ''));
      expect(res.status).toBe(400);
      expect(applyMock).not.toHaveBeenCalled();
    });

    it('a confirm value other than 1 is not a confirmation', async () => {
      verifyMock.mockReturnValue({ communityId: 7, userId: 'u1', topic: 'notifications' });
      const res = await POST(postReq('good', `${ONE_CLICK}&confirm=yes`));
      expect(res.status).toBe(400);
      expect(applyMock).not.toHaveBeenCalled();
    });

    it('honours one-click for announcements, audited as one-click', async () => {
      verifyMock.mockReturnValue({ communityId: 7, userId: 'u1', topic: 'announcements' });
      const res = await POST(postReq('good', ONE_CLICK));
      expect(res.status).toBe(200);
      expect(applyMock).toHaveBeenCalledWith(
        { communityId: 7, userId: 'u1', topic: 'announcements' },
        { confirmedVia: 'one_click' },
      );
    });

    it('a topic-specific confirmation keeps its narrow copy', async () => {
      verifyMock.mockReturnValue({ communityId: 3, userId: 'u1', topic: 'announcements' });
      const html = await (await POST(postReq('good', 'confirm=1'))).text();
      expect(html).toContain("You're unsubscribed from this community's announcement emails");
      expect(html).not.toContain('all email from this community');
    });

    it('an invalid token writes nothing, confirmed or not', async () => {
      verifyMock.mockReturnValue(null);
      expect((await POST(postReq('bad', 'confirm=1'))).status).toBe(400);
      expect((await POST(postReq('bad', ONE_CLICK))).status).toBe(400);
      expect(applyMock).not.toHaveBeenCalled();
    });
  });
});
