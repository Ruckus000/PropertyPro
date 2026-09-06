import { describe, it, expect, beforeEach } from 'vitest';
import { sendEmail, testInbox, clearTestInbox } from '../src/send';
import { SupportReplyEmail } from '../src/templates/support-reply-email';

/**
 * `SendEmailOptions.headers` exists for one caller: the platform support inbox,
 * which must set In-Reply-To/References so a reply threads in the recipient's
 * mail client.
 *
 * The ordering assertion is the point of this file. Caller headers are spread
 * FIRST in buildHeaders() so the List-Unsubscribe block lands on top of them.
 * Reverse the spread and a caller could blank out a CAN-SPAM header on a bulk
 * send — which nothing else in the suite would notice.
 */
const reply = (
  <SupportReplyEmail
    bodyText="Thanks for getting in touch."
    mailboxAddress="support@getpropertypro.com"
  />
);

describe('sendEmail custom headers', () => {
  beforeEach(() => {
    clearTestInbox();
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
  });

  it('passes caller headers through to the message', async () => {
    await sendEmail({
      to: 'someone@example.com',
      subject: 'Re: Question about my documents',
      category: 'transactional',
      headers: {
        'In-Reply-To': '<abc123@mail.example.com>',
        References: '<abc123@mail.example.com>',
      },
      react: reply,
    });

    expect(testInbox[0]?.headers['In-Reply-To']).toBe('<abc123@mail.example.com>');
    expect(testInbox[0]?.headers.References).toBe('<abc123@mail.example.com>');
  });

  it('omits the header block entirely when no headers are supplied', async () => {
    await sendEmail({
      to: 'someone@example.com',
      subject: 'Re: Question',
      category: 'transactional',
      react: reply,
    });

    expect(testInbox[0]?.headers).toEqual({});
  });

  it('does NOT let a caller override List-Unsubscribe on a bulk send', async () => {
    await sendEmail({
      to: 'resident@example.com',
      subject: 'Announcement',
      category: 'non-transactional',
      unsubscribeUrl: 'https://example.com/unsubscribe?token=real',
      headers: {
        'List-Unsubscribe': '<https://evil.example/hijack>',
        'List-Unsubscribe-Post': 'nonsense',
        'In-Reply-To': '<keep-me@mail.example.com>',
      },
      react: reply,
    });

    // The compliance pair wins...
    expect(testInbox[0]?.headers['List-Unsubscribe']).toBe(
      '<https://example.com/unsubscribe?token=real>',
    );
    expect(testInbox[0]?.headers['List-Unsubscribe-Post']).toBe(
      'List-Unsubscribe=One-Click-Unsubscribe',
    );
    // ...while unrelated caller headers still survive, so this is proving
    // precedence and not merely that caller headers are dropped.
    expect(testInbox[0]?.headers['In-Reply-To']).toBe('<keep-me@mail.example.com>');
  });

  it('still throws for a non-transactional send with no unsubscribe URL', async () => {
    // Supplying headers must not become a way around the existing guard.
    await expect(
      sendEmail({
        to: 'resident@example.com',
        subject: 'Announcement',
        category: 'non-transactional',
        headers: { 'List-Unsubscribe': '<https://evil.example/hijack>' },
        react: reply,
      }),
    ).rejects.toThrow(/List-Unsubscribe URL is required/);
  });
});
