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

describe('mailparser falsy fields', () => {
  it('does not turn html=false into the literal string "false"', () => {
    // simpleParser sets `html` to FALSE — not undefined, not '' — when a
    // message has no HTML part. Every plain-text-only sender (mutt, mail(1),
    // monitoring) hits this. Stringifying it wrote the word "false" into
    // html_body, which sanitizes to a truthy string, so the console offered
    // "Show original HTML" and rendered a word nobody sent.
    //
    // The pre-existing optional-fields test cannot catch this: it OMITS `html`
    // rather than setting it to false, so it exercises `undefined`.
    const email = normalizeForwardEmailPayload({
      from: { value: [{ address: 'jane@example.com' }] },
      recipients: ['support@getpropertypro.com'],
      subject: 'Plain text only',
      text: 'No HTML part on this one.',
      html: false,
    });

    expect(email.htmlBody).toBeNull();
    expect(email.textBody).toBe('No HTML part on this one.');
  });

  it('does not turn text=false or subject=false into strings either', () => {
    const email = normalizeForwardEmailPayload({
      from: { value: [{ address: 'jane@example.com' }] },
      recipients: ['support@getpropertypro.com'],
      subject: false,
      text: false,
      html: false,
    });

    expect(email.subject).toBeNull();
    expect(email.textBody).toBeNull();
    expect(email.htmlBody).toBeNull();
  });
});

describe('authentication verdicts', () => {
  it('reads spf/dkim/dmarc from the reference payload', () => {
    const email = normalizeForwardEmailPayload(forwardEmailFixture);

    expect(email.spfResult).toBe('pass');
    expect(email.dkimResult).toBe('pass');
    expect(email.dmarcResult).toBe('pass');
  });

  it('returns null when the provider omits them', () => {
    // `null` is not "none" — a provider that stops sending the field must stay
    // distinguishable from one reporting an absent DMARC record, or a future
    // reader cannot tell a downgrade from a verdict.
    const email = normalizeForwardEmailPayload({
      from: { value: [{ address: 'jane@example.com' }] },
      recipients: ['support@getpropertypro.com'],
    });

    expect(email.spfResult).toBeNull();
    expect(email.dkimResult).toBeNull();
    expect(email.dmarcResult).toBeNull();
  });

  it('stores an unfamiliar verdict verbatim rather than rejecting it', () => {
    // The column has no CHECK on purpose: rejecting a value here would fail the
    // INSERT, and the route answers 429 on a failed write, which parks a real
    // sender's mail for 24-72 hours. An odd verdict is not worth that.
    const email = normalizeForwardEmailPayload({
      from: { value: [{ address: 'jane@example.com' }] },
      recipients: ['support@getpropertypro.com'],
      spf: 'temperror',
      dkim: 'policy.syntax',
      dmarc: 'bestguesspass',
    });

    expect(email.spfResult).toBe('temperror');
    expect(email.dkimResult).toBe('policy.syntax');
    expect(email.dmarcResult).toBe('bestguesspass');
  });

  it('clamps an absurdly long verdict instead of storing it whole', () => {
    const email = normalizeForwardEmailPayload({
      from: { value: [{ address: 'jane@example.com' }] },
      recipients: ['support@getpropertypro.com'],
      spf: 'x'.repeat(5_000),
    });

    expect(email.spfResult).toHaveLength(64);
  });

  it('does not stringify a boolean verdict', () => {
    // Same defect class the html=false case documents above: mailparser-shaped
    // payloads use `false` for "absent", and String(false) would write the word
    // "false" into the column as though it were a verdict.
    const email = normalizeForwardEmailPayload({
      from: { value: [{ address: 'jane@example.com' }] },
      recipients: ['support@getpropertypro.com'],
      spf: false,
      dkim: false,
      dmarc: false,
    });

    expect(email.spfResult).toBeNull();
    expect(email.dkimResult).toBeNull();
    expect(email.dmarcResult).toBeNull();
  });

  it('digs a verdict out of the object shape production actually sends', () => {
    // The defect this block exists for. A string-only reader stored three
    // nulls for the first real message after the feature shipped: Forward
    // Email's MX is built on mailauth, which reports a verdict as an object.
    const email = normalizeForwardEmailPayload({
      from: { value: [{ address: 'jane@example.com' }] },
      recipients: ['support@getpropertypro.com'],
      spf: { result: 'pass' },
      dkim: { result: 'fail' },
      dmarc: { result: 'softfail' },
    });

    expect(email.spfResult).toBe('pass');
    expect(email.dkimResult).toBe('fail');
    expect(email.dmarcResult).toBe('softfail');
  });

  it("digs through mailauth's `status` wrapper as well as a bare `result`", () => {
    const email = normalizeForwardEmailPayload({
      from: { value: [{ address: 'jane@example.com' }] },
      recipients: ['support@getpropertypro.com'],
      spf: { status: { result: 'pass' }, domain: 'example.com' },
      dmarc: { status: 'fail', policy: 'reject' },
    });

    expect(email.spfResult).toBe('pass');
    expect(email.dmarcResult).toBe('fail');
  });

  it('falls back to the RFC 8601 Authentication-Results header', () => {
    // The point of the fallback: this reads a standard every receiving MTA
    // writes, so it survives the provider changing its JSON or being replaced.
    const email = normalizeForwardEmailPayload({
      from: { value: [{ address: 'jane@example.com' }] },
      recipients: ['support@getpropertypro.com'],
      headerLines: [
        {
          key: 'authentication-results',
          line:
            'Authentication-Results: mx1.forwardemail.net; dkim=pass header.d=gmail.com; ' +
            'spf=pass smtp.mailfrom=jane@example.com; dmarc=fail header.from=gmail.com',
        },
      ],
    });

    expect(email.spfResult).toBe('pass');
    expect(email.dkimResult).toBe('pass');
    expect(email.dmarcResult).toBe('fail');
  });

  it("prefers the provider's own field over the header", () => {
    const email = normalizeForwardEmailPayload({
      from: { value: [{ address: 'jane@example.com' }] },
      recipients: ['support@getpropertypro.com'],
      spf: { result: 'fail' },
      headerLines: [{ line: 'Authentication-Results: mx1.example.net; spf=pass' }],
    });

    expect(email.spfResult).toBe('fail');
  });

  it('trusts the FIRST Authentication-Results header, not a later relay', () => {
    // Each hop prepends its own header, so the first is the most recent hop —
    // the one that actually authenticated this delivery. A forged 'pass' from
    // further down the chain must not overwrite it.
    const email = normalizeForwardEmailPayload({
      from: { value: [{ address: 'jane@example.com' }] },
      recipients: ['support@getpropertypro.com'],
      headerLines: [
        { line: 'Authentication-Results: mx1.forwardemail.net; dmarc=fail' },
        { line: 'Authentication-Results: relay.attacker.example; dmarc=pass' },
      ],
    });

    expect(email.dmarcResult).toBe('fail');
  });

  it('does not read a verdict out of a lookalike token', () => {
    // The regex boundary earns its place here: without it `dkim=` matches
    // inside `x-dkim=` and `spf=` inside `receivedspf=`, which would write a
    // verdict this MTA never asserted.
    const email = normalizeForwardEmailPayload({
      from: { value: [{ address: 'jane@example.com' }] },
      recipients: ['support@getpropertypro.com'],
      headerLines: [
        { line: 'Authentication-Results: mx1.example.net; x-dkim=pass; receivedspf=pass' },
      ],
    });

    expect(email.dkimResult).toBeNull();
    expect(email.spfResult).toBeNull();
  });
});
