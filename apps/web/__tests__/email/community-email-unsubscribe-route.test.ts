/**
 * Route tests for the no-login community-email unsubscribe confirmation page.
 *
 * The `notifications` topic writes `emailFrequency: 'never'` — the master
 * switch for the notification pipeline, the digest and announcement delivery —
 * so one click stops every email from that community, not only the kind the
 * link arrived in. The confirmation page must say that (meeting notices and
 * announcements by name) and link to notification preferences, or a resident
 * who meant to silence one maintenance update silently loses meeting notices.
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

const req = (method: 'GET' | 'POST', token?: string) =>
  new NextRequest(
    `http://localhost:3000/api/v1/notifications/unsubscribe${token ? `?token=${token}` : ''}`,
    { method },
  );

describe('community email unsubscribe route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyMock.mockResolvedValue(undefined);
  });

  it('general (notifications) unsubscribe says it stops ALL community email, by name', async () => {
    verifyMock.mockReturnValue({ communityId: 7, userId: 'u1', topic: 'notifications' });
    const res = await GET(req('GET', 'good'));
    expect(res.status).toBe(200);
    expect(applyMock).toHaveBeenCalledWith({ communityId: 7, userId: 'u1', topic: 'notifications' });

    const html = await res.text();
    expect(html).toContain('all email from this community');
    expect(html).toContain('meeting notices');
    expect(html).toContain('announcements');
    // It must not claim the narrow scope the old copy did.
    expect(html).not.toContain("this community's notification emails");
  });

  it('links to the notification preferences of THAT community', async () => {
    verifyMock.mockReturnValue({ communityId: 7, userId: 'u1', topic: 'notifications' });
    const html = await (await GET(req('GET', 'good'))).text();
    expect(html).toContain('href="/settings?communityId=7#notifications"');
  });

  it('a topic-specific unsubscribe keeps its narrow copy and the preferences link', async () => {
    verifyMock.mockReturnValue({ communityId: 3, userId: 'u1', topic: 'announcements' });
    const html = await (await GET(req('GET', 'good'))).text();
    expect(html).toContain("this community's announcement emails");
    expect(html).not.toContain('all email from this community');
    expect(html).toContain('href="/settings?communityId=3#notifications"');
  });

  it('an invalid token neither writes nor shows a preferences link', async () => {
    verifyMock.mockReturnValue(null);
    const res = await GET(req('GET', 'bad'));
    expect(res.status).toBe(400);
    expect(applyMock).not.toHaveBeenCalled();
    expect(await res.text()).not.toContain('href=');
  });

  it('POST (one-click) still unsubscribes on a valid token', async () => {
    verifyMock.mockReturnValue({ communityId: 7, userId: 'u1', topic: 'announcements' });
    const res = await POST(req('POST', 'good'));
    expect(res.status).toBe(200);
    expect(applyMock).toHaveBeenCalledWith({ communityId: 7, userId: 'u1', topic: 'announcements' });
  });

  // A provider POST on the notifications topic would set email_frequency to
  // 'never' and stop meeting, violation and ARC notices with nobody seeing it.
  // No email advertises one-click for that topic; a POST anyway changes nothing.
  it('POST refuses the notifications topic and writes nothing', async () => {
    verifyMock.mockReturnValue({ communityId: 7, userId: 'u1', topic: 'notifications' });
    const res = await POST(req('POST', 'good'));
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Use the unsubscribe link in the email');
    expect(applyMock).not.toHaveBeenCalled();
  });

  // Decision D3: a PERSON on the confirmation page may stop everything,
  // statutory notices included, and the page names them.
  it('GET (the human path) still applies the notifications opt-out and names the legal notices it stops', async () => {
    verifyMock.mockReturnValue({ communityId: 7, userId: 'u1', topic: 'notifications' });
    const res = await GET(req('GET', 'good'));
    expect(res.status).toBe(200);
    expect(applyMock).toHaveBeenCalledWith({ communityId: 7, userId: 'u1', topic: 'notifications' });
    const html = await res.text();
    expect(html).toContain('violation notices');
    expect(html).toContain('decisions on your ARC requests');
  });
});
