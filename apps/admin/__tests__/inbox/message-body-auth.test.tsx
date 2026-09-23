// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/inbox/HtmlMessageFrame', () => ({
  HtmlMessageFrame: () => null,
}));

import { MessageBody } from '@/components/inbox/MessageBody';
import type { InboxMessage } from '@/lib/server/inbox';

/**
 * The verdict columns shipped write-only: the normalizer stored SPF/DKIM/DMARC
 * and nothing in the product ever read them. That is the same defect the
 * ponytail pass deleted twice in this feature (`support_inbox_spam_model`,
 * `spam_verdict`), so these cases exist to keep the reader in place — a column
 * with no reader is a column that should not exist.
 *
 * They also pin the one thing the classifier structurally cannot do. It scores
 * token frequency, so spoofing is invisible to it; a DMARC failure is the only
 * signal in this console that catches it.
 */
function message(overrides: Partial<InboxMessage> = {}): InboxMessage {
  return {
    id: 1,
    kind: 'email',
    direction: 'inbound',
    fromEmail: 'jane@example.com',
    fromName: 'Jane',
    subject: 'Hello',
    textBody: 'Body text',
    htmlBody: null,
    hasAttachments: false,
    deliveredTo: 'support@getpropertypro.com',
    rfcMessageId: null,
    references: null,
    occurredAt: '2026-09-23T14:27:13.000Z',
    unreadable: false,
    spamScore: null,
    spfResult: null,
    dkimResult: null,
    dmarcResult: null,
    ...overrides,
  };
}

describe('MessageBody authentication verdicts', () => {
  it('reports an authenticated sender when all reported verdicts pass', () => {
    render(
      <MessageBody
        message={message({ spfResult: 'pass', dkimResult: 'pass', dmarcResult: 'pass' })}
        sanitizedHtml=""
      />,
    );

    expect(screen.getByText(/sender authenticated/i)).toBeDefined();
  });

  it('reports a NOT-authenticated sender when any verdict is not a pass', () => {
    render(
      <MessageBody
        message={message({ spfResult: 'pass', dkimResult: 'pass', dmarcResult: 'fail' })}
        sanitizedHtml=""
      />,
    );

    expect(screen.getByText(/sender not authenticated/i)).toBeDefined();
    // The raw word must survive to the screen: an operator has to be able to
    // tell a forgery ('fail') from a policy gap ('none') without guessing.
    expect(screen.getByText('fail')).toBeDefined();
  });

  it('does not treat softfail or none as a pass', () => {
    render(
      <MessageBody message={message({ spfResult: 'softfail' })} sanitizedHtml="" />,
    );

    expect(screen.getByText(/sender not authenticated/i)).toBeDefined();
  });

  it('prints nothing at all when the provider reported no verdicts', () => {
    // A missing verdict is not a failing verdict. Rendering "unknown" on every
    // message would train the operator to skip the line, which is exactly how
    // the one real DMARC failure gets missed.
    render(<MessageBody message={message()} sanitizedHtml="" />);

    expect(screen.queryByText(/sender (not )?authenticated/i)).toBeNull();
  });

  it('prints nothing on our own outbound reply', () => {
    // Our replies never crossed an MTA, so there is no verdict to report and a
    // line claiming one would be fabricated.
    render(
      <MessageBody
        message={message({ direction: 'outbound', spfResult: 'pass' })}
        sanitizedHtml=""
      />,
    );

    expect(screen.queryByText(/sender (not )?authenticated/i)).toBeNull();
  });
});
