/**
 * The signature block at the foot of a support reply.
 *
 * This file exists because the first replies this feature sent in production
 * were signed by a HARDCODED "PropertyPro Support" literal in the template. Two
 * consequences, one cosmetic and one not:
 *
 *  - the route passed the full `Name <addr>` string as the address, so the name
 *    printed twice; and
 *  - every mailbox signed itself as Support, so a `privacy@` reply went out
 *    `From: PropertyPro Privacy` and signed "PropertyPro Support" — silently
 *    undoing the per-mailbox routing the From header had just got right.
 *
 * Nothing caught it. The database row records the `From` we asked Resend for,
 * not the body we rendered, and the only test touching this template asserted
 * headers. It was found by reading a message that had actually been delivered.
 *
 * So these cases render PRIVACY first: a support-only assertion passes against
 * the hardcoded literal and proves nothing.
 */
import { render } from '@react-email/components';
import { describe, expect, it } from 'vitest';

import { SupportReplyEmail } from '../src/templates/support-reply-email';

function signature(mailboxName: string, mailboxAddress: string): Promise<string> {
  return render(
    <SupportReplyEmail
      bodyText="Thanks for getting in touch."
      mailboxName={mailboxName}
      mailboxAddress={mailboxAddress}
    />,
    { plainText: true },
  );
}

describe('support reply signature', () => {
  it('signs a privacy reply as Privacy, never as Support', async () => {
    const text = await signature('PropertyPro Privacy', 'privacy@getpropertypro.com');

    expect(text).toContain('PropertyPro Privacy');
    expect(text).toContain('privacy@getpropertypro.com');
    // The defect, stated directly: the Support literal must not appear in a
    // privacy reply at all.
    expect(text).not.toContain('PropertyPro Support');
    expect(text).not.toContain('support@getpropertypro.com');
  });

  it('signs a contact reply as PropertyPro, never as Support', async () => {
    const text = await signature('PropertyPro', 'contact@getpropertypro.com');

    expect(text).toContain('contact@getpropertypro.com');
    expect(text).not.toContain('PropertyPro Support');
  });

  it('names the sender exactly once (control: support)', async () => {
    // The support case is the CONTROL — it passed even while the template was
    // hardcoded. What it can still catch is the duplication: the name appearing
    // twice because the address carried its own copy of it.
    const text = await signature('PropertyPro Support', 'support@getpropertypro.com');

    expect(text.split('PropertyPro Support').length - 1).toBe(1);
    expect(text).toContain('support@getpropertypro.com');
  });
});
