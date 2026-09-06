import { describe, expect, it } from 'vitest';

import {
  detectAttachments,
  normalizeForwardEmailPayload,
  resolveMailbox,
} from '@/lib/services/support-inbox/normalize';
import { InboundEmailShapeError } from '@/lib/services/support-inbox/types';

import forwardEmailFixture from './fixtures/forward-email-webhook.json';

describe('normalizeForwardEmailPayload', () => {
  it('normalizes the reference payload', () => {
    const email = normalizeForwardEmailPayload(forwardEmailFixture);

    expect(email.mailbox).toBe('support');
    expect(email.deliveredTo).toBe('support@getpropertypro.com');
    expect(email.from).toEqual({ email: 'jane@example.com', name: 'Jane Doe' });
    expect(email.subject).toBe('Re: Question about my documents');
    expect(email.textBody).toBe('Any update on this?');
    expect(email.htmlBody).toBe('<p>Any update on this?</p>');
    expect(email.rfcMessageId).toBe('reply-2@mail.example.com');
    expect(email.inReplyTo).toBe('original-1@mail.example.com');
    expect(email.references).toEqual(['original-1@mail.example.com']);
    expect(email.sentAt?.toISOString()).toBe('2026-09-05T10:15:00.000Z');
    expect(email.hasAttachments).toBe(false);
  });

  it('lowercases addresses so thread matching is case-insensitive on the sender', () => {
    const email = normalizeForwardEmailPayload({
      ...forwardEmailFixture,
      from: { value: [{ address: 'Jane@EXAMPLE.com', name: 'Jane' }] },
    });
    expect(email.from.email).toBe('jane@example.com');
  });

  it('reads a bare "Name <addr>" string where an object was expected', () => {
    // Provider drift tolerance: the shape is read from their source, not a spec.
    const email = normalizeForwardEmailPayload({
      ...forwardEmailFixture,
      from: '"Jane Doe" <jane@example.com>',
    });
    expect(email.from).toEqual({ email: 'jane@example.com', name: 'Jane Doe' });
  });

  it('survives a payload missing every optional field', () => {
    const email = normalizeForwardEmailPayload({
      from: { value: [{ address: 'jane@example.com' }] },
      recipients: ['support@getpropertypro.com'],
    });

    expect(email.subject).toBeNull();
    expect(email.textBody).toBeNull();
    expect(email.htmlBody).toBeNull();
    expect(email.rfcMessageId).toBeNull();
    expect(email.references).toEqual([]);
    expect(email.sentAt).toBeNull();
  });

  it('throws rather than inventing a message when there is no sender', () => {
    // The quarantine path. A hollow InboundEmail here would mean a month of
    // blank threads instead of one loud failure on day one.
    expect(() =>
      normalizeForwardEmailPayload({ recipients: ['support@getpropertypro.com'] }),
    ).toThrow(InboundEmailShapeError);
  });

  it('throws when the payload is not an object at all', () => {
    expect(() => normalizeForwardEmailPayload('nope')).toThrow(InboundEmailShapeError);
    expect(() => normalizeForwardEmailPayload(null)).toThrow(InboundEmailShapeError);
  });

  it('ignores an invalid Date header instead of producing an Invalid Date', () => {
    const email = normalizeForwardEmailPayload({
      ...forwardEmailFixture,
      date: 'not a date',
    });
    expect(email.sentAt).toBeNull();
  });
});

describe('resolveMailbox', () => {
  it('prefers the provider recipients field', () => {
    expect(
      resolveMailbox({
        recipients: ['privacy@getpropertypro.com'],
        to: { value: [{ address: 'support@getpropertypro.com' }] },
      }),
    ).toEqual({
      mailbox: 'privacy',
      deliveredTo: 'privacy@getpropertypro.com',
      unresolved: false,
    });
  });

  it('falls back to the To header when the provider field is absent', () => {
    expect(
      resolveMailbox({ to: { value: [{ address: 'Privacy@GetPropertyPro.com' }] } }).mailbox,
    ).toBe('privacy');
  });

  it('maps the hello@ alias onto contact while keeping the literal address', () => {
    const resolved = resolveMailbox({ recipients: ['hello@getpropertypro.com'] });
    expect(resolved.mailbox).toBe('contact');
    expect(resolved.deliveredTo).toBe('hello@getpropertypro.com');
  });

  it('routes postmaster@ and abuse@ into support, per RFC 2142', () => {
    expect(resolveMailbox({ recipients: ['postmaster@getpropertypro.com'] }).mailbox).toBe(
      'support',
    );
    expect(resolveMailbox({ recipients: ['abuse@getpropertypro.com'] }).mailbox).toBe(
      'support',
    );
  });

  it('ignores same-local-part addresses on another domain', () => {
    // `support@someoneelse.com` in the Cc must not decide our mailbox.
    const resolved = resolveMailbox({ to: { value: [{ address: 'support@evil.example' }] } });
    expect(resolved.unresolved).toBe(true);
  });

  it('falls back to a real mailbox rather than rejecting an unmatched delivery', () => {
    // A 400 here would make the provider retry the same message forever, and a
    // misfiled support email is recoverable in a way a discarded one is not.
    const resolved = resolveMailbox({ to: { value: [{ address: 'someone@example.com' }] } });
    expect(resolved.mailbox).toBe('support');
    expect(resolved.unresolved).toBe(true);
  });
});

describe('detectAttachments', () => {
  it('flags multipart/mixed', () => {
    expect(
      detectAttachments({
        headerLines: [{ key: 'content-type', line: 'Content-Type: multipart/mixed; boundary=x' }],
      }),
    ).toBe(true);
  });

  it('flags an explicit attachment disposition', () => {
    expect(
      detectAttachments({
        headerLines: [{ key: 'content-disposition', line: 'Content-Disposition: attachment; filename="a.pdf"' }],
      }),
    ).toBe(true);
  });

  it('does NOT flag multipart/alternative', () => {
    // Control: that is just a text+HTML pair. Counting it would make every
    // HTML email claim an attachment it never had.
    expect(
      detectAttachments({
        headerLines: [
          { key: 'content-type', line: 'Content-Type: multipart/alternative; boundary=x' },
        ],
      }),
    ).toBe(false);
  });

  it('is false when there are no header lines at all', () => {
    expect(detectAttachments({})).toBe(false);
  });
});
