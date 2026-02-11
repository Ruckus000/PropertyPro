import { describe, it, expect, beforeEach } from 'vitest';
import { sendEmail, testInbox, clearTestInbox } from '../src/send';
import { InvitationEmail } from '../src/templates/invitation-email';

const branding = {
  communityName: 'Palm Gardens Condominium',
  logoUrl: 'https://example.com/logo.png',
  accentColor: '#1a6b3f',
};

describe('sendEmail', () => {
  beforeEach(() => {
    clearTestInbox();
    delete process.env.RESEND_API_KEY;
  });

  it('stores transactional email in test inbox when RESEND_API_KEY is missing', async () => {
    const result = await sendEmail({
      to: 'resident@example.com',
      subject: 'Invitation',
      category: 'transactional',
      react: (
        <InvitationEmail
          branding={branding}
          inviteeName="Jane Doe"
          inviterName="John Smith"
          role="Owner"
          inviteUrl="https://example.com/invite/abc123"
        />
      ),
    });

    expect(result.id).toBe('test_1');
    expect(testInbox).toHaveLength(1);
    expect(testInbox[0]?.headers['List-Unsubscribe']).toBeUndefined();
  });

  it('adds List-Unsubscribe headers for non-transactional emails', async () => {
    await sendEmail({
      to: 'resident@example.com',
      subject: 'Announcement',
      category: 'non-transactional',
      unsubscribeUrl: 'https://example.com/unsubscribe',
      react: (
        <InvitationEmail
          branding={branding}
          inviteeName="Jane Doe"
          inviterName="John Smith"
          role="Owner"
          inviteUrl="https://example.com/invite/abc123"
        />
      ),
    });

    expect(testInbox).toHaveLength(1);
    expect(testInbox[0]?.headers['List-Unsubscribe']).toBe('<https://example.com/unsubscribe>');
    expect(testInbox[0]?.headers['List-Unsubscribe-Post']).toBe(
      'List-Unsubscribe=One-Click-Unsubscribe',
    );
  });

  it('throws when non-transactional email omits unsubscribeUrl', async () => {
    await expect(
      sendEmail({
        to: 'resident@example.com',
        subject: 'Announcement',
        category: 'non-transactional',
        react: (
          <InvitationEmail
            branding={branding}
            inviteeName="Jane Doe"
            inviterName="John Smith"
            role="Owner"
            inviteUrl="https://example.com/invite/abc123"
          />
        ),
      }),
    ).rejects.toThrow(/List-Unsubscribe URL is required/i);
  });

  it('uses the configured default from address', async () => {
    await sendEmail({
      to: 'resident@example.com',
      subject: 'Invitation',
      category: 'transactional',
      react: (
        <InvitationEmail
          branding={branding}
          inviteeName="Jane Doe"
          inviterName="John Smith"
          role="Owner"
          inviteUrl="https://example.com/invite/abc123"
        />
      ),
    });

    expect(testInbox[0]?.from).toBe('PropertyPro <noreply@mail.propertyprofl.com>');
  });

  it('clearTestInbox removes all captured messages', async () => {
    await sendEmail({
      to: 'resident@example.com',
      subject: 'Invitation',
      category: 'transactional',
      react: (
        <InvitationEmail
          branding={branding}
          inviteeName="Jane Doe"
          inviterName="John Smith"
          role="Owner"
          inviteUrl="https://example.com/invite/abc123"
        />
      ),
    });

    expect(testInbox).toHaveLength(1);
    clearTestInbox();
    expect(testInbox).toHaveLength(0);
  });

  it('uses caller-supplied from when provided', async () => {
    await sendEmail({
      to: 'resident@example.com',
      subject: 'Invitation',
      from: 'PropertyPro Support <support@mail.propertyprofl.com>',
      category: 'transactional',
      react: (
        <InvitationEmail
          branding={branding}
          inviteeName="Jane Doe"
          inviterName="John Smith"
          role="Owner"
          inviteUrl="https://example.com/invite/abc123"
        />
      ),
    });

    expect(testInbox[0]?.from).toBe('PropertyPro Support <support@mail.propertyprofl.com>');
  });
});
