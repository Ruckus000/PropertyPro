/**
 * Failure semantics for the publish-time resident notification (blocker #6).
 *
 * The behaviour under test is mostly about what this service REFUSES to do:
 * it must never throw (the publish transaction has already committed, so there
 * is nothing to roll back), and it must never report success for a delivery
 * that did not happen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  createAnnouncementMock,
  getAuthorNameMock,
  queueDeliveryMock,
  createNotificationsMock,
  logAuditEventMock,
  queryMock,
} = vi.hoisted(() => ({
  createAnnouncementMock: vi.fn(),
  getAuthorNameMock: vi.fn(),
  queueDeliveryMock: vi.fn(),
  createNotificationsMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  queryMock: vi.fn(),
}));

vi.mock('@/lib/services/announcement-service', () => ({
  createAnnouncementForCommunity: createAnnouncementMock,
  getAnnouncementAuthorName: getAuthorNameMock,
}));

vi.mock('@/lib/services/announcement-delivery', () => ({
  queueAnnouncementDelivery: queueDeliveryMock,
}));

vi.mock('@/lib/services/notification-service', () => ({
  createNotificationsForEvent: createNotificationsMock,
}));

vi.mock('@propertypro/db', () => ({
  logAuditEvent: logAuditEventMock,
  createScopedClient: () => ({ query: queryMock }),
  communities: { id: 'communities.id' },
}));

// Identity-ish: this suite asserts on the HTML the service COMPOSES, so a
// sanitizer that rewrote it would obscure what is being tested. Sanitizer
// behaviour has its own suite.
vi.mock('@/lib/utils/html-sanitizer', () => ({
  sanitizeHtml: (html: string) => html,
}));

import { notifyResidentsOfSitePublish } from '@/lib/services/site-publish-notification';

const INPUT = { communityId: 42, actorUserId: 'user-1', summary: 'Pool hours updated' };

describe('notifyResidentsOfSitePublish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    queryMock.mockResolvedValue([{ id: 42, slug: 'sunset-condos' }]);
    createAnnouncementMock.mockResolvedValue({ id: 7 });
    getAuthorNameMock.mockResolvedValue('Dana Reyes');
    queueDeliveryMock.mockResolvedValue(12);
    createNotificationsMock.mockResolvedValue(undefined);
    logAuditEventMock.mockResolvedValue(undefined);
  });

  it('posts the summary as the announcement title, to everyone, unpinned', async () => {
    const result = await notifyResidentsOfSitePublish(INPUT);

    expect(result).toEqual({ status: 'sent', announcementId: 7, recipientCount: 12 });
    expect(createAnnouncementMock).toHaveBeenCalledWith(42, {
      title: 'Pool hours updated',
      body: expect.stringContaining('The community website has been updated.'),
      audience: 'all',
      // Pinning would displace whatever the board actually chose to pin.
      isPinned: false,
      publishedBy: 'user-1',
    });
  });

  it('links the announcement to the community site it is announcing', async () => {
    await notifyResidentsOfSitePublish(INPUT);

    const body = createAnnouncementMock.mock.calls[0]![1].body as string;
    expect(body).toContain('sunset-condos');
    expect(body).toContain('View the updated site');
  });

  it('still notifies when the slug cannot be resolved — minus the link', async () => {
    /*
     * A missing slug should cost the reader a hyperlink, never the whole
     * notification. Degrading to "no announcement at all" would be the silent
     * failure this feature exists to remove.
     */
    queryMock.mockResolvedValueOnce([]);

    const result = await notifyResidentsOfSitePublish(INPUT);

    expect(result.status).toBe('sent');
    const body = createAnnouncementMock.mock.calls[0]![1].body as string;
    expect(body).not.toContain('<a href');
    expect(body).toContain('The community website has been updated.');
  });

  it('returns failed — and does not deliver — when the announcement cannot be created', async () => {
    createAnnouncementMock.mockRejectedValueOnce(new Error('insert blew up'));

    const result = await notifyResidentsOfSitePublish(INPUT);

    expect(result).toEqual({ status: 'failed', reason: 'insert blew up' });
    expect(queueDeliveryMock).not.toHaveBeenCalled();
  });

  it('returns partial when the announcement lands but the email does not', async () => {
    /*
     * The distinction that keeps the PM's mental model true: residents CAN see
     * this in the app, and were NOT emailed. Collapsing it into 'failed' or
     * 'sent' would make one of those two statements a lie.
     */
    queueDeliveryMock.mockRejectedValueOnce(new Error('resend 500'));

    const result = await notifyResidentsOfSitePublish(INPUT);

    expect(result).toEqual({ status: 'partial', announcementId: 7, reason: 'resend 500' });
  });

  it('records the partial delivery in the audit trail, not just the console', async () => {
    queueDeliveryMock.mockRejectedValueOnce(new Error('resend 500'));

    await notifyResidentsOfSitePublish(INPUT);

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'notification_delivery_partial',
        communityId: 42,
        resourceId: '7',
        metadata: expect.objectContaining({ source: 'site_publish' }),
      }),
    );
  });

  it('audits a successful send with the recipient count', async () => {
    await notifyResidentsOfSitePublish(INPUT);

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'announcement_email_sent',
        resourceId: '7',
        communityId: 42,
        metadata: expect.objectContaining({ recipientCount: 12, source: 'site_publish' }),
      }),
    );
  });

  it('never throws, even when every downstream call fails', async () => {
    /*
     * The load-bearing guarantee. The caller invokes this AFTER
     * publishCommunitySite has committed; a throw here would surface to the PM
     * as a failed publish for a site that is, in fact, live.
     */
    queryMock.mockRejectedValueOnce(new Error('db down'));
    createAnnouncementMock.mockRejectedValueOnce(new Error('db down'));
    logAuditEventMock.mockRejectedValue(new Error('audit down'));

    await expect(notifyResidentsOfSitePublish(INPUT)).resolves.toMatchObject({
      status: 'failed',
    });
  });

  it('does not let an in-app notification failure change the result', async () => {
    // Fire-and-forget by design: the announcement row is the durable record.
    createNotificationsMock.mockRejectedValueOnce(new Error('notify down'));

    const result = await notifyResidentsOfSitePublish(INPUT);

    expect(result.status).toBe('sent');
  });
});
